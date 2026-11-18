// Builds the data behind the 3D map of Nigeria (/map) from open sources.
//
//   npm run data:map                  build from the downloads in data/raw/map
//   npm run data:map -- --fresh-rail  ask Overpass for the railways again
//
// Output
//   public/data/map/grid.dat      gzip of three byte layers on a 2 km grid in
//                                 the map's transverse Mercator (src/lib/map/projection.ts):
//                                 ground height, residents and flags (see below)
//   public/data/map/grid.json     grid geometry, states, summary numbers
//   public/data/map/rail.geojson  the main railway lines, simplified. Kept in
//                                 the repository: Overpass is too unreliable to
//                                 ask on every build.
//   data/raw/map/preview.png      a flat picture of the grid, for checking
//
// Sources
//   Ground height  Mapzen terrain tiles on AWS Open Data (terrarium, zoom 7)
//   Residents      WorldPop Global2 R2025A, constrained, UN-adjusted, 1 km, 2026
//   States         geoBoundaries gbOpen NGA ADM1 (GRID3)
//   Neighbours, lakes, rivers   Natural Earth 10 m
//   Railways       OpenStreetMap route relations, through Overpass
//
// Downloads are kept in data/raw/map (git-ignored), so a second run is quick
// and works offline.

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { fromArrayBuffer } from "geotiff";
import { PNG } from "pngjs";
import { latLonToWorld, worldToLatLon } from "../src/lib/map/projection.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "data/raw/map");
const OUT = path.join(ROOT, "public/data/map");
const USER_AGENT = "AllAboutNigeria-Map/1.0 (https://allaboutnigeria.ng)";

// ---------------------------------------------------------------- the grid --
// 2 km squares. Nigeria is about 1,300 by 1,050 km; at 500 m, like the Dutch
// map, that is four million squares, far too many for a phone to draw.
const CELL = 2;
/** Neighbouring land and sea kept around the country, km. */
const MARGIN = 70;

// Flag byte. Keep in sync with src/lib/map/grid.ts.
//   bits 0-5  state number (1-37), 0 outside Nigeria
//   bits 6-7  kind: sea, Nigerian land, foreign land, Nigerian inland water
const KIND_SEA = 0;
const KIND_NG = 1;
const KIND_FOREIGN = 2;
const KIND_WATER = 3;
const kindOf = (flag) => flag >> 6;

const POPULATION_YEAR = 2026;
const ELEVATION_ZOOM = 7;

// One byte each for height and residents keeps the file small enough for a
// phone. Both scales are finest where it matters most: a metre near the
// coast, where the sea-level slider works, and a few percent of residents.
//   height     round(sqrt(metres) * HEIGHT_SCALE), 0 to 2,300 m; each row is
//              stored as differences from the cell to its west, which gzip
//              packs a third smaller
//   residents  round(log2(1 + n) * PEOPLE_SCALE), 0 to 130,000
const HEIGHT_SCALE = 5.3;
const PEOPLE_SCALE = 15;

const SOURCES = {
  states:
    "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1.geojson",
  countries:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson",
  lakes: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson",
  rivers:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson",
  population:
    `https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/${POPULATION_YEAR}/NGA/v1/1km_ua/constrained/` +
    `nga_pop_${POPULATION_YEAR}_CN_1km_R2025A_UA_v1.tif`,
  terrain: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium",
  overpass: "https://overpass-api.de/api/interpreter",
};

/**
 * The railway routes to draw and run trains on, by OSM relation. Both
 * directions of a line are listed where OSM has two relations; their
 * shared track is kept once.
 */
const RAIL_ROUTES = [
  { id: 15668733, line: "Lagos Blue Line", kind: "metro" },
  { id: 15668734, line: "Lagos Blue Line", kind: "metro" },
  { id: 8441841, line: "Abuja light rail", kind: "metro" },
  { id: 8441842, line: "Abuja light rail", kind: "metro" },
  { id: 8442723, line: "Abuja light rail", kind: "metro" },
  { id: 8442724, line: "Abuja light rail", kind: "metro" },
  { id: 13184642, line: "Lagos–Ibadan", kind: "rail" },
  { id: 6441947, line: "Abuja–Kaduna", kind: "rail" },
  { id: 9285998, line: "Itakpe–Warri", kind: "rail" },
  { id: 8527053, line: "Port Harcourt–Kano", kind: "rail" },
  { id: 18278186, line: "Kaduna–Kano", kind: "rail" },
];

// ----------------------------------------------------------------- helpers --
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function fetchRetry(url, init = {}, tries = 4) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...init.headers },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response;
    } catch (error) {
      lastError = error;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError;
}

/** Download to the cache once, then read from disk. Returns a Buffer. */
async function cached(name, url) {
  const file = path.join(CACHE, name);
  if (await exists(file)) return fs.readFile(file);
  console.log(`  downloading ${url}`);
  const response = await fetchRetry(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buffer);
  return buffer;
}

/** GeoJSON Polygon or MultiPolygon to a list of polygons (lists of rings). */
function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function linesOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

/** [lon, lat] rings to scene km. */
const project = (rings) => rings.map((ring) => ring.map(([lon, lat]) => latLonToWorld(lat, lon)));

// ------------------------------------------------------- the grid's extent --
function gridFor(states) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const state of states) {
    for (const rings of state.polygons) {
      for (const [x, z] of rings[0]) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
    }
  }
  const snap = (value, round) => round(value / CELL) * CELL;
  const xMin = snap(x0 - MARGIN, Math.floor);
  const zMin = snap(z0 - MARGIN, Math.floor);
  const width = (snap(x1 + MARGIN, Math.ceil) - xMin) / CELL;
  const height = (snap(z1 + MARGIN, Math.ceil) - zMin) / CELL;
  return {
    xMin,
    zMin,
    width,
    height,
    size: width * height,
    centreX: (i) => xMin + (i + 0.5) * CELL,
    centreZ: (j) => zMin + (j + 0.5) * CELL,
    cellAt(x, z) {
      const i = Math.floor((x - xMin) / CELL);
      const j = Math.floor((z - zMin) / CELL);
      return i < 0 || j < 0 || i >= width || j >= height ? -1 : j * width + i;
    },
  };
}

/**
 * Scanline fill. `polygons` is a list of polygons, each a list of closed
 * rings of [x, z] in scene km. Calls mark(cell) for every cell whose centre
 * is inside (even-odd rule, so holes work).
 */
function rasterize(grid, polygons, mark) {
  const edges = [];
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let k = 0; k < ring.length - 1; k++) {
        const [xa, za] = ring[k];
        const [xb, zb] = ring[k + 1];
        if (za === zb) continue;
        edges.push(za < zb ? [xa, za, xb, zb] : [xb, zb, xa, za]);
      }
    }
  }
  const xs = [];
  for (let j = 0; j < grid.height; j++) {
    const z = grid.centreZ(j);
    xs.length = 0;
    for (const [xa, za, xb, zb] of edges) {
      if (z >= za && z < zb) xs.push(xa + ((z - za) / (zb - za)) * (xb - xa));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] - grid.xMin) / CELL - 0.5));
      const to = Math.min(grid.width - 1, Math.floor((xs[k + 1] - grid.xMin) / CELL - 0.5));
      for (let i = from; i <= to; i++) mark(j * grid.width + i);
    }
  }
}

/** Steps (4-connected) from the nearest cell that matches, up to a limit; 255 beyond. */
function stepsFrom(grid, matches, limit) {
  const { width: W, size: N } = grid;
  const steps = new Uint8Array(N).fill(255);
  let frontier = [];
  for (let c = 0; c < N; c++) {
    if (matches(c)) {
      steps[c] = 0;
      frontier.push(c);
    }
  }
  for (let d = 1; d <= limit && frontier.length; d++) {
    const next = [];
    for (const c of frontier) {
      const i = c % W;
      for (const n of [i + 1 < W ? c + 1 : -1, i > 0 ? c - 1 : -1, c + W < N ? c + W : -1, c - W]) {
        if (n >= 0 && steps[n] === 255) {
          steps[n] = d;
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return steps;
}

// ------------------------------------------------------------------ layers --
async function loadStates() {
  const json = JSON.parse(await cached("geoboundaries-nga-adm1.geojson", SOURCES.states));
  if (json.features.length !== 37) {
    throw new Error(`Expected 36 states and the FCT, got ${json.features.length} features`);
  }
  return json.features
    .map((feature) => {
      const iso = feature.properties.shapeISO;
      const fct = iso === "NG-FC";
      return {
        name: fct ? "Federal Capital Territory" : feature.properties.shapeName,
        label: fct ? "FCT" : feature.properties.shapeName,
        iso,
        polygons: polygonsOf(feature.geometry).map(project),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadNeighbours(grid) {
  const json = JSON.parse(await cached("ne_10m_admin_0_countries.geojson", SOURCES.countries));
  const [south, west] = worldToLatLon(grid.xMin, grid.zMin + grid.height * CELL);
  const [north, east] = worldToLatLon(grid.xMin + grid.width * CELL, grid.zMin);
  const near = [];
  const nigeria = [];
  for (const country of json.features) {
    for (const rings of polygonsOf(country.geometry)) {
      const lons = rings[0].map((point) => point[0]);
      const lats = rings[0].map((point) => point[1]);
      if (Math.max(...lons) < west - 2 || Math.min(...lons) > east + 2) continue;
      if (Math.max(...lats) < south - 2 || Math.min(...lats) > north + 2) continue;
      (country.properties.ADM0_A3 === "NGA" ? nigeria : near).push(project(rings));
    }
  }
  return { near, nigeria };
}

async function loadWater(grid) {
  const lakes = JSON.parse(await cached("ne_10m_lakes.geojson", SOURCES.lakes));
  const rivers = JSON.parse(await cached("ne_10m_rivers_lake_centerlines.geojson", SOURCES.rivers));
  const inside = ([x, z]) => grid.cellAt(x, z) >= 0;
  const lakePolygons = lakes.features
    .flatMap((feature) => polygonsOf(feature.geometry).map(project))
    .filter((rings) => rings[0].some(inside));
  // The larger rivers only: the Niger, the Benue and their main branches.
  const riverLines = rivers.features
    .filter((feature) => feature.properties.scalerank <= 7)
    .flatMap((feature) => linesOf(feature.geometry))
    .map((line) => line.map(([lon, lat]) => latLonToWorld(lat, lon)))
    .filter((line) => line.some(inside));
  return { lakePolygons, riverLines };
}

/** Residents per cell, from the WorldPop 1 km grid. */
async function loadPopulation(grid) {
  const buffer = await cached(`worldpop-nga-${POPULATION_YEAR}-1km.tif`, SOURCES.population);
  const tiff = await fromArrayBuffer(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  const image = await tiff.getImage();
  const [band] = await image.readRasters();
  const width = image.getWidth();
  const height = image.getHeight();
  const [west, north] = image.getOrigin();
  const [dLon, dLat] = image.getResolution();
  const people = new Float64Array(grid.size);
  let total = 0;
  // Each 1 km pixel is split into a 2 x 2 of quarters before it is dropped
  // into the 2 km grid, which keeps the totals and avoids a moiré of cells
  // that happen to catch five pixels next to cells that catch four.
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const value = band[r * width + c];
      if (!(value > 0)) continue;
      total += value;
      for (const [fr, fc] of [
        [0.25, 0.25],
        [0.25, 0.75],
        [0.75, 0.25],
        [0.75, 0.75],
      ]) {
        const lon = west + (c + fc) * dLon;
        const lat = north + (r + fr) * dLat;
        const cell = grid.cellAt(...latLonToWorld(lat, lon));
        if (cell >= 0) people[cell] += value / 4;
      }
    }
  }
  console.log(`  ${width} x ${height} pixels, ${Math.round(total).toLocaleString("en")} residents`);
  return { people, total };
}

/** Ground height in metres at a lat/lon, bilinear between terrain tile pixels. */
async function loadElevation(grid) {
  const size = 256 * 2 ** ELEVATION_ZOOM;
  const toPixel = (lat, lon) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return [((lon + 180) / 360) * size, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size];
  };
  const [south, west] = worldToLatLon(grid.xMin, grid.zMin + grid.height * CELL);
  const [north, east] = worldToLatLon(grid.xMin + grid.width * CELL, grid.zMin);
  const [px0, py0] = toPixel(north + 0.3, west - 0.3);
  const [px1, py1] = toPixel(south - 0.3, east + 0.3);
  const tiles = new Map();
  const jobs = [];
  for (let ty = Math.floor(py0 / 256); ty <= Math.floor(py1 / 256); ty++) {
    for (let tx = Math.floor(px0 / 256); tx <= Math.floor(px1 / 256); tx++) jobs.push([tx, ty]);
  }
  for (const [tx, ty] of jobs) {
    const name = `${ELEVATION_ZOOM}/${tx}/${ty}.png`;
    const buffer = await cached(`terrarium/${name}`, `${SOURCES.terrain}/${name}`);
    tiles.set(`${tx}/${ty}`, PNG.sync.read(buffer).data);
  }
  console.log(`  ${jobs.length} terrain tiles at zoom ${ELEVATION_ZOOM}`);

  const at = (x, y) => {
    const data = tiles.get(`${x >> 8}/${y >> 8}`);
    if (!data) return 0;
    const o = ((y & 255) * 256 + (x & 255)) * 4;
    return data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
  };
  return (lat, lon) => {
    const [px, py] = toPixel(lat, lon);
    const fx = px - 0.5;
    const fy = py - 0.5;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const tx = fx - x;
    const ty = fy - y;
    return (
      at(x, y) * (1 - tx) * (1 - ty) +
      at(x + 1, y) * tx * (1 - ty) +
      at(x, y + 1) * (1 - tx) * ty +
      at(x + 1, y + 1) * tx * ty
    );
  };
}

// ---------------------------------------------------------------- railways --

/** Douglas-Peucker on [lon, lat] points, with the tolerance in metres. */
function simplify(points, metres) {
  if (points.length < 3) return points;
  const kx = 111320 * Math.cos((points[0][1] * Math.PI) / 180);
  const ky = 110540;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = points[a][0] * kx;
    const ay = points[a][1] * ky;
    const dx = points[b][0] * kx - ax;
    const dy = points[b][1] * ky - ay;
    const span = Math.hypot(dx, dy) || 1;
    let worst = 0;
    let at = -1;
    for (let k = a + 1; k < b; k++) {
      const off = Math.abs((points[k][0] * kx - ax) * dy - (points[k][1] * ky - ay) * dx) / span;
      if (off > worst) {
        worst = off;
        at = k;
      }
    }
    if (worst > metres) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, k) => keep[k]);
}

/**
 * The railway lines as GeoJSON: one LineString per OSM way of track, each
 * kept once however many routes use it. Overpass is often at capacity, so
 * it is asked politely a few times; anything less than every route is an
 * error rather than a map with a line missing.
 */
async function fetchRail() {
  const query =
    "[out:json][timeout:180];(" +
    RAIL_ROUTES.map((route) => `relation(${route.id});`).join("") +
    ");out geom;";
  let json;
  for (let attempt = 0; attempt < 5 && !json; attempt++) {
    if (attempt) {
      const wait = 15000 * 2 ** (attempt - 1);
      console.log(`  Overpass is busy, asking again in ${wait / 1000} s`);
      await sleep(wait);
    }
    try {
      const response = await fetch(SOURCES.overpass, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (response.ok) json = await response.json();
      else console.log(`  Overpass answered ${response.status}`);
    } catch (error) {
      console.log(`  Overpass failed: ${error.message}`);
    }
  }
  if (!json) throw new Error("Overpass did not answer. The railways were not updated.");

  const features = [];
  const seen = new Set();
  for (const route of RAIL_ROUTES) {
    const relation = json.elements.find((element) => element.type === "relation" && element.id === route.id);
    // Stops and platforms have roles; the track itself has none.
    const ways = (relation?.members ?? []).filter(
      (member) => member.type === "way" && !member.role && member.geometry?.length > 1,
    );
    if (!ways.length) {
      throw new Error(`Relation ${route.id} (${route.line}) came back without track. Nothing was written.`);
    }
    for (const way of ways) {
      if (seen.has(way.ref)) continue;
      seen.add(way.ref);
      const points = simplify(
        way.geometry.map(({ lon, lat }) => [lon, lat]),
        8,
      ).map(([lon, lat]) => [+lon.toFixed(5), +lat.toFixed(5)]);
      features.push({
        type: "Feature",
        properties: { line: route.line, kind: route.kind },
        geometry: { type: "LineString", coordinates: points },
      });
    }
  }
  return {
    type: "FeatureCollection",
    // Required by the ODbL, and handy for knowing how old the copy is.
    attribution: "© OpenStreetMap contributors (ODbL)",
    fetched: new Date().toISOString().slice(0, 10),
    features,
  };
}

// -------------------------------------------------------------------- main --
async function main() {
  await fs.mkdir(CACHE, { recursive: true });
  await fs.mkdir(OUT, { recursive: true });

  console.log("States (geoBoundaries / GRID3)");
  const states = await loadStates();
  const grid = gridFor(states);
  const { width: W, height: H, size: N } = grid;
  console.log(`  grid ${W} x ${H} cells of ${CELL} km`);

  const flags = new Uint8Array(N);
  states.forEach((state, index) => {
    rasterize(grid, state.polygons, (c) => {
      flags[c] = (KIND_NG << 6) | (index + 1);
    });
  });

  console.log("Neighbouring countries (Natural Earth)");
  const { near, nigeria } = await loadNeighbours(grid);
  const naturalEarthNigeria = new Uint8Array(N);
  rasterize(grid, nigeria, (c) => (naturalEarthNigeria[c] = 1));
  rasterize(grid, near, (c) => {
    if (flags[c] === 0) flags[c] = KIND_FOREIGN << 6;
  });
  // Natural Earth and GRID3 draw the border slightly differently. Strips that
  // Natural Earth calls Nigerian and GRID3 does not would show up as a moat
  // along the border; they go to the neighbour next to them.
  {
    let frontier = [];
    for (let c = 0; c < N; c++) if (kindOf(flags[c]) === KIND_FOREIGN) frontier.push(c);
    for (let step = 0; step < 6 && frontier.length; step++) {
      const next = [];
      for (const c of frontier) {
        const i = c % W;
        for (const n of [i + 1 < W ? c + 1 : -1, i > 0 ? c - 1 : -1, c + W < N ? c + W : -1, c - W]) {
          if (n >= 0 && flags[n] === 0 && naturalEarthNigeria[n]) {
            flags[n] = KIND_FOREIGN << 6;
            next.push(n);
          }
        }
      }
      frontier = next;
    }
  }

  console.log(`Residents (WorldPop ${POPULATION_YEAR}, 1 km)`);
  const { people, total: populationTotal } = await loadPopulation(grid);

  console.log("Ground height (terrain tiles)");
  const elevationAt = await loadElevation(grid);
  const elevation = new Float32Array(N);
  const offsets = [-CELL / 3, 0, CELL / 3];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      if (kindOf(flags[c]) === KIND_SEA) continue;
      let sum = 0;
      for (const dx of offsets) {
        for (const dz of offsets)
          sum += elevationAt(...worldToLatLon(grid.centreX(i) + dx, grid.centreZ(j) + dz));
      }
      elevation[c] = sum / 9;
    }
  }

  console.log("Lakes, lagoons and rivers (Natural Earth, and the ground itself)");
  const { lakePolygons, riverLines } = await loadWater(grid);
  const isNigerian = (c) => kindOf(flags[c]) === KIND_NG;
  rasterize(grid, lakePolygons, (c) => {
    if (isNigerian(c)) flags[c] = (KIND_WATER << 6) | (flags[c] & 63);
  });
  for (const line of riverLines) {
    for (let k = 0; k < line.length - 1; k++) {
      const [xa, za] = line[k];
      const [xb, zb] = line[k + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(xb - xa, zb - za) / (CELL / 3)));
      for (let s = 0; s <= steps; s++) {
        const c = grid.cellAt(xa + ((xb - xa) * s) / steps, za + ((zb - za) * s) / steps);
        // A town on the bank stays dry.
        if (c >= 0 && isNigerian(c) && people[c] < 2000) flags[c] = (KIND_WATER << 6) | (flags[c] & 63);
      }
    }
  }
  // The state outlines include the lagoons and the creeks of the delta. The
  // terrain tiles have them at or below sea level, with nobody living there.
  let lagoon = 0;
  for (let c = 0; c < N; c++) {
    if (isNigerian(c) && elevation[c] <= 0.5 && people[c] < 40) {
      flags[c] = (KIND_WATER << 6) | (flags[c] & 63);
      lagoon++;
    }
  }
  console.log(
    `  ${lakePolygons.length} lakes, ${riverLines.length} river lines, ${lagoon} cells of lagoon and creek`,
  );

  // People who fall in the sea or abroad because the outlines differ a
  // little from WorldPop's are left out; the summary says how many.
  const population = new Uint8Array(N);
  let placed = 0;
  let densest = 0;
  for (let c = 0; c < N; c++) {
    const kind = kindOf(flags[c]);
    if (kind !== KIND_NG && kind !== KIND_WATER) continue;
    const n = people[c];
    if (!(n >= 1)) continue;
    population[c] = Math.min(255, Math.round(Math.log2(1 + n) * PEOPLE_SCALE));
    placed += n;
    densest = Math.max(densest, n);
  }

  // Abroad, the map only draws the heights within 30 cells of the border
  // (FADE_END in src/lib/map/terrain.ts). Zero beyond that packs smaller.
  const fromNigeria = stepsFrom(
    grid,
    (c) => kindOf(flags[c]) === KIND_NG || kindOf(flags[c]) === KIND_WATER,
    32,
  );
  for (let c = 0; c < N; c++) {
    if (kindOf(flags[c]) === KIND_FOREIGN && fromNigeria[c] === 255) elevation[c] = 0;
  }
  // The tiles carry the depth of lagoons and the sea floor; the map has no use for it.
  const height = Uint8Array.from(elevation, (m) =>
    Math.min(255, Math.round(Math.sqrt(Math.max(0, m)) * HEIGHT_SCALE)),
  );
  const metres = (c) => (height[c] / HEIGHT_SCALE) ** 2;

  // ---- states: a label spot well inside each, and its size
  const stateMeta = states.map((state, index) => {
    const number = index + 1;
    const inside = stepsFrom(
      grid,
      (c) => (flags[c] & 63) !== number || kindOf(flags[c]) === KIND_FOREIGN,
      254,
    );
    let best = -1;
    let cells = 0;
    for (let c = 0; c < N; c++) {
      if ((flags[c] & 63) !== number || kindOf(flags[c]) === KIND_FOREIGN) continue;
      cells++;
      if (best < 0 || inside[c] > inside[best]) best = c;
    }
    const i = best % W;
    return {
      name: state.name,
      label: state.label,
      iso: state.iso,
      x: +grid.centreX(i).toFixed(1),
      z: +grid.centreZ((best - i) / W).toFixed(1),
      km2: cells * CELL * CELL,
    };
  });

  // ---- summary numbers, also a sanity check on the inputs
  let landCells = 0;
  let waterCells = 0;
  let highest = -1;
  for (let c = 0; c < N; c++) {
    if (kindOf(flags[c]) === KIND_WATER) waterCells++;
    if (kindOf(flags[c]) !== KIND_NG) continue;
    landCells++;
    if (highest < 0 || height[c] > height[highest]) highest = c;
  }
  const where = (c) => {
    const i = c % W;
    const [lat, lon] = worldToLatLon(grid.centreX(i), grid.centreZ((c - i) / W));
    return { lat: +lat.toFixed(4), lon: +lon.toFixed(4) };
  };

  const meta = {
    cell: CELL,
    xMin: grid.xMin,
    zMin: grid.zMin,
    width: W,
    height: H,
    heightScale: HEIGHT_SCALE,
    peopleScale: PEOPLE_SCALE,
    states: stateMeta,
    stats: {
      landKm2: landCells * CELL * CELL,
      inlandWaterKm2: waterCells * CELL * CELL,
      highest: { metres: Math.round(metres(highest)), ...where(highest) },
      population: Math.round(populationTotal),
      populationOnGrid: Math.round(placed),
      densestSquare: Math.round(densest),
      populationYear: POPULATION_YEAR,
    },
    generated: new Date().toISOString().slice(0, 10),
  };

  // ---- write
  const heightRows = height.map((value, c) => (c % W ? value - height[c - 1] : value));
  const raw = Buffer.concat([Buffer.from(heightRows), Buffer.from(population), Buffer.from(flags)]);
  const packed = zlib.gzipSync(raw, { level: 9 });
  await fs.writeFile(path.join(OUT, "grid.dat"), packed);
  await fs.writeFile(path.join(OUT, "grid.json"), JSON.stringify(meta, null, 2) + "\n");

  console.log("Railways (OpenStreetMap)");
  const railFile = path.join(OUT, "rail.geojson");
  if (process.argv.includes("--fresh-rail") || !(await exists(railFile))) {
    const rail = await fetchRail();
    await fs.writeFile(railFile, JSON.stringify(rail) + "\n");
    console.log(`  ${rail.features.length} stretches of track written`);
  } else {
    console.log("  kept the copy in public/data/map (--fresh-rail asks Overpass again)");
  }

  // ---- preview picture
  const png = new PNG({ width: W, height: H });
  for (let c = 0; c < N; c++) {
    const kind = kindOf(flags[c]);
    let rgb = [18, 30, 44];
    if (kind === KIND_FOREIGN) rgb = [58, 62, 66];
    if (kind === KIND_WATER) rgb = [90, 200, 235];
    if (kind === KIND_NG) {
      const t = Math.min(1, metres(c) / 1200);
      rgb = [90 + 140 * t, 160 - 50 * t, 70];
      const p = Math.min(1, population[c] / 255);
      rgb = [rgb[0] + (255 - rgb[0]) * p, rgb[1] * (1 - 0.6 * p), rgb[2] * (1 - 0.6 * p)];
    }
    png.data.set([rgb[0], rgb[1], rgb[2], 255], c * 4);
  }
  await fs.writeFile(path.join(CACHE, "preview.png"), PNG.sync.write(png));

  console.log("\nDone.");
  console.log(
    `  grid ${W} x ${H} cells, ${(packed.length / 1024).toFixed(0)} KB gzipped (${(raw.length / 1024).toFixed(0)} KB raw)`,
  );
  console.log("  stats:", JSON.stringify(meta.stats, null, 2));

  // Spot checks against places whose height is well known.
  const spots = [
    ["Lagos Island (a few metres)", 6.4541, 3.3947],
    ["Kano (about 480 m)", 12.0, 8.52],
    ["Jos (about 1,200 m)", 9.8965, 8.8583],
    ["Abuja (about 480 m)", 9.0579, 7.4951],
    ["Chappal Waddi (2,419 m)", 7.03, 11.705],
    ["Lagos Lagoon (water)", 6.5, 3.5],
    ["Kainji Lake (water)", 10.3, 4.55],
    ["Bight of Benin (sea)", 5.6, 3.5],
  ];
  for (const [name, lat, lon] of spots) {
    const c = grid.cellAt(...latLonToWorld(lat, lon));
    const kind = ["sea", "Nigeria", "abroad", "inland water"][kindOf(flags[c])];
    const n = 2 ** (population[c] / PEOPLE_SCALE) - 1;
    console.log(`  ${name}: ${kind}, ${Math.round(metres(c))} m, ${Math.round(n)} residents`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

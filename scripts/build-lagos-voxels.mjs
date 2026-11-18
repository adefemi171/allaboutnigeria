import fs from "node:fs";
import path from "node:path";
import { buildWalkRoutes } from "./lib/osm-nav.mjs";
import {
  CELL_M,
  PALETTE_BASE,
  createWorld,
  colourToPaletteIndex,
  pick,
  carveWater,
  paintParks,
  scatterTrees,
  paintRoads,
  stampBuildings,
  stampTower,
  toPath,
  trafficRoutes,
  writeWorld,
} from "./lib/voxel-world.mjs";

const RAW_PATH = path.join(process.cwd(), "data", "raw", "lagos-osm-clean.json");
const OUT_DIR = path.join(process.cwd(), "public", "data");

// Grid covers the full fetch bbox 6.418..6.466, 3.384..3.456
const HALF_W_M = 3960; // 7920m E-W -> 1320 cells
const HALF_H_M = 2640; // 5280m N-S -> 880 cells

const PALETTE = [...PALETTE_BASE, "#a36a52"]; // 19 Ikoyi tiled villa

const OPEN_WATER = ["Five Cowries", "Kuramo", "Commodore"];

// [lat, lon, radiusCells, heightVoxels, paletteIndex]
const LANDMARK_TOWERS = [
  [6.4474, 3.3949, 3, 52, 1], // NECOM House (Marina, 160m)
  [6.4488, 3.3917, 3, 38, 10], // Union Bank / Marina Financial Towers
  [6.4508, 3.3905, 3, 32, 7], // CBN Lagos
  [6.4479, 3.4184, 3, 28, 11], // Kingsway Tower Ikoyi
  [6.4347, 3.4244, 3, 26, 9], // Civic Tower VI
  [6.4198, 3.4102, 3, 38, 16], // Eko Pearl / Eko Atlantic cluster
  [6.4206, 3.4126, 2, 32, 9],
  [6.4253, 3.4307, 4, 21, 1], // Eko Hotel
  [6.4437, 3.4455, 1, 22, 16], // Lekki-Ikoyi Link Bridge pylon spire
];

const FERRY_ROUTES = [
  {
    name: "LAGFERRY: Five Cowries (Ikoyi) ↔ Marina CMS",
    coords: [
      [6.4392, 3.4198],
      [6.4398, 3.411],
      [6.4395, 3.403],
      [6.4435, 3.398],
      [6.4485, 3.392],
    ],
  },
  {
    name: "LAGFERRY: Falomo ↔ Lekki Phase 1 Creek",
    coords: [
      [6.4395, 3.423],
      [6.4392, 3.434],
      [6.4415, 3.4455],
      [6.4435, 3.4535],
    ],
  },
];

// Districts (scene metres) for height/style priors when OSM lacks tags; they overlap
function districtsAt([mx, mz]) {
  return {
    marina: mx < -1400 && mz < 150 && mz > -1300,
    victoriaIsland: mz > 400 && mx > -1800 && mx < 2600,
    ekoAtlantic: mz > 1800 && mx < 500,
    ikoyi: mx > -400 && mx < 2800 && mz < 250 && mz > -1700,
  };
}

/**
 * OSM has no reliable coastline polygons here, so land is inferred: everything
 * near a road, building or park is land, then creeks are carved back out and
 * water pockets not connected to the lagoon/ocean are filled in.
 */
function buildLandmass(world, raw) {
  const { surface, idx, gridW, gridH, totalCells } = world;

  const landSeed = new Uint8Array(totalCells);
  const markLand = (gx, gz) => {
    landSeed[idx(gx, gz)] = 1;
  };
  for (const r of raw.roads) {
    if (r.bridge) continue;
    world.tracePolyline(r.coords, (gx, gz) => world.drawDisc(landSeed, gx, gz, 2.5, 1));
  }
  for (const b of raw.buildings) world.fillPolygon(b.coords, markLand);
  for (const p of raw.parks) world.fillPolygon(p.coords, markLand);

  // Separable sliding-window box filter: a cell is set if its (2r+1)² window
  // contains any set cell (dilate) or only set cells (erode).
  function boxFilter(src, radius, erode) {
    const win = radius * 2 + 1;
    const pass = (from, to, len, at) => {
      let run = 0;
      for (let p = 0; p < len + radius; p++) {
        if (p < len && from[at(p)]) run++;
        if (p - win >= 0 && from[at(p - win)]) run--;
        const c = p - radius;
        if (c >= 0 && c < len && (erode ? run === win : run > 0)) to[at(c)] = 1;
      }
    };
    const tmp = new Uint8Array(totalCells);
    const dst = new Uint8Array(totalCells);
    for (let z = 0; z < gridH; z++) pass(src, tmp, gridW, (x) => z * gridW + x);
    for (let x = 0; x < gridW; x++) pass(tmp, dst, gridH, (z) => z * gridW + x);
    return dst;
  }

  console.log("Building Lagos Island / Ikoyi / VI / Lekki landmass mask...");
  // Morphological closing: dilate 14 cells (~84m) then erode 12 cells (~72m)
  const closed = boxFilter(boxFilter(landSeed, 14, false), 12, true);
  for (let i = 0; i < totalCells; i++) {
    if (closed[i] || landSeed[i]) surface[i] = 1;
  }

  carveWater(world, raw.waters, (w) =>
    w.name && w.name.includes("Commodore")
      ? 16
      : w.name && w.name.includes("Five Cowries")
      ? 9
      : w.name && w.name.includes("MacGregor")
      ? 3.5
      : 5
  );

  // Flood-fill open water from the grid border and the named channels;
  // any water the fill cannot reach is an enclosed urban block -> solid ground
  const openWater = new Uint8Array(totalCells);
  const queue = new Int32Array(totalCells);
  let qHead = 0;
  let qTail = 0;
  function seedWater(gx, gz) {
    if (!world.inBounds(gx, gz)) return;
    const i = idx(gx, gz);
    if (surface[i] === 0 && !openWater[i]) {
      openWater[i] = 1;
      queue[qTail++] = i;
    }
  }

  for (let x = 0; x < gridW; x++) {
    seedWater(x, 0);
    seedWater(x, gridH - 1);
  }
  for (let z = 0; z < gridH; z++) {
    seedWater(0, z);
    seedWater(gridW - 1, z);
  }
  for (const w of raw.waters) {
    if (w.name && OPEN_WATER.some((n) => w.name.includes(n))) {
      for (const [lat, lon] of w.coords) seedWater(...world.cellAt(lat, lon));
    }
  }
  while (qHead < qTail) {
    const i = queue[qHead++];
    const cx = i % gridW;
    const cz = (i - cx) / gridW;
    seedWater(cx - 1, cz);
    seedWater(cx + 1, cz);
    seedWater(cx, cz - 1);
    seedWater(cx, cz + 1);
  }
  for (let i = 0; i < totalCells; i++) {
    if (surface[i] === 0 && !openWater[i]) surface[i] = 1;
  }

  // Sandy shoreline / seawall where land touches water
  for (let z = 1; z < gridH - 1; z++) {
    for (let x = 1; x < gridW - 1; x++) {
      const i = idx(x, z);
      if (
        surface[i] === 1 &&
        (surface[i - 1] === 0 ||
          surface[i + 1] === 0 ||
          surface[i - gridW] === 0 ||
          surface[i + gridW] === 0)
      ) {
        surface[i] = 5;
      }
    }
  }
}

function main() {
  if (!fs.existsSync(RAW_PATH)) {
    throw new Error(`Missing ${RAW_PATH}. Run fetch-lagos-osm.mjs first.`);
  }
  const raw = JSON.parse(fs.readFileSync(RAW_PATH, "utf8"));
  console.log(`Loaded OSM: ${raw.buildings.length} buildings, ${raw.roads.length} roads`);

  const world = createWorld({
    centerLat: 6.442,
    centerLon: 3.42,
    halfWM: HALF_W_M,
    halfHM: HALF_H_M,
    palette: PALETTE,
    ground: 0,
  });

  buildLandmass(world, raw);

  paintParks(world, raw.parks, 0.91, (h) => 2 + Math.floor((h * 100) % 2));

  // Palm/tropical street trees in leafy Ikoyi
  scatterTrees(world, 4, 3, (x, z, h) => {
    const mx = x * CELL_M - HALF_W_M;
    const mz = z * CELL_M - HALF_H_M;
    return h > 0.94 && mx > -200 && mx < 2800 && mz < 100 && mz > -1700;
  });

  paintRoads(world, raw.roads, {
    major: ["motorway", "trunk", "primary", "motorway_link", "trunk_link"],
    mid: "secondary",
    radii: [1.7, 1.2, 0.75],
    bridgeElev: (r) =>
      r.name && r.name.includes("Third Mainland") ? 3 : r.name && r.name.includes("Lekki") ? 4 : 2,
  });

  const districtsOf = (b) => districtsAt(world.latLonToMeters(b.coords[0][0], b.coords[0][1]));
  const heights = stampBuildings(world, raw.buildings, {
    levelM: 3.4,
    maxVox: 72,
    fallbackMeters(h, b) {
      const d = districtsOf(b);
      if (d.marina) return h > 0.88 ? 24 + h * 28 : 8 + h * 14;
      if (d.victoriaIsland) return h > 0.86 ? 20 + h * 26 : 7 + h * 12;
      if (d.ekoAtlantic) return 18 + h * 30;
      if (d.ikoyi) return h > 0.9 ? 18 + h * 22 : 6 + h * 8;
      return 5 + h * 9;
    },
    paletteIndex(voxH, h, b) {
      const fromTag = colourToPaletteIndex(b.colour, PALETTE);
      if (fromTag) return fromTag;
      if (voxH >= 10) return pick([9, 10, 11, 7, 8, 17, 18], h); // glass / slate towers
      const d = districtsOf(b);
      if (d.ikoyi) return pick([1, 2, 16, 19, 3, 13], h);
      if (d.marina) return pick([2, 4, 5, 6, 7, 12, 15], h);
      return pick([1, 2, 3, 4, 5, 12, 13, 15], h);
    },
  });
  const tallCount = heights.filter((voxH) => voxH >= 8).length;

  for (const [lat, lon, radius, height, palIdx] of LANDMARK_TOWERS) {
    stampTower(world, lat, lon, { radius, reach: radius * 1.45, height, minH: 8, taper: 0.14, palIdx });
  }

  // Top 90 longest arterial & bridge routes for moving Danfo buses and BRTs
  const topRoutes = trafficRoutes(world, raw.roads, {
    minPts: 4,
    minLen: 180,
    yBridge: 8.5,
    kinds: ["motorway", "trunk", "primary"],
    fallbackName: (r) => r.highway,
  }).slice(0, 90);
  const ferryRoutes = FERRY_ROUTES.map((f) => ({
    name: f.name,
    kind: "ferry",
    pts: toPath(world, f.coords, 1.5),
  }));

  // Named streets for walk / street-view snap / search
  const walkRoutes = buildWalkRoutes(raw.roads, world.latLonToMeters, {
    maxRoutes: 400,
    minLen: 50,
    yRoad: 3.2,
    yBridge: 8.5,
  });
  const stops = Array.isArray(raw.stops) ? raw.stops : [];

  const bytes = writeWorld(world, OUT_DIR, "lagos-world.bin", "lagos-meta.json", {
    stats: {
      buildings: raw.buildings.length,
      tallBuildings: tallCount,
      roads: raw.roads.length,
      parks: raw.parks.length,
      walkRoutes: walkRoutes.length,
      stops: stops.length,
    },
    routes: [...topRoutes, ...ferryRoutes],
    walkRoutes,
    stops,
  });

  console.log(
    `Built Lagos voxel grid (${world.gridW}x${world.gridH} = ${world.totalCells.toLocaleString()} cells, ${(
      bytes /
      1024 /
      1024
    ).toFixed(2)} MB) + ${topRoutes.length + ferryRoutes.length} transit routes, ${walkRoutes.length} walk streets, ${stops.length} stops.`
  );
}

main();

/**
 * Shared OSM download: tiled api.openstreetmap.org map fetch, resolved into
 * the compact building / road / park / water layers the voxelizers consume.
 */
import { extractStopsFromNodes, labelStopsFromRoads, compactStops } from "./osm-nav.mjs";

export const URBAN_HIGHWAYS = [
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "residential",
  "unclassified",
];

const isUrbanWater = (tags) =>
  tags.natural === "water" || tags.waterway || tags.landuse === "reservoir";

const isUrbanPark = (tags) =>
  tags.leisure === "park" ||
  tags.leisure === "garden" ||
  tags.leisure === "golf_course" ||
  tags.leisure === "recreation_ground" ||
  tags.landuse === "forest" ||
  tags.landuse === "grass" ||
  tags.natural === "wood";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch all OSM elements in a bbox, subdividing 2x2 when the API rejects the
 * tile as too large (HTTP 400, >50,000 nodes).
 * @param {{ userAgent: string, strict?: boolean }} opts
 *   strict: one attempt, no timeout. Otherwise up to 3 attempts, waiting out
 *   rate limits in between. Either way a tile that cannot be fetched throws:
 *   a world built without it would have a silent hole.
 */
export async function fetchTile(south, west, north, east, opts, depth = 0) {
  const { userAgent, strict = false } = opts;
  const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${west.toFixed(5)},${south.toFixed(5)},${east.toFixed(5)},${north.toFixed(5)}`;
  let failure = "no response";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timer = strict ? null : setTimeout(() => controller.abort(), 20000);
      const res = await fetch(url, {
        headers: { "User-Agent": userAgent },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 400 && depth < 2) {
        const midLat = (south + north) / 2;
        const midLon = (west + east) / 2;
        const parts = await Promise.all([
          fetchTile(south, west, midLat, midLon, opts, depth + 1),
          fetchTile(south, midLon, midLat, east, opts, depth + 1),
          fetchTile(midLat, west, north, midLon, opts, depth + 1),
          fetchTile(midLat, midLon, north, east, opts, depth + 1),
        ]);
        return parts.flat();
      }

      if (!strict && (res.status === 429 || res.status === 509 || res.status >= 500)) {
        failure = `HTTP ${res.status}`;
        console.warn(`    ${failure} (rate limit or server trouble), waiting 15s...`);
        if (attempt < 2) await sleep(15000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      if (!strict && !text.startsWith("{")) {
        failure = `rate-limited (${text.slice(0, 60)})`;
        console.warn(`    ${failure}, waiting 16s...`);
        if (attempt < 2) await sleep(16000);
        continue;
      }
      return JSON.parse(text).elements || [];
    } catch (err) {
      // A failed sub-tile has already used its own attempts
      if (strict || err.tileFailed) throw err;
      failure = err.message;
      if (attempt < 2) await sleep(800 * (attempt + 1));
    }
  }
  const err = new Error(`map tile ${south.toFixed(3)},${west.toFixed(3)} failed after 3 attempts: ${failure}`);
  err.tileFailed = true;
  throw err;
}

/**
 * Download `tiles` (`batchSize` at a time) and split the ways into layers.
 * @param {Array<{ south: number, west: number, north: number, east: number }>} tiles
 * @param {{
 *   userAgent: string, strict?: boolean, batchSize: number,
 *   onBatch?: (done: number, nodes: Map, ways: Map) => void,
 *   highways?: string[], isWater?: (tags) => any, isPark?: (tags) => any,
 *   coastlines?: boolean, maxStops?: number,
 * }} opts
 * @returns raw `nodes` (id -> [lat, lon, tags|null]) and `ways` maps plus the resolved layers
 */
export async function fetchOsmLayers(tiles, opts) {
  const {
    batchSize,
    onBatch,
    highways = URBAN_HIGHWAYS,
    isWater = isUrbanWater,
    isPark = isUrbanPark,
    coastlines: wantCoastlines = false,
    maxStops,
  } = opts;

  const nodes = new Map();
  const ways = new Map();
  for (let i = 0; i < tiles.length; i += batchSize) {
    const results = await Promise.all(
      tiles.slice(i, i + batchSize).map((t) => fetchTile(t.south, t.west, t.north, t.east, opts))
    );
    for (const el of results.flat()) {
      if (el.type === "node") nodes.set(el.id, [el.lat, el.lon, el.tags || null]);
      else if (el.type === "way") ways.set(el.id, el);
    }
    if (onBatch) onBatch(i / batchSize + 1, nodes, ways);
  }

  const buildings = [];
  const roads = [];
  const parks = [];
  const waters = [];
  const coastlines = [];

  for (const way of ways.values()) {
    const tags = way.tags || {};
    if (!way.nodes || way.nodes.length < 2) continue;
    const coords = [];
    for (const nid of way.nodes) {
      const n = nodes.get(nid);
      if (!n) break;
      coords.push([Number(n[0].toFixed(6)), Number(n[1].toFixed(6))]);
    }
    if (coords.length < way.nodes.length) continue;

    if (tags.building) {
      buildings.push({
        id: way.id,
        name: tags.name || null,
        levels: tags["building:levels"] ? Number(tags["building:levels"]) : null,
        height: tags.height ? parseFloat(tags.height) : null,
        type: tags.building,
        colour: tags["building:colour"] || null,
        coords,
      });
    } else if (tags.highway) {
      if (highways.includes(tags.highway)) {
        roads.push({
          id: way.id,
          name: tags.name || null,
          highway: tags.highway,
          bridge: Boolean(tags.bridge && tags.bridge !== "no"),
          lanes: tags.lanes ? Number(tags.lanes) : null,
          coords,
        });
      }
    } else if (isWater(tags)) {
      waters.push({
        id: way.id,
        name: tags.name || null,
        waterway: tags.waterway || null,
        coords,
      });
    } else if (wantCoastlines && tags.natural === "coastline") {
      coastlines.push({ id: way.id, coords });
    } else if (isPark(tags)) {
      parks.push({
        id: way.id,
        name: tags.name || null,
        kind: tags.leisure || tags.landuse || tags.natural,
        coords,
      });
    }
  }

  const stops = compactStops(labelStopsFromRoads(extractStopsFromNodes(nodes), roads), maxStops);
  return { nodes, ways, buildings, roads, parks, waters, coastlines, stops };
}

/**
 * Patch existing *-meta.json / lagos-meta.json with walkRoutes + stops
 * without re-voxelizing binaries. Uses local Lagos raw roads when present,
 * otherwise Overpass for named highways + bus stops around each city center.
 *
 * Usage: node scripts/enrich-city-nav.mjs [slug]
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildWalkRoutes,
  extractStopsFromNodes,
  labelStopsFromRoads,
  compactStops,
} from "./lib/osm-nav.mjs";
import { loadCampuses } from "./lib/site-data.mjs";
import { makeProjection } from "./lib/voxel-world.mjs";

const ROOT = process.cwd();
const CITIES_DIR = path.join(ROOT, "public", "data", "cities");
const LAGOS_META = path.join(ROOT, "public", "data", "lagos-meta.json");
const LAGOS_RAW = path.join(ROOT, "data", "raw", "lagos-osm-clean.json");
const OVERPASS = "https://overpass-api.de/api/interpreter";

async function overpassQuery(query) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(OVERPASS, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "AllAboutNigeria-NavEnrich/1.0 (https://allaboutnigeria.ng)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (res.status === 429 || res.status === 504 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
  return { elements: [] };
}

function parseOverpassNav(data, centerLat, centerLon, maxRoutes, maxStops) {
  const nodes = new Map();
  for (const el of data.elements || []) {
    if (el.type === "node") {
      nodes.set(el.id, [el.lat, el.lon, el.tags || null]);
    }
  }

  const roads = [];
  for (const el of data.elements || []) {
    if (el.type !== "way" || !el.tags?.highway || !el.nodes) continue;
    const name = el.tags.name ? String(el.tags.name).trim() : null;
    if (!name) continue;
    const coords = [];
    let missing = false;
    for (const nid of el.nodes) {
      const n = nodes.get(nid);
      if (!n) {
        missing = true;
        break;
      }
      coords.push([n[0], n[1]]);
    }
    if (missing || coords.length < 2) continue;
    roads.push({
      id: el.id,
      name,
      highway: el.tags.highway,
      bridge: Boolean(el.tags.bridge && el.tags.bridge !== "no"),
      coords,
    });
  }

  const rawStops = extractStopsFromNodes(nodes);
  const latLonToMeters = makeProjection(centerLat, centerLon);
  const walkRoutes = buildWalkRoutes(roads, latLonToMeters, {
    maxRoutes,
    minLen: 50,
  });
  const stops = compactStops(labelStopsFromRoads(rawStops, roads), maxStops);
  return { walkRoutes, stops, roadCount: roads.length };
}

function bboxAround(lat, lon, dLat, dLon) {
  return {
    south: lat - dLat,
    west: lon - dLon,
    north: lat + dLat,
    east: lon + dLon,
  };
}

function navQuery(bbox) {
  const { south, west, north, east } = bbox;
  return `
[out:json][timeout:90];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)(_link)?$"]["name"](${south},${west},${north},${east});
  node["highway"="bus_stop"](${south},${west},${north},${east});
  node["public_transport"~"^(platform|stop_position)$"](${south},${west},${north},${east});
  node["amenity"="bus_station"](${south},${west},${north},${east});
  node["amenity"="ferry_terminal"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;
`.trim();
}

function patchMeta(metaPath, walkRoutes, stops) {
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  meta.walkRoutes = walkRoutes;
  meta.stops = stops;
  meta.stats = {
    ...(meta.stats || {}),
    walkRoutes: walkRoutes.length,
    stops: stops.length,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta));
  return meta;
}

async function enrichLagos() {
  console.log("Enriching Lagos…");
  if (!fs.existsSync(LAGOS_META)) {
    console.warn("  skip — no lagos-meta.json");
    return;
  }
  const meta = JSON.parse(fs.readFileSync(LAGOS_META, "utf8"));
  let walkRoutes = [];
  let stops = [];

  if (fs.existsSync(LAGOS_RAW)) {
    const raw = JSON.parse(fs.readFileSync(LAGOS_RAW, "utf8"));
    const latLonToMeters = makeProjection(meta.centerLat, meta.centerLon);
    walkRoutes = buildWalkRoutes(raw.roads || [], latLonToMeters, {
      maxRoutes: 400,
      minLen: 50,
      yRoad: 3.2,
      yBridge: 8.5,
    });
    if (Array.isArray(raw.stops) && raw.stops.length > 0) {
      stops = raw.stops;
    }
  }

  // Always refresh stops from Overpass (raw Lagos export may predate stop extraction)
  const bbox = bboxAround(meta.centerLat, meta.centerLon, 0.028, 0.04);
  try {
    const data = await overpassQuery(navQuery(bbox));
    const parsed = parseOverpassNav(data, meta.centerLat, meta.centerLon, 400, 200);
    if (walkRoutes.length === 0) walkRoutes = parsed.walkRoutes;
    if (parsed.stops.length > 0) stops = parsed.stops;
    console.log(
      `  Overpass: ${parsed.roadCount} named roads, ${parsed.stops.length} stops`
    );
  } catch (err) {
    console.warn(`  Overpass failed (${err.message}); keeping local walkRoutes only`);
  }

  patchMeta(LAGOS_META, walkRoutes, stops);
  console.log(`  → ${walkRoutes.length} walkRoutes, ${stops.length} stops`);
}

async function enrichCityMeta(metaPath, label, dLat, dLon, maxRoutes, maxStops) {
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const bbox = bboxAround(meta.centerLat, meta.centerLon, dLat, dLon);
  try {
    const data = await overpassQuery(navQuery(bbox));
    const { walkRoutes, stops, roadCount } = parseOverpassNav(
      data,
      meta.centerLat,
      meta.centerLon,
      maxRoutes,
      maxStops
    );
    patchMeta(metaPath, walkRoutes, stops);
    console.log(
      `  ${label}: ${roadCount} named roads → ${walkRoutes.length} walkRoutes, ${stops.length} stops`
    );
  } catch (err) {
    console.warn(`  ${label}: failed — ${err.message}`);
  }
}

async function main() {
  const filter = process.argv[2] || null;
  const files = fs
    .readdirSync(CITIES_DIR)
    .filter((f) => f.endsWith("-meta.json"))
    .sort();

  if (!filter || filter === "lagos") {
    await enrichLagos();
    await new Promise((r) => setTimeout(r, 1500));
  }

  const campusSlugs = new Set(loadCampuses().map((p) => p.campusSlug));
  for (const file of files) {
    const slug = file.replace(/-meta\.json$/, "");
    if (filter && filter !== slug) continue;
    const metaPath = path.join(CITIES_DIR, file);
    // Campuses have smaller footprints
    const isCampus = campusSlugs.has(slug);

    const dLat = isCampus ? 0.012 : 0.014;
    const dLon = isCampus ? 0.014 : 0.02;
    const maxRoutes = isCampus ? 120 : 280;
    const maxStops = isCampus ? 80 : 180;

    await enrichCityMeta(metaPath, slug, dLat, dLon, maxRoutes, maxStops);
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log("Done enriching city navigation graphs.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

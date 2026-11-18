/**
 * Voxelize state capitals or university campuses from live OSM into
 * public/data/cities/<slug>.bin + <slug>-meta.json. Existing outputs are
 * skipped unless a slug is given.
 *
 * Usage: node scripts/build-city-voxels.mjs <states|campuses> [slug]
 */
import fs from "node:fs";
import path from "node:path";
import { buildWalkRoutes } from "./lib/osm-nav.mjs";
import { fetchOsmLayers } from "./lib/osm-fetch.mjs";
import { loadCampuses, loadTsArray } from "./lib/site-data.mjs";
import {
  CELL_M,
  V_STEP_M,
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

const PALETTE = [...PALETTE_BASE, "#6d6b68"]; // 19 granite rock / inselberg

// Split a bbox of ±dLat/±dLon around a place into rows x cols fetch tiles
function tilesAround({ lat, lon }, dLat, dLon, rows, cols) {
  const south = lat - dLat;
  const west = lon - dLon;
  const latStep = (lat + dLat - south) / rows;
  const lonStep = (lon + dLon - west) / cols;
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        south: south + r * latStep,
        north: south + (r + 1) * latStep,
        west: west + c * lonStep,
        east: west + (c + 1) * lonStep,
      });
    }
  }
  return tiles;
}

// Granite dome (Aso Rock, Olumo Rock, Mount Patti, Dutse Rock, ...)
function stampRock(world, rock) {
  const [cx, cz] = world.cellAt(rock.lat, rock.lon);
  const radCells = Math.round(rock.radiusM / CELL_M);
  const maxVox = Math.round(rock.heightM / V_STEP_M);
  for (let dz = -radCells; dz <= radCells; dz++) {
    for (let dx = -radCells; dx <= radCells; dx++) {
      const dist = Math.hypot(dx, dz) / radCells;
      if (dist > 1) continue;
      const gx = cx + dx;
      const gz = cz + dz;
      if (!world.inBounds(gx, gz)) continue;
      const vh = Math.max(2, Math.round(maxVox * Math.pow(1 - dist * dist, 0.7)));
      const i = world.idx(gx, gz);
      if (vh > world.bHeight[i]) {
        world.bHeight[i] = vh;
        world.bColor[i] = 19;
      }
    }
  }
}

const KINDS = {
  states: {
    places: () =>
      loadTsArray("nigeria-states.ts", "export const NIGERIA_STATES: NigeriaStateProfile[] = ").filter(
        (s) => s.slug !== "lagos"
      ),
    slug: (state) => state.slug,
    label: (state) => `${state.state} (${state.capital})`,
    halfWM: 1848, // 3696m E-W -> 616 cells (14 * 44)
    halfHM: 1320, // 2640m N-S -> 440 cells (10 * 44)
    walk: { maxRoutes: 280, minLen: 60 },
    fetch: (state) =>
      fetchOsmLayers(tilesAround(state, 0.0125, 0.0175, 2, 3), {
        userAgent: "AllAboutNigeria-3DVoxel/1.0 (https://allaboutnigeria.ng)",
        batchSize: 2,
      }),
    build(world, state, raw) {
      carveWater(world, raw.waters, (w) => (w.waterway === "river" ? 6 : 2.5));
      paintParks(world, raw.parks, 0.9);
      // Sparser street trees in the drier north
      const treeCut = state.lat > 9.5 ? 0.955 : 0.925;
      scatterTrees(world, 3, 4, (x, z, h) => h > treeCut);
      paintRoads(world, raw.roads, {
        major: ["motorway", "trunk", "primary", "motorway_link", "trunk_link"],
        mid: "secondary",
        radii: [1.6, 1.15, 0.7],
      });

      const isFCT = state.slug === "abuja";
      const regional =
        state.zone === "North-West" || state.zone === "North-East"
          ? [12, 13, 2, 3, 4, 15, 1] // warm Sahelian sand, ochre & cream
          : state.zone === "South-West"
          ? [5, 6, 1, 2, 3, 15] // terracotta / rust roofs & warm stucco
          : [1, 2, 3, 5, 13, 15, 7];
      stampBuildings(world, raw.buildings, {
        levelM: 3.4,
        maxVox: 64,
        fallbackMeters: (h) =>
          isFCT ? (h > 0.85 ? 20 + h * 26 : 7 + h * 12) : h > 0.92 ? 16 + h * 18 : 4.5 + h * 8,
        paletteIndex: (voxH, h, b) =>
          colourToPaletteIndex(b.colour, PALETTE) ||
          pick(voxH >= 9 ? [9, 10, 11, 7, 8, 17] : regional, h),
      });

      for (const rock of state.rockFormations || []) stampRock(world, rock);

      // Landmark towers so iconic monuments stand out cleanly
      for (const lm of state.landmarks || []) {
        if (lm.category !== "landmark" && lm.category !== "culture") continue;
        stampTower(world, lm.lat, lm.lon, {
          radius: 2,
          reach: 3,
          height: Math.max(8, Math.min(54, Math.round(lm.elevationM / V_STEP_M))),
          minH: 5,
          taper: 0.18,
          palIdx: lm.category === "culture" ? 12 : 9,
        });
      }

      const routes = trafficRoutes(world, raw.roads, {
        minPts: 3,
        minLen: 140,
        yBridge: 7.5,
        kinds: ["motorway", "trunk", "primary", "secondary"],
        fallbackName: (r) => `${state.capital} ${r.highway}`,
      }).slice(0, 55);
      // One ferry along the first substantial river
      const river = raw.waters.find((w) => w.waterway === "river" && w.coords.length >= 4);
      if (river) {
        routes.push({
          name: river.name || `${state.capital} River Ferry`,
          kind: "ferry",
          len: 800,
          pts: toPath(world, river.coords, 1.5),
        });
      }
      return { routes };
    },
  },

  campuses: {
    places: loadCampuses,
    slug: (campus) => campus.campusSlug,
    label: (campus) => campus.shortName,
    halfWM: 1320, // 2640m E-W -> 440 cells (10 * 44)
    halfHM: 1056, // 2112m N-S -> 352 cells (8 * 44)
    walk: { maxRoutes: 120, minLen: 50 },
    fetch: (campus) =>
      fetchOsmLayers(tilesAround(campus, 0.01, 0.012, 1, 2), {
        userAgent: "AllAboutNigeria-CampusVoxel/1.0",
        batchSize: 2,
        highways: [
          "motorway",
          "trunk",
          "primary",
          "secondary",
          "tertiary",
          "residential",
          "unclassified",
          "service",
        ],
        isWater: (tags) => tags.natural === "water" || tags.waterway,
        isPark: (tags) =>
          tags.leisure || tags.landuse === "forest" || tags.landuse === "grass" || tags.natural === "wood",
        maxStops: 80,
      }),
    build(world, campus, raw) {
      carveWater(world, raw.waters, () => 4.5);
      paintParks(world, raw.parks, 0.89);
      scatterTrees(world, 3, 4, (x, z, h) => h > 0.91);
      paintRoads(world, raw.roads, {
        major: ["motorway", "trunk", "primary", "secondary"],
        mid: "tertiary",
        radii: [1.5, 1.1, 0.7],
      });
      stampBuildings(world, raw.buildings, {
        levelM: 3.5,
        maxVox: 48,
        fallbackMeters: (h) => (h > 0.85 ? 14 + h * 18 : 6 + h * 8),
        paletteIndex: (voxH, h) => pick(voxH >= 7 ? [9, 1, 7, 13, 16] : [1, 2, 5, 6, 12, 13, 15], h),
      });

      // Named amenity nodes first, then named buildings until there are 25
      const pois = [];
      for (const [id, [lat, lon, tags]] of raw.nodes) {
        if (tags && tags.name && (tags.amenity || tags.leisure || tags.tourism || tags.building)) {
          pois.push({ id, name: tags.name, lat, lon, kind: tags.amenity || tags.leisure || "landmark" });
        }
      }
      for (const b of raw.buildings) {
        if (!b.name || pois.length >= 25) continue;
        const [lat, lon] = b.coords[0];
        pois.push({ id: b.id, name: b.name, lat, lon, kind: raw.ways.get(b.id).tags.amenity || b.type });
      }

      const routes = trafficRoutes(world, raw.roads, {
        minPts: 3,
        minLen: 110,
        yBridge: 7.5,
        fallbackName: () => `${campus.shortName} Campus Road`,
      }).slice(0, 45);
      return { pois: pois.slice(0, 20), routes };
    },
  },
};

async function main() {
  const [kindName, filterSlug = null] = process.argv.slice(2);
  const kind = KINDS[kindName];
  if (!kind) {
    console.error("Usage: node scripts/build-city-voxels.mjs <states|campuses> [slug]");
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "public", "data", "cities");
  const all = kind.places();
  const targets = filterSlug ? all.filter((p) => kind.slug(p) === filterSlug) : all;
  console.log(`Building real OSM 3D voxel worlds for ${targets.length} ${kindName}...`);

  const failed = [];
  for (let i = 0; i < targets.length; i++) {
    const place = targets[i];
    const slug = kind.slug(place);
    const tag = `[${i + 1}/${targets.length}] ${kind.label(place)}`;
    if (!filterSlug && fs.existsSync(path.join(outDir, `${slug}.bin`))) {
      console.log(`${tag} — cached, skipping`);
      continue;
    }
    const t0 = Date.now();
    let raw;
    try {
      raw = await kind.fetch(place);
    } catch (err) {
      // Incomplete map data: leave any existing world in place rather than write one with holes
      console.error(`${tag} — NOT built: ${err.message}`);
      failed.push(slug);
      continue;
    }
    const world = createWorld({
      centerLat: place.lat,
      centerLon: place.lon,
      halfWM: kind.halfWM,
      halfHM: kind.halfHM,
      palette: PALETTE,
    });
    const built = kind.build(world, place, raw);
    const walkRoutes = buildWalkRoutes(raw.roads, world.latLonToMeters, kind.walk);
    writeWorld(world, outDir, `${slug}.bin`, `${slug}-meta.json`, {
      stats: {
        buildings: raw.buildings.length,
        roads: raw.roads.length,
        parks: raw.parks.length,
        walkRoutes: walkRoutes.length,
        stops: raw.stops.length,
      },
      ...built,
      walkRoutes,
      stops: raw.stops,
    });
    console.log(
      `${tag}: ${raw.buildings.length} buildings, ${raw.roads.length} roads (${Date.now() - t0}ms)`
    );
  }

  if (failed.length > 0) {
    console.error(
      `${failed.length} of ${targets.length} ${kindName} were not built: ${failed.join(", ")}.\n` +
        `Re-run one with: node scripts/build-city-voxels.mjs ${kindName} <slug>`
    );
    process.exit(1);
  }
  console.log(`All ${kindName} voxelized!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

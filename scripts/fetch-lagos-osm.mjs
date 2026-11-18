import fs from "node:fs";
import path from "node:path";
import { fetchOsmLayers } from "./lib/osm-fetch.mjs";

const BBOX = {
  south: 6.418,
  west: 3.384,
  north: 6.466,
  east: 3.456,
};

async function main() {
  const latStep = 0.012;
  const lonStep = 0.012;
  const tiles = [];

  for (let lat = BBOX.south; lat < BBOX.north - 1e-6; lat += latStep) {
    for (let lon = BBOX.west; lon < BBOX.east - 1e-6; lon += lonStep) {
      tiles.push({
        south: lat,
        west: lon,
        north: Math.min(lat + latStep, BBOX.north),
        east: Math.min(lon + lonStep, BBOX.east),
      });
    }
  }

  console.log(`Fetching ${tiles.length} real OSM tiles for Central Lagos...`);
  // Small batches of 3 to stay polite to api.openstreetmap.org; any failed tile aborts the run
  const { buildings, roads, parks, waters, coastlines, stops } = await fetchOsmLayers(tiles, {
    userAgent: "AllAboutNigeria-LagosVoxel/1.0 (https://allaboutnigeria.ng)",
    strict: true,
    batchSize: 3,
    coastlines: true,
    onBatch: (done, nodes, ways) =>
      console.log(
        `  Batch ${done}/${Math.ceil(tiles.length / 3)}: ${nodes.size} nodes, ${ways.size} ways`
      ),
  });

  const outDir = path.join(process.cwd(), "data", "raw");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "lagos-osm-clean.json");
  const payload = {
    bbox: BBOX,
    counts: {
      buildings: buildings.length,
      roads: roads.length,
      parks: parks.length,
      waters: waters.length,
      coastlines: coastlines.length,
      stops: stops.length,
    },
    buildings,
    roads,
    parks,
    waters,
    coastlines,
    stops,
  };
  fs.writeFileSync(outFile, JSON.stringify(payload));
  const stats = fs.statSync(outFile);
  console.log(
    `Done! Saved ${buildings.length} buildings, ${roads.length} roads, ${parks.length} parks, ${waters.length} water ways, ${stops.length} bus stops (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

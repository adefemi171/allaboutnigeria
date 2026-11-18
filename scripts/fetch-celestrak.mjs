#!/usr/bin/env node
// Save a snapshot of the orbits the Sky page uses, as public/data/celestrak.json.
// The page asks /api/satellites for current orbits and only falls back on this
// file when that fails, so it needs refreshing now and then, not every day:
//
//   node scripts/fetch-celestrak.mjs
//
// Celestrak asks for roughly 2 hours between downloads of the same group.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "celestrak.json");
const BASE = "https://celestrak.org/NORAD/elements/gp.php";

// The same groups as src/app/api/satellites/route.ts.
/** Searched for passes: Earth-watching, weather and crewed. */
const SEARCH_GROUPS = ["resource", "weather", "stations"];
/** Only dots on the globe. */
const OTHER_GROUPS = ["science", "cubesat"];

async function fetchGroup(group) {
  const response = await fetch(`${BASE}?GROUP=${group}&FORMAT=json`, {
    headers: { "User-Agent": "AllAboutNigeria-Sky/1.0 (https://allaboutnigeria.ng)" },
  });
  if (!response.ok) throw new Error(`${group}: HTTP ${response.status}`);
  const records = await response.json();
  if (!Array.isArray(records)) throw new Error(`${group}: expected a JSON array`);
  console.log(`${group}: ${records.length}`);
  return records;
}

const seen = new Set();
async function collect(groups) {
  const added = [];
  for (const group of groups) {
    for (const record of await fetchGroup(group)) {
      const id = Number(record.NORAD_CAT_ID);
      if (!Number.isFinite(id) || seen.has(id)) continue;
      seen.add(id);
      added.push(record);
    }
  }
  return added;
}

const file = {
  fetchedAt: new Date().toISOString(),
  search: await collect(SEARCH_GROUPS),
  others: await collect(OTHER_GROUPS),
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(file));
console.log(`Wrote ${file.search.length} + ${file.others.length} satellites to ${OUT}`);

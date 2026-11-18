import { NextResponse } from "next/server";
import type { CatalogFile } from "@/lib/satellites/catalog";
import type { GpRecord } from "@/lib/satellites/types";
import { cachedUpstream, UPSTREAM_HEADERS } from "@/lib/upstream-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The same groups as scripts/fetch-celestrak.mjs, which saves the fallback.
/** Celestrak's groups that are searched for passes: Earth-watching, weather and crewed. */
const SEARCH_GROUPS = ["resource", "weather", "stations"];
/** Groups that are only dots on the globe. */
const OTHER_GROUPS = ["science", "cubesat"];

// Celestrak renews its elements every two hours and asks not to be fetched more often
const CACHE_MS = 3 * 60 * 60 * 1000;

const fetchGroup = cachedUpstream<GpRecord[]>(CACHE_MS, 10, async (group) => {
  const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`, {
    headers: UPSTREAM_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  // When it has nothing, Celestrak says so in plain text with a 200
  const records: unknown = res.ok ? await res.json() : null;
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`Celestrak returned no orbits for ${group}`);
  }
  return records;
});

/** The current orbits (Celestrak GP elements, as JSON) of the satellites the Sky page shows. */
export async function GET() {
  try {
    const groups = await Promise.all([...SEARCH_GROUPS, ...OTHER_GROUPS].map(fetchGroup));
    const byId = new Map<number, GpRecord>();
    const collect = (from: number, to: number) => {
      const added: GpRecord[] = [];
      for (const record of groups.slice(from, to).flatMap((group) => group.value)) {
        const id = Number(record.NORAD_CAT_ID);
        if (!Number.isFinite(id) || byId.has(id)) continue;
        byId.set(id, record);
        added.push(record);
      }
      return added;
    };
    const file: CatalogFile = {
      fetchedAt: new Date(Math.min(...groups.map((group) => group.fetchedAt))).toISOString(),
      search: collect(0, SEARCH_GROUPS.length),
      others: collect(SEARCH_GROUPS.length, groups.length),
    };
    return NextResponse.json(file, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

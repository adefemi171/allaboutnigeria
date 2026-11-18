import { NextRequest, NextResponse } from "next/server";
import type { WeekAnswer, YearAnswer } from "@/lib/satellites/scenes";
import type { ArchiveItem, Collection } from "@/lib/satellites/types";
import { cachedUpstream, UPSTREAM_HEADERS } from "@/lib/upstream-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Sentinel-2 began covering Nigeria at the very end of 2015. */
const FIRST_YEAR = 2016;
/** With a scene this clear in the week there is no need to look further back. */
const FAIRLY_CLEAR_PCT = 25;
/** A scene with less cloud than this across its frame counts as a clear look. */
const CLEAR_PCT = 10;
/** One overpass is filed as several overlapping frames, minutes apart at most. */
const SAME_PASS_MS = 10 * 60 * 1000;

interface StacItem {
  id: string;
  collection: Collection;
  properties: { datetime: string; platform?: string; "eo:cloud_cover"?: number };
}

async function stacSearch(
  lat: number,
  lon: number,
  options: {
    collections: Collection[];
    fromMs: number;
    toMs: number;
    limit: number;
    maxCloudPct?: number;
    sortBy: "datetime" | "eo:cloud_cover";
  }
): Promise<ArchiveItem[]> {
  const res = await fetch(STAC_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...UPSTREAM_HEADERS },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      collections: options.collections,
      intersects: { type: "Point", coordinates: [lon, lat] },
      datetime: `${new Date(options.fromMs).toISOString()}/${new Date(options.toMs).toISOString()}`,
      ...(options.maxCloudPct !== undefined && {
        query: { "eo:cloud_cover": { lt: options.maxCloudPct } },
      }),
      sortby: [
        {
          field: `properties.${options.sortBy}`,
          direction: options.sortBy === "datetime" ? "desc" : "asc",
        },
      ],
      limit: options.limit,
    }),
  });
  if (!res.ok) throw new Error(`Imagery search failed (${res.status})`);
  const data = (await res.json()) as { features: StacItem[] };

  const scenes: ArchiveItem[] = [];
  for (const item of data.features) {
    const platform = item.properties.platform ?? "";
    const time = Date.parse(item.properties.datetime);
    const twin = scenes.some(
      (kept) => kept.platform === platform && Math.abs(Date.parse(kept.datetime) - time) < SAME_PASS_MS
    );
    if (twin) continue;
    scenes.push({
      id: item.id,
      collection: item.collection,
      datetime: item.properties.datetime,
      platform,
      cloudCover: item.properties["eo:cloud_cover"] ?? null,
    });
  }
  return scenes;
}

const point = (key: string) => key.split(",").map(Number);

const searchWeek = cachedUpstream<WeekAnswer>(HOUR_MS, 500, async (key) => {
  const [lat, lon] = point(key);
  const now = Date.now();
  const scenes = await stacSearch(lat, lon, {
    collections: ["sentinel-2-l2a", "landsat-c2-l2"],
    fromMs: now - 7 * DAY_MS,
    toMs: now,
    limit: 80,
    sortBy: "datetime",
  });
  if (scenes.some((scene) => (scene.cloudCover ?? 100) < FAIRLY_CLEAR_PCT)) {
    return { scenes, clearLook: null };
  }
  // The coast is under cloud for much of the year: fall back on the last clear look
  const [clearLook = null] = await stacSearch(lat, lon, {
    collections: ["sentinel-2-l2a"],
    fromMs: now - 365 * DAY_MS,
    toMs: now,
    limit: 1,
    maxCloudPct: CLEAR_PCT,
    sortBy: "datetime",
  });
  return { scenes, clearLook };
});

// What a past year holds does not change
const searchYear = cachedUpstream<YearAnswer>(DAY_MS, 2000, async (key) => {
  const [lat, lon, year] = point(key);
  const scenes = await stacSearch(lat, lon, {
    collections: ["sentinel-2-l2a"],
    fromMs: Date.UTC(year, 0, 1),
    toMs: Math.min(Date.UTC(year + 1, 0, 1), Date.now()),
    limit: 4,
    maxCloudPct: 20,
    sortBy: "eo:cloud_cover",
  });
  return { scenes };
});

/**
 * ?lat=..&lon=.. — the Sentinel-2 and Landsat scenes of a point in the last seven days,
 *   and the last clear one of the past year if cloud hid it all week
 * ?lat=..&lon=..&year=2019 — the clearest Sentinel-2 scenes of that year
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const lat = Number.parseFloat(params.get("lat") ?? "");
  const lon = Number.parseFloat(params.get("lon") ?? "");
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }
  const year = params.get("year");
  if (year !== null && !(Number(year) >= FIRST_YEAR && Number(year) <= new Date().getUTCFullYear())) {
    return NextResponse.json({ error: `year must be ${FIRST_YEAR} or later` }, { status: 400 });
  }
  // About 100 m: nearby requests share one answer
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  try {
    const found = year === null ? await searchWeek(key) : await searchYear(`${key},${Number(year)}`);
    return NextResponse.json(found.value, {
      headers: { "Cache-Control": `public, max-age=${year === null ? 600 : 86400}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Imagery search failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

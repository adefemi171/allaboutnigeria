import { NextRequest, NextResponse } from "next/server";
import { NIGERIA_BOX, type PlaceHit } from "@/lib/satellites/places";
import { cachedUpstream, UPSTREAM_HEADERS } from "@/lib/upstream-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTON = "https://photon.komoot.io";
// Streets don't move: a day is plenty
const CACHE_MS = 24 * 60 * 60 * 1000;

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    countrycode?: string;
  };
}

/** Ask Photon, a geocoder on OpenStreetMap data, and keep what lies in Nigeria. */
async function photon(path: string, params: string[][]): Promise<PlaceHit[]> {
  const res = await fetch(`${PHOTON}/${path}?${new URLSearchParams([...params, ["lang", "en"]])}`, {
    headers: UPSTREAM_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const data = (await res.json()) as { features: PhotonFeature[] };

  const hits: PlaceHit[] = [];
  const seen = new Set<string>();
  for (const f of data.features) {
    const p = f.properties;
    if (p.countrycode !== "NG") continue;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const title = p.name || street;
    if (!title) continue;
    const context = [p.name ? street : "", p.district, p.city, p.county, p.state].filter(
      (part, i, all) => part && part !== title && all.indexOf(part) === i
    );
    const subtitle = context.slice(0, 3).join(", ");
    // OSM splits long roads into many segments with the same name
    const dedupeKey = `${title}|${subtitle}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    hits.push({
      id: `${p.osm_type}${p.osm_id}`,
      title,
      subtitle,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
    });
  }
  return hits;
}

const search = cachedUpstream(CACHE_MS, 2000, (q) =>
  photon("api/", [["q", q], ["limit", "8"], ["bbox", NIGERIA_BOX.join(",")]])
);

// A spot is named after the street or the area it is in, not the shop next door
const REVERSE_LAYERS = ["street", "locality", "district", "city"].map((layer) => ["layer", layer]);

const reverse = cachedUpstream(CACHE_MS, 2000, async (key) => {
  const [lat, lon] = key.split(",");
  const [nearest] = await photon("reverse", [["lat", lat], ["lon", lon], ["limit", "1"], ...REVERSE_LAYERS]);
  return nearest ?? null;
});

/**
 * ?q=allen avenue — streets, areas and landmarks in Nigeria
 * ?lat=6.6018&lon=3.3515 — what is at a spot, or null if nothing is mapped near it
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  try {
    if (params.has("q")) {
      const q = (params.get("q") ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      if (q.length < 3 || q.length > 120) {
        return NextResponse.json({ error: "q must be 3 to 120 characters" }, { status: 400 });
      }
      return NextResponse.json({ places: (await search(q)).value });
    }
    const lat = Number.parseFloat(params.get("lat") ?? "");
    const lon = Number.parseFloat(params.get("lon") ?? "");
    if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
      return NextResponse.json({ error: "q, or lat and lon, are required" }, { status: 400 });
    }
    // About 100 m: nearby spots share one answer
    return NextResponse.json({ place: (await reverse(`${lat.toFixed(3)},${lon.toFixed(3)}`)).value });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Place search failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

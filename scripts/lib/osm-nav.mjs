/**
 * Shared helpers: bake walkable named streets + bus stops into city meta
 * so the 3D scene can move people without a hard-coded landmark list.
 */

const HIGHWAY_FALLBACK =
  /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|path|footway|bridleway|track|living_street)(_link)?$/i;

/**
 * @param {Array<{ name?: string|null, highway?: string, bridge?: boolean, coords: [number, number][] }>} roads
 * @param {(lat: number, lon: number) => [number, number]} latLonToMeters
 * @param {{ maxRoutes?: number, minLen?: number, yRoad?: number, yBridge?: number }} [opts]
 */
export function buildWalkRoutes(roads, latLonToMeters, opts = {}) {
  const maxRoutes = opts.maxRoutes ?? 320;
  const minLen = opts.minLen ?? 60;
  const yRoad = opts.yRoad ?? 3.2;
  const yBridge = opts.yBridge ?? 7.5;

  /** @type {Map<string, { name: string, kind: string, len: number, pts: [number, number, number][] }>} */
  const byName = new Map();

  for (const r of roads) {
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name || HIGHWAY_FALLBACK.test(name)) continue;
    if (!r.coords || r.coords.length < 2) continue;

    const pts = r.coords.map(([lat, lon]) => {
      const [mx, mz] = latLonToMeters(lat, lon);
      return /** @type {[number, number, number]} */ ([
        Number(mx.toFixed(1)),
        r.bridge ? yBridge : yRoad,
        Number(mz.toFixed(1)),
      ]);
    });

    let len = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      len += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][2] - pts[k][2]);
    }
    if (len < minLen) continue;

    const key = name.toLowerCase();
    const kind = r.bridge ? "bridge" : r.highway || "residential";
    const prev = byName.get(key);
    if (!prev || len > prev.len) {
      byName.set(key, { name, kind, len: Math.round(len), pts });
    }
  }

  return [...byName.values()].sort((a, b) => b.len - a.len).slice(0, maxRoutes);
}

/**
 * @param {Map<number, [number, number, Record<string, string>|null]>} nodes
 *   Map of nodeId -> [lat, lon, tags|null]
 */
export function extractStopsFromNodes(nodes) {
  /** @type {Array<{ id: number, name: string|null, lat: number, lon: number, kind: string }>} */
  const stops = [];
  for (const [id, n] of nodes.entries()) {
    const tags = n[2];
    if (!tags) continue;
    const kind = stopKindFromTags(tags);
    if (!kind) continue;
    stops.push({
      id,
      name: tags.name ? String(tags.name).trim() : null,
      lat: n[0],
      lon: n[1],
      kind,
    });
  }
  return stops;
}

/**
 * @param {Record<string, string>} tags
 */
export function stopKindFromTags(tags) {
  if (tags.highway === "bus_stop") return "bus_stop";
  if (tags.amenity === "bus_station") return "bus_station";
  if (tags.public_transport === "platform" || tags.public_transport === "stop_position") {
    if (tags.bus === "yes" || tags.highway === "bus_stop" || !tags.railway) {
      return tags.public_transport;
    }
  }
  if (tags.amenity === "ferry_terminal") return "ferry_terminal";
  return null;
}

/**
 * Label unnamed stops from the nearest named road within maxDistM.
 * @param {Array<{ id: number, name: string|null, lat: number, lon: number, kind: string }>} stops
 * @param {Array<{ name?: string|null, coords: [number, number][] }>} roads
 * @param {number} [maxDistM]
 */
export function labelStopsFromRoads(stops, roads, maxDistM = 40) {
  const namedRoads = roads.filter((r) => r.name && r.coords && r.coords.length >= 2);
  const mPerLat = 110574;

  return stops.map((s) => {
    if (s.name) return { ...s, name: s.name };
    let bestName = null;
    let bestD = maxDistM;
    const mPerLon = 111320 * Math.cos((s.lat * Math.PI) / 180);
    for (const r of namedRoads) {
      for (const [lat, lon] of r.coords) {
        const d = Math.hypot((lon - s.lon) * mPerLon, (lat - s.lat) * mPerLat);
        if (d < bestD) {
          bestD = d;
          bestName = r.name;
        }
      }
    }
    const label = bestName
      ? `${bestName} stop`
      : s.kind === "bus_station"
      ? "Bus station"
      : s.kind === "ferry_terminal"
      ? "Ferry terminal"
      : "Bus stop";
    return { ...s, name: label };
  });
}

/**
 * Compact stops for meta JSON (named only after labeling).
 * @param {Array<{ id: number, name: string|null, lat: number, lon: number, kind: string }>} stops
 * @param {number} [maxStops]
 */
export function compactStops(stops, maxStops = 180) {
  const seen = new Set();
  const out = [];
  for (const s of stops) {
    if (!s.name) continue;
    const key = `${s.name.toLowerCase()}|${s.lat.toFixed(4)}|${s.lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: s.id,
      name: s.name,
      lat: Number(s.lat.toFixed(6)),
      lon: Number(s.lon.toFixed(6)),
      kind: s.kind,
    });
    if (out.length >= maxStops) break;
  }
  return out;
}

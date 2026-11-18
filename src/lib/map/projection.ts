// Coordinates.
//
// The 3D scene is laid out on a transverse Mercator projection of a sphere,
// with its central meridian through the middle of Nigeria. It is conformal,
// so streets keep their angles and buildings their shapes, and its scale is
// within half a percent of true across the whole country. The scene uses
// kilometres with its origin at ORIGIN: +x is east, +z is south, +y is up.
//
// The live tiles (streets, buildings, the satellite picture) are cut in Web
// Mercator, so the helpers for that grid live here too. The data build
// (scripts/build-map-data.mjs) imports this file, which is why it has no
// imports of its own and only type syntax that Node can strip.

export const EARTH_RADIUS_KM = 6371;

/** The middle of Nigeria's bounding box. */
export const ORIGIN = { lat: 9.08, lon: 8.68 } as const;

const RAD = Math.PI / 180;
const PHI0 = ORIGIN.lat * RAD;

/** WGS84 degrees to scene kilometres, as [x, z]. */
export function latLonToWorld(lat: number, lon: number): [number, number] {
  const phi = lat * RAD;
  const lambda = (lon - ORIGIN.lon) * RAD;
  const b = Math.cos(phi) * Math.sin(lambda);
  const x = EARTH_RADIUS_KM * Math.atanh(b);
  const north = EARTH_RADIUS_KM * (Math.atan2(Math.tan(phi), Math.cos(lambda)) - PHI0);
  return [x, -north];
}

/** Scene kilometres to WGS84 degrees, as [lat, lon]. */
export function worldToLatLon(x: number, z: number): [number, number] {
  const d = -z / EARTH_RADIUS_KM + PHI0;
  const k = x / EARTH_RADIUS_KM;
  const lat = Math.asin(Math.sin(d) / Math.cosh(k)) / RAD;
  const lon = ORIGIN.lon + Math.atan2(Math.sinh(k), Math.cos(d)) / RAD;
  return [lat, lon];
}

// ------------------------------------------------------------ Web Mercator --

/** Position in the Web Mercator tile grid of a zoom level, as fractional [x, y]. */
export function lonLatToTile(lat: number, lon: number, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const s = Math.sin(lat * RAD);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

/** WGS84 degrees of a point in the Web Mercator tile grid, as [lat, lon]. */
export function tileToLatLon(x: number, y: number, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) / RAD;
  return [lat, (x / n) * 360 - 180];
}

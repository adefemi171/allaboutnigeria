// The places the satellite page can be about, and how one is named and
// kept in the address bar.

/** A state capital: one of the site's own places. */
export interface Place {
  /** The slug of its state, as in /explore/<slug>. */
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
}

/** A street, an area or a landmark the place search found. */
export interface PlaceHit {
  id: string;
  title: string;
  subtitle: string;
  lat: number;
  lon: number;
}

/** The place the page is about. One of the site's own places has an id. */
export interface Focus {
  lat: number;
  lon: number;
  label: string;
  id?: string;
  /** The visitor's own position: kept out of the address bar. */
  own?: boolean;
}

/** Roughly Nigeria: west, south, east, north. */
export const NIGERIA_BOX = [2.5, 4.0, 14.8, 14.0] as const;

export function inNigeria({ lat, lon }: { lat: number; lon: number }): boolean {
  const [west, south, east, north] = NIGERIA_BOX;
  return lat > south && lat < north && lon > west && lon < east;
}

/** "6.442°N 3.420°E" */
export function coordinates(lat: number, lon: number): string {
  const part = (value: number, plus: string, minus: string) =>
    `${Math.abs(value).toFixed(3)}°${value < 0 ? minus : plus}`;
  return `${part(lat, "N", "S")} ${part(lon, "E", "W")}`;
}

export function focusOn(place: Place): Focus {
  return { lat: place.lat, lon: place.lon, label: place.name, id: place.id };
}

/** The state capital nearest a spot. Near enough on the scale of a country. */
export function nearestPlace(places: Place[], lat: number, lon: number): Place {
  const away = (place: Place) => (place.lat - lat) ** 2 + (place.lon - lon) ** 2;
  return places.reduce((best, place) => (away(place) < away(best) ? place : best));
}

/** The place a link asks for: "?place=kano", or "?lat=6.60&lon=3.35&name=Allen Avenue". */
export function focusFromUrl(places: Place[], search: string): Focus | null {
  const params = new URLSearchParams(search);
  const place = places.find((candidate) => candidate.id === params.get("place"));
  if (place) return focusOn(place);
  const lat = Number.parseFloat(params.get("lat") ?? "");
  const lon = Number.parseFloat(params.get("lon") ?? "");
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return null;
  return { lat, lon, label: params.get("name") || coordinates(lat, lon) };
}

/** The same place as a query string. */
export function queryFor(focus: Focus): string {
  return focus.id
    ? `?place=${encodeURIComponent(focus.id)}`
    : `?lat=${focus.lat.toFixed(5)}&lon=${focus.lon.toFixed(5)}&name=${encodeURIComponent(focus.label)}`;
}

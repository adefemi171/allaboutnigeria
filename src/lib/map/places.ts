// The places the map names: state capitals, universities and landmarks, from
// the site's own lists (src/data). This only decides how the map shows them.

import { NIGERIA_PLACES, type PlaceCategory } from "@/data/nigeria-places";
import { NIGERIA_STATES } from "@/data/nigeria-states";

export type PlaceKind = "city" | "university" | "landmark";

export interface MapPlace {
  id: string;
  name: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  /** "Kano State" */
  state: string;
  /** 1 shows from far away, 3 only when zoomed in. */
  rank: 1 | 2 | 3;
  /** A single spot, such as a building: the map goes down to its street. */
  streets: boolean;
  blurb: string;
  /** More about it elsewhere on the site. */
  link: { href: string; label: string } | null;
}

/** Spread out over a park or a range of hills: shown from above, not from a street. */
const WIDE: PlaceCategory[] = ["nature"];

function guide(slug: string): MapPlace["link"] {
  return slug ? { href: `/guides/${slug}`, label: "Read the guide" } : null;
}

/**
 * Every place, with cities ranked by how many people live around them.
 * @param peopleNear Residents within a few kilometres of a point.
 */
export function mapPlaces(peopleNear: (lat: number, lon: number) => number): MapPlace[] {
  const cities = NIGERIA_STATES.map((state) => ({
    state,
    people: peopleNear(state.lat, state.lon),
  })).sort((a, b) => b.people - a.people);

  const places: MapPlace[] = cities.map(({ state }, order) => ({
    id: `city-${state.slug}`,
    // "Lagos (Ikeja / Island)" is Lagos.
    name: state.capital.replace(/\s*\(.*\)$/, ""),
    kind: "city",
    lat: state.lat,
    lon: state.lon,
    state: state.state,
    rank: order < 6 ? 1 : order < 16 ? 2 : 3,
    streets: false,
    blurb: state.tagline,
    link: {
      href: state.slug === "lagos" ? "/lagos" : `/explore/${state.slug}`,
      label: "Open the 3D city",
    },
  }));

  for (const state of NIGERIA_STATES) {
    for (const landmark of state.landmarks) {
      places.push({
        id: `landmark-${landmark.id}`,
        name: landmark.name,
        kind: "landmark",
        lat: landmark.lat,
        lon: landmark.lon,
        state: state.state,
        rank: 3,
        streets: landmark.category !== "district",
        blurb: landmark.summary,
        link: guide(landmark.guideSlug),
      });
    }
  }

  for (const place of NIGERIA_PLACES) {
    const university = place.category === "university";
    places.push({
      id: `place-${place.id}`,
      name: place.name,
      kind: university ? "university" : "landmark",
      lat: place.lat,
      lon: place.lon,
      state: place.state,
      rank: place.has3DCampus || place.category === "landmark" ? 2 : 3,
      streets: !university && !WIDE.includes(place.category),
      blurb: place.summary,
      link:
        place.has3DCampus && place.campusSlug
          ? { href: `/explore/${place.campusSlug}`, label: "Open the 3D campus" }
          : guide(place.guideSlug),
    });
  }
  return places;
}

import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { SatellitePage } from "@/components/sky/SatellitePage";
import { NIGERIA_STATES } from "@/data/nigeria-states";
import type { Place } from "@/lib/satellites/places";

export const metadata: Metadata = {
  title: "Sky: who watched here this week — All About Nigeria",
  description:
    "Who watched a place in Nigeria this week: satellite passes from public orbit data, and the pictures Sentinel, Landsat and the weather satellites took of it.",
};

/** The state capitals. Only what the page needs of them goes to the browser. */
const PLACES: Place[] = NIGERIA_STATES.map((state) => ({
  id: state.slug,
  // "Lagos (Ikeja / Island)" is Lagos
  name: state.capital.replace(/\s*\(.*\)$/, ""),
  state: state.state,
  lat: state.lat,
  lon: state.lon,
}));

/** The cities offered as buttons, by the slug of their state. */
const PICKS = ["lagos", "abuja", "kano", "rivers", "oyo"].flatMap(
  (slug) => PLACES.find((place) => place.id === slug) ?? []
);

export default function SkyPage() {
  return (
    <>
      <Navbar scene />
      <SatellitePage places={PLACES} picks={PICKS} />
    </>
  );
}

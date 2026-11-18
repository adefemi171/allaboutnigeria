// NASA GIBS: every day's pictures from the weather satellites, stitched
// into one mosaic of the world per satellite and served as plain images.

import { sunPosition } from "@/lib/sun";
import { utcDay } from "./time";
import type { MatchedPass } from "./types";

const WMS =
  "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap" +
  "&VERSION=1.1.1&SRS=EPSG:4326&STYLES=&FORMAT=image/jpeg";

/** West, south, east, north, in degrees. */
export type Box = [number, number, number, number];

/** The mosaic the globe wears: VIIRS on NOAA-20, in true colour. */
export const GLOBE_LAYER = "VIIRS_NOAA20_CorrectedReflectance_TrueColor";

/** A part of one day's mosaic as a JPEG. */
export function gibsPicture(
  layer: string,
  day: string,
  box: Box,
  width: number,
  height: number,
): string {
  return `${WMS}&WIDTH=${width}&HEIGHT=${height}&LAYERS=${layer}&TIME=${day}&BBOX=${box.join(",")}`;
}

/**
 * The satellites with a daily mosaic, by catalogue number. `reachDeg` is
 * how far to the side of its path the camera gets a place and the ground
 * around it into the picture. VIIRS sees 1,500 km to either side. MODIS
 * sees 1,165 km, which this close to the equator leaves a strip between
 * one orbit and the next that it misses for the day.
 */
const DAILY: Record<number, { name: string; layer: string; metres: number; reachDeg: number }> = {
  43013: { name: "NOAA-20", layer: GLOBE_LAYER, metres: 375, reachDeg: 12.4 },
  54234: {
    name: "NOAA-21",
    layer: "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
    metres: 375,
    reachDeg: 12.4,
  },
  25994: {
    name: "Terra",
    layer: "MODIS_Terra_CorrectedReflectance_TrueColor",
    metres: 250,
    reachDeg: 9.4,
  },
  27424: {
    name: "Aqua",
    layer: "MODIS_Aqua_CorrectedReflectance_TrueColor",
    metres: 250,
    reachDeg: 9.4,
  },
};

/** Half the side of a daily picture of a place, km, and its side in pixels. */
const REACH_KM = 120;
const SIDE = 640;
/** A mosaic takes a few hours to appear. */
const DELAY_MS = 4 * 3600_000;
/** The sun has to stand this high over the place for a pass to be in the mosaic. */
const SUN_UP_DEG = 6;

/**
 * Give the weather satellites their pictures. A mosaic is made of the
 * daylight passes of its day, so for each satellite and day the daylight
 * pass that came closest gets the picture of the place.
 */
export function addDaily(passes: MatchedPass[], lat: number, lon: number): void {
  const reach = REACH_KM / 111.2;
  const wide = reach / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const box: Box = [lon - wide, lat - reach, lon + wide, lat + reach];
  const latest = Date.now() - DELAY_MS;

  const best = new Map<string, MatchedPass>();
  for (const pass of passes) {
    const source = DAILY[pass.noradId];
    const time = new Date(pass.time);
    if (!source || pass.scene || time.getTime() > latest) continue;
    if (pass.angleDeg > source.reachDeg) continue;
    if (sunPosition(time, lat, lon).altitude < SUN_UP_DEG) continue;
    const key = `${source.layer}:${utcDay(time)}`;
    const held = best.get(key);
    if (!held || pass.angleDeg < held.angleDeg) best.set(key, pass);
  }
  for (const [key, pass] of best) {
    const { name, layer, metres } = DAILY[pass.noradId];
    const day = utcDay(pass.time);
    pass.label = "watched";
    pass.scene = {
      id: key,
      datetime: pass.time,
      platform: name,
      cloudCover: null,
      thumbnail: gibsPicture(layer, day, box, SIDE, SIDE),
      collection: null,
      href: `https://worldview.earthdata.nasa.gov/?v=${box.join(",")}&l=${layer}&t=${day}`,
      noradId: pass.noradId,
      metres,
      daily: true,
    };
  }
}

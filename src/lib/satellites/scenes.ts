// Pictures in the open archives: Sentinel-2 and Landsat scenes over a
// place, from Microsoft's Planetary Computer. The site's own /api/scenes
// does the searching (and remembers the answers); the pictures themselves
// the browser fetches from the archive, which cuts and scales them to order.

import type { ArchiveItem, Collection, Scene } from "./types";

const ARCHIVE = "https://planetarycomputer.microsoft.com/api";

/** How the archive is to turn a scene's measurements into a colour picture. */
const RENDER: Record<Collection, string> = {
  "sentinel-2-l2a": "assets=visual&asset_bidx=visual%7C1%2C2%2C3&nodata=0",
  "landsat-c2-l2":
    "assets=red&assets=green&assets=blue&nodata=0&color_formula=" +
    encodeURIComponent("gamma RGB 2.7, saturation 1.5, sigmoidal RGB 15 0.55"),
};

/** The satellites behind the scenes, by the name the archive gives them. */
const PLATFORM_NORAD: Record<string, number> = {
  "sentinel-2a": 40697,
  "sentinel-2b": 42063,
  "sentinel-2c": 60990,
  "landsat-8": 39084,
  "landsat-9": 49260,
};

/** "landsat-9" reads better as "Landsat-9". */
function platformName(platform: string): string {
  return platform.replace(
    /^(sentinel|landsat)-(\w+)$/i,
    (_, family: string, unit: string) =>
      `${family[0].toUpperCase()}${family.slice(1).toLowerCase()}-${unit.toUpperCase()}`,
  );
}

function picture(item: { id: string; collection: Collection }, path: string, more = ""): string {
  return `${ARCHIVE}/data/v1/item/${path}?collection=${item.collection}&item=${encodeURIComponent(item.id)}&${RENDER[item.collection]}${more}`;
}

function toScene(item: ArchiveItem): Scene {
  return {
    id: item.id,
    datetime: item.datetime,
    platform: platformName(item.platform),
    cloudCover: item.cloudCover,
    thumbnail: picture(item, "preview.jpg", "&max_size=512"),
    collection: item.collection,
    href: `${ARCHIVE}/stac/v1/collections/${item.collection}/items/${encodeURIComponent(item.id)}`,
    noradId: PLATFORM_NORAD[item.platform.toLowerCase()] ?? null,
    metres: item.collection === "sentinel-2-l2a" ? 10 : 30,
    daily: false,
  };
}

/**
 * The square of a scene around a place, as a JPEG the archive cuts.
 * @param km Side of the square on the ground.
 * @param side Side of the picture, pixels.
 */
export function closeupPicture(
  item: { id: string; collection: Collection },
  lat: number,
  lon: number,
  km: number,
  side: number,
): string {
  const reach = km / 2 / 111.2;
  const wide = reach / Math.cos((lat * Math.PI) / 180);
  const box = [lon - wide, lat - reach, lon + wide, lat + reach].map((n) => n.toFixed(5));
  return picture(item, `bbox/${box.join(",")}/${side}x${side}.jpg`);
}

async function ask<Answer>(query: string, signal?: AbortSignal): Promise<Answer> {
  const response = await fetch(`/api/scenes?${query}`, { signal });
  if (!response.ok) throw new Error(`The archive search returned ${response.status}`);
  return (await response.json()) as Answer;
}

/** What /api/scenes answers for a place, and for a place and a year. */
export interface WeekAnswer {
  scenes: ArchiveItem[];
  clearLook: ArchiveItem | null;
}
export interface YearAnswer {
  scenes: ArchiveItem[];
}

export interface WeekOfScenes {
  /** The scenes of the last seven days that cover the place, newest first. */
  scenes: Scene[];
  /**
   * When cloud hid the place all week: the latest Sentinel-2 scene of the
   * past year with a clear sky.
   */
  clearLook: Scene | null;
}

export async function searchScenes(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<WeekOfScenes> {
  const found = await ask<WeekAnswer>(`lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, signal);
  return {
    scenes: found.scenes.map(toScene),
    clearLook: found.clearLook && toScene(found.clearLook),
  };
}

/** The clearest Sentinel-2 scenes of a year over a place, clearest first. */
export async function clearestOf(
  year: number,
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<Scene[]> {
  const found = await ask<YearAnswer>(
    `lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&year=${year}`,
    signal,
  );
  return found.scenes.map(toScene);
}

/** "Sentinel-2A · 10 m · 19% cloud" */
export function describeScene(scene: Scene): string {
  const cloud = scene.daily
    ? "daily mosaic"
    : scene.cloudCover === null
      ? "cloud cover unknown"
      : `${Math.round(scene.cloudCover)}% cloud`;
  return `${scene.platform} · ${scene.metres} m · ${cloud}`;
}

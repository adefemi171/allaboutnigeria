// A close look at one place in a scene.
//
// The archive's preview shows a whole frame, a hundred kilometres across
// or more, in a few hundred pixels: a city is a smudge. The archive will
// also cut any square out of the full picture and send just that, which
// is what this asks for: one small JPEG instead of megabytes of scene.

import { isLiteDevice } from "@/lib/earth";
import { closeupPicture } from "./scenes";
import type { Scene } from "./types";

/** Side of a close-up on the ground, km. */
export const CLOSEUP_KM = 8;

/** The last few close-ups, so the page and the dialog fetch each one once. */
const KEPT = 6;
const cache = new Map<string, Promise<HTMLImageElement>>();

/**
 * The part of a scene around a place, with the place in its middle.
 * Fails where the scene has no full picture, or its strip missed the place.
 * @param side Side of the picture in pixels. By default 10 m to the pixel,
 *   a little less on a phone.
 */
export function closeup(
  scene: Scene,
  lat: number,
  lon: number,
  km = CLOSEUP_KM,
  side = isLiteDevice() ? 640 : 800,
): Promise<HTMLImageElement> {
  const key = `${scene.id}:${lat}:${lon}:${km}:${side}`;
  let job = cache.get(key);
  if (!job) {
    job = read(scene, lat, lon, km, side);
    cache.set(key, job);
    job.catch(() => cache.delete(key));
    if (cache.size > KEPT) cache.delete(cache.keys().next().value!);
  }
  return job;
}

async function read(
  scene: Scene,
  lat: number,
  lon: number,
  km: number,
  side: number,
): Promise<HTMLImageElement> {
  const { collection } = scene;
  if (!collection) throw new Error("No full picture for this scene");
  const image = new Image();
  // Asked for as a stranger, so that the page may look at the pixels.
  image.crossOrigin = "anonymous";
  image.src = closeupPicture({ id: scene.id, collection }, lat, lon, km, side);
  await image.decode();

  // A frame is a slanted strip of the orbit; outside it there is nothing,
  // which the archive paints black. A coarse copy is enough to tell.
  const coarse = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = coarse;
  const context = canvas.getContext("2d");
  if (!context) return image;
  context.drawImage(image, 0, 0, coarse, coarse);
  const { data } = context.getImageData(0, 0, coarse, coarse);
  let lit = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] + data[i + 1] + data[i + 2] > 24) lit++;
  }
  if (lit < coarse * coarse * 0.2) throw new Error("The satellite's strip missed this place");
  return image;
}

/** Put a close-up on its canvas, and the ring on the place in its middle. */
export function drawCloseup(
  canvas: HTMLCanvasElement,
  pin: HTMLElement,
  image: HTMLImageElement,
): void {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  pin.style.left = pin.style.top = "50%";
}

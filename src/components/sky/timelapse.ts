// A place through the years: the clearest picture Sentinel-2 took of it
// each year, played in a row.

import { closeup, drawCloseup } from "@/lib/satellites/closeup";
import { clearestOf } from "@/lib/satellites/scenes";
import { formatDay } from "@/lib/satellites/time";

/** Sentinel-2 began covering Nigeria at the very end of 2015. */
const FIRST_YEAR = 2016;
/** Side of a frame, on the ground and in pixels. Smaller than a close-up: there are many. */
const FRAME_KM = 5;
const SIDE = 512;
const FRAME_MS = 1100;

interface Frame {
  year: number;
  when: string;
  image: HTMLImageElement;
}

let running: AbortController | null = null;

/** The clearest picture of a year that has the place in it. */
async function clearestIn(
  year: number,
  lat: number,
  lon: number,
  signal: AbortSignal,
): Promise<Frame | null> {
  for (const scene of await clearestOf(year, lat, lon, signal)) {
    if (signal.aborted) return null;
    try {
      const image = await closeup(scene, lat, lon, FRAME_KM, SIDE);
      return { year, when: scene.datetime, image };
    } catch {
      // The strip missed the place: the next clearest may not have.
    }
  }
  return null;
}

export function openTimelapse(
  dialog: HTMLDialogElement,
  place: { lat: number; lon: number; label: string },
): void {
  const $ = <T extends HTMLElement>(name: string) =>
    dialog.querySelector<T>(`[data-lapse-${name}]`)!;
  const canvas = $<HTMLCanvasElement>("canvas");
  const pin = $("pin");
  const note = $("note");
  const play = $<HTMLButtonElement>("play");

  running?.abort();
  const { signal } = (running = new AbortController());
  const last = new Date().getUTCFullYear();
  const years = Array.from({ length: last - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
  const frames = new Map<number, Frame>();
  let shown = 0;
  let playing = true;
  let waiting = years.length;

  const buttons = new Map(
    years.map((year) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(year);
      button.disabled = true;
      button.onclick = () => {
        setPlaying(false);
        show(year);
      };
      return [year, button];
    }),
  );
  $("years").replaceChildren(play, ...buttons.values());
  $("label").textContent = `${place.label} · year by year`;
  canvas.width = canvas.height = SIDE;
  pin.hidden = true;

  const tell = () => {
    const frame = frames.get(shown);
    const progress = waiting ? `Fetching ${waiting} more years from the archive. ` : "";
    note.textContent = frame
      ? `${progress}${formatDay(frame.when)}: the clearest picture Sentinel-2 took that year, ${FRAME_KM} km across.`
      : waiting
        ? `Looking up the clearest picture of every year since ${FIRST_YEAR}…`
        : "The archive has no clear picture of this place.";
  };
  const show = (year: number) => {
    const frame = frames.get(year);
    if (!frame) return;
    shown = year;
    drawCloseup(canvas, pin, frame.image);
    pin.hidden = false;
    for (const [each, button] of buttons) button.setAttribute("aria-pressed", String(each === year));
    tell();
  };
  const setPlaying = (on: boolean) => {
    playing = on;
    play.textContent = on ? "Pause" : "Play";
    play.setAttribute("aria-pressed", String(on));
  };
  play.onclick = () => setPlaying(!playing);
  setPlaying(true);
  tell();

  const timer = window.setInterval(() => {
    const have = [...frames.keys()].sort();
    if (playing && have.length > 1) show(have[(have.indexOf(shown) + 1) % have.length]);
  }, FRAME_MS);
  dialog.addEventListener(
    "close",
    () => {
      window.clearInterval(timer);
      running?.abort();
    },
    { once: true },
  );
  if (!dialog.open) dialog.showModal();

  // Two at a time: quick enough, and light on a phone's line.
  const queue = [...years];
  const work = async () => {
    for (let year = queue.shift(); year && !signal.aborted; year = queue.shift()) {
      const frame = await clearestIn(year, place.lat, place.lon, signal).catch(() => null);
      if (signal.aborted) return;
      waiting--;
      if (frame) {
        frames.set(year, frame);
        buttons.get(year)!.disabled = false;
        if (!shown) show(year);
      }
      tell();
    }
  };
  void Promise.all([work(), work()]);
}

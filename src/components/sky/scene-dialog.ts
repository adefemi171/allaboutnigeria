// A satellite picture shown large: the close-up of the place where the
// archive has the full picture, and the whole frame.

import { closeup, CLOSEUP_KM, drawCloseup } from "@/lib/satellites/closeup";
import { describeScene } from "@/lib/satellites/scenes";
import { formatDay, formatWhen } from "@/lib/satellites/time";
import type { Scene } from "@/lib/satellites/types";

type View = "closeup" | "frame";

/** A picture from before the week of passes is dated by its day. */
const WEEK_MS = 8 * 86400_000;

let loading: AbortController | null = null;

/**
 * Show a scene large. Where the archive holds the full picture, the
 * dialog opens on a close-up of the place; the whole frame is one press away.
 */
export function openScene(
  dialog: HTMLDialogElement,
  scene: Scene,
  place: { lat: number; lon: number; label: string },
): void {
  const $ = <T extends HTMLElement>(name: string) =>
    dialog.querySelector<T>(`[data-scene-${name}]`)!;
  const canvas = $<HTMLCanvasElement>("canvas");
  const close = $("closeup");
  const img = $<HTMLImageElement>("img");
  const pin = $("pin");
  const note = $("note");
  const views = $("views");
  const buttons = [...views.querySelectorAll<HTMLButtonElement>("button")];

  const recent = Date.now() - Date.parse(scene.datetime) < WEEK_MS;
  const title = `${describeScene(scene)} · ${(recent ? formatWhen : formatDay)(scene.datetime)}`;
  const record = document.createElement("a");
  record.href = scene.href;
  record.target = "_blank";
  record.rel = "noopener noreferrer";
  record.textContent = "Archive record";
  $("label").textContent = title;
  img.alt = `${place.label} seen by ${title}`;
  if (scene.thumbnail) img.src = scene.thumbnail;
  else img.removeAttribute("src");

  loading?.abort();
  const { signal } = (loading = new AbortController());
  dialog.addEventListener("close", () => loading?.abort(), { once: true });
  let detail: "loading" | "ready" | "failed" = scene.collection ? "loading" : "failed";

  const show = (view: View) => {
    const near = view === "closeup";
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.sceneView === view));
    }
    close.hidden = !near || detail !== "ready";
    // The frame stands in while the close-up loads.
    img.hidden = !close.hidden || !scene.thumbnail;
    const text =
      near && detail === "loading"
        ? "Fetching the close-up from the archive. Meanwhile, the whole frame."
        : near && detail === "ready"
          ? `${place.label}, ${CLOSEUP_KM} km across, cut from the satellite's ${scene.metres} m picture. The ring marks the spot.`
          : scene.daily
            ? `${place.label} in the middle of the satellite's picture of that day, 240 km across.`
            : scene.thumbnail
              ? `The whole frame the satellite took, about ${scene.metres === 10 ? 110 : 185} km across.`
              : "The archive has no preview of this scene to show here.";
    note.replaceChildren(`${text} `, record);
  };
  for (const button of buttons) {
    button.onclick = () => show(button.dataset.sceneView as View);
  }

  views.hidden = !scene.collection;
  show("closeup");
  if (!dialog.open) dialog.showModal();
  if (!scene.collection) return;

  closeup(scene, place.lat, place.lon)
    .then((found) => {
      if (signal.aborted) return;
      drawCloseup(canvas, pin, found);
      detail = "ready";
      show("closeup");
    })
    .catch(() => {
      if (signal.aborted) return;
      // Its strip missed the place, or the archive would not answer: the frame stays.
      detail = "failed";
      views.hidden = true;
      show("frame");
    });
}

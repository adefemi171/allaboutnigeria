// The pictures of a place, one at a time, at the head of the Sky page:
// the closest look first. Pressing the picture shows it large.

import { closeup, CLOSEUP_KM, drawCloseup } from "@/lib/satellites/closeup";
import { formatAway, formatDay, formatWhen } from "@/lib/satellites/time";
import type { MatchedPass, Scene } from "@/lib/satellites/types";

type Tab = "all" | "detail" | "weather";
type Place = { lat: number; lon: number; label: string };
/**
 * A picture and the pass that took it. The last clear look is older than
 * the week of passes, so it has none.
 */
interface Shot {
  scene: Scene;
  pass: MatchedPass | null;
}

/** Leafing through quickly should not fetch every close-up on the way. */
const SETTLE_MS = 300;

export interface GalleryEvents {
  onOpen(scene: Scene): void;
  onReplay(pass: MatchedPass): void;
}

/** The sharpest first, then the clearest, then the latest. Last, what cannot be shown. */
function order(a: Shot, b: Shot): number {
  const cloud = (shot: Shot) => Math.round((shot.scene.cloudCover ?? 0) / 20);
  return (
    Number(!a.scene.thumbnail) - Number(!b.scene.thumbnail) ||
    a.scene.metres - b.scene.metres ||
    cloud(a) - cloud(b) ||
    b.scene.datetime.localeCompare(a.scene.datetime)
  );
}

export class Gallery {
  private shots: Shot[] = [];
  private shown: Shot[] = [];
  private index = 0;
  private tab: Tab = "all";
  private place: Place = { lat: 0, lon: 0, label: "" };
  private settle = 0;
  private listeners = new AbortController();

  constructor(
    private root: HTMLElement,
    events: GalleryEvents,
  ) {
    const { signal } = this.listeners;
    for (const button of this.all<HTMLButtonElement>("tab")) {
      button.addEventListener(
        "click",
        () => {
          this.tab = button.dataset.galleryTab as Tab;
          this.index = 0;
          this.render();
        },
        { signal },
      );
    }
    for (const button of this.all<HTMLButtonElement>("step")) {
      button.addEventListener(
        "click",
        () => {
          const count = this.shown.length;
          this.index = (this.index + Number(button.dataset.galleryStep) + count) % count;
          this.render();
        },
        { signal },
      );
    }
    this.part("open").addEventListener(
      "click",
      () => {
        const shot = this.shown[this.index];
        if (shot) events.onOpen(shot.scene);
      },
      { signal },
    );
    this.part("replay").addEventListener(
      "click",
      () => {
        const pass = this.shown[this.index]?.pass;
        if (pass) events.onReplay(pass);
      },
      { signal },
    );
    // The archive makes its previews to order, and now and then cannot.
    this.part("img").addEventListener(
      "error",
      () => {
        this.part("img").hidden = true;
        this.part("tag").textContent = "No preview";
      },
      { signal },
    );
  }

  dispose(): void {
    this.listeners.abort();
    window.clearTimeout(this.settle);
  }

  private part<T extends HTMLElement>(name: string): T {
    return this.root.querySelector<T>(`[data-gallery-${name}]`)!;
  }

  private all<T extends HTMLElement>(name: string): T[] {
    return [...this.root.querySelectorAll<T>(`[data-gallery-${name}]`)];
  }

  /** @param clearLook The last clear picture, where cloud hid the place all week. */
  set(passes: MatchedPass[], place: Place, clearLook: Scene | null): void {
    this.shots = passes.flatMap((pass) => (pass.scene ? [{ scene: pass.scene, pass }] : []));
    if (clearLook) this.shots.push({ scene: clearLook, pass: null });
    this.shots.sort(order);
    this.place = place;
    this.tab = "all";
    this.index = 0;
    this.render();
  }

  /** Turn to the picture of a pass, if it left one. */
  show(pass: MatchedPass): void {
    const taken = (shot: Shot) => shot.pass?.id === pass.id;
    let index = this.shown.findIndex(taken);
    if (index < 0 && this.shots.some(taken)) {
      this.tab = "all";
      index = this.shots.findIndex(taken);
    }
    if (index < 0 || index === this.index) return;
    this.index = index;
    this.render();
  }

  private render(): void {
    const fits = (shot: Shot, tab: Tab) =>
      tab === "all" || (tab === "weather") === shot.scene.daily;
    this.shown = this.shots.filter((shot) => fits(shot, this.tab));
    this.root.hidden = this.shots.length === 0;
    for (const button of this.all<HTMLButtonElement>("tab")) {
      const tab = button.dataset.galleryTab as Tab;
      button.setAttribute("aria-pressed", String(tab === this.tab));
      button.hidden = !this.shots.some((shot) => fits(shot, tab));
    }
    window.clearTimeout(this.settle);
    const shot = this.shown[this.index];
    if (!shot) return;
    const { scene, pass } = shot;

    this.part("count").textContent = `${this.index + 1} / ${this.shown.length}`;
    this.part("name").textContent =
      `${scene.platform} · ${pass ? formatWhen(scene.datetime) : formatDay(scene.datetime)}`;
    const cloud = scene.daily
      ? "daily mosaic"
      : scene.cloudCover === null
        ? ""
        : scene.cloudCover < 10
          ? "clear"
          : `${Math.round(scene.cloudCover)}% cloud`;
    this.part("what").textContent = [`${scene.metres} m`, formatAway(scene.datetime), cloud]
      .filter(Boolean)
      .join(" · ");
    this.part("replay").hidden = !pass;

    const canvas = this.part<HTMLCanvasElement>("canvas");
    const img = this.part<HTMLImageElement>("img");
    const pin = this.part("pin");
    const tag = this.part("tag");
    canvas.hidden = true;
    img.hidden = !scene.thumbnail;
    if (scene.thumbnail) img.src = scene.thumbnail;
    img.alt = `${this.place.label} seen by ${scene.platform}`;
    // A daily picture is cut with the place in its middle.
    pin.hidden = !scene.daily;
    pin.style.left = pin.style.top = "50%";
    tag.textContent = scene.daily
      ? "240 km across"
      : scene.thumbnail
        ? "Whole frame"
        : "No preview";

    if (!scene.collection) return;
    this.settle = window.setTimeout(() => {
      closeup(scene, this.place.lat, this.place.lon)
        .then((found) => {
          if (this.shown[this.index] !== shot) return;
          drawCloseup(canvas, pin, found);
          canvas.hidden = pin.hidden = false;
          img.hidden = true;
          tag.textContent = !pass
            ? "Last clear look"
            : shot === this.shots[0]
              ? "Closest look"
              : `${CLOSEUP_KM} km across`;
        })
        // Its strip missed the place, or the archive would not answer: the frame stays.
        .catch(() => {});
    }, SETTLE_MS);
  }
}

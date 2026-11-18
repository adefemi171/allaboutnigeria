// The search box on the Sky page: the state capitals, which the page
// knows itself, and under them streets, areas and landmarks anywhere in
// Nigeria, which the site looks up in OpenStreetMap (/api/geocode).

import type { Place, PlaceHit } from "@/lib/satellites/places";

interface Entry {
  title: string;
  detail: string;
  tag: string;
  pick(): void;
}

export interface PlaceSearchEvents {
  onPlace(place: Place): void;
  onHit(hit: PlaceHit): void;
}

/** Wait for the typing to pause before asking for streets. */
const PAUSE_MS = 300;

function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase();
}

function score(place: Place, query: string): number {
  const name = plain(place.name);
  if (name.startsWith(query)) return 3;
  if (name.split(/[\s-]+/).some((word) => word.startsWith(query))) return 2;
  if (plain(place.state).includes(query)) return 1;
  return 0;
}

async function findStreets(query: string, signal: AbortSignal): Promise<PlaceHit[]> {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) return [];
  return ((await response.json()) as { places: PlaceHit[] }).places;
}

export class PlaceSearch {
  private listeners = new AbortController();
  private timer = 0;
  private lookup: AbortController | null = null;

  constructor(root: HTMLElement, places: Place[], events: PlaceSearchEvents) {
    const field = root.querySelector<HTMLInputElement>(".search__field")!;
    const list = root.querySelector<HTMLUListElement>(".search__results")!;
    const { signal } = this.listeners;

    let active = -1;
    let shown: Entry[] = [];
    let local: Entry[] = [];
    let remote: Entry[] = [];
    /** The text the remote results belong to. */
    let remoteFor = "";
    let looking = false;

    const close = () => {
      list.hidden = true;
      field.setAttribute("aria-expanded", "false");
      field.removeAttribute("aria-activedescendant");
      active = -1;
    };

    const highlight = (next: number) => {
      const items = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
      if (!items.length) return;
      active = (next + items.length) % items.length;
      items.forEach((item, k) => item.setAttribute("aria-selected", String(k === active)));
      field.setAttribute("aria-activedescendant", items[active].id);
      items[active].scrollIntoView({ block: "nearest" });
    };

    const go = (entry: Entry) => {
      entry.pick();
      // The page names the place from here on, also once another is picked.
      field.value = "";
      close();
      field.blur();
    };

    const render = () => {
      const query = plain(field.value.trim());
      if (!query) {
        this.stopLooking();
        return close();
      }
      local = places
        .map((place) => ({ place, rank: score(place, query) }))
        .filter((scored) => scored.rank > 0)
        .sort((a, b) => b.rank - a.rank)
        .slice(0, 5)
        .map(({ place }) => ({
          title: place.name,
          detail: place.state,
          tag: "City",
          pick: () => events.onPlace(place),
        }));
      draw();
      lookUp(field.value.trim());
    };

    /** Ask for streets and areas once the typing pauses. */
    const lookUp = (text: string) => {
      this.stopLooking();
      looking = false;
      if (text === remoteFor) return;
      remote = [];
      remoteFor = "";
      if (text.length < 3) return;
      looking = true;
      draw();
      this.timer = window.setTimeout(async () => {
        this.lookup = new AbortController();
        let found: PlaceHit[] = [];
        try {
          found = await findStreets(text, this.lookup.signal);
        } catch (error) {
          // Typed on, or the service is down. The local results stand.
          if ((error as Error).name === "AbortError") return;
        }
        if (field.value.trim() !== text) return;
        remote = found.map((hit) => ({
          title: hit.title,
          detail: hit.subtitle,
          tag: "Place",
          pick: () => events.onHit(hit),
        }));
        remoteFor = text;
        looking = false;
        draw();
      }, PAUSE_MS);
    };

    const draw = () => {
      const selected = active;
      shown = [...local, ...(remoteFor === field.value.trim() ? remote : [])];

      list.replaceChildren();
      if (!shown.length) {
        const empty = document.createElement("li");
        empty.className = "search__empty";
        empty.textContent = looking
          ? "Looking for streets and areas"
          : "Nothing found. Try a city, a street or an area in Nigeria.";
        list.append(empty);
      }
      shown.forEach((entry, k) => {
        const item = document.createElement("li");
        item.id = `${list.id}-${k}`;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        const button = document.createElement("button");
        button.type = "button";
        button.tabIndex = -1;
        const title = document.createElement("span");
        title.textContent = entry.title;
        const tag = document.createElement("span");
        tag.className = "mono";
        tag.textContent = entry.tag;
        const detail = document.createElement("small");
        detail.textContent = entry.detail;
        button.append(title, tag, detail);
        button.addEventListener("click", () => go(entry));
        item.append(button);
        list.append(item);
      });
      const note = document.createElement("li");
      note.className = "search__note";
      note.setAttribute("role", "presentation");
      note.textContent = "Streets and areas are looked up in OpenStreetMap, through Photon.";
      list.append(note);
      list.hidden = false;
      field.setAttribute("aria-expanded", "true");
      active = -1;
      // Results that arrive later are added below, so the choice stands.
      if (selected >= 0 && selected < shown.length) highlight(selected);
    };

    field.addEventListener(
      "focus",
      () => {
        if (field.value.trim()) render();
      },
      { signal },
    );
    field.addEventListener("input", render, { signal });
    field.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (list.hidden) render();
          else highlight(active + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          highlight(active - 1);
        } else if (event.key === "Enter") {
          const entry = shown[active < 0 ? 0 : active];
          if (!list.hidden && entry) {
            event.preventDefault();
            go(entry);
          }
        } else if (event.key === "Escape") {
          if (list.hidden) field.blur();
          else close();
        }
      },
      { signal },
    );
    root.addEventListener(
      "focusout",
      (event) => {
        if (!root.contains(event.relatedTarget as Node | null)) close();
      },
      { signal },
    );
    // Keep focus in the field when a result is pressed, so the click lands.
    list.addEventListener("pointerdown", (event) => event.preventDefault(), { signal });
  }

  private stopLooking(): void {
    window.clearTimeout(this.timer);
    this.lookup?.abort();
  }

  dispose(): void {
    this.listeners.abort();
    this.stopLooking();
  }
}

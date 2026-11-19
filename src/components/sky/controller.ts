// The Sky page: pick a place, find the passes over it and the pictures
// that match, and show any of them on the globe. Works on the markup of
// SatellitePage.tsx.

import { isLiteDevice } from "@/lib/earth";
import { loadCatalog, type Catalog } from "@/lib/satellites/catalog";
import { addDaily } from "@/lib/satellites/gibs";
import { SatelliteGlobe } from "@/lib/satellites/globe";
import { matchPasses } from "@/lib/satellites/match";
import { defaultWindow, watchers } from "@/lib/satellites/passes";
import {
  coordinates,
  focusFromUrl,
  focusOn,
  inNigeria,
  nearestPlace,
  queryFor,
  type Focus,
  type Place,
  type PlaceHit,
} from "@/lib/satellites/places";
import { findPasses } from "@/lib/satellites/pool";
import { LABEL_COPY } from "@/lib/satellites/profile";
import { describeScene, searchScenes } from "@/lib/satellites/scenes";
import { formatAway, formatClock, formatWhen } from "@/lib/satellites/time";
import { ROWS, Timeline } from "@/lib/satellites/timeline";
import type { MatchedPass, PassLabel, SatKind } from "@/lib/satellites/types";
import { Gallery } from "./gallery";
import { ReplayCapture } from "@/lib/satellites/replay-capture";
import { PlaceSearch } from "./place-search";
import { openScene } from "./scene-dialog";
import { openTimelapse } from "./timelapse";

const BADGE: Record<PassLabel, string> = {
  watched: "◆",
  likely: "◇",
  could: "□",
  overhead: "+",
};

/** Which passes head the list. */
const RANK: Record<PassLabel, number> = { watched: 0, likely: 1, could: 2, overhead: 3 };

const KIND_COPY: Record<SatKind, string> = {
  imaging: "Takes pictures of the ground",
  radar: "Sees the ground by radar, through cloud and at night",
  weather: "Watches the weather",
  crew: "Has people on board",
  other: "Not known to take pictures",
};

/** Kilometres on the ground for one degree at the centre of the Earth. */
const KM_PER_DEGREE = 111.2;

/** The place the page opens on. */
const HOME = "lagos";

type Filter = "all" | "photo" | SatKind;

/** What is mapped at a spot in Nigeria, if anything is. */
async function nameOf(lat: number, lon: number): Promise<string | null> {
  if (!inNigeria({ lat, lon })) return null;
  try {
    const response = await fetch(`/api/geocode?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
    const { place } = (await response.json()) as { place?: PlaceHit | null };
    if (!place) return null;
    const [area] = place.subtitle.split(", ");
    return area ? `${place.title}, ${area}` : place.title;
  } catch {
    return null;
  }
}

/** Bring the page to life. The function it returns stops everything again. */
export function mountSatellitePage(root: HTMLElement, places: Place[]): () => void {
  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const all = <T extends HTMLElement>(selector: string) => [...root.querySelectorAll<T>(selector)];
  const setText = (selector: string, text: string) => {
    $(selector).textContent = text;
  };

  const stage = $("[data-sat-globe]");
  const report = $("[data-sat-report]");
  const status = $("[data-sat-status]");
  const progress = $<HTMLProgressElement>("[data-sat-progress]");
  const card = $("[data-sat-pass]");
  const tip = $("[data-sat-tip]");
  const sceneDialog = $<HTMLDialogElement>("[data-scene]");
  const lapseDialog = $<HTMLDialogElement>("[data-lapse]");

  /** Ends with the page: every listener below is tied to it. */
  const mounted = new AbortController();
  const listen = { signal: mounted.signal };

  /** The label that follows the pointer, or nothing. */
  const hint = (text: string | null, x = 0, y = 0) => {
    tip.hidden = !text;
    if (!text) return;
    tip.textContent = text;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  };

  const replayCapture = new ReplayCapture($<HTMLElement>("[data-sat-replay-capture]")!);
  const replayHud = $<HTMLElement>("[data-sat-replay]");
  const replayProgress = $<HTMLInputElement>("[data-sat-replay-progress]");
  const replayPlayback = $<HTMLButtonElement>("[data-sat-replay-playback]");
  const replayFollow = $<HTMLButtonElement>("[data-sat-replay-follow]");
  const globe = new SatelliteGlobe(
    stage,
    "The Earth with the satellites around it. Arrow keys turn it, plus and minus zoom. Press a spot to see who watched it.",
    {
      onHover(hovered) {
        hint(
          hovered && `${hovered.name} · ${Math.round(hovered.altitudeKm)} km up`,
          hovered?.x,
          hovered?.y,
        );
      },
      onTime(date, live, frame) {
        const what = live ? "Now" : date.getTime() > Date.now() ? "Still to come" : "Replay";
        setText("[data-sat-clock]", `${what} · ${formatClock(date)}`);
        if (replayHud) replayHud.hidden = !frame;
        if (frame) {
          replayCapture.update(frame.scan, frame.scanDirection);
          if (replayProgress) {
            replayProgress.value = String(Math.round(frame.progress * 1000));
            replayProgress.setAttribute("aria-valuetext", formatClock(date));
          }
          const playbackLabel = frame.playing ? "Pause" : "Play";
          if (replayPlayback && replayPlayback.textContent !== playbackLabel) replayPlayback.textContent = playbackLabel;
          replayFollow?.setAttribute("aria-pressed", String(frame.following));
          setText("[data-sat-replay-phase]", frame.phase);
          setText("[data-sat-replay-altitude]", `${Math.round(frame.altitudeKm)} km up`);
        }
      },
      onPick(lat, lon) {
        const near = inNigeria({ lat, lon }) ? `, near ${nearestPlace(places, lat, lon).name}` : "";
        const spot: Focus = { lat, lon, label: coordinates(lat, lon) + near };
        void run(spot);
        void nameOf(lat, lon).then((name) => {
          if (!name || focus !== spot) return;
          spot.label = name;
          setText("[data-sat-where]", name);
          link(spot);
        });
      },
    },
  );
  const timeline = new Timeline($<HTMLCanvasElement>("[data-sat-timeline-canvas]"), {
    onPick: (pass) => select(pass),
    onHover: (pass, x, y) => hint(pass && `${pass.name} · ${formatWhen(pass.time)}`, x, y),
  });
  const gallery = new Gallery($("[data-sat-gallery]"), {
    onOpen: (scene) => focus && openScene(sceneDialog, scene, focus),
    onReplay: (pass, selectPhoto) => {
      select(pass, selectPhoto);
      stage.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
  });
  const search = new PlaceSearch($("[data-sat-search]"), places, {
    onPlace: (place) => void run(focusOn(place)),
    onHit: (hit) =>
      void run({
        lat: hit.lat,
        lon: hit.lon,
        label: hit.subtitle ? `${hit.title}, ${hit.subtitle}` : hit.title,
      }),
  });

  let catalog: Catalog | null = null;
  let abort: AbortController | null = null;
  let focus: Focus | null = null;
  let matched: MatchedPass[] = [];
  let filter: Filter = "all";
  let selected: MatchedPass | null = null;
  let span = defaultWindow();

  const busy = (text: string, done = 0) => {
    status.textContent = text;
    status.hidden = !text;
    progress.hidden = !text;
    progress.value = done;
  };

  // --------------------------------------------------------- one pass --

  const select = (pass: MatchedPass | null, selectPhoto = true) => {
    selected = pass;
    replayCapture.set(pass, focus);
    globe.showPass(pass);
    timeline.select(pass?.id ?? null);
    if (pass && selectPhoto) gallery.show(pass);
    for (const item of all("[data-pass-id]")) {
      item.classList.toggle("is-active", item.dataset.passId === pass?.id);
    }
    card.hidden = !pass;
    if (!pass) return;
    setText("[data-sat-pass-name]", pass.name);
    setText("[data-sat-pass-label]", `${LABEL_COPY[pass.label]} · ${KIND_COPY[pass.kind]}`);
    setText("[data-sat-pass-when]", `${formatWhen(pass.time)} · ${formatAway(pass.time)}`);
    setText(
      "[data-sat-pass-near]",
      `${Math.round(pass.angleDeg * KM_PER_DEGREE)} km from straight overhead`,
    );
    $("[data-sat-pass-photo]").hidden = !pass.scene;
  };

  $("[data-sat-pass-photo]").addEventListener(
    "click",
    () => {
      if (selected?.scene && focus) openScene(sceneDialog, selected.scene, focus);
    },
    listen,
  );
  $("[data-sat-pass-replay]").addEventListener("click", () => globe.replayPass(), listen);
  replayProgress?.addEventListener("input", () => globe.seekReplay(Number(replayProgress.value) / 1000), listen);
  replayPlayback?.addEventListener("click", () => globe.toggleReplayPlayback(), listen);
  $("[data-sat-replay-closest]")?.addEventListener("click", () => globe.seekClosestApproach(), listen);
  replayFollow?.addEventListener("click", () => globe.toggleReplayFollow(), listen);
  $("[data-sat-pass-now]").addEventListener("click", () => select(null), listen);

  const passItem = (pass: MatchedPass): HTMLLIElement => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sat__item";
    button.dataset.passId = pass.id;
    button.classList.toggle("is-active", pass.id === selected?.id);

    const badge = document.createElement("span");
    badge.className = `sat__badge sat__badge--${pass.label}`;
    badge.textContent = BADGE[pass.label];
    badge.title = LABEL_COPY[pass.label];

    const meta = document.createElement("span");
    meta.className = "sat__meta";
    const name = document.createElement("strong");
    name.textContent = pass.name;
    const when = document.createElement("span");
    when.textContent = `${formatWhen(pass.time)} · ${formatAway(pass.time)}`;
    const what = document.createElement("span");
    what.textContent = pass.scene ? describeScene(pass.scene) : LABEL_COPY[pass.label];
    meta.append(name, when, what);

    button.append(badge, meta);
    // Gone with the button, so not tied to the page.
    button.addEventListener("click", () => {
      select(pass);
      // On a phone the globe is above the list, out of sight.
      stage.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    item.append(button);
    return item;
  };

  // ---------------------------------------------------------- the lists --

  /** A phone gets shorter lists: the page is long enough there. */
  const limits = isLiteDevice() ? { upcoming: 10, past: 30 } : { upcoming: 40, past: 80 };

  const fits = (pass: MatchedPass, kind: Filter) =>
    kind === "all" || (kind === "photo" ? !!pass.scene : pass.kind === kind);

  const renderLists = () => {
    const shown = matched.filter((pass) => fits(pass, filter));
    // The next pass first. Of those gone by, the ones most likely to have
    // looked come first, and the latest of each.
    const upcoming = shown.filter((pass) => pass.upcoming);
    const past = shown
      .filter((pass) => !pass.upcoming)
      .sort((a, b) => RANK[a.label] - RANK[b.label] || b.time.localeCompare(a.time));
    const fill = (name: "upcoming" | "past", passes: MatchedPass[]) => {
      const limit = limits[name];
      $(`[data-sat-${name}]`).replaceChildren(...passes.slice(0, limit).map(passItem));
      const note = $(`[data-sat-${name}-note]`);
      note.hidden = passes.length > 0 && passes.length <= limit;
      note.textContent = passes.length
        ? `Showing the first ${limit} of ${passes.length}. Narrow it down with the buttons above, or press a mark on the timeline.`
        : "Nothing here.";
    };
    fill("upcoming", upcoming);
    fill("past", past);
    if (focus) timeline.set(shown, focus, span);

    for (const chip of all<HTMLButtonElement>("[data-sat-filter]")) {
      const kind = chip.dataset.satFilter as Filter;
      const count = matched.filter((pass) => fits(pass, kind)).length;
      chip.setAttribute("aria-pressed", String(kind === filter));
      chip.hidden = kind !== "all" && count === 0;
      const counter = chip.querySelector("span");
      if (counter) counter.textContent = String(count);
    }
  };

  for (const chip of all<HTMLButtonElement>("[data-sat-filter]")) {
    chip.addEventListener(
      "click",
      () => {
        filter = chip.dataset.satFilter as Filter;
        renderLists();
      },
      listen,
    );
  }

  // ---------------------------------------------------------- one place --

  /** Put the place in the address bar, and link to the city's 3D model. */
  const link = (place: Focus) => {
    history.replaceState(null, "", `${window.location.pathname}${place.own ? "" : queryFor(place)}`);
    const city = inNigeria(place) ? nearestPlace(places, place.lat, place.lon) : null;
    $("[data-sat-city]").hidden = !city;
    if (!city) return;
    const cityLink = $<HTMLAnchorElement>("[data-sat-city-link]");
    cityLink.href = `/explore/${city.id}`;
    cityLink.textContent = `${city.name} in 3D`;
  };

  const run = async (next: Focus) => {
    abort?.abort();
    abort = new AbortController();
    const { signal } = abort;
    const place = (focus = next);

    report.hidden = false;
    setText("[data-sat-where]", place.label);
    for (const button of all<HTMLButtonElement>("[data-sat-pick]")) {
      button.setAttribute("aria-pressed", String(button.dataset.satPick === place.id));
    }
    setText("[data-sat-summary]", "");
    busy("Looking up orbits…");
    matched = [];
    filter = "all";
    span = defaultWindow();
    select(null);
    renderLists();
    gallery.set([], place);
    for (const block of all("[data-sat-block]")) block.hidden = true;

    globe.setPlace(place.lat, place.lon);
    link(place);

    try {
      if (!catalog) {
        catalog = await loadCatalog(signal);
        globe.setCatalog(catalog.globe);
      }
      const records = catalog.search;

      const [passes, archive] = await Promise.all([
        findPasses(records, place.lat, place.lon, {
          window: span,
          signal,
          onProgress: (done, total) => busy("Checking a week of orbits…", done / total),
        }),
        // Without the archive there are still the passes.
        searchScenes(place.lat, place.lon, signal).catch(() => null),
      ]);
      if (signal.aborted) return;

      matched = matchPasses(passes, archive?.scenes ?? [], records);
      addDaily(matched, place.lat, place.lon);
      const past = matched.filter((pass) => !pass.upcoming);
      const photos = gallery.set(matched, place, archive?.scenes, archive?.clearLook);
      const upcoming = matched.length - past.length;
      const satellites = new Set(past.map((pass) => pass.noradId)).size;
      busy("");
      setText(
        "[data-sat-summary]",
        `${satellites} satellites in the past 7 days · ${photos} public images · ${upcoming} upcoming passes.` +
          (archive ? "" : " The detailed imagery archive is temporarily unavailable."),
      );
      for (const label of ROWS) {
        setText(
          `[data-sat-count="${label}"]`,
          String(past.filter((pass) => pass.label === label).length),
        );
      }

      const always = watchers(records, place.lat, place.lon).map((profile) => profile.name);
      setText(
        "[data-sat-always]",
        `${always.join(", ")}. Weather satellites that hang 35,786 km over the equator and photograph this side of the Earth every few minutes.`,
      );
      const blocks: Record<string, boolean> = {
        always: always.length > 0,
        lapse: true,
        timeline: true,
        passes: true,
      };
      for (const block of all("[data-sat-block]")) {
        block.hidden = !blocks[block.dataset.satBlock ?? ""];
      }
      renderLists();
    } catch {
      if (!signal.aborted) busy("Could not finish the orbit search. Try again in a moment.");
    }
  };

  // ------------------------------------------------------------ choosing --

  for (const button of all<HTMLButtonElement>("[data-sat-pick]")) {
    const place = places.find((candidate) => candidate.id === button.dataset.satPick);
    if (place) button.addEventListener("click", () => void run(focusOn(place)), listen);
  }

  const locate = $<HTMLButtonElement>("[data-sat-locate]");
  if ("geolocation" in navigator) {
    locate.hidden = false;
    locate.addEventListener(
      "click",
      () => {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            if (mounted.signal.aborted) return;
            void run({
              lat: coords.latitude,
              lon: coords.longitude,
              label: "Where you are",
              own: true,
            });
          },
          () => (locate.textContent = "Your location is not available"),
          { maximumAge: 600_000, timeout: 10_000 },
        );
      },
      listen,
    );
  }
  $("[data-sat-lapse]").addEventListener(
    "click",
    () => {
      if (focus) openTimelapse(lapseDialog, focus);
    },
    listen,
  );

  const zooms: Record<string, number> = { in: 0.7, out: 1 / 0.7 };
  for (const button of all<HTMLButtonElement>("[data-sat-zoom]")) {
    button.addEventListener(
      "click",
      () => globe.zoomBy(zooms[button.dataset.satZoom ?? ""] ?? 1),
      listen,
    );
  }
  const day = $<HTMLInputElement>("[data-sat-day]");
  day.addEventListener("change", () => globe.setDayPicture(day.checked), listen);

  // On a phone the page scrolls under the site's header, which is clear
  // glass over the globe and has to turn solid over the text (see Navbar).
  let solid = false;
  window.addEventListener(
    "scroll",
    () => {
      if (solid === window.scrollY > stage.offsetHeight - 64) return;
      solid = !solid;
      window.dispatchEvent(new CustomEvent("story-header-solid", { detail: { solid } }));
    },
    { passive: true, ...listen },
  );

  const home = places.find((place) => place.id === HOME) ?? places[0];
  void run(focusFromUrl(places, window.location.search) ?? focusOn(home));

  return () => {
    mounted.abort();
    abort?.abort();
    // Closing a dialog stops what it was fetching.
    sceneDialog.close();
    lapseDialog.close();
    search.dispose();
    gallery.dispose();
    timeline.dispose();
    globe.dispose();
  };
}

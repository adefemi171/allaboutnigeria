"use client";

import { useEffect, useRef } from "react";
import type { Place } from "@/lib/satellites/places";
import "./sky.css";

const FILTERS = [
  ["all", "All"],
  ["photo", "With a photo"],
  ["imaging", "Cameras"],
  ["radar", "Radar"],
  ["weather", "Weather"],
  ["crew", "Crewed"],
];
// The rows of the timeline, as in src/lib/satellites/timeline.ts.
const ROWS = [
  ["watched", "Photo"],
  ["likely", "Likely"],
  ["could", "Could"],
  ["overhead", "Overhead"],
];
const TABS = [
  ["all", "All"],
  ["detail", "Detail"],
  ["weather", "Weather"],
];
const LEGEND = [
  ["imaging", "Camera"],
  ["radar", "Radar"],
  ["weather", "Weather"],
  ["crew", "Crewed"],
  ["other", "Other"],
];

/**
 * The Sky page. React only lays out the markup: what happens on it is the
 * work of controller.ts, which fills in the lists, draws the globe and the
 * timeline, and cleans up after itself when the page is left.
 */
export function SatellitePage({ places, picks }: { places: Place[]; picks: Place[] }) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    let unmount: (() => void) | undefined;
    let left = false;
    // The globe is most of the page's script: fetch it once the page shows.
    void import("./controller").then(({ mountSatellitePage }) => {
      if (!left && root.current) unmount = mountSatellitePage(root.current, places);
    });
    return () => {
      left = true;
      unmount?.();
    };
  }, [places]);

  return (
    <main id="main" className="sat" ref={root}>
      <div className="sat__stage">
        <div className="sat__viewport">
          <div className="sat__globe" data-sat-globe>
            <p className="sat__clock mono" data-sat-clock></p>

            <figure className="sat__capture" data-sat-replay-capture hidden>
              <canvas role="img"></canvas>
              <figcaption></figcaption>
            </figure>

            <div className="sat__tools">
              <ul className="sat__legend" aria-label="What the dots are">
                {LEGEND.map(([kind, label]) => (
                  <li key={kind} className={`sat__dot sat__dot--${kind}`}>
                    {label}
                  </li>
                ))}
              </ul>
              <label className="sat__day">
                <input type="checkbox" data-sat-day defaultChecked aria-label="Clouds of the day" />
                <span aria-hidden="true">Clouds of the day</span>
              </label>
              <div className="sat__zoom" role="group" aria-label="Zoom">
                <button type="button" data-sat-zoom="in" aria-label="Zoom in">
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
                <button type="button" data-sat-zoom="out" aria-label="Zoom out">
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            <p className="sat__tip mono" data-sat-tip hidden></p>
          </div>
          <article className="sat__pass sat__card" data-sat-pass hidden>
            <p className="mono" data-sat-pass-label></p>
            <h2 data-sat-pass-name></h2>
            <dl>
              <div>
                <dt className="mono">Closest</dt>
                <dd data-sat-pass-when></dd>
              </div>
              <div>
                <dt className="mono">Passed</dt>
                <dd data-sat-pass-near></dd>
              </div>
            </dl>
            <div className="sat__replay" data-sat-replay hidden>
              <p className="sat__replay-status">
                <strong data-sat-replay-phase></strong>
                <span data-sat-replay-altitude></span>
              </p>
              <input className="sat__replay-scrubber" type="range" min="0" max="1000" defaultValue={0} data-sat-replay-progress aria-label="Replay time" />
              <div className="sat__replay-controls">
                <button type="button" data-sat-replay-playback>Pause</button>
                <button type="button" data-sat-replay-closest>Closest approach</button>
                <button type="button" data-sat-replay-follow aria-pressed="false">Follow spacecraft</button>
              </div>
              <p className="sat__replay-scale">Illustrated spacecraft, enlarged for visibility</p>
            </div>
            <p className="sat__actions">
              <button type="button" className="is-main" data-sat-pass-photo>
                See the photo
              </button>
              <button type="button" data-sat-pass-replay>
                Restart
              </button>
              <button type="button" data-sat-pass-now>
                Back to now
              </button>
            </p>
          </article>
        </div>

        <section className="sat__timeline" data-sat-block="timeline" aria-label="The week on a timeline" hidden>
          <ul className="sat__rows mono">
            {ROWS.map(([label, name]) => (
              <li key={label} className={`sat__row sat__row--${label}`}>
                {name} <span data-sat-count={label}></span>
              </li>
            ))}
          </ul>
          {/* The same passes are in the lists, for those who cannot use this. */}
          <canvas data-sat-timeline-canvas aria-hidden="true"></canvas>
        </section>
      </div>

      <div className="sat__panel">
        <div className="sat__scroll">
          <header className="sat__intro">
            <h1>Satellite explorer</h1>
            <p className="sat__lede">
              Search for a place or pick one on the globe to see imagery and satellite passes.
            </p>
          </header>

          <div className="sat__search">
            <div className="search" data-sat-search>
              <label className="visually-hidden" htmlFor="sat-search">
                Find a city, a street or an area in Nigeria
              </label>
              <input
                className="search__field"
                id="sat-search"
                type="text"
                inputMode="search"
                enterKeyHint="search"
                placeholder="Find a city, a street, an area"
                autoComplete="off"
                spellCheck={false}
                role="combobox"
                aria-expanded="false"
                aria-controls="sat-search-results"
                aria-autocomplete="list"
              />
              <ul className="search__results" id="sat-search-results" role="listbox" hidden></ul>
            </div>
            <ul className="sat__picks">
              {picks.map((place) => (
                <li key={place.id}>
                  <button type="button" data-sat-pick={place.id}>
                    {place.name}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" data-sat-locate hidden>
                  Where I am
                </button>
              </li>
            </ul>
          </div>

          <section className="sat__report sat__card" data-sat-report hidden>
            <h2 data-sat-where />
            <p className="mono" data-sat-status role="status">
              Looking up orbits…
            </p>
            <progress className="sat__progress" data-sat-progress max={1} value={0}></progress>
            <p className="sat__summary" data-sat-summary></p>

            <div className="sat__gallery" data-sat-gallery hidden>
              <h3 className="sat__gallery-title">Satellite imagery</h3>
              <div className="sat__gallery-bar">
                <div className="sat__tabs" role="group" aria-label="Image type">
                  {TABS.map(([tab, label]) => (
                    <button key={tab} type="button" data-gallery-tab={tab} aria-pressed="false">
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mono" data-gallery-count></p>
                <button type="button" data-gallery-step="-1" aria-label="Previous picture">
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M10 3 5 8l5 5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button type="button" data-gallery-step="1" aria-label="Next picture">
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="m6 3 5 5-5 5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
              <button type="button" className="sat__picture" data-gallery-open aria-label="Show this picture large">
                <span className="sat__square">
                  <canvas data-gallery-canvas hidden></canvas>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the archive scales it */}
                  <img data-gallery-img alt="" referrerPolicy="no-referrer" decoding="async" hidden />
                  <span className="sat__pin" data-gallery-pin hidden></span>
                </span>
                <span className="sat__picture-message" data-gallery-placeholder hidden />
                <span className="sat__tag mono" data-gallery-tag></span>
                <span className="sat__picture-action" aria-hidden="true">View larger ↗</span>
              </button>
              <div className="sat__caption">
                <p>
                  <strong data-gallery-name></strong>
                  <span data-gallery-what></span>
                </p>
                <button type="button" data-gallery-replay>
                  Replay
                </button>
              </div>
            </div>

            <div className="sat__block" data-sat-block="lapse" hidden>
              <button type="button" className="sat__lapse" data-sat-lapse>
                <strong className="mono">Time-lapse</strong>
                <span>This place, year by year</span>
              </button>
            </div>

            <div className="sat__block" data-sat-block="always" hidden>
              <h3 className="mono">Always watching</h3>
              <p className="sat__note" data-sat-always></p>
            </div>

            <div className="sat__block" data-sat-block="passes" hidden>
              <div className="sat__filters" role="group" aria-label="Which passes to list">
                {FILTERS.map(([kind, label]) => (
                  <button key={kind} type="button" data-sat-filter={kind} aria-pressed="false">
                    {label} <span></span>
                  </button>
                ))}
              </div>
              <h3 className="mono">Upcoming</h3>
              <ul className="sat__list" data-sat-upcoming></ul>
              <p className="sat__note" data-sat-upcoming-note hidden></p>
              <h3 className="mono">This week</h3>
              <ul className="sat__list" data-sat-past></ul>
              <p className="sat__note" data-sat-past-note hidden></p>
            </div>

            <p className="sat__credit">
              Times are West Africa Time. Orbits Celestrak · SGP4 via satellite.js · Photos
              Sentinel-2 / Landsat via Microsoft Planetary Computer · Globe, clouds and daily
              pictures NASA Blue Marble, Black Marble, VIIRS and MODIS via GIBS · Streets
              OpenStreetMap via Photon
              <span data-sat-city hidden>
                {" · "}
                <a data-sat-city-link></a>
              </span>
            </p>
          </section>
        </div>
      </div>

      {/* A picture shown large: the close-up of the place, and the whole frame. */}
      <dialog className="sat__dialog" data-scene>
        <form method="dialog" className="sat__dialog-bar">
          <p className="mono" data-scene-label></p>
          <button type="submit">Close</button>
        </form>
        <div className="sat__views" role="group" aria-label="What to show" data-scene-views>
          <button type="button" data-scene-view="closeup" aria-pressed="true">
            Close-up
          </button>
          <button type="button" data-scene-view="frame" aria-pressed="false">
            Whole frame
          </button>
        </div>
        <div className="sat__large">
          <div className="sat__closeup" data-scene-closeup hidden>
            <canvas data-scene-canvas></canvas>
            <span className="sat__pin" data-scene-pin aria-hidden="true"></span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- the archive scales it */}
          <img data-scene-img alt="" referrerPolicy="no-referrer" hidden />
        </div>
        <p className="sat__dialog-note" data-scene-note role="status"></p>
      </dialog>

      {/* One place through the years: the clearest picture of each, played in a row. */}
      <dialog className="sat__dialog" data-lapse>
        <form method="dialog" className="sat__dialog-bar">
          <p className="mono" data-lapse-label></p>
          <button type="submit">Close</button>
        </form>
        <div className="sat__views" role="group" aria-label="Which year to show" data-lapse-years>
          <button type="button" data-lapse-play aria-pressed="true">
            Play
          </button>
        </div>
        <div className="sat__large">
          <div className="sat__closeup">
            <canvas data-lapse-canvas></canvas>
            <span className="sat__pin" data-lapse-pin aria-hidden="true" hidden></span>
          </div>
        </div>
        <p className="sat__dialog-note" data-lapse-note role="status"></p>
      </dialog>
    </main>
  );
}

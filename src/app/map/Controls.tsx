"use client";

// The "Light and water" panel: the time and the sun, the sky, the ground,
// what is shown, and the sea level. On a phone it is a sheet at the bottom.

import { useEffect, useRef, useState } from "react";
import { openFeedbackModal } from "@/components/FeedbackWidget";
import { sunPosition, sunTimes } from "@/lib/sun";
import {
  dayOfYear,
  formatDay,
  formatMinutes,
  formatTime,
  fromDayOfYear,
  fromLocal,
  toLocal,
  type LocalTime,
} from "@/lib/map/clock";
import type { GroundMode, MapEngine } from "@/lib/map/engine";
import { ORIGIN } from "@/lib/map/projection";
import { BUILDING_BANDS, LAND_LEGEND, STREET } from "@/lib/map/style";
import { Sources } from "./Sources";
import styles from "./map.module.css";

/** Highest sea level on the slider, metres. */
const SEA_MAX = 10;

function metres(value: number): string {
  return `+${value.toFixed(1)} m`;
}

export function Controls({
  engine,
  streets,
  overhead,
  onOverhead,
}: {
  engine: MapEngine;
  /** Street-level detail is showing, so the legend is the buildings'. */
  streets: boolean;
  overhead: boolean;
  onOverhead: (open: boolean) => void;
}) {
  // On a phone the panel starts closed so the map is what you see first.
  const [open, setOpen] = useState(() => !window.matchMedia("(max-width: 720px)").matches);
  const [live, setLive] = useState(true);
  const [local, setLocal] = useState<LocalTime>(() => toLocal(new Date()));
  const [ground, setGround] = useState<GroundMode>("model");
  const [overcast, setOvercast] = useState(0);
  const [shown, setShown] = useState({ university: true, landmark: true, people: true });
  const [flood, setFlood] = useState(false);
  const [sea, setSea] = useState(3);
  const animation = useRef(0);

  // ---- light: the real sun now, or at a time and day picked on the sliders
  const date = live ? null : fromLocal(local);
  useEffect(() => {
    if (!live) return;
    const tick = () => {
      const now = new Date();
      setLocal(toLocal(now));
      engine.setDate(now);
    };
    tick();
    const timer = window.setInterval(tick, 30000);
    return () => window.clearInterval(timer);
  }, [engine, live]);
  useEffect(() => {
    if (date) engine.setDate(date);
  }, [engine, date?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownDate = date ?? new Date();
  const { altitude } = sunPosition(shownDate, ORIGIN.lat, ORIGIN.lon);
  const { rise, set } = sunTimes(shownDate, ORIGIN.lat, ORIGIN.lon);
  const sunLine =
    (altitude >= 0
      ? `The sun is ${Math.round(altitude)}° above the horizon.`
      : `The sun is ${Math.round(-altitude)}° below the horizon.`) +
    (rise && set ? ` Sunrise ${formatTime(rise)}, sunset ${formatTime(set)}.` : "");

  const pick = (next: Partial<LocalTime>) => {
    setLive(false);
    setLocal((current) => ({ ...current, ...next }));
  };

  // ---- the sea: it rises from the shore to the chosen level
  const showSea = (level: number | null) => engine.setFlood(level);
  useEffect(() => () => cancelAnimationFrame(animation.current), []);
  const riseTo = (target: number) => {
    cancelAnimationFrame(animation.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return showSea(target);
    const started = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - started) / 2000);
      showSea(target * (1 - (1 - t) ** 3));
      if (t < 1) animation.current = requestAnimationFrame(frame);
    };
    animation.current = requestAnimationFrame(frame);
  };
  const share = Math.round(engine.grid.shareBelow(flood ? sea : SEA_MAX) * 1000) / 10;

  return (
    <details
      className={`${styles.card} ${styles.controls}`}
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary>
        <span>Light and water</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2 4.5 6 8.5l4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className={styles.controlsBody}>
        <fieldset>
          <legend className="mono">Nigerian time</legend>
          <p className={styles.value}>
            {formatMinutes(local.minutes)}, {formatDay(shownDate)}
            {live ? " (now)" : ""}
          </p>
          <label className={styles.slider}>
            <span>Time of day</span>
            <input
              type="range"
              min="0"
              max="1435"
              step="5"
              value={local.minutes}
              onChange={(event) => pick({ minutes: Number(event.target.value) })}
            />
          </label>
          <label className={styles.slider}>
            <span>Day of the year</span>
            <input
              type="range"
              min="1"
              max="365"
              step="1"
              value={dayOfYear(local)}
              onChange={(event) => pick(fromDayOfYear(local.year, Number(event.target.value)))}
            />
          </label>
          <p className={styles.note}>{sunLine}</p>
          {!live && (
            <button
              className={`button button--quiet ${styles.now}`}
              type="button"
              onClick={() => setLive(true)}
            >
              Back to now
            </button>
          )}
        </fieldset>

        <fieldset>
          <legend className="mono">Sky</legend>
          <div className={styles.segmented}>
            {["Clear", "Overcast"].map((label, value) => (
              <label key={label}>
                <input
                  type="radio"
                  name="sky"
                  checked={overcast === value}
                  onChange={() => {
                    setOvercast(value);
                    engine.setOvercast(value);
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mono">Ground</legend>
          <div className={styles.segmented}>
            {(["model", "aerial"] as const).map((mode) => (
              <label key={mode}>
                <input
                  type="radio"
                  name="ground"
                  checked={ground === mode}
                  onChange={() => {
                    setGround(mode);
                    engine.setGroundMode(mode);
                  }}
                />
                <span>{mode === "model" ? "Model" : "Aerial"}</span>
              </label>
            ))}
          </div>
          <p className={styles.note}>
            Model is the atlas of heights and people. Aerial is the cloud-free Sentinel-2 picture of 2016 by
            EOX: 10 m pixels, sharp for a region and soft at street level. Zoom in for streets and 3D
            buildings on top of it.
          </p>
        </fieldset>

        <fieldset>
          <legend className="mono">On the map</legend>
          <label className={`${styles.check} ${styles.checkFirst}`}>
            <input
              type="checkbox"
              checked={shown.university}
              onChange={(event) => {
                setShown({ ...shown, university: event.target.checked });
                engine.setLabelKinds(["university", "campus"], event.target.checked);
              }}
            />
            <span className={`${styles.swatch} ${styles.swatchUniversity}`} aria-hidden="true" />
            <span>Universities</span>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={shown.landmark}
              onChange={(event) => {
                setShown({ ...shown, landmark: event.target.checked });
                engine.setLabelKinds(["landmark"], event.target.checked);
              }}
            />
            <span className={`${styles.swatch} ${styles.swatchLandmark}`} aria-hidden="true" />
            <span>Landmarks</span>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={shown.people}
              onChange={(event) => {
                setShown({ ...shown, people: event.target.checked });
                engine.setPeople(event.target.checked);
              }}
            />
            <span>People and traffic</span>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={overhead}
              onChange={(event) => onOverhead(event.target.checked)}
            />
            <span>What watched here</span>
          </label>
          <p className={styles.note}>
            From afar they are dots: point at one for its name, press it to go there. Once you are close to
            the ground, walkers, okadas, cars and trains appear, and the street lamps come on after dark. The
            traffic is made up. What watched here lists recent satellite pictures of the place you picked, or
            the map centre.
          </p>
        </fieldset>

        <fieldset>
          <legend className="mono">Sea level</legend>
          <p className={styles.value}>{flood ? metres(sea) : "Today's sea"}</p>
          <label className={styles.slider}>
            <span>Raise the sea by</span>
            <input
              type="range"
              min="0.5"
              max={SEA_MAX}
              step="0.5"
              value={sea}
              onChange={(event) => {
                const level = Number(event.target.value);
                cancelAnimationFrame(animation.current);
                setSea(level);
                setFlood(true);
                showSea(level);
              }}
            />
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={flood}
              onChange={(event) => {
                setFlood(event.target.checked);
                if (event.target.checked) riseTo(sea);
                else {
                  cancelAnimationFrame(animation.current);
                  showSea(null);
                }
              }}
            />
            <span>Raise the sea</span>
          </label>
          <p className={styles.note}>
            {flood
              ? `${share}% of Nigeria's land lies below this level.`
              : `${share}% of Nigeria's land lies less than ${SEA_MAX} m above the sea, most of it in the Niger Delta and along the Lagos coast.`}
          </p>
        </fieldset>

        {streets ? (
          <div className={styles.legend}>
            <p className="mono">Floors</p>
            <ul className={styles.bands}>
              {BUILDING_BANDS.map((band) => (
                <li key={band.label}>
                  <span style={{ background: band.walls[0] }} aria-hidden="true" />
                  {band.label}
                </li>
              ))}
            </ul>
            <p className={styles.note}>
              The colour of a wall shows how many floors the building is drawn with. Overture Maps records a
              height for few Nigerian buildings, so most heights here are estimated from the footprint and how
              many people live around it.{" "}
              <span className={styles.lane} style={{ background: STREET.laterite }} aria-hidden="true" />
              Red-brown roads are unpaved laterite.
            </p>
          </div>
        ) : (
          <div className={styles.legend}>
            <p className="mono">Ground height</p>
            <div className={styles.ramp} style={{ background: LAND_LEGEND }} aria-hidden="true" />
            <div className={`${styles.scale} mono`} aria-hidden="true">
              {[0, 500, 1200, 2300].map((metres) => (
                <span key={metres} style={{ left: `${(metres / 2300) * 100}%` }}>
                  {metres ? metres.toLocaleString("en-GB") : "0 m"}
                </span>
              ))}
            </div>
            <p className={styles.note}>
              Each block stands on one 2 km square; the taller it is, the more people live there. Heights are
              stretched so you can see them. Zoom in far enough and the squares give way to real streets and
              buildings.
            </p>
          </div>
        )}

        <p className={`${styles.note} ${styles.report}`}>
          Something wrong on the map?{" "}
          <button type="button" onClick={() => openFeedbackModal({ category: "map-landmark" })}>
            Report a problem
          </button>
        </p>

        <div className={`${styles.legend} ${styles.phoneOnly}`}>
          <Sources />
        </div>
      </div>
    </details>
  );
}

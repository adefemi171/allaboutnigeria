"use client";

// The map page: starts the engine on its canvas and wires the panels and
// readouts to it. The engine is plain TypeScript (src/lib/map) and owns the
// canvas and the labels laid over it; React owns everything else.

import { useCallback, useEffect, useRef, useState } from "react";
import { isLiteDevice } from "@/lib/earth";
import type { MapEngine, Picked, Pose } from "@/lib/map/engine";
import type { MapPlace } from "@/lib/map/places";
import { ORIGIN, latLonToWorld, worldToLatLon } from "@/lib/map/projection";
import type { StreetStatus } from "@/lib/map/streets";
import { Controls } from "./Controls";
import { Overhead, type Focus } from "./Overhead";
import { PlaceCard, about } from "./PlaceCard";
import { MapSearch, type Spot } from "./MapSearch";
import { Sources } from "./Sources";
import styles from "./map.module.css";

const number = new Intl.NumberFormat("en-GB");

/** Camera distance (km) below which the map counts as down at the streets. */
const STREET_LEVEL = 4.4;
/** Where the streets button goes back up to: the view of a whole city. */
const CITY_LEVEL = 70;

function Readout({ picked, touch }: { picked: Picked | null; touch: boolean }) {
  if (!picked) {
    return touch ? (
      <>
        Tap a square to read it, or a dot to see what it is. Drag, pinch and twist to move. Pinch in for
        streets.
      </>
    ) : (
      <>
        Point at a square to read it. Drag to move, scroll to zoom, right-drag to turn. Zoom in for streets
        and people.
      </>
    );
  }
  const { cell } = picked;
  const where = (
    <b>
      {cell.lat.toFixed(4)}°N {cell.lon.toFixed(4)}°E
    </b>
  );
  if (cell.kind === "abroad")
    return (
      <>
        {where}
        <br />
        Outside Nigeria
      </>
    );
  if (cell.kind === "sea")
    return (
      <>
        {where}
        <br />
        Gulf of Guinea
      </>
    );
  const state = <b>{cell.state?.name}</b>;
  if (cell.kind === "water" || cell.elevation === null)
    return (
      <>
        {where}
        <br />
        {state} · lagoon, lake or river
      </>
    );
  return (
    <>
      {where}
      <br />
      {state} · <b>{number.format(Math.round(cell.elevation))} m</b> above the sea ·{" "}
      {cell.people >= 1 ? (
        <>
          <b>{about(cell.people)}</b> residents in this 2 km square
        </>
      ) : (
        "nobody lives in this square"
      )}
    </>
  );
}

export function MapClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);
  const [hover, setHover] = useState<Picked | null>(null);
  const [pinned, setPinned] = useState<Picked | null>(null);
  const [place, setPlace] = useState<MapPlace | null>(null);
  const [spot, setSpot] = useState<Focus | null>(null);
  const [overhead, setOverhead] = useState(false);
  const [centre, setCentre] = useState<Focus>({ ...ORIGIN, label: "Map centre" });
  const [streets, setStreets] = useState<StreetStatus>({ visible: false, loading: false, failed: false });
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // ---- the engine: started once, and taken down completely on the way out
  useEffect(() => {
    const canvas = canvasRef.current;
    const labels = labelsRef.current;
    if (!canvas || !labels) return;
    let live: MapEngine | null = null;
    let gone = false;

    (async () => {
      if (!document.createElement("canvas").getContext("webgl2")) {
        setFailed("This browser cannot draw the 3D map. The guides work without it.");
        return;
      }
      const lite = isLiteDevice();
      const narrow = window.matchMedia("(max-width: 720px)").matches;
      setTouch(window.matchMedia("(pointer: coarse)").matches);
      const start: Pose = { x: 0, z: 30, dist: narrow ? 5600 : 2100, az: 0, tilt: 30, shiftX: 0, shiftY: 0 };
      let MapEngine: typeof import("@/lib/map/engine").MapEngine;
      try {
        ({ MapEngine } = await import("@/lib/map/engine"));
      } catch (error) {
        console.error(error);
        setFailed("The map could not be loaded. The guides work without it.");
        return;
      }
      if (gone) return;
      live = new MapEngine({
        canvas,
        labels,
        dataUrl: "/data/map",
        interactive: true,
        pose: start,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        lite,
      });
      try {
        await live.init();
      } catch (error) {
        if (gone) return;
        console.error(error);
        live.dispose();
        live = null;
        setFailed("The map could not be loaded. The guides work without it.");
        return;
      }
      if (gone) return;
      setEngine(live);
    })();

    return () => {
      gone = true;
      live?.dispose();
    };
  }, []);

  // ---- picking a place, a spot, or nothing
  const syncUrl = useCallback((set: Record<string, string | null>) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(set)) {
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    history.replaceState(null, "", url);
  }, []);

  const showPlace = useCallback(
    (next: MapPlace) => {
      if (!engine) return;
      setPlace(next);
      setSpot(null);
      engine.setMarker(null);
      engine.flyToPlace(next);
      syncUrl({ place: next.id, at: null, name: null });
    },
    [engine, syncUrl],
  );

  const hidePlace = useCallback(() => {
    setPlace(null);
    syncUrl({ place: null });
  }, [syncUrl]);

  /** Pin a spot that is not one of the map's own places, and go down to its street. */
  const showSpot = useCallback(
    (hit: Spot): boolean => {
      if (!engine) return false;
      const [x, z] = latLonToWorld(hit.lat, hit.lon);
      // Only inside the country: the streets cover nothing else.
      const cell = engine.grid.cellAt(x, z);
      if (cell < 0 || !engine.grid.isNigeria(cell)) return false;
      setPlace(null);
      setSpot({ lat: hit.lat, lon: hit.lon, label: hit.title });
      engine.setMarker({ x, z, text: hit.title });
      engine.flyToStreets(x, z);
      syncUrl({ place: null, at: `${hit.lat.toFixed(5)},${hit.lon.toFixed(5)}`, name: hit.title });
      return true;
    },
    [engine, syncUrl],
  );

  // ---- events from the engine
  useEffect(() => {
    if (!engine) return;
    engine.on("hover", setHover);
    engine.on("pick", setPinned);
    engine.on("streets", setStreets);
    engine.on("select", (id) => {
      const found = engine.places.find((candidate) => candidate.id === id);
      if (found) showPlace(found);
    });
    let timer = 0;
    engine.on("move", (pose) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const [lat, lon] = worldToLatLon(pose.x, pose.z);
        setCentre({ lat, lon, label: `Map centre · ${lat.toFixed(3)}°N ${lon.toFixed(3)}°E` });
      }, 700);
    });
    setStreets(engine.getStreets());
    return () => window.clearTimeout(timer);
  }, [engine, showPlace]);

  // A link can open the map on a place, or on a spot ("at=6.45,3.39&name=...").
  useEffect(() => {
    if (!engine) return;
    const params = new URL(window.location.href).searchParams;
    const wanted = engine.places.find((candidate) => candidate.id === params.get("place"));
    const [lat, lon] = (params.get("at") ?? "").split(",").map(Number);
    if (wanted) showPlace(wanted);
    else if (Number.isFinite(lat) && Number.isFinite(lon)) {
      showSpot({ lat, lon, title: params.get("name") || "Here" });
    }
    // Once, when the map is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const toggleStreets = () => {
    if (!engine) return;
    const goal = engine.getGoal();
    if (goal.dist < STREET_LEVEL) engine.setGoal({ dist: CITY_LEVEL, tilt: 54 }, 2.6);
    else engine.flyToStreets(goal.x, goal.z);
  };

  const nudges: [string, string, () => void, React.ReactNode][] = engine
    ? [
        [
          "in",
          "Zoom in",
          () => engine.zoomBy(0.7),
          <path key="p" d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
        ],
        [
          "out",
          "Zoom out",
          () => engine.zoomBy(1 / 0.7),
          <path key="p" d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
        ],
        [
          "left",
          "Turn left",
          () => engine.rotateBy(-30),
          <path
            key="p"
            d="M3.5 8a4.5 4.5 0 1 0 1.6-3.4M3 2.5v3h3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />,
        ],
        [
          "right",
          "Turn right",
          () => engine.rotateBy(30),
          <path
            key="p"
            d="M12.5 8a4.5 4.5 0 1 1-1.6-3.4M13 2.5v3h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />,
        ],
        [
          "flat",
          "Switch between top view and tilted view",
          () => engine.tiltTo(engine.getGoal().tilt > 20 ? 0.6 : 55),
          <path
            key="p"
            d="M2 11 8 8l6 3-6 3zM8 2v4M6.3 4.3 8 6l1.7-1.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />,
        ],
      ]
    : [];

  const status = streets.failed
    ? "Streets could not be loaded here. Trying again shortly."
    : streets.loading && streets.visible
      ? "Loading streets and buildings"
      : "";
  const focus: Focus = place ? { lat: place.lat, lon: place.lon, label: place.name } : (spot ?? centre);
  const streetsLabel = streets.visible ? "Back up to the city" : "Go down to the streets";

  return (
    <main className={styles.map}>
      <h1 className="visually-hidden">Map of Nigeria</h1>

      <div className={`${styles.stage} ${engine ? styles.ready : ""}`}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          tabIndex={0}
          role="application"
          aria-label="3D map of Nigeria. Arrow keys move, plus and minus zoom, Q and E turn, Page Up and Page Down tilt."
        />
        <div ref={labelsRef} className={styles.labels} aria-hidden="true" />
        <p
          className={`${styles.notice} ${failed ? styles.noticeFailed : ""}`}
          role={failed ? "alert" : undefined}
        >
          {failed ?? "Loading the map"}
        </p>

        <div className={styles.foot}>
          {status && (
            <p
              className={`${styles.hud} ${styles.status} ${streets.failed ? styles.statusFailed : ""}`}
              role="status"
            >
              {status}
            </p>
          )}
          <p className={styles.hud}>
            <Readout picked={hover ?? pinned} touch={touch} />
          </p>
        </div>
        <p className={`${styles.hud} ${styles.credit}`}>
          Heights Mapzen/SRTM · People WorldPop · States GRID3 · Streets © OpenStreetMap, OpenMapTiles ·
          Buildings Overture ·{" "}
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setSourcesOpen((open) => !open)}
            aria-expanded={sourcesOpen}
          >
            Sources
          </button>
        </p>
        {sourcesOpen && (
          <div className={`${styles.card} ${styles.sourcesCard}`}>
            <Sources />
          </div>
        )}
      </div>

      <div className={styles.left}>
        <MapSearch places={engine?.places ?? []} onPlace={showPlace} onSpot={showSpot} disabled={!engine} />
        {engine && place && (
          <PlaceCard
            engine={engine}
            place={place}
            onClose={hidePlace}
            onStreets={() => {
              const [x, z] = latLonToWorld(place.lat, place.lon);
              engine.flyToStreets(x, z);
              // On a phone the card covers half the map, and the streets are what was asked for.
              if (window.matchMedia("(max-width: 720px)").matches) hidePlace();
            }}
            onOverhead={() => setOverhead(true)}
          />
        )}
        {overhead && <Overhead focus={focus} onClose={() => setOverhead(false)} />}
      </div>

      {engine && (
        <Controls engine={engine} streets={streets.visible} overhead={overhead} onOverhead={setOverhead} />
      )}

      {engine && (
        <div className={styles.nudge} role="group" aria-label="Move the map">
          {nudges.map(([key, label, act, icon]) => (
            <button
              key={key}
              type="button"
              className={styles.extra}
              aria-label={label}
              title={label}
              onClick={act}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                {icon}
              </svg>
            </button>
          ))}
          <button
            type="button"
            aria-label={streetsLabel}
            title={streetsLabel}
            aria-pressed={streets.visible}
            onClick={toggleStreets}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M2.5 14V7.5l3-1.5v8M8 14V3.5l5.5 2V14M1.5 14h13M10.3 7.2v.1M10.3 10v.1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </main>
  );
}

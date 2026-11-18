"use client";

// "What watched here": the satellite pictures of the last week over the
// place picked, or the map centre, from the site's own archive search
// (src/lib/satellites, /api/scenes).

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/map/clock";
import { describeScene, searchScenes, type WeekOfScenes } from "@/lib/satellites/scenes";
import type { Scene } from "@/lib/satellites/types";
import { Close } from "./PlaceCard";
import styles from "./map.module.css";

export interface Focus {
  lat: number;
  lon: number;
  label: string;
}

function SceneItem({ scene }: { scene: Scene }) {
  return (
    <li className={styles.scene}>
      {scene.thumbnail ? (
        // The archive renders these to order; there is nothing for Next to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={scene.thumbnail} alt="" loading="lazy" width="74" height="74" />
      ) : (
        <span className={styles.sceneEmpty}>No preview</span>
      )}
      <span>
        <strong>{formatDate(new Date(scene.datetime))}</strong>
        <span>{describeScene(scene)}</span>
      </span>
    </li>
  );
}

export function Overhead({ focus, onClose }: { focus: Focus; onClose: () => void }) {
  const [found, setFound] = useState<WeekOfScenes | null>(null);
  const [error, setError] = useState(false);
  const { lat, lon, label } = focus;

  useEffect(() => {
    const abort = new AbortController();
    setFound(null);
    setError(false);
    searchScenes(lat, lon, abort.signal).then(
      (week) => setFound(week),
      () => {
        if (!abort.signal.aborted) setError(true);
      },
    );
    return () => abort.abort();
  }, [lat, lon]);

  const sky = `/sky?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&name=${encodeURIComponent(label)}`;
  return (
    <article className={`${styles.card} ${styles.overhead}`}>
      <Close onClick={onClose} />
      <p className="mono">What watched here</p>
      <h2>{label}</h2>
      {error ? (
        <p className={styles.overheadStatus} role="status">
          Could not reach the satellite archive just now. Try again in a moment.
        </p>
      ) : !found ? (
        <p className={styles.overheadStatus} role="status">
          Looking up recent satellite pictures…
        </p>
      ) : found.scenes.length ? (
        <ul className={styles.scenes}>
          {found.scenes.slice(0, 8).map((scene) => (
            <SceneItem key={scene.id} scene={scene} />
          ))}
        </ul>
      ) : (
        <>
          <p className={styles.overheadStatus}>
            No Sentinel-2 or Landsat pictures of this spot in the last 7 days.
            {found.clearLook ? " The last clear look:" : ""}
          </p>
          {found.clearLook && (
            <ul className={styles.scenes}>
              <SceneItem scene={found.clearLook} />
            </ul>
          )}
        </>
      )}
      <p className={styles.overheadCredit}>
        Sentinel-2 and Landsat via Microsoft Planetary Computer · last 7 days · Nigerian time ·{" "}
        <a href={sky}>Full satellite view</a>
      </p>
    </article>
  );
}

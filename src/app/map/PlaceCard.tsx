"use client";

import Link from "next/link";
import type { MapEngine } from "@/lib/map/engine";
import type { MapPlace } from "@/lib/map/places";
import { latLonToWorld } from "@/lib/map/projection";
import styles from "./map.module.css";

/** "about 7,800": two significant figures, which is all the grid can say. */
export function about(people: number): string {
  if (people < 1) return "nobody";
  const step = 10 ** Math.max(0, Math.floor(Math.log10(people)) - 1);
  return `about ${(Math.round(people / step) * step).toLocaleString("en-GB")}`;
}

const KINDS: Record<MapPlace["kind"], string> = {
  city: "City",
  university: "University",
  landmark: "Landmark",
};

export function Close({ onClick }: { onClick: () => void }) {
  return (
    <button className={styles.close} type="button" onClick={onClick} aria-label="Close">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function PlaceCard({
  engine,
  place,
  onClose,
  onStreets,
  onOverhead,
}: {
  engine: MapEngine;
  place: MapPlace;
  onClose: () => void;
  onStreets: () => void;
  onOverhead: () => void;
}) {
  const [x, z] = latLonToWorld(place.lat, place.lon);
  const cell = engine.grid.cellAt(x, z);
  const info = cell >= 0 ? engine.grid.info(cell) : null;
  const nearby = engine.grid.peopleWithin(x, z, 5);

  return (
    <article className={`${styles.card} ${styles.place}`}>
      <Close onClick={onClose} />
      <p className="mono">
        {KINDS[place.kind]} · {place.state}
      </p>
      <h2>{place.name}</h2>
      <p className={styles.blurb}>{place.blurb}</p>
      <dl className={styles.facts}>
        <div>
          <dt className="mono">Within 5 km</dt>
          <dd>{nearby >= 1 ? `${about(nearby)} people` : "nobody"}</dd>
        </div>
        <div>
          <dt className="mono">Ground level</dt>
          <dd>
            {info?.elevation != null ? `${Math.round(info.elevation).toLocaleString("en-GB")} m` : "water"}
          </dd>
        </div>
      </dl>
      <p className={styles.actions}>
        {!place.streets && (
          <button className="button" type="button" onClick={onStreets}>
            See the streets
          </button>
        )}
        <button className="button button--quiet" type="button" onClick={onOverhead}>
          What watched here
        </button>
      </p>
      {place.link && (
        <p className={styles.links}>
          <Link href={place.link.href}>{place.link.label}</Link>
        </p>
      )}
    </article>
  );
}

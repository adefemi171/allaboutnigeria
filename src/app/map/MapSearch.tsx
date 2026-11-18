"use client";

// "Find a city, a university, a street": the map's own places first, then
// streets and spots from the site's geocoder (/api/geocode, Photon on
// OpenStreetMap, limited to Nigeria).

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MapPlace } from "@/lib/map/places";
import styles from "./map.module.css";

export interface Spot {
  title: string;
  lat: number;
  lon: number;
}

interface Hit extends Spot {
  id: string;
  subtitle: string;
}

type Result = { place: MapPlace } | { hit: Hit };

const KINDS: Record<MapPlace["kind"], string> = {
  city: "City",
  university: "University",
  landmark: "Landmark",
};

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function MapSearch({
  places,
  onPlace,
  onSpot,
  disabled,
}: {
  places: MapPlace[];
  onPlace: (place: MapPlace) => void;
  /** False when the spot is outside the map. */
  onSpot: (spot: Spot) => boolean;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [note, setNote] = useState("");
  const list = useId();
  const field = useRef<HTMLInputElement>(null);

  const local = useMemo(() => {
    const q = fold(query.trim());
    if (q.length < 2) return [];
    return places
      .filter((place) => fold(`${place.name} ${place.state}`).includes(q))
      .sort(
        (a, b) =>
          Number(!fold(a.name).startsWith(q)) - Number(!fold(b.name).startsWith(q)) || a.rank - b.rank,
      )
      .slice(0, 6);
  }, [places, query]);

  // Streets come from the geocoder, a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    setHits([]);
    if (q.length < 3) return;
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: abort.signal })
        .then((response) => (response.ok ? response.json() : { places: [] }))
        .then((answer: { places?: Hit[] }) => setHits(answer.places ?? []))
        .catch(() => {});
    }, 350);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [query]);

  const results: Result[] = [...local.map((place) => ({ place })), ...hits.map((hit) => ({ hit }))];

  const choose = (result: Result) => {
    if ("place" in result) {
      onPlace(result.place);
    } else if (!onSpot(result.hit)) {
      setNote(`${result.hit.title} is outside the map.`);
      return;
    }
    setNote("");
    setOpen(false);
    setQuery("place" in result ? result.place.name : result.hit.title);
    field.current?.blur();
  };

  const showing = open && query.trim().length >= 2;

  return (
    <div className={styles.search} role="search">
      <label className="visually-hidden" htmlFor={`${list}-field`}>
        Find a city, a university, a street
      </label>
      <input
        ref={field}
        id={`${list}-field`}
        className={styles.searchField}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Find a city, a university, a street"
        disabled={disabled}
        value={query}
        role="combobox"
        aria-expanded={showing}
        aria-controls={list}
        aria-activedescendant={showing && results[active] ? `${list}-${active}` : undefined}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
          setNote("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") setActive((at) => Math.min(results.length - 1, at + 1));
          else if (event.key === "ArrowUp") setActive((at) => Math.max(0, at - 1));
          else if (event.key === "Enter" && results[active]) choose(results[active]);
          else if (event.key === "Escape") setOpen(false);
          else return;
          event.preventDefault();
        }}
      />
      {note && (
        <p className={styles.searchNote} role="status">
          {note}
        </p>
      )}
      {showing && (
        <ul className={styles.results} id={list} role="listbox">
          {results.map((result, index) => {
            const [title, detail, key] =
              "place" in result
                ? [result.place.name, `${KINDS[result.place.kind]} · ${result.place.state}`, result.place.id]
                : [result.hit.title, result.hit.subtitle || "Street or place", result.hit.id];
            return (
              <li
                key={key}
                id={`${list}-${index}`}
                role="option"
                aria-selected={index === active}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(result)}
              >
                <span>{title}</span>
                <span className="mono">{detail}</span>
              </li>
            );
          })}
          {!results.length && <li className={styles.resultsEmpty}>Nothing found yet</li>}
        </ul>
      )}
    </div>
  );
}

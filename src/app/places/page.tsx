"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  NIGERIA_PLACES,
  type PlaceCategory,
} from "@/data/nigeria-places";
import { Search, GraduationCap, Mountain, Landmark, Box, MapPin } from "lucide-react";

const CATEGORIES: { id: "all" | PlaceCategory; label: string }[] = [
  { id: "all", label: "All Places" },
  { id: "university", label: "Universities" },
  { id: "nature", label: "Natural Wonders" },
  { id: "culture", label: "Heritage & Culture" },
  { id: "stadium", label: "Stadia" },
  { id: "market", label: "Historic Markets" },
  { id: "transit", label: "Bridges & Transit" },
];

export default function PlacesDirectoryPage() {
  const [category, setCategory] = useState<"all" | PlaceCategory>("all");
  const [zone, setZone] = useState<string>("ALL");
  const [query, setQuery] = useState("");

  const zones = ["ALL", ...Array.from(new Set(NIGERIA_PLACES.map((p) => p.zone)))];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NIGERIA_PLACES.filter((p) => {
      const mCat = category === "all" || p.category === category;
      const mZone = zone === "ALL" || p.zone === zone;
      const mQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.shortName.toLowerCase().includes(q) ||
        p.state.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q);
      return mCat && mZone && mQ;
    });
  }, [category, zone, query]);

  const uniCount = NIGERIA_PLACES.filter((p) => p.category === "university").length;
  const campus3dCount = NIGERIA_PLACES.filter((p) => p.has3DCampus).length;

  return (
    <div className="min-h-screen bg-[#09090b]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <header className="border-b border-white/10 pb-8">
          <p className="font-mono-tech text-xs uppercase tracking-widest text-[#a855f7]">
            NIGERIA PLACES · {uniCount} UNIVERSITIES ({campus3dCount} IN 3D) &amp; NATIONAL LANDMARKS
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Universities, monuments &amp; natural wonders.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-[#b6b4ad]">
            Browse federal, state, and private universities alongside Nigeria&apos;s monoliths, waterfalls, reserves, stadia, and historic markets—with direct 3D OpenStreetMap campus &amp; city views.
          </p>

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex max-w-md flex-1 items-center rounded-xl border border-white/15 bg-[#121215] px-3.5 py-2.5">
                <Search className="mr-2.5 h-4 w-4 text-[#71717a]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search UNILAG, ABU Zaria, UI, Yankari, Zuma Rock, Kurmi…"
                  className="w-full bg-transparent text-sm text-white placeholder-[#71717a] focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {zones.map((z) => (
                  <button
                    key={z}
                    onClick={() => setZone(z)}
                    className={`rounded-lg border px-2.5 py-1 font-mono-tech text-[11px] transition ${
                      zone === z
                        ? "border-[#10b981] bg-[#10b981]/15 text-white"
                        : "border-white/10 text-[#9a9891] hover:text-white"
                    }`}
                  >
                    {z}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    category === c.id
                      ? "border-[#a855f7] bg-[#a855f7]/20 text-white"
                      : "border-white/10 bg-white/[0.02] text-[#9a9891] hover:text-white"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((place) => {
            const href3D =
              place.has3DCampus && place.campusSlug
                ? `/explore/${place.campusSlug}`
                : place.stateSlug === "lagos"
                ? "/lagos"
                : `/explore/${place.stateSlug}`;
            const isUni = place.category === "university";
            return (
              <div
                key={place.id}
                className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#121215] p-5 transition hover:border-white/25"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono-tech text-[10px] uppercase ${
                        isUni
                          ? "bg-[#a855f7]/20 text-[#e9d5ff]"
                          : "bg-[#f59e0b]/15 text-[#fbbf24]"
                      }`}
                    >
                      {isUni ? (
                        <GraduationCap className="h-3 w-3" />
                      ) : place.category === "nature" ? (
                        <Mountain className="h-3 w-3" />
                      ) : (
                        <Landmark className="h-3 w-3" />
                      )}
                      {place.category}
                    </span>
                    <span className="font-mono-tech text-[10px] text-[#71717a]">
                      {place.foundedOrStat}
                    </span>
                  </div>

                  <h2 className="font-display mt-3 text-lg font-semibold text-white">
                    {place.name}
                  </h2>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-[#9a9891]">
                    <MapPin className="h-3 w-3 text-[#00a862]" />
                    <span>
                      {place.city} · {place.state}
                    </span>
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-[#b6b4ad]">
                    {place.summary}
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3">
                  <Link
                    href={`/guides/${place.guideSlug}`}
                    className="font-mono-tech text-[11px] text-[#9a9891] hover:text-white"
                  >
                    Read guide →
                  </Link>
                  <Link
                    href={href3D}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono-tech text-[11px] font-semibold transition ${
                      place.has3DCampus
                        ? "bg-[#a855f7] text-white hover:bg-[#9333ea]"
                        : "bg-white/10 text-white hover:bg-[#00a862] hover:text-[#0b1620]"
                    }`}
                  >
                    <Box className="h-3.5 w-3.5" />
                    {place.has3DCampus ? "Open 3D Campus" : `View ${place.state.replace(" State", "")} 3D`}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
}

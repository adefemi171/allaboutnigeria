"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { NigeriaGlobe } from "@/components/home/NigeriaGlobe";
import { NIGERIA_STATES, type NigeriaStateProfile } from "@/data/nigeria-states";
import { getPlacesForState } from "@/data/nigeria-places";
import { ArrowRight, Box, Plane, Zap, Wifi, Search, Bus, GraduationCap } from "lucide-react";

export default function AtlasPage() {
  const [selectedState, setSelectedState] = useState<NigeriaStateProfile>(
    () => NIGERIA_STATES.find((s) => s.slug === "abuja") || NIGERIA_STATES[0]
  );
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const zones = ["ALL", ...Array.from(new Set(NIGERIA_STATES.map((s) => s.zone)))];

  const visibleStates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return NIGERIA_STATES.filter((s) => {
      const matchZone = zoneFilter === "ALL" || s.zone === zoneFilter;
      const matchQ =
        !q ||
        s.state.toLowerCase().includes(q) ||
        s.capital.toLowerCase().includes(q) ||
        s.tagline.toLowerCase().includes(q);
      return matchZone && matchQ;
    });
  }, [zoneFilter, search]);

  const selectedHref =
    selectedState.slug === "lagos" ? "/lagos" : `/explore/${selectedState.slug}`;
  const statePlaces = useMemo(
    () => getPlacesForState(selectedState.slug),
    [selectedState.slug]
  );

  return (
    <div className="min-h-screen bg-[#09090b]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="font-mono-tech text-xs uppercase tracking-widest text-[#10b981]">
              NIGERIA NATIONAL ATLAS · ALL 36 STATES + FCT
            </p>
            <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Every state capital in 3D voxels.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[#9a9891]">
              Explore Nigeria&apos;s 36 states and Federal Capital Territory—compare rent, power, fiber, and jump directly into each capital&apos;s real OpenStreetMap 3D voxel diorama.
            </p>
          </div>
          <Link
            href="/feedback"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white hover:border-[#00a862]"
          >
            Report Missing / Wrong State Info
          </Link>
        </div>

        {/* Interactive Globe + Selected State Spotlight */}
        <div className="grid items-center gap-8 rounded-2xl border border-white/10 bg-[#0e0e12] p-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <NigeriaGlobe
              selectedState={selectedState}
              onSelectState={setSelectedState}
            />
          </div>
          <div className="lg:col-span-6">
            <span className="font-mono-tech text-[11px] uppercase tracking-wider text-[#00a862]">
              {selectedState.zone} · {selectedState.state}
            </span>
            <h2 className="font-display mt-1 text-3xl font-bold text-white">
              {selectedState.capital}
            </h2>
            <p className="mt-2 text-sm text-[#b6b4ad]">{selectedState.tagline}</p>

            <div className="mt-5 grid grid-cols-2 gap-3 font-mono-tech text-xs">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-[#71717a]">
                  <Plane className="h-3.5 w-3.5 text-[#00a862]" />
                  AIRPORT / POP
                </div>
                <div className="mt-1 text-white">
                  {selectedState.airportCode} · {selectedState.populationLabel}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-[#71717a]">
                  <Zap className="h-3.5 w-3.5 text-[#f59e0b]" />
                  POWER GRID
                </div>
                <div className="mt-1 text-white">{selectedState.powerScore}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-[#71717a]">
                  <Wifi className="h-3.5 w-3.5 text-[#10b981]" />
                  INTERNET / FIBER
                </div>
                <div className="mt-1 text-white">{selectedState.fiberStatus}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-[#71717a]">
                  <Bus className="h-3.5 w-3.5 text-[#38bdf8]" />
                  LOCAL TRANSIT
                </div>
                <div className="mt-1 text-white">{selectedState.transitLabel}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3 font-mono-tech text-xs">
              <span className="text-[#71717a]">Rent Benchmark: </span>
              <span className="text-[#f59e0b]">{selectedState.rentMonthlyRange}</span>
            </div>

            {statePlaces.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-1.5 font-mono-tech text-[10px] uppercase tracking-wider text-[#a855f7]">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Universities &amp; Key Landmarks in {selectedState.state}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {statePlaces.map((pl) => (
                    <Link
                      key={pl.id}
                      href={
                        pl.has3DCampus && pl.campusSlug
                          ? `/explore/${pl.campusSlug}`
                          : "/places"
                      }
                      className="rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] text-[#e4e4e7] hover:border-[#a855f7] hover:text-white"
                    >
                      {pl.shortName}
                      {pl.has3DCampus ? " · 3D" : ""}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={selectedHref}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#00a862] px-4 py-2 text-xs font-semibold text-[#0b1620] hover:bg-[#00b46a]"
              >
                <Box className="h-3.5 w-3.5" />
                Explore {selectedState.capital} in 3D Voxels
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/guides"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white hover:bg-white/10"
              >
                Survival Guides
              </Link>
            </div>
          </div>
        </div>

        {/* All 36 States + FCT Filter Bar */}
        <div className="mt-12 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">
              All 36 States &amp; FCT ({visibleStates.length})
            </h2>
            <p className="text-xs text-[#9a9891]">
              Every state capital includes a live 3D OpenStreetMap voxel map.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-white/15 bg-[#121215] px-3 py-1.5">
              <Search className="mr-2 h-3.5 w-3.5 text-[#71717a]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter state or capital…"
                className="w-44 bg-transparent text-xs text-white placeholder-[#71717a] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {zones.map((z) => (
                <button
                  key={z}
                  onClick={() => setZoneFilter(z)}
                  className={`rounded-lg border px-2.5 py-1 font-mono-tech text-[11px] transition ${
                    zoneFilter === z
                      ? "border-[#10b981] bg-[#10b981]/15 text-white"
                      : "border-white/10 text-[#9a9891] hover:text-white"
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleStates.map((st) => {
            const href = st.slug === "lagos" ? "/lagos" : `/explore/${st.slug}`;
            return (
              <div
                key={st.slug}
                onClick={() => setSelectedState(st)}
                className={`cursor-pointer rounded-xl border p-5 transition ${
                  st.slug === selectedState.slug
                    ? "border-[#00a862] bg-[#171412]"
                    : "border-white/10 bg-[#121215] hover:border-white/25"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span
                      className="font-mono-tech text-[10px] uppercase tracking-wider"
                      style={{ color: st.accentColor }}
                    >
                      {st.zone}
                    </span>
                    <h3 className="font-display mt-0.5 text-lg font-semibold text-white">
                      {st.capital}
                    </h3>
                    <div className="text-xs text-[#9a9891]">{st.state}</div>
                  </div>
                  <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono-tech text-[10px] text-[#9a9891]">
                    {st.airportCode}
                  </span>
                </div>

                <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-[#b6b4ad]">
                  {st.tagline}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="font-mono-tech text-[10px] text-[#10b981]">
                    {st.rentMonthlyRange}
                  </span>
                  <Link
                    href={href}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 font-mono-tech text-[10px] font-semibold text-white transition hover:bg-[#00a862] hover:text-[#0b1620]"
                  >
                    <Box className="h-3 w-3" />
                    3D Voxels →
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

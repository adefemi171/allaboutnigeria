"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SURVIVAL_GUIDES } from "@/data/guides";
import {
  Search,
  Compass,
  Home,
  CreditCard,
  Landmark,
  Bus,
  Zap,
  Briefcase,
  HeartPulse,
  Plane,
} from "lucide-react";

const ICON_MAP = {
  compass: Compass,
  home: Home,
  "id-card": CreditCard,
  landmark: Landmark,
  bus: Bus,
  zap: Zap,
  briefcase: Briefcase,
  "heart-pulse": HeartPulse,
  plane: Plane,
};

export default function GuidesIndexPage() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");

  const categories = ["all", "arrival", "housing", "bureaucracy", "money", "mobility", "utilities", "business", "health"];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SURVIVAL_GUIDES.filter((g) => {
      const matchCat = cat === "all" || g.category === cat;
      const matchQ =
        !q ||
        g.title.toLowerCase().includes(q) ||
        g.summary.toLowerCase().includes(q) ||
        g.shortTitle.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [query, cat]);

  return (
    <div className="min-h-screen bg-[#09090b]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="border-b border-white/10 pb-8">
          <p className="font-mono-tech text-xs uppercase tracking-widest text-[#00a862]">
            ALL ABOUT NIGERIA · GUIDES
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            The Lagos &amp; Nigeria survival guides.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-[#b6b4ad]">
            Step-by-step, street-tested guides written in plain English—covering leases, NIN/BVN, fintech wallets, solar power, CAC incorporation, and getting across Lagos Lagoon.
          </p>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex max-w-md flex-1 items-center rounded-xl border border-white/15 bg-[#121215] px-3.5 py-2.5">
              <Search className="mr-2.5 h-4 w-4 text-[#71717a]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter guides (NIN, rent, solar, Danfo, CAC…)"
                className="w-full bg-transparent text-sm text-white placeholder-[#71717a] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`rounded-lg border px-2.5 py-1 font-mono-tech text-[11px] capitalize transition ${
                    cat === c
                      ? "border-[#00a862] bg-[#00a862]/20 text-white"
                      : "border-white/10 text-[#9a9891] hover:text-white"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((guide) => {
            const Icon = ICON_MAP[guide.iconName];
            return (
              <Link
                key={guide.slug}
                href={`/guides/${guide.slug}`}
                className="group flex flex-col justify-between rounded-xl border border-white/10 bg-[#121215] p-6 transition hover:border-[#00a862]/60 hover:bg-[#17171c]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[#f5f4f0] group-hover:text-[#00a862]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="rounded bg-white/5 px-2 py-0.5 font-mono-tech text-[10px] text-[#9a9891]">
                      {guide.cityFocus}
                    </span>
                  </div>
                  <h2 className="font-display mt-4 text-lg font-semibold text-white">
                    {guide.title}
                  </h2>
                  <p className="mt-2 text-xs leading-relaxed text-[#9a9891]">{guide.summary}</p>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 font-mono-tech text-[11px] text-[#71717a]">
                  <span>
                    {guide.readTime} · Updated {guide.updatedAt}
                  </span>
                  <span className="text-[#00a862]">Read →</span>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, MapPin, GraduationCap, BookOpen, Compass, Satellite } from "lucide-react";
import { NIGERIA_STATES } from "@/data/nigeria-states";
import { NIGERIA_PLACES } from "@/data/nigeria-places";
import { SURVIVAL_GUIDES } from "@/data/guides";

export function CommandSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !open && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("open-command-search"));
      } else if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const guides = SURVIVAL_GUIDES.filter(
      (g) =>
        !q ||
        g.title.toLowerCase().includes(q) ||
        g.shortTitle.toLowerCase().includes(q) ||
        g.summary.toLowerCase().includes(q)
    ).slice(0, 4);

    const states = NIGERIA_STATES.filter(
      (s) =>
        !q ||
        s.state.toLowerCase().includes(q) ||
        s.capital.toLowerCase().includes(q) ||
        s.zone.toLowerCase().includes(q)
    ).slice(0, q ? 6 : 4);

    const places = NIGERIA_PLACES.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.shortName.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.state.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    ).slice(0, q ? 6 : 4);

    const skyHit =
      !q ||
      "sky".includes(q) ||
      q.includes("sky") ||
      q.includes("satellite") ||
      q.includes("orbit") ||
      q.includes("celestrak") ||
      q.includes("pass");

    return { guides, states, places, skyHit };
  }, [query]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div
      className="command-search-backdrop"
      onClick={onClose}
    >
      <div
        className="command-search-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <div className="flex items-center border-b border-[#e9e5db]/10 px-4 py-3">
          <Search className="mr-3 h-4 w-4 shrink-0 text-[#93a3b5]" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Guides, states, universities, sky…"
            className="w-full bg-transparent text-base text-[#e9e5db] placeholder-[#6e8196] focus:outline-none sm:text-sm"
            enterKeyHint="search"
          />
          <button
            onClick={onClose}
            aria-label="Close search"
            className="ml-2 rounded-lg p-2 text-[#93a3b5] hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="command-search-results space-y-4 p-3">
          {results.skyHit && (
            <div>
              <div className="px-2 pb-1.5 font-mono-tech text-[10px] uppercase tracking-wider text-[#38bdf8]">
                Sky
              </div>
              <button
                onClick={() => go("/sky")}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-3 text-left text-sm hover:bg-white/5 sm:py-2 sm:text-xs"
              >
                <span className="flex min-w-0 items-center gap-2 text-[#e9e5db]">
                  <Satellite className="h-3.5 w-3.5 shrink-0 text-[#38bdf8]" />
                  <span className="truncate font-medium">Sky over Nigeria</span>
                  <span className="truncate text-[#93a3b5]">· passes, pictures, globe</span>
                </span>
                <span className="shrink-0 font-mono-tech text-[10px] text-[#38bdf8]">→</span>
              </button>
            </div>
          )}

          {results.guides.length > 0 && (
            <div>
              <div className="px-2 pb-1.5 font-mono-tech text-[10px] uppercase tracking-wider text-[#00a862]">
                Guides
              </div>
              {results.guides.map((g) => (
                <button
                  key={g.slug}
                  onClick={() => go(`/guides/${g.slug}`)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-3 text-left text-sm hover:bg-white/5 sm:py-2 sm:text-xs"
                >
                  <span className="flex min-w-0 items-center gap-2 text-[#e9e5db]">
                    <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#00a862]" />
                    <span className="truncate font-medium">{g.shortTitle || g.title}</span>
                  </span>
                  <span className="shrink-0 font-mono-tech text-[10px] text-[#93a3b5]">{g.readTime}</span>
                </button>
              ))}
            </div>
          )}

          {results.states.length > 0 && (
            <div>
              <div className="px-2 pb-1.5 font-mono-tech text-[10px] uppercase tracking-wider text-[#5ba4e5]">
                3D State Capitals &amp; FCT
              </div>
              {results.states.map((s) => (
                <button
                  key={s.slug}
                  onClick={() => go(s.slug === "lagos" ? "/lagos" : `/explore/${s.slug}`)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-3 text-left text-sm hover:bg-white/5 sm:py-2 sm:text-xs"
                >
                  <span className="flex min-w-0 items-center gap-2 text-[#e9e5db]">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#5ba4e5]" />
                    <span className="truncate font-medium">{s.capital.split(" ")[0]}</span>
                    <span className="truncate text-[#93a3b5]">· {s.state.replace(" State", "")}</span>
                  </span>
                  <span className="shrink-0 font-mono-tech text-[10px] text-[#00a862]">3D →</span>
                </button>
              ))}
            </div>
          )}

          {results.places.length > 0 && (
            <div>
              <div className="px-2 pb-1.5 font-mono-tech text-[10px] uppercase tracking-wider text-[#a855f7]">
                Universities &amp; Landmarks
              </div>
              {results.places.map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    go(
                      p.has3DCampus && p.campusSlug
                        ? `/explore/${p.campusSlug}`
                        : p.stateSlug === "lagos"
                        ? "/lagos"
                        : `/explore/${p.stateSlug}`
                    )
                  }
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-3 text-left text-sm hover:bg-white/5 sm:py-2 sm:text-xs"
                >
                  <span className="flex min-w-0 items-center gap-2 text-[#e9e5db]">
                    {p.category === "university" ? (
                      <GraduationCap className="h-3.5 w-3.5 shrink-0 text-[#a855f7]" />
                    ) : (
                      <Compass className="h-3.5 w-3.5 shrink-0 text-[#00a862]" />
                    )}
                    <span className="truncate font-medium">{p.shortName || p.name}</span>
                    <span className="truncate text-[#93a3b5]">· {p.city}</span>
                  </span>
                  <span className="shrink-0 font-mono-tech text-[10px] uppercase text-[#93a3b5]">
                    {p.has3DCampus ? "3D →" : p.category}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

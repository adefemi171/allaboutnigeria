"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, X, CheckCircle2, Send, Loader2 } from "lucide-react";
import { NIGERIA_STATES } from "@/data/nigeria-states";

const CATEGORIES = [
  { id: "wrong-info", label: "Inaccurate fact or guide step" },
  { id: "outdated-cost", label: "Outdated rent, fare, or price" },
  { id: "map-landmark", label: "3D map pin or building issue" },
  { id: "missing-state-info", label: "Missing state or city details" },
  { id: "bug", label: "Site bug / broken UI" },
  { id: "suggestion", label: "General suggestion" },
] as const;

export function openFeedbackModal(detail?: { topic?: string; category?: string }) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-feedback-modal", { detail }));
  }
}

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("wrong-info");
  const [stateOrTopic, setStateOrTopic] = useState<string>("General / Nationwide");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ topic?: string; category?: string }>;
      if (custom.detail?.topic) setStateOrTopic(custom.detail.topic);
      if (custom.detail?.category) setCategory(custom.detail.category);
      setSubmittedId(null);
      setError(null);
      setOpen(true);
    };
    window.addEventListener("open-feedback-modal", handler);
    return () => window.removeEventListener("open-feedback-modal", handler);
  }, []);

  // Auto-detect state context from URL like /explore/kano
  useEffect(() => {
    if (pathname.startsWith("/explore/")) {
      const slug = pathname.split("/")[2];
      const match = NIGERIA_STATES.find((s) => s.slug === slug);
      if (match) setStateOrTopic(`${match.capital} (${match.state})`);
    } else if (pathname === "/lagos") {
      setStateOrTopic("Lagos State");
    }
  }, [pathname]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl: pathname,
          category,
          stateOrTopic,
          message,
          contactEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not submit your feedback.");
      } else {
        setSubmittedId(data.submission?.id || "saved");
        setMessage("");
      }
    } catch {
      setError("Network error while submitting feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Subtle persistent bottom-right button (hidden on fullscreen /explore, /lagos and /map, which have their own way to report) */}
      {!pathname.startsWith("/explore") && pathname !== "/lagos" && pathname !== "/map" && (
        <button
          onClick={() => {
            setSubmittedId(null);
            setError(null);
            setOpen(true);
          }}
          aria-label="Report issue or feedback"
          className="feedback-fab"
        >
          <Flag className="h-4 w-4 text-[#00a862]" />
          <span className="feedback-fab__label">Report</span>
        </button>
      )}

      {open && (
        <div
          className="feedback-sheet-backdrop"
          onClick={() => setOpen(false)}
        >
          <div
            className="feedback-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 font-mono-tech text-[11px] uppercase tracking-wider text-[#00a862]">
                  <Flag className="h-3.5 w-3.5" />
                  COMMUNITY CORRECTIONS
                </div>
                <h2 id="feedback-title" className="font-display mt-1 text-xl font-semibold text-white">
                  Spot something wrong on this site?
                </h2>
                <p className="mt-1 text-xs text-[#9a9891]">
                  Flag outdated prices, wrong map coordinates, missing state details, or UI bugs.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close feedback modal"
                className="rounded-lg p-1.5 text-[#9a9891] hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {submittedId ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-[#10b981]" />
                <h3 className="font-display mt-3 text-lg font-semibold text-white">
                  Thank you — correction logged!
                </h3>
                <p className="mt-1 text-xs text-[#b6b4ad]">
                  Reference ID:{" "}
                  <span className="font-mono-tech text-[#f59e0b]">{submittedId}</span>
                </p>
                <div className="mt-6 flex items-center justify-center gap-3">
                  <Link
                    href="/feedback"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/10"
                  >
                    View Feedback Log
                  </Link>
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-lg bg-[#00a862] px-4 py-2 text-xs font-semibold text-[#0b1620] hover:bg-[#00b46a]"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="font-mono-tech text-[10px] uppercase tracking-wider text-[#9a9891]">
                      Issue Type
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#09090b] px-3 py-2 text-xs text-white focus:border-[#00a862] focus:outline-none"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-mono-tech text-[10px] uppercase tracking-wider text-[#9a9891]">
                      State / Topic
                    </label>
                    <input
                      type="text"
                      value={stateOrTopic}
                      onChange={(e) => setStateOrTopic(e.target.value)}
                      placeholder="e.g. Kano, Abuja, NIN Guide"
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#09090b] px-3 py-2 text-xs text-white placeholder-[#71717a] focus:border-[#00a862] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-wider text-[#9a9891]">
                    <span>What needs fixing?</span>
                    <span className="text-[#71717a]">Page: {pathname}</span>
                  </div>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what's inaccurate, outdated, or broken—and what the right info is if you know it."
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#09090b] px-3 py-2 text-xs text-white placeholder-[#71717a] focus:border-[#00a862] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-mono-tech text-[10px] uppercase tracking-wider text-[#9a9891]">
                    Email (optional, for follow-up)
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#09090b] px-3 py-2 text-xs text-white placeholder-[#71717a] focus:border-[#00a862] focus:outline-none"
                  />
                </div>

                {error && (
                  <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {error}
                  </p>
                )}

                <div className="flex items-center justify-between pt-2">
                  <Link
                    href="/feedback"
                    onClick={() => setOpen(false)}
                    className="font-mono-tech text-[11px] text-[#9a9891] hover:text-white"
                  >
                    See community reports →
                  </Link>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#00a862] px-4 py-2 text-xs font-semibold text-[#0b1620] transition hover:bg-[#00b46a] disabled:opacity-60"
                  >
                    {submitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Submit Response
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

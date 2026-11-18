"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Flag, Send, CheckCircle2, Loader2, MessageSquare } from "lucide-react";
import { NIGERIA_STATES } from "@/data/nigeria-states";

interface PublicSubmission {
  id: string;
  pageUrl: string;
  category: string;
  stateOrTopic: string;
  message: string;
  createdAt: string;
  status: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  "wrong-info": "Inaccurate fact / guide",
  "outdated-cost": "Outdated price / fare",
  "map-landmark": "3D map / landmark",
  "missing-state-info": "Missing state info",
  bug: "Site bug",
  suggestion: "Suggestion",
};

export default function FeedbackPage() {
  const [submissions, setSubmissions] = useState<PublicSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const [pageUrl, setPageUrl] = useState("/");
  const [category, setCategory] = useState("wrong-info");
  const [stateOrTopic, setStateOrTopic] = useState("Nationwide / General");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const loadList = async () => {
    try {
      const res = await fetch("/api/feedback");
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setJustSubmitted(false);
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl,
          category,
          stateOrTopic,
          message,
          contactEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not submit feedback.");
      } else {
        setJustSubmitted(true);
        setMessage("");
        await loadList();
      }
    } catch {
      setError("Network error while submitting feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <header className="border-b border-white/10 pb-8">
          <p className="font-mono-tech text-xs uppercase tracking-widest text-[#00a862]">
            COMMUNITY FEEDBACK &amp; CORRECTIONS
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Help keep All About Nigeria accurate.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-[#b6b4ad]">
            Nigeria moves fast—rents, bus fares, passport fees, power tariffs, and landmarks change. Submit a response whenever you spot anything wrong or missing in any state.
          </p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-12">
          {/* Submission Form */}
          <section className="rounded-2xl border border-white/15 bg-[#121215] p-6 lg:col-span-6">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-[#00a862]" />
              <h2 className="font-display text-xl font-semibold text-white">
                Submit a Correction or Report
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="font-mono-tech text-[10px] uppercase tracking-wider text-[#9a9891]">
                    Issue Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#09090b] px-3 py-2 text-xs text-white focus:border-[#00a862] focus:outline-none"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-mono-tech text-[10px] uppercase tracking-wider text-[#9a9891]">
                    State / Area
                  </label>
                  <select
                    value={stateOrTopic}
                    onChange={(e) => setStateOrTopic(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-[#09090b] px-3 py-2 text-xs text-white focus:border-[#00a862] focus:outline-none"
                  >
                    <option value="Nationwide / General">Nationwide / General</option>
                    {NIGERIA_STATES.map((st) => (
                      <option key={st.slug} value={`${st.capital} (${st.state})`}>
                        {st.state} ({st.capital})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-mono-tech text-[10px] uppercase tracking-wider text-[#9a9891]">
                  Affected Page / Section
                </label>
                <input
                  type="text"
                  value={pageUrl}
                  onChange={(e) => setPageUrl(e.target.value)}
                  placeholder="/explore/abuja, /guides/renting-an-apartment, /tools"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#09090b] px-3 py-2 text-xs text-white placeholder-[#71717a] focus:border-[#00a862] focus:outline-none"
                />
              </div>

              <div>
                <label className="font-mono-tech text-[10px] uppercase tracking-wider text-[#9a9891]">
                  What&apos;s wrong or needs updating?
                </label>
                <textarea
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe the error, outdated number, missing landmark, or bug…"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#09090b] px-3 py-2 text-xs text-white placeholder-[#71717a] focus:border-[#00a862] focus:outline-none"
                />
              </div>

              <div>
                <label className="font-mono-tech text-[10px] uppercase tracking-wider text-[#9a9891]">
                  Email (optional)
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

              {justSubmitted && (
                <div className="flex items-center gap-2 rounded-lg border border-[#10b981]/40 bg-[#10b981]/10 px-3 py-2 text-xs text-[#10b981]">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Response submitted! Thank you for improving the guide.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-[#00a862] px-5 py-2.5 text-xs font-semibold text-[#0b1620] transition hover:bg-[#00b46a] disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Submit Correction
              </button>
            </form>
          </section>

          {/* Recent Community Reports */}
          <section className="lg:col-span-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[#10b981]" />
                <h2 className="font-display text-xl font-semibold text-white">
                  Recent Community Submissions ({submissions.length})
                </h2>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {loading ? (
                <div className="rounded-xl border border-white/10 bg-[#121215] p-6 text-xs text-[#9a9891]">
                  Loading recent submissions…
                </div>
              ) : submissions.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#121215] p-6 text-xs text-[#9a9891]">
                  No reports submitted yet. Spotted an outdated fare, rent range, or map landmark? Use the form on the left to log the first one.
                </div>
              ) : (
                submissions.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-white/10 bg-[#121215] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono-tech text-[10px]">
                      <span className="rounded bg-[#00a862]/20 px-2 py-0.5 text-[#f59e0b]">
                        {CATEGORY_LABELS[s.category] || s.category}
                      </span>
                      <span className="text-[#10b981] uppercase">{s.status}</span>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-white">
                      {s.stateOrTopic}{" "}
                      <span className="font-mono-tech font-normal text-[#71717a]">
                        · {s.pageUrl}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#d4d4d8]">
                      {s.message}
                    </p>
                    <div className="mt-2 font-mono-tech text-[10px] text-[#71717a]">
                      {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

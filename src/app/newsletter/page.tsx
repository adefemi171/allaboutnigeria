"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { NEWSLETTER_ISSUES } from "@/data/newsletter-issues";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function NewsletterPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not subscribe.");
      } else {
        setSuccessMsg(data.message || "Subscribed!");
        setEmail("");
      }
    } catch {
      setError("Network error while subscribing.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#f5f4f0] sm:text-4xl">
            Nigeria newsletter
          </h1>
          <p className="mt-3 text-sm text-[#b6b4ad]">
            Subscribe to our newsletter to get Nigeria tips and updates once per month.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-6 flex max-w-md items-stretch overflow-hidden rounded-lg border border-white/20 bg-[#151518] focus-within:border-[#00a862]"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              aria-label="Email address"
              className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-sm text-white placeholder-[#71717a] focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex shrink-0 items-center justify-center bg-[#b84b31] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#cf5639] disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe"}
            </button>
          </form>

          {error && <p className="mt-2.5 text-xs text-red-400">{error}</p>}
          {successMsg && (
            <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-[#10b981]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {successMsg}
            </p>
          )}
        </div>

        {/* Previous Emails Archive Card — each row links directly to /newsletter/[slug] */}
        <section
          aria-label="Previous emails"
          className="mt-10 rounded-xl border border-white/10 bg-[#161619] px-5 py-2 sm:px-7"
        >
          <ol className="divide-y divide-white/10">
            {NEWSLETTER_ISSUES.map((issue) => (
              <li key={issue.slug} className="py-4">
                <Link
                  href={`/newsletter/${issue.slug}`}
                  className="group block"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#c9c75a] transition group-hover:text-[#e2df72] group-hover:underline sm:text-base">
                      {issue.title}
                    </h3>
                    <span className="text-xs text-[#9a9891]">{issue.date}</span>
                  </div>
                  <p className="mt-1 text-sm text-[#e4e4e7]">{issue.summary}</p>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-6 text-center text-[11px] text-[#71717a]">
          Published by Runeward Labs · Questions?{" "}
          <a href="mailto:adefemi@runeward.io" className="text-[#9a9891] underline hover:text-white">
            adefemi@runeward.io
          </a>
        </p>
      </main>
      <Footer />
    </div>
  );
}

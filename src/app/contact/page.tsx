"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { openFeedbackModal } from "@/components/FeedbackWidget";
import { Copy, Check, CheckCircle2, Loader2, Send } from "lucide-react";

export default function ContactPage() {
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("General inquiry");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText("adefemi@runeward.io");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSentMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not send message.");
      } else {
        setSentMsg(data.message || "Message received!");
        setMessage("");
      }
    } catch {
      setError("Network error while sending message.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="font-display text-center text-3xl font-bold tracking-tight text-[#f5f4f0] sm:text-4xl">
          Contact me
        </h1>

        <article className="mt-8 rounded-xl border border-white/10 bg-[#161619] p-6 text-sm leading-relaxed text-[#e4e4e7] sm:p-9">
          <p>
            Hi, I&apos;m <span className="text-[#c9c75a]">Adefemi</span>. You can contact me to…
          </p>

          <ul className="mt-4 space-y-4">
            <li className="flex gap-2.5">
              <span className="text-[#71717a]">–</span>
              <div>
                <div className="font-semibold text-white">Ask a question</div>
                <p className="mt-0.5 text-[#b6b4ad]">
                  Check our{" "}
                  <Link href="/guides" className="text-[#c9c75a] hover:underline">
                    survival guides
                  </Link>{" "}
                  and{" "}
                  <Link href="/atlas" className="text-[#c9c75a] hover:underline">
                    36 states atlas
                  </Link>{" "}
                  first. I get a lot of messages, and I do not give legal, visa, or financial advice.
                </p>
              </div>
            </li>

            <li className="flex gap-2.5">
              <span className="text-[#71717a]">–</span>
              <div>
                <div className="font-semibold text-white">Give feedback</div>
                <p className="mt-0.5 text-[#b6b4ad]">
                  Spot an outdated rent range, missing university, or wrong map landmark?{" "}
                  <button
                    type="button"
                    onClick={() => openFeedbackModal({ topic: "Site Correction" })}
                    className="text-[#c9c75a] hover:underline"
                  >
                    Submit a correction
                  </button>{" "}
                  or check the{" "}
                  <Link href="/feedback" className="text-[#c9c75a] hover:underline">
                    community reports log
                  </Link>
                  .
                </p>
              </div>
            </li>

            <li className="flex gap-2.5">
              <span className="text-[#71717a]">–</span>
              <div>
                <div className="font-semibold text-white">Say thanks</div>
                <p className="mt-0.5 text-[#b6b4ad]">
                  I always love hearing from readers across Nigeria and the diaspora!
                </p>
              </div>
            </li>

            <li className="flex gap-2.5">
              <span className="text-[#71717a]">–</span>
              <div>
                <div className="font-semibold text-white">Partner or contribute</div>
                <p className="mt-0.5 text-[#b6b4ad]">
                  Want to contribute verified city data, local transit updates, or collaborate? Reach out directly by email below.
                </p>
              </div>
            </li>
          </ul>

          <hr className="my-7 border-white/10" />

          <section className="space-y-3">
            <h2 className="font-display text-2xl font-semibold text-white">
              Contact information
            </h2>
            <p className="text-[#b6b4ad]">
              I cannot process official NIN, BVN, passport, or visa applications directly—always use official NIMC and Nigeria Immigration Service portals.
            </p>

            <div className="space-y-2 pt-1 text-sm">
              <div>
                <span className="font-semibold text-white">Website owner:</span>{" "}
                <span className="text-[#c9c75a]">Adefemi (Runeward Labs)</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">Email:</span>
                <a
                  href="mailto:adefemi@runeward.io"
                  className="text-[#c9c75a] hover:underline"
                >
                  adefemi@runeward.io
                </a>
                <button
                  type="button"
                  onClick={copyEmail}
                  className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-0.5 font-mono-tech text-[10px] text-[#b6b4ad] hover:text-white"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-[#10b981]" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>

              <div>
                <span className="font-semibold text-white">Coverage:</span>{" "}
                <span className="text-[#b6b4ad]">All 36 Nigerian States &amp; FCT Abuja</span>
              </div>

              <div>
                <div className="font-semibold text-white">Useful links:</div>
                <ul className="mt-1.5 space-y-1 text-sm">
                  <li>
                    <span className="mr-2 text-[#71717a]">–</span>
                    <Link href="/newsletter" className="text-[#c9c75a] hover:underline">
                      Newsletter
                    </Link>
                  </li>
                  <li>
                    <span className="mr-2 text-[#71717a]">–</span>
                    <Link href="/feedback" className="text-[#c9c75a] hover:underline">
                      Report an issue or correction
                    </Link>
                  </li>
                  <li>
                    <span className="mr-2 text-[#71717a]">–</span>
                    <Link href="/atlas" className="text-[#c9c75a] hover:underline">
                      Nigeria 36 States Atlas
                    </Link>
                  </li>
                  <li>
                    <span className="mr-2 text-[#71717a]">–</span>
                    <Link href="/places" className="text-[#c9c75a] hover:underline">
                      Universities &amp; Landmarks
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="my-7 border-white/10" />

          {/* Optional inline quick message toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="text-xs font-medium text-[#c9c75a] hover:underline"
            >
              {showForm ? "Hide quick contact form ↑" : "Or send a quick message directly from here →"}
            </button>

            {showForm && (
              <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-lg border border-white/10 bg-[#101013] p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full rounded-lg border border-white/15 bg-[#09090b] px-3 py-2 text-xs text-white placeholder-[#71717a] focus:border-[#00a862] focus:outline-none"
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your email"
                    className="w-full rounded-lg border border-white/15 bg-[#09090b] px-3 py-2 text-xs text-white placeholder-[#71717a] focus:border-[#00a862] focus:outline-none"
                  />
                </div>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full rounded-lg border border-white/15 bg-[#09090b] px-3 py-2 text-xs text-white placeholder-[#71717a] focus:border-[#00a862] focus:outline-none"
                />
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your message…"
                  className="w-full rounded-lg border border-white/15 bg-[#09090b] px-3 py-2 text-xs text-white placeholder-[#71717a] focus:border-[#00a862] focus:outline-none"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                {sentMsg && (
                  <p className="flex items-center gap-1.5 text-xs text-[#10b981]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {sentMsg}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#b84b31] px-4 py-2 text-xs font-semibold text-white hover:bg-[#cf5639] disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send Message
                </button>
              </form>
            )}
          </div>
        </article>

        <p className="mt-6 text-center text-[11px] text-[#71717a]">
          All About Nigeria · Built by Runeward Labs
        </p>
      </main>
      <Footer />
    </div>
  );
}

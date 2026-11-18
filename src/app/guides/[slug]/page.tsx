import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { GuideFeedbackButton } from "@/components/guides/GuideFeedbackButton";
import { SURVIVAL_GUIDES, getGuideBySlug } from "@/data/guides";
import { ArrowLeft, CheckCircle2, AlertTriangle, Compass, Box } from "lucide-react";

export function generateStaticParams() {
  return SURVIVAL_GUIDES.map((g) => ({ slug: g.slug }));
}

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) notFound();

  const related = SURVIVAL_GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 3);

  return (
    <div className="min-h-screen bg-[#09090b]">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <Link
          href="/guides"
          className="inline-flex items-center gap-1.5 font-mono-tech text-xs text-[#9a9891] hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All survival guides
        </Link>

        <header className="mt-5 border-b border-white/10 pb-8">
          <div className="flex flex-wrap items-center gap-2 font-mono-tech text-[11px] uppercase tracking-wider text-[#00a862]">
            <span>{guide.category}</span>
            <span className="text-white/25">·</span>
            <span className="text-[#10b981]">{guide.cityFocus}</span>
            <span className="text-white/25">·</span>
            <span className="text-[#9a9891]">{guide.readTime}</span>
            <span className="text-white/25">·</span>
            <span className="text-[#9a9891]">Updated {guide.updatedAt}</span>
          </div>
          <h1 className="font-display mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {guide.title}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[#b6b4ad]">{guide.summary}</p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-12">
          <article className="space-y-8 lg:col-span-8">
            <div className="rounded-2xl border border-[#10b981]/30 bg-[#0d1915] p-6">
              <div className="flex items-center gap-2 font-mono-tech text-xs uppercase tracking-wider text-[#10b981]">
                <CheckCircle2 className="h-4 w-4" />
                Key Takeaways
              </div>
              <ul className="mt-3 space-y-2.5 text-sm text-[#e5e7eb]">
                {guide.keyTakeaways.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#10b981]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {guide.sections.map((sec) => (
              <section key={sec.id} id={sec.id} className="space-y-4">
                <h2 className="font-display text-2xl font-semibold text-white">
                  {sec.heading}
                </h2>
                {sec.paragraphs.map((p, idx) => (
                  <p key={idx} className="text-sm leading-7 text-[#d4d4d8]">
                    {p}
                  </p>
                ))}
                {sec.bullets && (
                  <ul className="space-y-2 rounded-xl border border-white/10 bg-[#121215] p-5 text-sm text-[#d4d4d8]">
                    {sec.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#00a862]" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {sec.callout && (
                  <div className="rounded-xl border border-[#00a862]/40 bg-[#19120e] p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#f59e0b]">
                      <AlertTriangle className="h-4 w-4" />
                      {sec.callout.title}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#e5e7eb]">
                      {sec.callout.body}
                    </p>
                  </div>
                )}
              </section>
            ))}

            {/* Inline Correction Callout */}
            <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-white/15 bg-[#121215] p-5 sm:flex-row sm:items-center">
              <div>
                <div className="text-sm font-semibold text-white">
                  Something outdated or wrong in this guide?
                </div>
                <p className="mt-0.5 text-xs text-[#9a9891]">
                  Submit a correction for your city or state so others get accurate facts.
                </p>
              </div>
              <GuideFeedbackButton topic={guide.shortTitle} />
            </div>
          </article>

          <aside className="space-y-6 lg:col-span-4">
            <div className="rounded-xl border border-white/10 bg-[#121215] p-5">
              <div className="font-mono-tech text-[11px] uppercase tracking-wider text-[#9a9891]">
                On This Page
              </div>
              <ul className="mt-3 space-y-2 text-xs">
                {guide.sections.map((sec) => (
                  <li key={sec.id}>
                    <a
                      href={`#${sec.id}`}
                      className="text-[#d4d4d8] transition hover:text-[#00a862]"
                    >
                      {sec.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-[#00a862]/35 bg-gradient-to-br from-[#1b130f] to-[#121215] p-5">
              <div className="flex items-center gap-2 font-mono-tech text-[11px] text-[#f59e0b]">
                <Box className="h-4 w-4" />
                EXPLORE 37 CITIES IN 3D
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#d4d4d8]">
                Inspect Abuja, Kano, Port Harcourt, Enugu, Ibadan, Lagos, and all 36 states in interactive 3D voxels.
              </p>
              <Link
                href="/atlas"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#00a862] px-3.5 py-2 text-xs font-semibold text-[#0b1620] hover:bg-[#00b46a]"
              >
                <Compass className="h-3.5 w-3.5" />
                Open 36 States Atlas
              </Link>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#121215] p-5">
              <div className="font-mono-tech text-[11px] uppercase tracking-wider text-[#9a9891]">
                Related Guides
              </div>
              <div className="mt-3 space-y-3">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/guides/${r.slug}`}
                    className="block border-b border-white/5 pb-2.5 text-xs last:border-none last:pb-0 hover:text-[#00a862]"
                  >
                    <div className="font-medium text-white">{r.shortTitle}</div>
                    <div className="mt-0.5 text-[11px] text-[#71717a]">{r.readTime}</div>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}

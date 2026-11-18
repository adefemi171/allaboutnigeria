import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  NEWSLETTER_ISSUES,
  getNewsletterIssueBySlug,
} from "@/data/newsletter-issues";
import { ArrowLeft } from "lucide-react";

export function generateStaticParams() {
  return NEWSLETTER_ISSUES.map((issue) => ({ slug: issue.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = getNewsletterIssueBySlug(slug);
  if (!issue) return { title: "Newsletter — All About Nigeria" };
  return {
    title: `${issue.title} — All About Nigeria`,
    description: issue.summary,
  };
}

export default async function NewsletterIssuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const issue = getNewsletterIssueBySlug(slug);
  if (!issue) notFound();

  const otherIssues = NEWSLETTER_ISSUES.filter((i) => i.slug !== issue.slug);

  return (
    <div className="min-h-screen bg-[#0d0d0f]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div className="text-center">
          <Link
            href="/newsletter"
            className="inline-flex items-center gap-1.5 text-xs text-[#9a9891] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All newsletter issues
          </Link>

          <h1 className="font-display mt-4 text-3xl font-bold tracking-tight text-[#f5f4f0] sm:text-4xl">
            {issue.title}
          </h1>
          <p className="mt-2 text-xs text-[#9a9891]">
            Published on {issue.date} · By {issue.author}
          </p>
        </div>

        <article className="mt-8 rounded-xl border border-white/10 bg-[#161619] p-6 text-sm leading-7 text-[#e4e4e7] sm:p-9">
          <p className="text-[#d4d4d8]">{issue.intro}</p>

          <div className="mt-8 space-y-8">
            {issue.sections.map((section) => (
              <section key={section.heading} className="space-y-5">
                <h2 className="font-display border-b border-white/10 pb-2 text-2xl font-semibold text-white">
                  {section.heading}
                </h2>

                {section.subSections.map((sub) => (
                  <div key={sub.title} className="space-y-2.5">
                    <h3 className="font-display text-lg font-semibold text-[#c9c75a]">
                      {sub.title}
                    </h3>
                    {sub.paragraphs.map((p, idx) => (
                      <p key={idx} className="text-[#d4d4d8]">
                        {p}
                      </p>
                    ))}
                    {sub.bullets && (
                      <ul className="space-y-1.5 pl-4 text-[#d4d4d8]">
                        {sub.bullets.map((b) => (
                          <li key={b} className="flex gap-2">
                            <span className="text-[#71717a]">–</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>

          <hr className="my-8 border-white/10" />

          <section>
            <h3 className="font-mono-tech text-xs uppercase tracking-wider text-[#9a9891]">
              Sources and notes
            </h3>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-[#9a9891]">
              {issue.sources.map((src) => (
                <li key={src}>{src}</li>
              ))}
            </ol>
          </section>
        </article>

        {/* More issues */}
        <section className="mt-8 rounded-xl border border-white/10 bg-[#161619] p-5 sm:p-7">
          <div className="font-mono-tech text-xs uppercase tracking-wider text-[#9a9891]">
            More issues
          </div>
          <ul className="mt-3 divide-y divide-white/10">
            {otherIssues.map((other) => (
              <li key={other.slug} className="py-2.5">
                <Link
                  href={`/newsletter/${other.slug}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-[#c9c75a] hover:underline"
                >
                  <span>{other.title}</span>
                  <span className="text-xs text-[#9a9891]">{other.date}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-6 text-center text-[11px] text-[#71717a]">
          By Runeward Labs ·{" "}
          <a href="mailto:adefemi@runeward.io" className="text-[#9a9891] underline hover:text-white">
            adefemi@runeward.io
          </a>
        </p>
      </main>
      <Footer />
    </div>
  );
}

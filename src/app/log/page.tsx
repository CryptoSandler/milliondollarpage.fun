import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "../../components/ThemeToggle";
import SiteFooter from "../../components/SiteFooter";
import { publishedEntries } from "../../lib/log/entries";

export const dynamic = "force-static";

/**
 * The log: one entry per thing that actually happened to this wall.
 *
 * WHO LINKS HERE: `SiteFooter`, which is on every page that carries prose. Not
 * the board's header — the header is three links wide and they are the three a
 * buyer needs before they can buy. A log is for somebody who has already
 * understood the offer, which is exactly the reader who has scrolled to a foot.
 *
 * ## What an entry is for, and what it is not
 *
 * A milestone: the launch, the first thousand pixels, every hundred thousand
 * after that, a purchase big enough to be a story, press. `docs/marketing-fomo.md`
 * is where this comes from — Alex Tew's blog is the reason the original is
 * remembered as a story rather than as an advert, and the mechanism is that
 * every post had a number in it a reader could go and check.
 *
 * So the type in `../../lib/log/entries.ts` REQUIRES a date and a figure, and
 * the figure names the page it can be checked against. An entry that cannot
 * point at a number is an entry that has not earned a date.
 *
 * ## Drafts are not here
 *
 * `publishedEntries()` filters them, `log.test.tsx` proves it, and the owner is
 * the one who changes a word in the file to publish. An unapproved entry
 * appearing on a public log because somebody merged a branch is the one failure
 * this page has to be incapable of.
 *
 * ## Zero client JavaScript, like `/faq` and `/how-to-buy`
 *
 * Static, no state, no handlers; the only client component is the theme switch
 * every page shares. `scripts/bundle-guard.mts` measures the claim.
 */

export const metadata: Metadata = {
  title: "Log · milliondollarpage.fun",
  description:
    "What has actually happened to this wall, one entry per milestone, each with a date and a number you can check.",
  alternates: { types: { "application/rss+xml": "/log/rss.xml" } },
};

export default function LogPage() {
  const entries = publishedEntries();

  return (
    <main className="prose-page">
      <div className="mx-auto max-w-[44rem] px-5 pb-24 pt-6">
        <nav className="flex items-center justify-between gap-4 border-b border-hairline-strong pb-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-[17px] font-bold text-ink"
          >
            <span aria-hidden className="size-2.5 rounded-full bg-ink" />
            milliondollarpage.fun
          </Link>
          <span className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/" className="btn-quiet px-3 py-1.5 text-[13px]">
              Back to the board
            </Link>
          </span>
        </nav>

        <h1 className="mt-10 font-display text-[34px] font-bold leading-tight tracking-tight">
          Log
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          One entry per thing that happened: the launch, the first thousand pixels, every hundred
          thousand after that, a purchase worth writing about, press. Every entry has a date and a
          number, and says where you can check the number.{" "}
          <a href="/log/rss.xml" className="font-semibold text-ink underline underline-offset-2">
            There is a feed
          </a>
          .
        </p>

        {entries.length === 0 ? (
          /*
            THE EMPTY STATE IS THE HONEST ONE and it is what this page shows on
            the day it ships: both entries written so far are drafts waiting on
            the owner. It says nothing is published rather than pretending the
            page is broken or that the wall has no history.
          */
          <p className="mt-10 border-t border-hairline-strong pt-6 text-[16px] leading-relaxed text-body">
            Nothing published yet. The wall is new; the first entry goes up when the first thing
            worth recording has happened.
          </p>
        ) : (
          <div className="mt-10 flex flex-col gap-12">
            {entries.map((entry) => (
              <article key={entry.slug} id={entry.slug} className="border-t border-hairline-strong pt-6">
                <p className="tabular text-[12px] font-semibold uppercase tracking-wide text-body">
                  <time dateTime={entry.date}>{entry.date}</time>
                </p>
                <h2 className="mt-2 font-display text-[24px] font-bold leading-snug tracking-tight">
                  {entry.title}
                </h2>
                {/*
                  THE NUMBER, IN THE MONO FACE AND ON ITS OWN LINE. DESIGN.md's
                  rule about the two families is the whole reason it reads as a
                  fact: a measurement is set in the mono and a sentence is not,
                  so a reader can tell one from the other without reading either.
                */}
                <p className="mt-3 border-l-2 border-hairline-strong pl-3 text-[13px] leading-relaxed text-body">
                  <span className="tabular font-bold text-ink">{entry.figure.value}</span> —{" "}
                  {entry.figure.of}. Check it at{" "}
                  <Link
                    href={entry.figure.where}
                    className="tabular font-semibold underline underline-offset-2"
                  >
                    {entry.figure.where}
                  </Link>
                  .
                </p>
                <div className="mt-4 flex flex-col gap-3 text-[16px] leading-relaxed text-body">
                  {entry.body.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}

        <SiteFooter />
      </div>
    </main>
  );
}

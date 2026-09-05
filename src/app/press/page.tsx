import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "../../components/ThemeToggle";
import SiteFooter from "../../components/SiteFooter";
import { CONTACT_EMAIL } from "../../lib/site";

export const dynamic = "force-static";

/**
 * Where anything written about this wall goes, once anything has been.
 *
 * WHO LINKS HERE: `SiteFooter`, and `/log`, whose entries name press as one of
 * the things worth an entry.
 *
 * ## It ships empty on purpose
 *
 * Nobody has written about this yet and the page says so in those words. The
 * alternative — waiting until there is a first item and then building the page
 * — is how a site ends up with a press mention sitting in somebody's inbox for
 * three weeks because there is nowhere to put it. An empty page with an address
 * on it is a page that can receive the first one the day it arrives.
 *
 * A page that says "nothing yet" is also the honest thing to show. `DESIGN.md`
 * has the rule this follows: an empty state says what is true, and never
 * invents a placeholder to look busier than the wall is.
 */

export const metadata: Metadata = {
  title: "Press · milliondollarpage.fun",
  description: "Anything written about this wall, as it is written. Nothing yet.",
};

export default function PressPage() {
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
          Press
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-body">
          <strong className="font-semibold text-ink">Nothing yet.</strong> Nobody has written about
          this wall. When somebody does, it goes here — the publication, the date and the link,
          whatever the piece says about us.
        </p>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          If you are writing something and want the numbers, they are all on{" "}
          <Link href="/stats" className="font-semibold text-ink underline underline-offset-2">
            /stats
          </Link>{" "}
          and they are the same rows the board draws from. Anything else, including a screenshot at
          a size you need, comes from{" "}
          <a className="tabular font-semibold text-ink underline decoration-hairline-strong underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <SiteFooter />
      </div>
    </main>
  );
}

import Link from "next/link";
import { CONTACT_EMAIL } from "../lib/site";

/**
 * The foot of every page on this site that is a page rather than the board.
 *
 * WHO CALLS THIS: `/faq`, `/how-to-buy`, `/stats`, `/log`, `/press`, `/buyers`
 * and one rectangle's own page at `/b/<id>`. Seven routes, and none of them
 * could do it themselves without the address existing in seven places — which
 * is the failure this exists to prevent, not the markup, which is six lines.
 *
 * THE BOARD ITSELF HAS NO FOOTER AND DOES NOT GET ONE. `DESIGN.md`, the chrome
 * section as rewritten on 2026-09-02: nothing stands on the wall at any width,
 * and the strip along the bottom is presets, zoom and the purchase panel. An
 * address down there would be a line of prose competing with the thing being
 * sold. The board's way to this is the header link to `/faq`, which carries it.
 *
 * NOT ONE LINE OF CLIENT JAVASCRIPT, which is the constraint `/faq` and
 * `/how-to-buy` already hold themselves to and which `scripts/bundle-guard.mts`
 * measures: this is a server component with no state and no handlers, so
 * putting it on seven routes cannot grow the board's bundle.
 */
export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-hairline-strong pt-5 text-[13px] leading-relaxed text-body">
      <p>
        {/*
          A `mailto:` since the mailbox opened. It was printed as text for as
          long as an address that bounced would have spent somebody's message
          without telling them — see `src/lib/site.ts`, which carries both
          halves of that decision and its date.
        */}
        Write to <a className="tabular font-semibold text-ink underline decoration-hairline-strong underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. A person
        reads it. Anything about a rectangle is easier to answer if you send the address of its
        page — the one under <span className="tabular">/b/</span>.
      </p>
      <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/" className="underline-offset-2 hover:underline">
          The board
        </Link>
        <Link href="/faq" className="underline-offset-2 hover:underline">
          What this is
        </Link>
        <Link href="/how-to-buy" className="underline-offset-2 hover:underline">
          How to buy
        </Link>
        <Link href="/buyers" className="underline-offset-2 hover:underline">
          Who has bought
        </Link>
        <Link href="/stats" className="underline-offset-2 hover:underline">
          What the wall has done
        </Link>
        <Link href="/log" className="underline-offset-2 hover:underline">
          Log
        </Link>
        <Link href="/press" className="underline-offset-2 hover:underline">
          Press
        </Link>
      </nav>
    </footer>
  );
}

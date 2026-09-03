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
          THE ADDRESS IS TEXT, NOT A LINK, and `src/lib/site.ts` carries the
          reason: the mailbox is not open yet. When it is, this becomes an `<a>`
          and nothing else on the page changes.
        */}
        Write to <span className="tabular font-semibold text-ink">{CONTACT_EMAIL}</span>. A person
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

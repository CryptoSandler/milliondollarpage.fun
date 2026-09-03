import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "../../components/ThemeToggle";
import SiteFooter from "../../components/SiteFooter";
import { blockImageUrl } from "../../lib/board/block-image";
import { blockPageUrl } from "../../lib/board/block-details";
import { BUYERS_PER_PAGE, soldBlocks, type SoldBlock } from "../../lib/board/buyers";
import { pixelCount } from "../../lib/board/pricing";

export const dynamic = "force-dynamic";

/**
 * Everything that has been bought, in the order it was bought.
 *
 * WHO LINKS HERE: `SiteFooter`, so every page that carries prose does. Not the
 * board's header, which stays three links wide.
 *
 * ## Why this page exists after being turned down
 *
 * It was refused on 2026-09-02 on the grounds that a list of purchases is a
 * list of buyers, and this site names nobody. `DECISIONS.md` carries the
 * reversal and its date. What changed is the reading: the objection is right
 * about a list of BUYERS and this is a list of RECTANGLES — the same subtraction
 * `tape.ts` already makes for the register, held to on a page whose title is the
 * one most likely to invite the mistake. There is no wallet, no signature and no
 * name in the query (`../../lib/board/buyers.ts` states the rule) and
 * `src/app/__tests__/buyers.test.tsx` renders this page over a row whose wallet
 * is a recognisable string and asserts that string is nowhere in the markup.
 *
 * ## Every outbound link is `/go/<id>`
 *
 * What is SHOWN is the buyer's own address, because a reader must be able to
 * see where a link goes before following it. What is FOLLOWED is the
 * redirector, which reads the destination from the row. Same arrangement as
 * `BlockCard`, and the reason the clicks on `/b/<id>` are countable at all.
 *
 * ## Zero client JavaScript
 *
 * Paging is links with a query string, not state. The only client component is
 * the theme switch every page shares, so this route cannot grow the board's
 * bundle — the claim `scripts/bundle-guard.mts` measures.
 */

export const metadata: Metadata = {
  title: "Who has bought · milliondollarpage.fun",
  description:
    "Every rectangle sold on this wall, in the order it was bought. Rectangles, not people: nobody is named and no wallet appears.",
};

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const requested = Number((await searchParams).page ?? "1");
  const { rows, total, page, pages } = await soldBlocks(Number.isFinite(requested) ? requested : 1);
  // Ascending order is what makes this stable: purchase #1 is the first pixel
  // ever sold and stays #1. See `soldBlocks`.
  const firstNumber = (page - 1) * BUYERS_PER_PAGE + 1;

  return (
    <main className="prose-page">
      <div className="mx-auto max-w-[52rem] px-5 pb-24 pt-6">
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

        <h1 className="mt-8 font-display text-[34px] font-bold leading-tight tracking-tight">
          Who has bought
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          Every rectangle on the wall, in the order it was paid for.{" "}
          <strong className="font-semibold text-ink">
            These are rectangles, not people.
          </strong>{" "}
          No wallet, no name and no signature appears on this page — what is here is what is on the
          wall: a picture, a caption, a link, a size and a date.
        </p>

        {total === 0 ? (
          <p className="mt-10 border-t border-hairline-strong pt-6 text-[16px] leading-relaxed text-body">
            Nothing has been bought yet. The first rectangle sold will be the first row here, and it
            will keep that place for as long as this wall is up.
          </p>
        ) : (
          <>
            <p className="tabular mt-6 text-[13px] text-body">
              {/* RECTANGLES, not pixels. `/stats` counts the pixels; this page
                  counts the purchases, and they are wildly different numbers on
                  a wall sold a rectangle at a time. */}
              {total.toLocaleString("en-US")} {total === 1 ? "rectangle" : "rectangles"} sold ·
              showing {firstNumber}–{firstNumber + rows.length - 1} · page {page} of {pages}
            </p>

            <ol className="mt-6 flex flex-col">
              {rows.map((row, index) => (
                <Row key={row.id} row={row} number={firstNumber + index} />
              ))}
            </ol>

            <Pager page={page} pages={pages} />
          </>
        )}

        <SiteFooter />
      </div>
    </main>
  );
}

/** One purchase: its picture at its real shape, its words, its size, its date. */
function Row({ row, number }: { row: SoldBlock; number: number }) {
  return (
    <li className="flex items-start gap-4 border-t border-hairline-strong py-4">
      <span className="tabular w-10 shrink-0 pt-0.5 text-right text-[13px] font-semibold text-body">
        {number}
      </span>
      {/*
        THE PICTURE KEEPS THE RECTANGLE'S OWN PROPORTION, never a square — the
        same rule `BlockCard`'s thumbnail follows, and here it carries the same
        information: a wide thumbnail is what a wide rectangle looks like on the
        wall. A background rather than an `<img>` because the bytes come from an
        API route `next/image` can neither optimize nor leave unsmoothed, and
        `image-rendering: pixelated` is what keeps a 1×1 purchase honest.
      */}
      {/*
        THE PICTURE VARIES IN SHAPE AND THE COLUMN DOES NOT. A 213×12 thumbnail
        and a 6×39 one are three pixels and forty-four wide, so laying them out
        as flex items put every caption on a different left edge and the list
        read as a ransom note. The box is a fixed 2.75rem square that the
        picture is centred in; the picture keeps its own proportion inside it.
      */}
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center">
        <span className="block-card-thumb" style={thumb(row)} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] font-bold text-ink">
          {row.caption ?? "No caption"}
        </p>
        {row.link && (
          <a
            href={`/go/${row.id}`}
            rel="noreferrer noopener nofollow"
            target="_blank"
            className="block truncate text-[12.5px] font-semibold text-primary-pressed underline-offset-2 hover:underline"
          >
            {row.link}
          </a>
        )}
        <p className="tabular mt-1 text-[12px] text-body">
          {row.w} × {row.h} at ({row.x}, {row.y}) · {pixelCount(row.pixels)} ·{" "}
          <time dateTime={row.paidAt}>{row.paidAt.slice(0, 10)}</time> ·{" "}
          <Link href={blockPageUrl(row.id)} className="underline underline-offset-2">
            its page
          </Link>
        </p>
      </div>
    </li>
  );
}

/** The thumbnail's box, at the rectangle's aspect. See the comment at the call. */
function thumb(row: SoldBlock): { width: string; height: string; backgroundImage?: string } {
  const longest = Math.max(row.w, row.h);
  return {
    width: `${(2.75 * row.w) / longest}rem`,
    height: `${(2.75 * row.h) / longest}rem`,
    // A taken-down rectangle, and one whose bytes never arrived, get the frame
    // and no picture rather than a broken request.
    ...(row.hasImage ? { backgroundImage: `url("${blockImageUrl(row.id)}")` } : {}),
  };
}

/**
 * Previous and next, as links.
 *
 * ponytail: two links and a count, not a numbered pager. A list in purchase
 * order is read from one end or the other; page 7 of 40 is a destination nobody
 * navigates to on purpose, and the pages that matter — the first and the last —
 * are both one click away.
 */
function Pager({ page, pages }: { page: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-between gap-4 border-t border-hairline-strong pt-5 text-[13px]">
      {page > 1 ? (
        <Link href={`/buyers?page=${page - 1}`} className="btn-quiet px-3 py-1.5">
          ← Earlier
        </Link>
      ) : (
        <span />
      )}
      <span className="tabular text-body">
        {page} / {pages}
      </span>
      {page < pages ? (
        <Link href={`/buyers?page=${page + 1}`} className="btn-quiet px-3 py-1.5">
          Later →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

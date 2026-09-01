import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "../../components/ThemeToggle";
import { boardStats, boardStandings, soldValueBaseUnits } from "../../lib/board/blocks";
import { TOTAL_PIXELS } from "../../lib/board/geometry";
import { formatPercentSold, formatUsdc, pixelCount } from "../../lib/board/pricing";
import { onlineNow, presenceHistory } from "../../lib/board/presence";
import { pricePerPixelBaseUnits } from "../../lib/board/settings";
import { recentPurchases } from "../../lib/board/tape";
import PurchaseTape from "../../components/PurchaseTape";

export const dynamic = "force-dynamic";

/**
 * What the wall has done, on a page somebody opened on purpose to ask.
 *
 * ## Why one number here is not allowed on the board
 *
 * The dollars taken. DESIGN.md's top-bar section is exact: "Nothing on the page
 * promises revenue. Not a million dollars raised, not a total, not an implied
 * one. A million pixels at a dollar is the offer; what it adds up to is
 * arithmetic a reader can do, and printing it would turn an offer into a
 * forecast." That reasoning is about the BAR, where a number sits beside the
 * offer and is read as part of it.
 *
 * This page is a different contract. Nobody arrives here being sold anything;
 * they came to ask what has happened, and a total of what has already been paid
 * is a fact about the past rather than a projection of the future. The owner
 * asked for it here and it is here, scoped here, and the mechanism that keeps
 * it here is not a rule about rendering: `boardStats` — the shape `/api/board`
 * ships and the bar renders from — does not contain it. The board is never told
 * the number, so the board cannot print it. See `soldValueBaseUnits`.
 *
 * ## The ranking, and the one word that makes it admissible
 *
 * "Outbid." The genre's most effective primitive is a leaderboard whose
 * positions can be taken by paying more, and this is that primitive with its
 * mechanic inverted: a rank changes only when somebody buys a bigger rectangle
 * of their own. Nobody's position can be bought away from them, and the page
 * says so in as many words rather than leaving it to be inferred — a mockup
 * that does not say the difference out loud has not made it.
 *
 * And it ranks rectangles. No holder is named on this page, which is the same
 * rule the board and the register keep.
 */

export const metadata: Metadata = {
  title: "What the wall has done · milliondollarpage.fun",
  description:
    "How much of the wall is sold, who is looking at it right now, and the biggest rectangles on it. Nobody is named.",
};

export default async function StatsPage() {
  const [online, history, stats, taken, perPixel, standings, settled] = await Promise.all([
    onlineNow(),
    presenceHistory(),
    boardStats(),
    soldValueBaseUnits(),
    pricePerPixelBaseUnits(),
    boardStandings(),
    recentPurchases(),
  ]);

  const ceiling = TOTAL_PIXELS * perPixel;
  const today = history.days.at(-1)?.visitors ?? 0;

  return (
    <main className="prose-page">
      <div className="mx-auto max-w-[52rem] px-5 pb-24 pt-6">
        <nav className="flex items-center justify-between gap-4 border-b border-hairline-strong pb-4">
          <Link href="/" className="flex items-center gap-2 font-display text-[17px] font-bold text-ink">
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
          What the wall has done
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          Everything on this page is a count of rectangles or of visits. Nobody is named here, and
          there is nothing on it that could name anybody: a visitor is a salted one-way hash of an
          address, and a rectangle is four numbers.
        </p>

        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline-strong bg-hairline-strong md:grid-cols-4">
          <Figure
            term="Online now"
            value={online.toLocaleString("en-US")}
            note={online === 1 ? "that is one person, and it may be you" : "in the last two minutes"}
          />
          <Figure
            term="Visitors today"
            value={today.toLocaleString("en-US")}
            note="distinct, counted once each"
          />
          <Figure
            term="Pixels sold"
            value={stats.pixelsSold.toLocaleString("en-US")}
            note={`of ${TOTAL_PIXELS.toLocaleString("en-US")} · ${formatPercentSold(stats.percentSold)}`}
          />
          <Figure
            term="Taken"
            value={formatUsdc(taken)}
            note={`of ${formatUsdc(ceiling)}, which is what the whole wall costs`}
          />
        </dl>

        <section className="mt-12">
          <h2 className="font-display text-[22px] font-semibold tracking-tight">
            The biggest rectangles on the wall
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">
            Ranked by pixels held.{" "}
            <strong className="font-bold text-ink">Nothing here can be outbid</strong> — a rank
            changes only when somebody buys a bigger rectangle of their own. Nobody&apos;s position
            can be taken by paying more, because nothing about a sold rectangle can be changed by
            anyone, including us.
          </p>

          {standings.length === 0 ? (
            <p className="mt-6 rounded-xl border border-hairline-strong bg-card-lift px-4 py-6 text-center text-[15px] text-body">
              Nothing has been bought yet. The first rectangle on the wall is the first rectangle on
              this list.
            </p>
          ) : (
            <ol className="mt-5 flex flex-col gap-px overflow-hidden rounded-xl border border-hairline-strong bg-hairline-strong">
              {standings.map((block, index) => (
                <li
                  key={block.id}
                  className="flex items-baseline gap-4 bg-card px-4 py-3 text-[15px]"
                >
                  <span className="tabular w-8 shrink-0 font-display text-[17px] font-bold text-ink">
                    {index + 1}
                  </span>
                  <span className="tabular font-semibold text-ink">
                    {block.w} × {block.h}
                  </span>
                  <span className="tabular text-body">{pixelCount(block.pixels)}</span>
                  <span className="tabular ml-auto shrink-0 font-semibold text-ink-soft">
                    {formatUsdc(block.totalBaseUnits)}
                  </span>
                </li>
              ))}
            </ol>
          )}

          <p className="mt-3 text-[13px] leading-relaxed text-body">
            No holder is named anywhere on this page. Rectangles are ranked; people are not.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-[22px] font-semibold tracking-tight">
            Settled, newest first
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">
            The same register that runs along the bottom of the wall, here as well because the board
            does not show it on a phone. Each row ends in eight characters of the signature that
            settled it — enough for the buyer holding the other eighty to recognise their own, and
            not enough for anybody else to look up the address that paid.
          </p>
          <div className="stats-tape mt-5 overflow-hidden rounded-xl border border-hairline-strong">
            <PurchaseTape rows={settled} asOf={new Date().toISOString()} />
          </div>
        </section>
      </div>
    </main>
  );
}

function Figure({ term, value, note }: { term: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 bg-card px-4 py-4">
      <dt className="label-caps">{term}</dt>
      <dd className="tabular font-display text-[26px] font-bold leading-none text-ink">{value}</dd>
      <p className="text-[12.5px] leading-tight text-body">{note}</p>
    </div>
  );
}

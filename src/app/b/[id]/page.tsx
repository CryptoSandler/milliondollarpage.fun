import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ThemeToggle from "../../../components/ThemeToggle";
import SiteFooter from "../../../components/SiteFooter";
import { badgeUrl, blockImageUrl, shareCardUrl } from "../../../lib/board/block-image";
import { blockPageUrl } from "../../../lib/board/block-details";
import { renderBadge } from "../../../lib/board/badge";
import { getBlockPage, type BlockPage } from "../../../lib/board/blocks";
import type { OwnerChain } from "../../../lib/board/owner";
import { formatUsdc, pixelCount } from "../../../lib/board/pricing";
import { isUuid } from "../../../lib/http";
import { absoluteUrl } from "../../../lib/site";

export const dynamic = "force-dynamic";

/**
 * One rectangle, on a page of its own.
 *
 * WHO ARRIVES HERE: a buyer, from the receipt in `PurchaseDialog`, which offers
 * this URL the moment their purchase settles; and anybody they hand it to.
 * Nothing on the board links here — the board is a wall, and a wall does not
 * need a page per brick.
 *
 * ## Why it exists at all
 *
 * A buyer owned a rectangle and had nothing to link to. There was
 * `/api/blocks/<id>` for machines, the hover card for somebody already on the
 * wall, `/api/blocks/<id>/card` for an image with no page under it, and
 * `/go/<id>` for the way out. There was no page whose subject is one rectangle,
 * which meant the one thing the 2005 original actually had — a thousand buyers
 * with a reason to tell somebody — had nowhere to point.
 * `docs/marketing-fomo.md` has the round that argued it.
 *
 * ## It names nobody, and that is the same rule the standings keep
 *
 * DESIGN.md: "No holder is named, on the ranking or anywhere else — the page
 * prints that sentence rather than leaving it to be noticed." A page about a
 * rectangle is the most forwarded surface this product has, so it is the last
 * place to relax it. What is here is four numbers, an amount, a date, eight
 * characters of the signature that settled it, and the buyer's own caption and
 * link — every one of them a fact about the RECTANGLE.
 *
 * ## The card is not rendered here
 *
 * `og:image` points at `/api/blocks/<id>/card`, which already existed and
 * already composes a 1200×630 card out of bytes on disk. This page adds the
 * `<head>` that makes it unfurl and the page it unfurls into. Nothing new draws
 * an image; see `share-card.ts` for why one is never stored.
 *
 * ## Still noindex, and deliberately
 *
 * The root layout's `robots: { index: false, follow: false }` is inherited by
 * every page including this one, so a card shared today unfurls for a person
 * and is refused by a crawler. That is the correct order: the three locks come
 * off together when the owner launches, and this page is built closed.
 */

/**
 * A page for a rectangle, or 404.
 *
 * The one lookup both this and `generateMetadata` need. Next renders the two in
 * the same request, and `dynamic = "force-dynamic"` means neither is cached, so
 * this is two round trips for one page load. Left as two on purpose: React's
 * `cache()` would make it one and would put a memoisation boundary around a
 * query that costs a primary-key lookup, and `docs/` has no measurement saying
 * it matters. If it ever does, wrapping this function is the whole change.
 *
 * ponytail: two queries per page load, `cache()` it if a profile ever says so.
 */
async function pageFor(id: string): Promise<BlockPage | null> {
  // The same ladder every `[id]` route walks: a non-uuid answers exactly what
  // an absent id answers, rather than reaching Postgres and raising 22P02.
  if (!isUuid(id)) return null;
  return getBlockPage(id);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const block = await pageFor(id);

  if (!block) {
    return { title: "There is nothing on those pixels · milliondollarpage.fun" };
  }

  const title = `${block.w} × ${block.h} at (${block.x}, ${block.y}) · milliondollarpage.fun`;

  return {
    title,
    /*
      THE INVARIANT, IN THE WORDS `DECISIONS.md` ALREADY USES, and no more than
      that: "a sold pixel does not change owner or content without its owner's
      signature, and it never expires." Whether a block can ever change hands is
      OPEN there and "not to be answered by anything shipped", so this sentence
      says neither "non-transferable" nor its opposite. A description is copy
      that travels further than any other on this site; it is exactly where that
      door gets walked through by accident.
    */
    description: `${pixelCount(block.pixels)} on the wall, bought for ${formatUsdc(
      block.totalBaseUnits,
    )}. These pixels do not change owner or content without their owner's signature, and they never expire.`,
    alternates: { canonical: blockPageUrl(block.id) },
    openGraph: {
      title,
      url: blockPageUrl(block.id),
      // The card that already exists. No width or height: every crawler that
      // renders one fetches the image anyway, and a pair of numbers repeated
      // here is a pair of numbers that can disagree with `share-card.ts`.
      images: [{ url: shareCardUrl(block.id), alt: `${block.w} × ${block.h} on milliondollarpage.fun` }],
    },
    twitter: { card: "summary_large_image" },
  };
}

/** What the "Paid" figure says under it, per rail. One dollar, two rails. */
const PAID_ON: Record<OwnerChain, string> = {
  solana: "USDC, on Solana",
  robinhood: "USDG, on Robinhood Chain",
};

export default async function BlockPageRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const block = await pageFor(id);
  if (!block) notFound();

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

        <h1 className="tabular mt-8 font-display text-[34px] font-bold leading-tight tracking-tight">
          {block.w} × {block.h}
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          {pixelCount(block.pixels)} on the wall at ({block.x}, {block.y}). These pixels do not
          change owner or content without their owner&apos;s signature, and they never expire.
        </p>

        {/*
          A BACKGROUND RATHER THAN AN `<img>`, which is the choice `BlockCard`
          already made and gives its reasons for: the bytes are an API route's,
          `next/image` can neither optimise nor honestly smooth them, and
          `image-rendering: pixelated` reaches a background exactly as it
          reaches an element.

          The box is the RECTANGLE's shape, capped so a 1×800 purchase does not
          make a page nobody can scroll: width is the smaller of the column and
          what 60vh of height allows at this rectangle's own ratio.
        */}
        {block.approvedAt === null ? (
          /*
            IN REVIEW, AND THE PAGE STILL EXISTS. `DECISIONS.md`: the sale is
            not pending, the publication is. The money settled, the rectangle is
            theirs, the exclusion constraint holds it and `/stats` counts its
            pixels — what is waiting is the picture appearing. A 404 here would
            be the site losing a purchase in front of the person who just made
            it, and a blank rectangle with no explanation would be worse.

            The picture is not shown because the image route refuses it, which
            is the whole point of the queue: nothing is published to anybody,
            including through this page, until a person has looked.
          */
          <div className="mt-8 rounded-xl border border-hairline-strong bg-card px-4 py-6 text-[15px] leading-relaxed text-body">
            <p className="font-semibold text-ink">This one is in review.</p>
            <p className="mt-2">
              It was paid for on {block.paidAt.slice(0, 10)} and these pixels are permanently its
              buyer&apos;s — the sale is not waiting on anything. What is waiting is the picture
              going up on the wall, which happens once a person has looked at it.
            </p>
          </div>
        ) : (
          <div
            className="block-art mt-8"
            style={{
              aspectRatio: `${block.w} / ${block.h}`,
              maxWidth: `min(100%, calc(60vh * ${block.w} / ${block.h}))`,
              backgroundImage: `url("${blockImageUrl(block.id)}")`,
            }}
            role="img"
            aria-label={`The artwork on this ${block.w} by ${block.h} rectangle`}
          />
        )}

        {/*
          ONE COLUMN ON A PHONE, and it is a measured fix rather than a
          preference. At 390 in two columns a cell is 138px of text and the
          settlement date is 10 monospace characters at 26px — it broke as
          "2026-09-" / "02", which is a measurement split mid-token and the one
          thing DESIGN.md's numeric role exists to prevent. Dropping the figure
          size instead would make this page's numbers disagree with `/stats`.
        */}
        <dl className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-hairline-strong bg-hairline-strong sm:grid-cols-2 md:grid-cols-4">
          <Figure term="Pixels" value={block.pixels.toLocaleString("en-US")} note="one dollar each" />
          <Figure
            term="Paid"
            value={formatUsdc(block.totalBaseUnits)}
            /*
              THE RAIL THIS RECTANGLE WAS ACTUALLY PAID ON. This line said
              "USDC, on Solana" for every block until the second rail existed,
              which was true of every block at the time and is a sentence that
              quietly becomes wrong rather than absent. A dollar is a dollar
              either way — the wall is priced in six-decimal base units and both
              stablecoins carry six — so the figure above does not change.
            */
            note={PAID_ON[block.ownerChain]}
          />
          <Figure
            term="Settled"
            value={block.paidAt.slice(0, 10)}
            note={block.signature ? `signature ${block.signature}` : "before the money path existed"}
          />
          <Figure
            term="Clicks"
            value={block.clicks.toLocaleString("en-US")}
            note={
              block.link === null
                ? "there is no link on this one"
                : block.clicks === 0
                  ? "nobody has followed it yet"
                  : "times the link has been followed"
            }
          />
        </dl>

        {block.approvedAt !== null && (block.caption || block.link) && (
          <section className="mt-10">
            <h2 className="font-display text-[22px] font-semibold tracking-tight">
              What the buyer put on it
            </h2>
            {block.caption && (
              <p className="mt-3 text-[16px] leading-relaxed text-ink">{block.caption}</p>
            )}
            {block.link && (
              <p className="mt-3 text-[15px] leading-relaxed text-body">
                {/*
                  THROUGH `/go/<id>`, NEVER THE ADDRESS ITSELF — the same
                  indirection `BlockCard` uses, and the whole reason a click is
                  countable. The text says where it goes; the href says how it
                  is counted. `nofollow` because this page vouches for nothing
                  it did not write.
                */}
                <a
                  href={`/go/${block.id}`}
                  target="_blank"
                  rel="nofollow noreferrer"
                  className="font-semibold text-ink underline underline-offset-2"
                >
                  {hostOf(block.link)}
                </a>
              </p>
            )}
          </section>
        )}

        <section className="mt-10">
          <h2 className="font-display text-[22px] font-semibold tracking-tight">
            Put it on your own site
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">
            A small badge, drawn and served by us, linking back to this page. Paste this where your
            picture already lives.
          </p>
          {/*
            THE SNIPPET IS TEXT, AND THERE IS NO COPY BUTTON. One would need a
            second client component on a page that has one; selecting three
            lines is a thing every browser already does. The lazier half of that
            trade is named rather than hidden: if the owner wants the button it
            is one component, and nothing else here changes.

            ABSOLUTE URLs, from `src/lib/site.ts`. A relative path is useless the
            moment it is pasted anywhere, which is the only place this string is
            ever going.
          */}
          <pre className="embed-snippet mt-4">
            <code>{embedSnippet(block)}</code>
          </pre>

          <h2 className="mt-10 font-display text-[22px] font-semibold tracking-tight">Share it</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">
            This page unfurls as a card carrying the rectangle, the amount and the signature that
            settled it. It names nobody — no address, no wallet, no holder — here or anywhere else
            on this site.
          </p>
          <a
            href={shareCardUrl(block.id)}
            target="_blank"
            rel="noreferrer"
            className="btn-quiet mt-4 inline-block px-3 py-2 text-[14px]"
          >
            Open the card
          </a>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}

/**
 * The three lines a buyer pastes on their own page.
 *
 * An anchor, an image, and the two attributes that stop the badge reflowing the
 * page while it loads. Built here rather than in `badge.ts` because that module
 * draws the picture and this is the markup around it — and because the width
 * comes from the drawing, so the snippet has to ask for it rather than guess.
 *
 * `alt` says what the badge says, for the reader who does not get the picture.
 */
function embedSnippet(block: BlockPage): string {
  const badge = renderBadge(block);
  const alt = `${block.w} × ${block.h} pixels on milliondollarpage.fun`;
  return (
    `<a href="${absoluteUrl(blockPageUrl(block.id))}">\n` +
    `  <img src="${absoluteUrl(badgeUrl(block.id))}"\n` +
    `       alt="${alt}" width="${badge.width}" height="${badge.height}">\n` +
    `</a>`
  );
}

/**
 * The host a link goes to, as text.
 *
 * The address is shown rather than the caption's own words so a reader can see
 * where they are about to be sent, and `new URL` rather than a regular
 * expression because a hand-rolled parser is how a lookalike host gets printed
 * as the real one. `checkLink` already refused anything that is not https at
 * purchase time; this is the second reader of the same string and it does not
 * assume that held.
 */
function hostOf(link: string): string {
  try {
    return new URL(link).host;
  } catch {
    return "a link";
  }
}

function Figure({ term, value, note }: { term: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 bg-card px-4 py-4">
      <dt className="label-caps">{term}</dt>
      <dd className="tabular whitespace-nowrap font-display text-[26px] font-bold leading-none text-ink">
        {value}
      </dd>
      <p className="text-[12.5px] leading-tight text-body">{note}</p>
    </div>
  );
}

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { query } from "../../lib/db";
import BlockPageRoute from "../b/[id]/page";
import FaqPage from "../faq/page";
import HowToBuyPage from "../how-to-buy/page";
import BuyersPage from "../buyers/page";
import LogPage from "../log/page";
import PressPage from "../press/page";
import StatsPage from "../stats/page";

/**
 * The one question this product has deliberately not answered, checked on every
 * page that could answer it by accident.
 *
 * `DECISIONS.md`, "Open: whether a block can ever change hands": transfer is
 * "not built, not promised, and not forbidden", the words "non-transferable"
 * must not appear in copy, and "no page answers the question in either
 * direction". That was guarded on the FAQ, which is the page that discusses it
 * on purpose — and the pages most likely to close the door are the ones that do
 * NOT discuss it, where a reassuring sentence about permanence is written
 * without anybody noticing it has answered something.
 *
 * So this runs the same list over every page that carries prose. It reads the
 * RENDERED markup rather than the source, which matters here more than usual:
 * three of these files carry comments explaining what they must not say, and a
 * source scan would fail on the explanation.
 */

const PER_PIXEL = 1_000_000;

/**
 * A sold rectangle, because two of the three pages have nothing to render
 * without one.
 */
async function seed(): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                         owner_address, payment_signature, caption, link)
     VALUES (12, 34, 50, 20, 'paid', $1, $2, '2026-03-04T05:06:07Z',
             'AWalletNobodyMayLearn', 'a-signature', 'My shop', 'https://example.com/shop')
     RETURNING id`,
    [PER_PIXEL, 50 * 20 * PER_PIXEL],
  );
  return rows[0].id;
}

/**
 * What a reader reads, with the tags taken out — so a phrase split across an
 * element boundary is still one phrase.
 */
function readable(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Every phrase that would answer the question, in one direction or the other.
 *
 * A WORD IS NOT ON THIS LIST, AND THE FIRST DRAFT LEARNED THAT THE HARD WAY.
 * "transfer" and "sell" both appear in the FAQ's own answer, which is the
 * correct answer and decides nothing. The draft that matched
 * `(cannot|can't) be (transferred|sold|resold)` fired on this, from the
 * question about overlapping pixels:
 *
 *   "a rectangle that is sold or held cannot be sold or held again while it
 *    stands"
 *
 * — which is the exclusion constraint, not a promise about transfer. A second
 * draft matched `sell on`, and caught "a reason to refuse to sell one".
 *
 * So every pattern here is CLAIM-SHAPED and ends at a word boundary: it names a
 * subject who could dispose of a rectangle, or a property the rectangle is said
 * to have. A guard that fires on correct copy is a guard somebody deletes.
 */
const CLOSES_THE_DOOR: { phrase: RegExp; direction: string; example: string }[] = [
  {
    phrase: /non-?\s?transferable/,
    direction: "forbids it",
    example: "these pixels are non-transferable",
  },
  {
    phrase: /(cannot|can't|can never|will never) be (transferred|resold)/,
    direction: "forbids it",
    example: "a rectangle cannot be transferred",
  },
  {
    phrase: /never (be )?transferable/,
    direction: "forbids it",
    example: "it will never be transferable",
  },
  {
    phrase: /you (cannot|can't|may not|will never be able to) (sell|resell|transfer|give)/,
    direction: "forbids it",
    example: "you cannot sell it to anybody",
  },
  {
    phrase: /(never|cannot|does not|doesn't) change hands/,
    direction: "forbids it",
    example: "a sold rectangle never changes hands — never change hands",
  },
  {
    phrase: /(freely|fully) transferable/,
    direction: "promises it",
    example: "your pixels are freely transferable",
  },
  {
    phrase: /will be (transferable|able to sell)/,
    direction: "promises it",
    example: "you will be able to sell it later",
  },
  { phrase: /transfer is coming/, direction: "promises it", example: "transfer is coming soon" },
  {
    // `sell on` without the boundary matched "a reason to refuse to sell one",
    // which is the second false positive this list produced against correct
    // copy and the reason every pattern here now ends at a word boundary.
    phrase: /to (keep or )?resell\b|\bsell it on\b/,
    direction: "promises it",
    example: "yours to keep or resell",
  },
];

describe("no page answers whether a rectangle can ever change hands", () => {
  it.each([
    ["the landing and the FAQ", async () => renderToStaticMarkup(<FaqPage />)],
    /*
      THE PAGE MOST LIKELY TO WALK THROUGH THE DOOR, and the reason this list
      exists at all: a page that teaches somebody to buy is a page that wants to
      tell them what they may do with it afterwards.
    */
    ["how to buy", async () => renderToStaticMarkup(<HowToBuyPage />)],
    ["what the wall has done", async () => renderToStaticMarkup(await StatsPage())],
    // THREE MORE PAGES CARRYING PROSE, added 2026-09-03 with the pages
    // themselves. The log is the likeliest of all of them to walk through the
    // door — it is written in the first person about what the wall is for, and
    // that is the voice a sentence about what a buyer may do with their pixels
    // arrives in.
    ["the log", async () => renderToStaticMarkup(<LogPage />)],
    ["press", async () => renderToStaticMarkup(<PressPage />)],
    [
      "who has bought",
      async () =>
        renderToStaticMarkup(await BuyersPage({ searchParams: Promise.resolve({}) })),
    ],
    [
      "one rectangle's own page",
      async () =>
        renderToStaticMarkup(await BlockPageRoute({ params: Promise.resolve({ id: await seed() }) })),
    ],
  ])("%s", async (_name, render) => {
    const text = readable(await render());

    for (const { phrase, direction } of CLOSES_THE_DOOR) {
      expect(phrase.test(text), `this page ${direction}: ${phrase}`).toBe(false);
    }
  });

  /**
   * A guard is not a guard until it has been seen to fail. Every pattern above
   * carries the sentence it exists to catch, and this proves each one still
   * catches it — a list of regular expressions nobody has fired is a list that
   * can quietly stop matching anything.
   */
  it.each(CLOSES_THE_DOOR)("$phrase catches $example", ({ phrase, example }) => {
    expect(phrase.test(example)).toBe(true);
  });

  /**
   * The other half, and the half a list of forbidden phrases cannot give: the
   * page that DOES discuss it still says the question is open. Deleting that
   * answer would pass every assertion above.
   */
  it("and the one page that discusses it still calls it undecided", () => {
    const html = renderToStaticMarkup(<FaqPage />);
    expect(html).toContain("We have not decided, and we are not going to pretend either way");
  });
});

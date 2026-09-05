import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { execute } from "../../lib/db";
import BuyersPage from "../buyers/page";
import { BUYERS_PER_PAGE, soldBlocks } from "../../lib/board/buyers";

/**
 * The list of what has been bought, and the one thing it may never contain.
 *
 * `/buyers` was refused on 2026-09-02 because a list of purchases sounds like a
 * list of buyers; `DECISIONS.md` carries the reversal and the reason. The
 * reversal is only safe while the page stays a list of RECTANGLES, so the
 * assertion that matters here is negative and it is deliberately blunt: seed a
 * row whose wallet and signature are recognisable strings, render the page, and
 * look for them in the markup.
 *
 * A query test would not do. The failure this guards against is somebody adding
 * a column to the SELECT and a line to the row — two edits that each look
 * reasonable — so the check has to be on what a reader actually receives.
 */

const PER_PIXEL = 1_000_000;
const WALLET = "AWalletNobodyMayLearn";
const SIGNATURE = "ASignatureNobodyMayLearn";

async function sell(
  x: number,
  at: string,
  extra: { caption?: string; link?: string; hidden?: boolean } = {},
): Promise<void> {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                         owner_address, payment_signature, caption, link, hidden_at, approved_at)
     VALUES ($1, 0, 10, 10, 'paid', $2, $3, $4, $5, $6, $7, $8, $9, now())`,
    [
      x,
      PER_PIXEL,
      100 * PER_PIXEL,
      at,
      WALLET,
      `${SIGNATURE}-${x}`,
      extra.caption ?? null,
      extra.link ?? null,
      extra.hidden ? at : null,
    ],
  );
}

async function render(page?: string): Promise<string> {
  return renderToStaticMarkup(
    await BuyersPage({ searchParams: Promise.resolve(page ? { page } : {}) }),
  );
}

describe("no address reaches the page", () => {
  it("names no wallet and no signature, on a page full of purchases", async () => {
    for (let i = 0; i < 3; i += 1) {
      await sell(i * 20, `2026-0${i + 1}-01T00:00:00Z`, {
        caption: `Shop ${i}`,
        link: `https://example.com/${i}`,
      });
    }

    const html = await render();

    expect(html).toContain("Shop 0");
    expect(html).not.toContain(WALLET);
    expect(html).not.toContain(SIGNATURE);
    /*
      AND NOTHING SHAPED LIKE AN ADDRESS EITHER, which is the half the two
      assertions above cannot give: they catch the fixture's own strings, and a
      column added tomorrow would carry a different one. A Solana address is
      base58 and thirty-two characters or more; nothing this page legitimately
      prints is. Uuids fail it on their hyphens, and captions fail it on their
      spaces.
    */
    const text = html.replace(/<[^>]*>/g, " ");
    expect(text).not.toMatch(/[1-9A-HJ-NP-Za-km-z]{32,}/);
  });

  it("does not select a wallet column at all", async () => {
    await sell(0, "2026-01-01T00:00:00Z");
    const { rows } = await soldBlocks(1);
    expect(rows).toHaveLength(1);
    // The row shape is a deliberate subtraction. Anything that could name a
    // person is absent rather than nulled.
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["caption", "hasImage", "id", "link", "paidAt", "pixels", "w", "h", "x", "y"].sort(),
    );
  });
});

describe("the order and the paging", () => {
  it("lists purchases oldest first, so a row's number never changes", async () => {
    await sell(40, "2026-03-01T00:00:00Z", { caption: "third" });
    await sell(0, "2026-01-01T00:00:00Z", { caption: "first" });
    await sell(20, "2026-02-01T00:00:00Z", { caption: "second" });

    const { rows } = await soldBlocks(1);
    expect(rows.map((row) => row.caption)).toEqual(["first", "second", "third"]);
  });

  it("clamps a page number past the end to the last page", async () => {
    await sell(0, "2026-01-01T00:00:00Z");
    const { page, pages } = await soldBlocks(99);
    expect(pages).toBe(1);
    expect(page).toBe(1);
  });

  it("clamps a page number below the start, and a page that is not a number", async () => {
    await sell(0, "2026-01-01T00:00:00Z");
    expect((await soldBlocks(0)).page).toBe(1);
    expect((await soldBlocks(-3)).page).toBe(1);
    expect((await soldBlocks(Number.NaN)).page).toBe(1);
  });

  it("puts no more than a page of rows on a page", async () => {
    for (let i = 0; i < BUYERS_PER_PAGE + 2; i += 1) {
      await sell(i * 11, `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`);
    }
    expect((await soldBlocks(1)).rows).toHaveLength(BUYERS_PER_PAGE);
    expect((await soldBlocks(2)).rows).toHaveLength(2);
    expect((await soldBlocks(2)).total).toBe(BUYERS_PER_PAGE + 2);
  });
});

describe("a takedown", () => {
  /**
   * The rule `tape.ts` states for the register and `getBlockPage` for the page:
   * a takedown removes CONTENT and never the sale. The row stays, because a
   * list that dropped it would disagree with the money.
   */
  it("keeps its row and loses its words", async () => {
    await sell(0, "2026-01-01T00:00:00Z", {
      caption: "Taken down",
      link: "https://example.com/gone",
      hidden: true,
    });

    const { rows, total } = await soldBlocks(1);
    expect(total).toBe(1);
    expect(rows[0].caption).toBeNull();
    expect(rows[0].link).toBeNull();
    expect(rows[0].hasImage).toBe(false);

    const html = await render();
    expect(html).not.toContain("Taken down");
    expect(html).not.toContain("example.com/gone");
    expect(html).toContain("No caption");
  });
});

describe("an empty wall", () => {
  it("says nothing has been bought rather than showing an empty list", async () => {
    expect(await render()).toContain("Nothing has been bought yet");
  });
});

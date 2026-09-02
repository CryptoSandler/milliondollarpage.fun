import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { execute, query } from "../../lib/db";
import { renderBadge } from "../../lib/board/badge";
import { getBlockPage } from "../../lib/board/blocks";
import BlockPageRoute, { generateMetadata } from "../b/[id]/page";

/**
 * The page one rectangle gets, and the three things it may never become.
 *
 * It is rendered rather than asserted through its query, because two of the
 * claims are about what is ON THE SCREEN: that no holder is named, and that the
 * buyer's link is reached through `/go/<id>` rather than as its own address. A
 * query test passes with either one missing from the page.
 *
 * The fourth claim is about the `<head>` — the card a shared link unfurls into
 * — which is `generateMetadata` and is asserted directly.
 */

const PER_PIXEL = 1_000_000;
/**
 * A settlement signature, unique per rectangle because the column is unique,
 * and with its first four and last four characters constant because those eight
 * are the whole of what ever gets published.
 */
function signatureFor(x: number): string {
  return `5KqW2Tr9vZmP4nLcXyB8dQfHjRsA6EuVoT1iN3gYkM7pWzC2xJhFbD${String(x).padStart(4, "0")}SaGnQ4tU`;
}
const BUYER = "AWalletNobodyMayLearn11111111111111111111111";

type Seed = {
  /** Distinct where a test seeds more than one: `blocks_no_overlap` is real. */
  x?: number;
  status?: string;
  hidden?: boolean;
  caption?: string | null;
  link?: string | null;
  clicks?: number;
};

async function seed(fields: Seed = {}): Promise<string> {
  const status = fields.status ?? "paid";
  // `blocks_paid_at_matches_status` refuses a settled instant on a row nobody
  // has paid for, which is the schema being right: a hold has not settled, so
  // it has nothing to date and nothing to prove. The fixture obeys it rather
  // than working around it — that constraint is why `getBlockPage` can trust
  // `paid_at` on every row it returns.
  const settled = status === "paid" || status === "minted";
  const rows = await query<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                         buyer_pubkey, owner_wallet, payment_signature, caption, link, image_fit,
                         expires_at)
     VALUES ($10, 34, 50, 20, $1, $2, $3, $8,
             $4, $4, $5, $6, $7, 'contain', $9)
     RETURNING id`,
    [
      status,
      PER_PIXEL,
      50 * 20 * PER_PIXEL,
      BUYER,
      settled ? signatureFor(fields.x ?? 12) : null,
      "caption" in fields ? fields.caption : "My shop",
      "link" in fields ? fields.link : "https://example.com/shop",
      settled ? "2026-03-04T05:06:07Z" : null,
      // A reservation without an expiry is not a reservation the sweeper can
      // reason about; every other status ignores the column.
      status === "reserved" ? "2099-01-01T00:00:00Z" : null,
      fields.x ?? 12,
    ],
  );
  const id = rows[0].id;

  if (fields.hidden) {
    await execute(`UPDATE blocks SET hidden_at = now(), takedown_reason = 'a complaint' WHERE id = $1`, [id]);
  }
  if (fields.clicks) {
    await execute(`INSERT INTO block_clicks (block_id, clicks) VALUES ($1, $2)`, [id, fields.clicks]);
  }
  return id;
}

async function render(id: string): Promise<string> {
  return renderToStaticMarkup(await BlockPageRoute({ params: Promise.resolve({ id }) }));
}

/**
 * `notFound()` throws, and what it throws is Next's own control-flow error
 * rather than a failure. Asserting on the digest rather than on the message is
 * what makes this test about the 404 and not about the wording of an internal
 * error string.
 */
async function refuses(id: string): Promise<void> {
  await expect(render(id)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
}

describe("the page for one rectangle", () => {
  it("says the four numbers, the amount, the date and the click count", async () => {
    const id = await seed({ clicks: 17 });
    const html = await render(id);

    expect(html).toContain("50 × 20");
    expect(html).toContain("1,000 pixels");
    expect(html).toContain("(12, 34)");
    expect(html).toContain("$1,000");
    expect(html).toContain("2026-03-04");
    expect(html).toContain("17");
  });

  /**
   * DESIGN.md: "No holder is named, on the ranking or anywhere else — the page
   * prints that sentence rather than leaving it to be noticed." This is the
   * most forwarded surface on the site, so it is the one that gets the assertion
   * rather than the sentence alone.
   */
  it("names nobody, and publishes eight characters of the signature at most", async () => {
    const id = await seed();
    const html = await render(id);

    expect(html).not.toContain(BUYER);
    expect(html).not.toContain(signatureFor(12));
    expect(html).toContain("5KqW…Q4tU");
    expect(html).toContain("names nobody");
  });

  it("reaches the buyer's link through /go/<id> and never as its own address", async () => {
    const id = await seed();
    const html = await render(id);

    expect(html).toContain(`href="/go/${id}"`);
    expect(html).toContain("example.com");
    expect(html).not.toContain(`href="https://example.com/shop"`);
  });

  it("says a rectangle with no link has none, rather than showing a zero with no reason", async () => {
    const id = await seed({ link: null, caption: null });
    const html = await render(id);

    expect(html).toContain("there is no link on this one");
  });
});

describe("the badge a buyer pastes elsewhere", () => {
  it("hands over a snippet with absolute URLs and the badge's own size", async () => {
    const id = await seed();
    const html = await render(id);

    expect(html).toContain(`https://milliondollarpage.fun/b/${id}`);
    expect(html).toContain(`https://milliondollarpage.fun/api/blocks/${id}/badge`);
    // The width comes from the drawing rather than from a guess in the markup,
    // so a wider figure cannot end up in a box that crops it.
    // Escaped, because the snippet is TEXT on this page rather than markup —
    // which is the assertion worth making as much as the number is.
    expect(html).toContain(`width=&quot;${renderBadge({ w: 50, h: 20 }).width}&quot;`);
    expect(html).toContain("height=&quot;40&quot;");
  });

  /**
   * A relative path is useless the moment it is pasted anywhere, and that is
   * the only place this string is ever going.
   */
  it("never offers a relative path in the snippet", async () => {
    const html = await render(await seed());
    expect(html).not.toContain('&lt;a href=&quot;/b/');
    expect(html).not.toContain('src=&quot;/api/blocks/');
  });
});

describe("what has no page", () => {
  it("refuses a hold — a reservation is thirty free minutes, not a page on this domain", async () => {
    await refuses(await seed({ status: "reserved" }));
  });

  it("refuses a rectangle whose content has been taken down", async () => {
    await refuses(await seed({ hidden: true }));
  });

  it("refuses an id nobody has bought, and a string that is not an id at all", async () => {
    await refuses("00000000-0000-4000-8000-000000000000");
    await refuses("not-a-uuid");
  });

  /**
   * The page and its card publish the same rectangle, so they must refuse the
   * same ones: a page whose `og:image` is a permanent 404 is a link that
   * unfurls blank forever. `getBlockPage` and `renderShareCard` are both
   * written against `publishesTextSql`; this asserts they agree on the two
   * cases where it does the work.
   */
  it("refuses exactly what the share card refuses", async () => {
    expect(await getBlockPage(await seed({ x: 12, status: "reserved" }))).toBeNull();
    expect(await getBlockPage(await seed({ x: 100, hidden: true }))).toBeNull();
    expect(await getBlockPage(await seed({ x: 200 }))).not.toBeNull();
  });
});

describe("what a shared link unfurls into", () => {
  it("points og:image at the card route that already composes one", async () => {
    const id = await seed();
    const meta = await generateMetadata({ params: Promise.resolve({ id }) });

    expect(meta.openGraph?.images).toEqual([
      { url: `/api/blocks/${id}/card`, alt: "50 × 20 on milliondollarpage.fun" },
    ]);
    expect(meta.alternates?.canonical).toBe(`/b/${id}`);
    expect(meta.twitter).toEqual({ card: "summary_large_image" });
  });

  /**
   * `DECISIONS.md` holds whether a block can ever change hands OPEN, and "not
   * to be answered by anything shipped". A description travels further than any
   * other copy here, so it is the sentence most likely to answer it by
   * accident — in either direction.
   */
  it("says the permanence invariant and neither side of the transfer question", async () => {
    const id = await seed();
    const meta = await generateMetadata({ params: Promise.resolve({ id }) });
    const description = String(meta.description);

    expect(description).toContain("never expire");
    expect(description).not.toMatch(/non-?transferable|cannot be (sold|resold|transferred)|resell/i);
  });

  it("has a title and no card for a rectangle with no page", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    });

    expect(meta.openGraph).toBeUndefined();
  });
});

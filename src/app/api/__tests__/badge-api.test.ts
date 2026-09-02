import { describe, expect, it } from "vitest";
import { execute, query } from "../../../lib/db";
import { renderBadge } from "../../../lib/board/badge";
import { GET } from "../blocks/[id]/badge/route";

/**
 * The one thing this site hands somebody to paste into a page we do not own.
 *
 * Two claims are worth a test and both are about what is NOT in the document:
 * nothing a stranger wrote, and nothing that fetches or runs. The third is the
 * status ladder, which has to agree with the page and the card or a buyer's
 * site shows a broken image for a rectangle that is fine.
 */

const PER_PIXEL = 1_000_000;
const BUYER = "AWalletNobodyMayLearn11111111111111111111111";
const SIGNATURE = "5KqW2Tr9vZmP4nLcXyB8dQfHjRsA6EuVoT1iN3gYkM7pWzC2xJhFbD5rSaGnQ4tU";

async function seed(
  fields: { x?: number; status?: string; hidden?: boolean } = {},
): Promise<string> {
  const status = fields.status ?? "paid";
  const settled = status === "paid" || status === "minted";
  const rows = await query<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                         buyer_pubkey, owner_wallet, payment_signature, caption, link, expires_at)
     VALUES ($5, 34, 50, 20, $1, $2, $3, $6, $4, $4, $7,
             '<script>alert(1)</script>', 'https://example.com/shop', $8)
     RETURNING id`,
    [
      status,
      PER_PIXEL,
      50 * 20 * PER_PIXEL,
      BUYER,
      fields.x ?? 12,
      settled ? "2026-03-04T05:06:07Z" : null,
      settled ? SIGNATURE : null,
      status === "reserved" ? "2099-01-01T00:00:00Z" : null,
    ],
  );
  const id = rows[0].id;
  if (fields.hidden) {
    await execute(`UPDATE blocks SET hidden_at = now(), takedown_reason = 'a complaint' WHERE id = $1`, [id]);
  }
  return id;
}

async function get(id: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/blocks/${id}/badge`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/blocks/{id}/badge", () => {
  it("draws the rectangle's two numbers, as an SVG, cached for a year", async () => {
    const response = await get(await seed());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const svg = await response.text();
    expect(svg).toContain("50 × 20 · 1,000 pixels");
    expect(svg).toContain("MILLIONDOLLARPAGE.FUN");
  });

  /**
   * The badge is markup somebody pastes into their own page. The rule that
   * makes it safe is not escaping, it is that there is nothing to escape: no
   * caption, no link, no name, no signature. The fixture's caption is a script
   * tag — thirty-two characters is all a caption may be, and these are well
   * spent — precisely so this assertion means something.
   */
  it("carries nothing a stranger wrote, and nobody's name", async () => {
    const svg = await (await get(await seed())).text();

    expect(svg).not.toContain("alert(1)");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("example.com");
    expect(svg).not.toContain(BUYER);
    expect(svg).not.toContain(SIGNATURE);
  });

  it("fetches nothing and runs nothing, and says so in a header", async () => {
    const response = await get(await seed());
    const svg = await response.text();

    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(svg).not.toMatch(/href|foreignObject|@import|url\(/i);
    // The only URL in the document is the SVG namespace, which is an identifier
    // rather than something any renderer fetches.
    expect([...svg.matchAll(/https?:\/\/[^"' ]+/g)].map((m) => m[0])).toEqual([
      "http://www.w3.org/2000/svg",
    ]);
  });

  it("has no badge for a hold, a takedown, an unknown id or a string that is not one", async () => {
    expect((await get(await seed({ x: 12, status: "reserved" }))).status).toBe(404);
    expect((await get(await seed({ x: 100, hidden: true }))).status).toBe(404);
    expect((await get("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await get("not-a-uuid")).status).toBe(404);
  });
});

describe("the drawing itself", () => {
  /**
   * A badge sized to its own text rather than padded to a fixed width, and a
   * `textLength` on both lines so the layout is exact in whatever monospace the
   * reader's browser picks rather than only in ours.
   */
  it("grows with the figure it has to print, and pins both lines to a length", () => {
    const small = renderBadge({ w: 1, h: 1 });
    const large = renderBadge({ w: 1250, h: 800 });

    expect(large.width).toBeGreaterThan(small.width);
    expect(small.height).toBe(large.height);
    expect([...small.svg.matchAll(/textLength="/g)]).toHaveLength(2);
    expect(small.svg).toContain("1 pixel<");
    expect(large.svg).toContain("1,000,000 pixels");
  });
});

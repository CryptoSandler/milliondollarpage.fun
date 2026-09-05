import { describe, expect, it } from "vitest";
import { execute, query } from "../../../lib/db";
import { blockDetailsUrl } from "../../../lib/board/block-details";
import { GET } from "../blocks/[id]/route";

/**
 * The words, fetched one rectangle at a time.
 *
 * This route exists because the board payload stopped carrying captions and
 * links when a pixel became the unit. What it must not do is loosen the rule
 * that came with them: a hold publishes nothing, and neither does a rectangle
 * that has been taken down.
 */

async function seed(status: string, expiresAt: string | null = null): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, expires_at, caption, link, image_fit,
                         price_per_pixel_usdc, total_usdc, approved_at)
     VALUES (10, 20, 30, 40, $1, $2, 'My shop', 'https://example.com/shop', 'cover',
             1000000, 1200000000, CASE WHEN $1 IN ('paid','minted') THEN now() END)
     RETURNING id`,
    [status, expiresAt],
  );
  return rows[0].id;
}

async function get(id: string): Promise<Response> {
  return GET(new Request(`http://localhost${blockDetailsUrl(id)}`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/blocks/{id}", () => {
  it("hands back one sold rectangle's caption, link, fit and shape", async () => {
    const id = await seed("paid");
    const response = await get(id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id,
      x: 10,
      y: 20,
      w: 30,
      h: 40,
      status: "paid",
      clicks: 0,
      caption: "My shop",
      link: "https://example.com/shop",
      // Not words, and here for the zoom-detail draw: above the ruling's zoom
      // the canvas redraws this rectangle from its own bitmap, and it cannot
      // place that bitmap without knowing which fit its buyer chose.
      fit: "cover",
    });
  });

  it("gives a hold its rectangle and none of its words", async () => {
    const id = await seed("reserved", "2999-01-01T00:00:00Z");
    const raw = await (await get(id)).text();
    expect(raw).not.toContain("My shop");
    expect(raw).not.toContain("example.com");
    expect(JSON.parse(raw)).toMatchObject({
      status: "reserved",
      clicks: 0,
      caption: null,
      link: null,
      // A hold publishes no bitmap, so it publishes nothing about how one
      // would be drawn either — the same predicate, not a second one.
      fit: null,
    });
  });

  it("gives a taken-down rectangle its shape and none of its words", async () => {
    const id = await seed("paid");
    await execute("UPDATE blocks SET hidden_at = now() WHERE id = $1", [id]);
    const raw = await (await get(id)).text();
    expect(raw).not.toContain("My shop");
    expect(JSON.parse(raw)).toMatchObject({
      status: "paid",
      clicks: 0,
      w: 30,
      caption: null,
      link: null,
      fit: null,
    });
  });

  it("answers the same 404 for a malformed id and for one that names nothing", async () => {
    expect((await get("not-a-uuid")).status).toBe(404);
    expect((await get("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("answers 404 for an expired hold, which is no longer on the board", async () => {
    const id = await seed("reserved", "2999-01-01T00:00:00Z");
    await execute("UPDATE blocks SET expires_at = '2000-01-01T00:00:00Z' WHERE id = $1", [id]);
    expect((await get(id)).status).toBe(404);
  });

  it("is not cached, because a takedown has to take effect now", async () => {
    const id = await seed("paid");
    expect((await get(id)).headers.get("cache-control")).toBe("no-store");
  });

  it("never carries the one credential the site has", async () => {
    const rows = await query<{ id: string }>(
      `INSERT INTO blocks (x, y, w, h, status, owner_address, caption, price_per_pixel_usdc, total_usdc, approved_at)
       VALUES (0, 0, 10, 10, 'paid', 'AWalletNobodyMayLearn', 'Mine', 1000000, 100000000, now())
       RETURNING id`,
    );
    const raw = await (await get(rows[0].id)).text();
    expect(raw).not.toContain("AWalletNobodyMayLearn");
  });
});

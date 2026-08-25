import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { execute } from "../../../lib/db";
import { reserveRect } from "../../../lib/board/reserve";
import { GET } from "../orders/[id]/route";
import { POST as POST_CONTENT } from "../orders/[id]/content/route";
import { POST as POST_CONFIRM } from "../orders/[id]/confirm/route";

const BUYER = "BuyerPubkey1111111111111111111111111111111";
const STRANGER = "StrangerPubkey11111111111111111111111111111";
const CALLER = "e".repeat(64);

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .png()
    .toBuffer();
}

async function contentRequest(overrides: Record<string, string> = {}, bytes?: Buffer) {
  const form = new FormData();
  form.set("image", new Blob([new Uint8Array(bytes ?? (await png()))], { type: "image/png" }), "block.png");
  form.set("link", overrides.link ?? "https://example.com/");
  form.set("caption", overrides.caption ?? "A caption");
  form.set("imageFit", overrides.imageFit ?? "contain");
  form.set("buyerPubkey", overrides.buyerPubkey ?? BUYER);
  return new Request("http://localhost/api/orders/x/content", { method: "POST", body: form });
}

function confirmRequest(buyerPubkey = BUYER) {
  return new Request("http://localhost/api/orders/x/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ buyerPubkey }),
  });
}

describe("GET /api/orders/:id", () => {
  it("returns 404 for an unknown id", async () => {
    const response = await GET(new Request("http://localhost/"), ctx("00000000-0000-0000-0000-000000000000"));
    expect(response.status).toBe(404);
  });

  it("returns the order's state and never caches it", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const response = await GET(new Request("http://localhost/"), ctx(held.id));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.status).toBe("reserved");
    expect(body.hasContent).toBe(false);
  });
});

describe("POST /api/orders/:id/content", () => {
  it("accepts a valid image, link and caption", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const response = await POST_CONTENT(await contentRequest(), ctx(held.id));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.hasContent).toBe(true);
    expect(body.caption).toBe("A caption");
  });

  it("reports EVERY rejected field at once, not just the first", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const bad = await contentRequest(
      { link: "javascript:alert(1)", caption: "x".repeat(99) },
      Buffer.from("not an image"),
    );
    const response = await POST_CONTENT(bad, ctx(held.id));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.rejections.map((r: { field: string }) => r.field).sort()).toEqual([
      "caption",
      "image",
      "link",
    ]);
  });

  it("answers 403 when a different pubkey tries to attach content", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const response = await POST_CONTENT(await contentRequest({ buyerPubkey: STRANGER }), ctx(held.id));
    expect(response.status).toBe(403);
  });

  it("answers 410 for an expired hold", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    await execute("UPDATE blocks SET expires_at = now() - interval '1 minute' WHERE id = $1", [held.id]);
    const response = await POST_CONTENT(await contentRequest(), ctx(held.id));
    expect(response.status).toBe(410);
  });

  it("answers 404 for an unknown order", async () => {
    const response = await POST_CONTENT(
      await contentRequest(),
      ctx("00000000-0000-0000-0000-000000000000"),
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /api/orders/:id/confirm", () => {
  it("marks a described order paid and clears its expiry", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    await POST_CONTENT(await contentRequest(), ctx(held.id));
    const response = await POST_CONFIRM(confirmRequest(), ctx(held.id));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("paid");
    expect(body.expiresAt).toBeNull();
  });

  it("refuses an order with no content", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const response = await POST_CONFIRM(confirmRequest(), ctx(held.id));
    expect(response.status).toBe(409);
  });

  it("answers 403 for a different pubkey", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    await POST_CONTENT(await contentRequest(), ctx(held.id));
    const response = await POST_CONFIRM(confirmRequest(STRANGER), ctx(held.id));
    expect(response.status).toBe(403);
  });

  it("does not exist at all when stub payments are disabled", async () => {
    // Not "refuses" — 404. In production this route must be indistinguishable
    // from a route that was never deployed.
    const previous = process.env.ALLOW_STUB_PAYMENTS;
    delete process.env.ALLOW_STUB_PAYMENTS;
    try {
      const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
      const response = await POST_CONFIRM(confirmRequest(), ctx(held.id));
      expect(response.status).toBe(404);
    } finally {
      if (previous !== undefined) process.env.ALLOW_STUB_PAYMENTS = previous;
    }
  });
});

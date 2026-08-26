import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { execute } from "../../../lib/db";
import { reserveRect } from "../../../lib/board/reserve";
import { CONTENT_LIMITS, MULTIPART_FRAMING_ALLOWANCE_BYTES } from "../../../lib/board/content";
import { DELETE, GET } from "../orders/[id]/route";
import { POST as POST_CONTENT } from "../orders/[id]/content/route";
import { POST as POST_CONFIRM } from "../orders/[id]/confirm/route";

// Reserving, attaching content and confirming each cost their own round trips
// to the remote Neon test branch, and several tests chain two or three of
// them. The 5s default is tuned for a single query, so it's raised only here
// rather than repo-wide.
vi.setConfig({ testTimeout: 20_000 });

const BUYER = "BuyerPubkey1111111111111111111111111111111";
const STRANGER = "StrangerPubkey11111111111111111111111111111";
const CALLER = "e".repeat(64);

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .png()
    .toBuffer();
}

// A real browser sends `content-length` for a multipart body: every part's
// size is known upfront. Node's `Request` does not compute it automatically
// for a `FormData` body (it treats it as a stream), so it is added by hand
// here — via a `Response` over the same body, which forces it to be
// serialized so its true byte length can be measured — to make these
// fixtures match what the content-length gate in content/route.ts actually
// sees in production.
async function withContentLength(form: FormData, headers: Record<string, string>): Promise<Request> {
  const bytes = await new Response(form).arrayBuffer();
  return new Request("http://localhost/api/orders/x/content", {
    method: "POST",
    headers: { ...headers, "content-length": String(bytes.byteLength) },
    body: form,
  });
}

async function contentRequest(overrides: Record<string, string> = {}, bytes?: Buffer, ip = "203.0.113.9") {
  const form = new FormData();
  form.set("image", new Blob([new Uint8Array(bytes ?? (await png()))], { type: "image/png" }), "block.png");
  form.set("link", overrides.link ?? "https://example.com/");
  form.set("caption", overrides.caption ?? "A caption");
  form.set("imageFit", overrides.imageFit ?? "contain");
  form.set("buyerPubkey", overrides.buyerPubkey ?? BUYER);
  return withContentLength(form, { "x-forwarded-for": ip });
}

function confirmRequest(buyerPubkey = BUYER, ip = "203.0.113.9") {
  return new Request("http://localhost/api/orders/x/confirm", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
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

  it("answers 404 for an id that is not a uuid, rather than 500ing", async () => {
    const response = await GET(new Request("http://localhost/"), ctx("not-a-uuid"));
    expect(response.status).toBe(404);
  });

  it("never publishes the buyer's pubkey, which is the only thing the other routes check", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const body = await (await GET(new Request("http://localhost/"), ctx(held.id))).json();
    expect(body).not.toHaveProperty("buyerPubkey");
    expect(JSON.stringify(body)).not.toContain(BUYER);
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

  it("answers 404 for an id that is not a uuid, rather than 500ing", async () => {
    const response = await POST_CONTENT(await contentRequest(), ctx("not-a-uuid"));
    expect(response.status).toBe(404);
  });

  it("answers 413 for a declared content-length over the cap, before the body is ever read", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const oversized = new Request("http://localhost/api/orders/x/content", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.9",
        "content-length": String(CONTENT_LIMITS.maxBytes + MULTIPART_FRAMING_ALLOWANCE_BYTES + 1),
      },
      // The body is deliberately tiny and not even valid multipart: the
      // content-length gate must reject this from the header alone, before
      // request.formData() (and therefore sharp) ever runs.
      body: "this is not a form and is never read",
    });
    const response = await POST_CONTENT(oversized, ctx(held.id));
    expect(response.status).toBe(413);
  });

  it("answers 413 when content-length is absent entirely", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const noLength = new Request("http://localhost/api/orders/x/content", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    // Node's Request never sets content-length for a plain string body with
    // no other length hint here, which is exactly the "absent" case the
    // gate must also refuse.
    expect(noLength.headers.get("content-length")).toBeNull();
    const response = await POST_CONTENT(noLength, ctx(held.id));
    expect(response.status).toBe(413);
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

  it("answers 403 to a stranger even when the order has no content", async () => {
    // Without an explicit ownership check this returns 409 and tells the
    // stranger what state somebody else's order is in.
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const response = await POST_CONFIRM(confirmRequest(STRANGER), ctx(held.id));
    expect(response.status).toBe(403);
  });

  it("answers 404 for an id that is not a uuid, rather than 500ing", async () => {
    const response = await POST_CONFIRM(confirmRequest(), ctx("not-a-uuid"));
    expect(response.status).toBe(404);
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

describe("DELETE /api/orders/:id", () => {
  // Takes the WHOLE body rather than a pubkey, so "no buyerPubkey key at all"
  // is expressible. A defaulted parameter could not say it: passing undefined
  // would silently reinstate the default.
  function releaseRequest(body: unknown = { buyerPubkey: BUYER }): Request {
    return new Request("http://localhost/api/orders/x", {
      method: "DELETE",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify(body),
    });
  }

  it("answers 204 and the rectangle is reservable again immediately", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, BUYER, CALLER);

    const response = await DELETE(releaseRequest(), ctx(held.id));
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const gone = await GET(new Request("http://localhost/"), ctx(held.id));
    expect(gone.status).toBe(404);

    const again = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, BUYER, CALLER);
    expect(again.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });

  it("answers 403 to a different pubkey, AND the hold is still there afterwards", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, BUYER, CALLER);

    const response = await DELETE(releaseRequest({ buyerPubkey: STRANGER }), ctx(held.id));
    expect(response.status).toBe(403);

    // The status code on its own would also be returned by a handler that
    // deleted the row and then refused. Read the row back.
    const still = await GET(new Request("http://localhost/"), ctx(held.id));
    expect(still.status, "a stranger's 403 must not have cost the owner their hold").toBe(200);
    expect((await still.json()).status).toBe("reserved");
  });

  it("answers 409 for a paid order, even to the buyer who paid for it", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    await POST_CONTENT(await contentRequest(), ctx(held.id));
    const paid = await POST_CONFIRM(confirmRequest(), ctx(held.id));
    expect(paid.status).toBe(200);

    const response = await DELETE(releaseRequest(), ctx(held.id));
    expect(response.status).toBe(409);

    const survivor = await GET(new Request("http://localhost/"), ctx(held.id));
    expect(survivor.status).toBe(200);
    expect((await survivor.json()).status).toBe("paid");
  });

  it("answers 404 for an id that is not a uuid, rather than 500ing", async () => {
    const response = await DELETE(releaseRequest(), ctx("not-a-uuid"));
    expect(response.status).toBe(404);
  });

  it("answers 404 for a well-formed id that names nothing", async () => {
    const response = await DELETE(releaseRequest(), ctx("00000000-0000-0000-0000-000000000000"));
    expect(response.status).toBe(404);
  });

  it("answers 400 without a wallet address, before looking anything up", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, BUYER, CALLER);
    for (const body of [{}, { buyerPubkey: "" }, { buyerPubkey: "   " }, { buyerPubkey: 42 }, null]) {
      const response = await DELETE(releaseRequest(body), ctx(held.id));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    const still = await GET(new Request("http://localhost/"), ctx(held.id));
    expect(still.status).toBe(200);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, BUYER, CALLER);
    const response = await DELETE(
      new Request("http://localhost/api/orders/x", { method: "DELETE", body: "not json" }),
      ctx(held.id),
    );
    expect(response.status).toBe(400);
  });
});

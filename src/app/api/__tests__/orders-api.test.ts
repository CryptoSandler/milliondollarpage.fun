import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { execute } from "../../../lib/db";
import { reserveRect } from "../../../lib/board/reserve";
import { CONTENT_LIMITS, MULTIPART_FRAMING_ALLOWANCE_BYTES } from "../../../lib/board/content";
import { BUYER_PUBKEY_HEADER } from "../../../lib/board/purchase-client";
import { testWallet, type TestWallet } from "../../../lib/wallet/__tests__/keypair";
import { DELETE, GET } from "../orders/[id]/route";
import { POST as POST_CONTENT } from "../orders/[id]/content/route";
import { POST as POST_CONFIRM } from "../orders/[id]/confirm/route";
import { POST as POST_CHALLENGE } from "../orders/[id]/release-challenge/route";

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

  /**
   * A hold is free and lasts thirty minutes. Anyone can read the board, and
   * the board publishes every live block's id, so anyone can GET any hold —
   * which is fine for a status and a clock, and was not fine at all for a
   * caption and a link somebody attached and never paid for.
   */
  describe("an unpaid hold's caption and link", () => {
    async function heldWithContent(): Promise<string> {
      const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
      const attached = await POST_CONTENT(
        await contentRequest({ caption: "Claim your airdrop", link: "https://not-really-us.example/claim" }),
        ctx(held.id),
      );
      expect(attached.status).toBe(200);
      return held.id;
    }

    it("are absent for a caller who proves nothing", async () => {
      const id = await heldWithContent();
      const raw = await (await GET(new Request("http://localhost/"), ctx(id))).text();
      expect(raw).not.toContain("Claim your airdrop");
      expect(raw).not.toContain("not-really-us.example");
      const body = JSON.parse(raw);
      expect(body.status).toBe("reserved");
      expect(body.caption).toBeNull();
      expect(body.link).toBeNull();
      // Everything polling actually needs is still there.
      expect(body.hasContent).toBe(true);
      expect(body.expiresAt).not.toBeNull();
    });

    it("are absent for a caller who proves somebody else's wallet", async () => {
      const id = await heldWithContent();
      const request = new Request("http://localhost/", { headers: { [BUYER_PUBKEY_HEADER]: STRANGER } });
      const body = await (await GET(request, ctx(id))).json();
      expect(body.caption).toBeNull();
      expect(body.link).toBeNull();
    });

    it("come back to the buyer who wrote them, who needs them to finish paying", async () => {
      const id = await heldWithContent();
      const request = new Request("http://localhost/", { headers: { [BUYER_PUBKEY_HEADER]: BUYER } });
      const body = await (await GET(request, ctx(id))).json();
      expect(body.caption).toBe("Claim your airdrop");
      expect(body.link).toBe("https://not-really-us.example/claim");
      // Proving ownership still does not buy a copy of the credential.
      expect(body).not.toHaveProperty("buyerPubkey");
    });

    it("are published to every stranger once the block is paid for", async () => {
      const id = await heldWithContent();
      await execute("UPDATE blocks SET status = 'paid', expires_at = NULL WHERE id = $1", [id]);
      const body = await (await GET(new Request("http://localhost/"), ctx(id))).json();
      expect(body.status).toBe("paid");
      expect(body.caption).toBe("Claim your airdrop");
      expect(body.link).toBe("https://not-really-us.example/claim");
    });
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

  // The caption is optional now. A buyer who leaves it blank gets a block
  // with no caption at all, not one carrying an empty string that would draw
  // an empty chip on the board.
  it("accepts a blank caption and stores it as null", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, BUYER, CALLER);
    const response = await POST_CONTENT(await contentRequest({ caption: "   " }), ctx(held.id));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.hasContent).toBe(true);
    expect(body.caption).toBeNull();
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

/**
 * A wallet the server has never seen, and a second one to be refused with.
 * Generated once per file: the tests below care about which key signed, not
 * about which addresses they are.
 */
const OWNER: TestWallet = testWallet();
const STRANGER_WALLET: TestWallet = testWallet();

type Challenge = { nonce: string; message: string; expiresAt: string };

async function challengeFor(orderId: string): Promise<Challenge> {
  const response = await POST_CHALLENGE(new Request("http://localhost/"), ctx(orderId));
  expect(response.status, "the challenge endpoint should have issued one").toBe(200);
  return (await response.json()) as Challenge;
}

/** The proof body a wallet would build: ask for a challenge, sign it, present it. */
async function proofFor(orderId: string, wallet: TestWallet): Promise<Record<string, string>> {
  const challenge = await challengeFor(orderId);
  return { nonce: challenge.nonce, publicKey: wallet.address, signature: wallet.sign(challenge.message) };
}

describe("POST /api/orders/:id/release-challenge", () => {
  it("issues a fresh single-use challenge naming the order", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, OWNER.address, CALLER);

    const response = await POST_CHALLENGE(new Request("http://localhost/"), ctx(held.id));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(body.message).toContain(`Order: ${held.id}`);
    expect(body.message).toContain(`Nonce: ${body.nonce}`);
    expect(body.message).toContain("Action: release");
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("never issues the same nonce twice", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, OWNER.address, CALLER);
    const first = await challengeFor(held.id);
    const second = await challengeFor(held.id);
    expect(first.nonce).not.toBe(second.nonce);
  });

  it("answers 404 for a non-uuid and for an id that names nothing", async () => {
    expect((await POST_CHALLENGE(new Request("http://localhost/"), ctx("not-a-uuid"))).status).toBe(404);
    const unknown = await POST_CHALLENGE(
      new Request("http://localhost/"),
      ctx("00000000-0000-0000-0000-000000000000"),
    );
    expect(unknown.status).toBe(404);
  });
});

describe("DELETE /api/orders/:id", () => {
  // Takes the WHOLE body rather than a proof, so "no credential at all" is
  // expressible. A defaulted parameter could not say it: passing undefined
  // would silently reinstate the default.
  function releaseRequest(body: unknown): Request {
    return new Request("http://localhost/api/orders/x", {
      method: "DELETE",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify(body),
    });
  }

  async function stillReserved(id: string): Promise<void> {
    const still = await GET(new Request("http://localhost/"), ctx(id));
    expect(still.status, "a refused release must not have cost the owner their hold").toBe(200);
    expect((await still.json()).status).toBe("reserved");
  }

  it("answers 204 to a fresh signature from the owner, and the rectangle is reservable again", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, OWNER.address, CALLER);

    const response = await DELETE(releaseRequest(await proofFor(held.id, OWNER)), ctx(held.id));
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const gone = await GET(new Request("http://localhost/"), ctx(held.id));
    expect(gone.status).toBe(404);

    const again = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, OWNER.address, CALLER);
    expect(again.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });

  it("answers 403 to a different wallet's signature, AND the hold is still there afterwards", async () => {
    // The hole this whole mechanism closes: the buyer's address is public, so
    // before signatures a stranger who could read the board could release
    // anyone's rectangle. Here the stranger signs a perfectly valid challenge
    // for this very order — with their own key.
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, OWNER.address, CALLER);

    const response = await DELETE(releaseRequest(await proofFor(held.id, STRANGER_WALLET)), ctx(held.id));
    expect(response.status).toBe(403);

    // The status code on its own would also be returned by a handler that
    // deleted the row and then refused. Read the row back.
    await stillReserved(held.id);
  });

  it("answers 403 when the stranger sends the owner's address without the owner's key", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, OWNER.address, CALLER);
    const challenge = await challengeFor(held.id);

    const response = await DELETE(
      releaseRequest({
        nonce: challenge.nonce,
        publicKey: OWNER.address,
        signature: STRANGER_WALLET.sign(challenge.message),
      }),
      ctx(held.id),
    );
    expect(response.status).toBe(403);
    await stillReserved(held.id);
  });

  it("refuses a replayed challenge, even the owner's own", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, OWNER.address, CALLER);
    const proof = await proofFor(held.id, OWNER);

    // Same proof, twice. The first release succeeds, so the second is aimed at
    // a fresh hold on the same rectangle: a captured signature must be worth
    // nothing the moment its nonce has been spent.
    expect((await DELETE(releaseRequest(proof), ctx(held.id))).status).toBe(204);

    const again = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, OWNER.address, CALLER);
    const replay = await DELETE(releaseRequest(proof), ctx(again.id));
    expect(replay.status).toBe(403);
    await stillReserved(again.id);
  });

  it("refuses a replayed challenge on the same order when the first attempt failed", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, OWNER.address, CALLER);
    const challenge = await challengeFor(held.id);

    // A fumbled first attempt spends the nonce too, so the owner's own second
    // try with the same nonce is refused rather than accepted.
    const fumbled = await DELETE(
      releaseRequest({ nonce: challenge.nonce, publicKey: OWNER.address, signature: "not-a-signature" }),
      ctx(held.id),
    );
    expect(fumbled.status).toBe(403);

    const retry = await DELETE(
      releaseRequest({
        nonce: challenge.nonce,
        publicKey: OWNER.address,
        signature: OWNER.sign(challenge.message),
      }),
      ctx(held.id),
    );
    expect(retry.status).toBe(403);
    await stillReserved(held.id);
  });

  it("refuses an expired challenge", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, OWNER.address, CALLER);
    const proof = await proofFor(held.id, OWNER);

    // Age the row rather than wait two minutes for it. issued_at moves with
    // expires_at because the table refuses a row that expired before it was
    // issued.
    await execute(
      `UPDATE release_challenges
          SET issued_at = now() - interval '10 minutes',
              expires_at = now() - interval '1 second'
        WHERE nonce = $1`,
      [proof.nonce],
    );

    const response = await DELETE(releaseRequest(proof), ctx(held.id));
    expect(response.status).toBe(403);
    await stillReserved(held.id);
  });

  it("refuses a challenge issued for another order", async () => {
    const mine = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, OWNER.address, CALLER);
    const other = await reserveRect({ x: 40, y: 40, w: 20, h: 20 }, OWNER.address, CALLER);

    // Signed correctly, by the owner of both — but the nonce names `mine`, so
    // it cannot spend `other`. This is what binds a proof to one rectangle.
    const proof = await proofFor(mine.id, OWNER);
    const response = await DELETE(releaseRequest(proof), ctx(other.id));
    expect(response.status).toBe(403);

    await stillReserved(mine.id);
    await stillReserved(other.id);
  });

  it("answers 403 to a body carrying no proof at all", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, OWNER.address, CALLER);
    const bodies: unknown[] = [
      {},
      null,
      { buyerPubkey: OWNER.address },
      { nonce: "a".repeat(64), publicKey: OWNER.address },
      { nonce: "", publicKey: OWNER.address, signature: "x" },
      { nonce: 42, publicKey: OWNER.address, signature: "x" },
    ];
    for (const body of bodies) {
      const response = await DELETE(releaseRequest(body), ctx(held.id));
      expect(response.status, JSON.stringify(body)).toBe(403);
    }
    await stillReserved(held.id);
  });

  it("answers 409 for a paid order, and only to the wallet that can prove it owns it", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 10, h: 10 }, OWNER.address, CALLER);
    await POST_CONTENT(await contentRequest({ buyerPubkey: OWNER.address }), ctx(held.id));
    const paid = await POST_CONFIRM(confirmRequest(OWNER.address), ctx(held.id));
    expect(paid.status).toBe(200);

    // A stranger gets the same 403 they would get on a held rectangle, so the
    // status code never tells them this one is a sale.
    const stranger = await DELETE(releaseRequest(await proofFor(held.id, STRANGER_WALLET)), ctx(held.id));
    expect(stranger.status).toBe(403);

    const response = await DELETE(releaseRequest(await proofFor(held.id, OWNER)), ctx(held.id));
    expect(response.status).toBe(409);

    const survivor = await GET(new Request("http://localhost/"), ctx(held.id));
    expect(survivor.status).toBe(200);
    expect((await survivor.json()).status).toBe("paid");
  });

  it("answers 404 for an id that is not a uuid, rather than 500ing", async () => {
    const response = await DELETE(releaseRequest({}), ctx("not-a-uuid"));
    expect(response.status).toBe(404);
  });

  it("answers 404 for a well-formed id that names nothing", async () => {
    const response = await DELETE(releaseRequest({}), ctx("00000000-0000-0000-0000-000000000000"));
    expect(response.status).toBe(404);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const held = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, OWNER.address, CALLER);
    const response = await DELETE(
      new Request("http://localhost/api/orders/x", { method: "DELETE", body: "not json" }),
      ctx(held.id),
    );
    expect(response.status).toBe(400);
    await stillReserved(held.id);
  });
});

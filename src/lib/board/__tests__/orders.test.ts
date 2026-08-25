import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import * as db from "../../db";
import { execute, query } from "../../db";
import type { ValidatedContent } from "../content";
import {
  OrderExpired,
  OrderNotFound,
  OrderNotReady,
  OrderNotYours,
  SignatureAlreadyUsed,
  attachContent,
  getOrder,
  markPaid,
} from "../orders";
import { reserveRect } from "../reserve";

const BUYER = "BuyerPubkey1111111111111111111111111111111";
const STRANGER = "StrangerPubkey11111111111111111111111111111";
const CALLER = "d".repeat(64);

function content(overrides: Partial<ValidatedContent> = {}): ValidatedContent {
  const bytes = Buffer.from("fake-png-bytes");
  return {
    bytes,
    mime: "image/png",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    isAnimated: false,
    width: 100,
    height: 100,
    link: "https://example.com/",
    caption: "A caption",
    imageFit: "contain",
    ...overrides,
  };
}

async function hold(x = 0, y = 0, w = 10, h = 10) {
  return reserveRect({ x, y, w, h }, BUYER, CALLER);
}

/** Pushes a live hold's expiry into the past without touching anything else. */
async function expire(id: string): Promise<void> {
  await execute("UPDATE blocks SET expires_at = now() - interval '1 minute' WHERE id = $1", [id]);
}

describe("getOrder", () => {
  it("returns null for an id that does not exist", async () => {
    expect(await getOrder("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("returns a reserved order with its expiry and no content", async () => {
    const held = await hold();
    const order = await getOrder(held.id);
    expect(order).not.toBeNull();
    expect(order!.status).toBe("reserved");
    expect(order!.rect).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(order!.buyerPubkey).toBe(BUYER);
    expect(order!.totalBaseUnits).toBe(100_000_000);
    expect(order!.paymentBaseUnits).toBeGreaterThan(order!.totalBaseUnits);
    expect(order!.expiresAt).not.toBeNull();
    expect(order!.hasContent).toBe(false);
    expect(order!.caption).toBeNull();
  });

  it("reports hasContent once content is attached", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    const order = await getOrder(held.id);
    expect(order!.hasContent).toBe(true);
    expect(order!.caption).toBe("A caption");
    expect(order!.link).toBe("https://example.com/");
    expect(order!.imageFit).toBe("contain");
  });
});

describe("attachContent", () => {
  it("stores the bytes, the hash, the mime and the animated flag", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content({ isAnimated: true, mime: "image/gif" }));
    const rows = await query<{
      pending_image: Buffer;
      pending_image_mime: string;
      image_sha256: string;
      is_animated: boolean;
    }>(
      `SELECT pending_image, pending_image_mime, image_sha256, is_animated
         FROM blocks WHERE id = $1`,
      [held.id],
    );
    expect(rows[0].pending_image.toString()).toBe("fake-png-bytes");
    expect(rows[0].pending_image_mime).toBe("image/gif");
    expect(rows[0].image_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].is_animated).toBe(true);
  });

  it("refuses an order that does not exist", async () => {
    await expect(
      attachContent("00000000-0000-0000-0000-000000000000", BUYER, content()),
    ).rejects.toBeInstanceOf(OrderNotFound);
  });

  it("refuses content for an order belonging to a different pubkey", async () => {
    const held = await hold();
    await expect(attachContent(held.id, STRANGER, content())).rejects.toBeInstanceOf(OrderNotYours);
  });

  it("refuses content for an expired hold", async () => {
    const held = await hold();
    await expire(held.id);
    await expect(attachContent(held.id, BUYER, content())).rejects.toBeInstanceOf(OrderExpired);
  });

  it("replaces content when supplied twice before payment", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content({ caption: "First" }));
    await attachContent(held.id, BUYER, content({ caption: "Second" }));
    const order = await getOrder(held.id);
    expect(order!.caption).toBe("Second");
  });

  it("refuses content once the order is paid", async () => {
    // Content is editable right up to payment and never afterwards. This is the
    // line the whole product rests on.
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    await markPaid(held.id, BUYER, "sig-locked");
    await expect(attachContent(held.id, BUYER, content({ caption: "Nope" }))).rejects.toBeInstanceOf(
      OrderNotReady,
    );
  });

  it("throws OrderExpired, not a TypeError, when a concurrent sweep deletes the row after it loads", async () => {
    // A real race: a hold's expiry lands between loadOwnedLiveRow's read and
    // this function's UPDATE, and a concurrent sweep deletes the row in that
    // window. That's not reliably reproducible by timing two real requests
    // against each other, so it's reproduced deterministically here instead:
    // the first `queryOne` call (the load) runs for real, and only the
    // second (the UPDATE) is made to see what a vanished row looks like —
    // exactly what `queryOne` returns for a real concurrent delete.
    const held = await hold();
    const real = db.queryOne;
    let calls = 0;
    const spy = vi.spyOn(db, "queryOne").mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) return null;
      return real(...(args as Parameters<typeof real>));
    });
    try {
      await expect(attachContent(held.id, BUYER, content())).rejects.toBeInstanceOf(OrderExpired);
      expect(calls).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("markPaid", () => {
  it("moves reserved to paid and NULLS the expiry", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    const paid = await markPaid(held.id, BUYER, "sig-1");
    expect(paid.status).toBe("paid");
    expect(paid.expiresAt).toBeNull();

    const rows = await query<{ expires_at: Date | null; status: string }>(
      "SELECT expires_at, status FROM blocks WHERE id = $1",
      [held.id],
    );
    expect(rows[0].status).toBe("paid");
    expect(rows[0].expires_at).toBeNull();
  });

  it("records the payment signature", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    await markPaid(held.id, BUYER, "sig-recorded");
    const rows = await query<{ payment_signature: string }>(
      "SELECT payment_signature FROM blocks WHERE id = $1",
      [held.id],
    );
    expect(rows[0].payment_signature).toBe("sig-recorded");
  });

  it("survives the sweep once paid", async () => {
    // The property the whole retry story rests on: a paid order is never
    // reclaimed, however long the buyer takes from here.
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    await markPaid(held.id, BUYER, "sig-2");

    await execute(
      `DELETE FROM blocks WHERE status = 'reserved' AND (expires_at IS NULL OR expires_at <= now())`,
    );
    const still = await getOrder(held.id);
    expect(still?.status).toBe("paid");
  });

  it("refuses to mark paid an order with no content attached", async () => {
    const held = await hold();
    await expect(markPaid(held.id, BUYER, "sig-3")).rejects.toBeInstanceOf(OrderNotReady);
  });

  it("refuses a signature already used by another order", async () => {
    const a = await hold(0, 0);
    const b = await hold(20, 0);
    await attachContent(a.id, BUYER, content());
    await attachContent(b.id, BUYER, content());
    await markPaid(a.id, BUYER, "sig-shared");
    await expect(markPaid(b.id, BUYER, "sig-shared")).rejects.toBeInstanceOf(SignatureAlreadyUsed);
  });

  it("refuses an order belonging to a different pubkey", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    await expect(markPaid(held.id, STRANGER, "sig-4")).rejects.toBeInstanceOf(OrderNotYours);
  });

  it("refuses an expired hold", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    await expire(held.id);
    await expect(markPaid(held.id, BUYER, "sig-5")).rejects.toBeInstanceOf(OrderExpired);
  });

  it("is idempotent: re-marking with the same signature returns the same order", async () => {
    // The client can retry a confirm that timed out without being told its
    // order is already paid by somebody else.
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    const first = await markPaid(held.id, BUYER, "sig-same");
    const second = await markPaid(held.id, BUYER, "sig-same");
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("paid");
    expect(second.expiresAt).toBeNull();
  });

  it("refuses re-marking a paid order with a DIFFERENT signature", async () => {
    const held = await hold();
    await attachContent(held.id, BUYER, content());
    await markPaid(held.id, BUYER, "sig-first");
    await expect(markPaid(held.id, BUYER, "sig-second")).rejects.toBeInstanceOf(OrderNotReady);
  });

  it("throws OrderExpired, not a TypeError, when a concurrent sweep deletes the row after it loads", async () => {
    // Same race as attachContent's equivalent test above, reproduced the same
    // deterministic way: only the UPDATE's queryOne call is short-circuited
    // to null, simulating the row vanishing between the load and the write.
    const held = await hold();
    await attachContent(held.id, BUYER, content());

    const real = db.queryOne;
    let calls = 0;
    const spy = vi.spyOn(db, "queryOne").mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) return null;
      return real(...(args as Parameters<typeof real>));
    });
    try {
      await expect(markPaid(held.id, BUYER, "sig-vanished")).rejects.toBeInstanceOf(OrderExpired);
      expect(calls).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
});

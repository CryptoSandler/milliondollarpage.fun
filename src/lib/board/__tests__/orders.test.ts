import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import * as db from "../../db";
import { execute, query } from "../../db";
import { boardStats, getBlockDetails, listBoardRects } from "../blocks";
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
  releaseOwnReservation,
} from "../orders";
import { formatPercentSold, formatUsdc } from "../pricing";
import { reserveRect } from "../reserve";
import { approve } from "../review";

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
  return reserveRect({ x, y, w, h }, { chain: "solana", address: BUYER }, CALLER);
}

/** Pushes a live hold's expiry into the past without touching anything else. */
async function expire(id: string): Promise<void> {
  await execute("UPDATE blocks SET expires_at = now() - interval '1 minute' WHERE id = $1", [id]);
}

/**
 * One pixel, one dollar, all the way through.
 *
 * The headline of the whole model, and the case every rule used to forbid: a
 * 10-pixel grid, a 10x10 minimum and a $100 unit each made this purchase
 * impossible on their own. It runs the real path — hold, content, payment —
 * and then reads what the PAGE would draw rather than what the functions
 * returned, because the board renders from `listBoardRects` and `boardStats`
 * and a sale nobody can see is not a sale.
 */
describe("a single pixel, bought end to end", () => {
  it("is held, filled in, paid for, and shows on the board as one pixel for one dollar", async () => {
    const held = await reserveRect({ x: 137, y: 41, w: 1, h: 1 }, { chain: "solana", address: BUYER }, CALLER);
    expect(held.pixels).toBe(1);
    expect(formatUsdc(held.totalBaseUnits)).toBe("$1");

    await attachContent(held.id, BUYER, content());
    const paid = await markPaid(held.id, BUYER, "sig-one-pixel");
    expect(paid.status).toBe("paid");
    // Paid is not painted since migration 018. This test reads what the PAGE
    // would draw, so it takes the second step too — see `review.test.ts` for
    // the queue itself.
    await approve(held.id, "the suite");

    // The row itself: one pixel, a dollar, and no expiry left to sweep.
    const [row] = await query<{
      w: number;
      h: number;
      status: string;
      total_usdc: string;
      expires_at: Date | null;
    }>("SELECT w, h, status, total_usdc::text, expires_at FROM blocks WHERE id = $1", [held.id]);
    expect(row).toMatchObject({ w: 1, h: 1, status: "paid", expires_at: null });
    expect(formatUsdc(Number(row.total_usdc))).toBe("$1");

    // And what a visitor sees: the board draws it, and the counters count it.
    const [drawn] = await listBoardRects();
    expect(drawn).toMatchObject({ x: 137, y: 41, w: 1, h: 1, status: "paid" });
    // The words are not in that list any more — they are fetched for the one
    // rectangle somebody rests on — so this is where a visitor gets them.
    expect((await getBlockDetails(held.id))?.caption).toBe("A caption");

    const stats = await boardStats();
    expect(stats.pixelsSold).toBe(1);
    expect(stats.blocksSold).toBe(1);
    // One millionth of the wall rounds to nothing at two decimals, and the
    // counter is required to say so as a floor rather than as a zero.
    expect(formatPercentSold(stats.percentSold)).toBe("<0.01%");
  });
});

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
    expect(order!.ownerAddress).toBe(BUYER);
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

describe("releaseOwnReservation", () => {
  it("deletes the caller's own hold and puts the rectangle straight back on sale", async () => {
    const held = await hold(0, 0, 20, 20);
    await releaseOwnReservation(held.id, BUYER);

    expect(await getOrder(held.id), "the released row must be gone, not merely marked").toBeNull();

    // The point of the whole feature: those pixels are buyable again at once,
    // not when the sweep would have got to them.
    const again = await reserveRect({ x: 0, y: 0, w: 20, h: 20 }, { chain: "solana", address: BUYER }, CALLER);
    expect(again.rect).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    expect(again.id).not.toBe(held.id);
  });

  it("stops charging the hold the moment it is handed back, and no later", async () => {
    // A buyer who changes their mind pays the minutes they used, not the clock
    // they were given. Read off the ledger row rather than recomputed: the
    // charge must have been cut short, and the row must still be there — a
    // release that DELETED the charge would look identical here and would let
    // an attacker clear their meter by releasing.
    const held = await hold(0, 0, 20, 20);
    await releaseOwnReservation(held.id, BUYER);

    const charges = await query<{ shortened: boolean }>(
      "SELECT charged_until < started_at + interval '1 minute' AS shortened FROM hold_meter WHERE block_id = $1",
      [held.id],
    );
    expect(charges, "the charge must survive the release").toHaveLength(1);
    expect(charges[0].shortened).toBe(true);
  });

  it("REFUSES a different pubkey, AND leaves the row exactly where it was", async () => {
    const held = await hold(0, 0, 20, 20);
    await expect(releaseOwnReservation(held.id, STRANGER)).rejects.toBeInstanceOf(OrderNotYours);

    // Asserting the status alone would pass against a handler that deleted the
    // row and then threw. The row is what matters.
    const survivor = await getOrder(held.id);
    expect(survivor, "a stranger's refusal must not cost the owner their hold").not.toBeNull();
    expect(survivor!.status).toBe("reserved");
    expect(survivor!.ownerAddress).toBe(BUYER);
  });

  it("refuses a PAID order to its own buyer, and the sale survives", async () => {
    const held = await hold(0, 0, 20, 20);
    await attachContent(held.id, BUYER, content());
    await markPaid(held.id, BUYER, "sig-release-paid");

    await expect(releaseOwnReservation(held.id, BUYER)).rejects.toBeInstanceOf(OrderNotReady);

    const survivor = await getOrder(held.id);
    expect(survivor, "a paid block is a sale; nothing may delete it").not.toBeNull();
    expect(survivor!.status).toBe("paid");
  });

  it("refuses a PAID order to a stranger with the same error a reserved one gets", async () => {
    // The status a stranger sees must not depend on what state the order is
    // in, or the refusal itself becomes a way to read somebody else's board.
    const held = await hold(0, 0, 20, 20);
    await attachContent(held.id, BUYER, content());
    await markPaid(held.id, BUYER, "sig-release-paid-stranger");

    await expect(releaseOwnReservation(held.id, STRANGER)).rejects.toBeInstanceOf(OrderNotYours);
    expect(await getOrder(held.id)).not.toBeNull();
  });

  it("refuses an id that names no order", async () => {
    await expect(
      releaseOwnReservation("00000000-0000-0000-0000-000000000000", BUYER),
    ).rejects.toBeInstanceOf(OrderNotFound);
  });

  it("releases an expired hold rather than refusing it — letting go is what expiry does anyway", async () => {
    const held = await hold(0, 0, 20, 20);
    await expire(held.id);
    await releaseOwnReservation(held.id, BUYER);
    expect(await getOrder(held.id)).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { listBoardRects } from "../../../lib/board/blocks";
import { query } from "../../../lib/db";
import { POST as POST_CONFIRM } from "../orders/[id]/confirm/route";
import { POST as POST_CONTENT } from "../orders/[id]/content/route";
import { POST as POST_RESERVE } from "../reserve/route";
import { testWallet } from "../../../lib/wallet/__tests__/keypair";
import { proofFor } from "./proof";
import { approve } from "../../../lib/board/review";

/**
 * The purchase this batch's limits are not allowed to break.
 *
 * A ceiling on held pixels and a budget on pixel-minutes are mitigations right
 * up to the moment they refuse somebody with money. So this drives the largest
 * rectangle the ceiling allows — 100 x 100, ten thousand pixels, $10,000 at
 * list — all the way through hold, content and payment, four times in a row
 * from one address, and every number it checks is read back out of Postgres
 * rather than added up here.
 *
 * FOUR, not one, and that is the part that matters. A hold costs its caller
 * pixel-minutes; a hold that becomes a SALE costs nothing, because
 * `cancelHoldCharge` gives the whole charge back. Without that refund the
 * budget would run out partway through this test, which is exactly the failure
 * mode a limit like this has: it starts by pricing griefers and ends by
 * rationing customers. Forty thousand dollars of buying from one address
 * inside one window must go through untouched.
 */

// Twelve route calls, each several round trips to a remote Neon branch, plus
// four webp encodes.
vi.setConfig({ testTimeout: 90_000 });

// A real keypair: content and payment are signed, so a bare address is only
// half of what those two routes ask for. See ./proof.ts.
const BUYER_WALLET = testWallet();
const BUYER = BUYER_WALLET.address;
const ADDRESS = "203.0.113.180";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** A block 100 pixels on a side stores 400 x 400; solid colour keeps it tiny. */
async function picture(): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 32, g: 96, b: 160 } } })
    .webp({ quality: 80 })
    .toBuffer();
}

async function hold(rect: { x: number; y: number; w: number; h: number }): Promise<Response> {
  return POST_RESERVE(
    new Request("http://localhost/api/reserve", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ADDRESS },
      body: JSON.stringify({ rect, buyerPubkey: BUYER, chain: "solana" }),
    }),
  );
}

async function describeBlock(orderId: string, bytes: Buffer): Promise<Response> {
  const form = new FormData();
  form.set("image", new Blob([new Uint8Array(bytes)], { type: "image/webp" }), "block.webp");
  form.set("link", "https://example.com/a-large-rectangle");
  form.set("caption", "A large rectangle");
  form.set("imageFit", "cover");
  for (const [field, value] of Object.entries(await proofFor(orderId, "attach", BUYER_WALLET))) {
    form.set(field, value);
  }
  const framed = await new Response(form).arrayBuffer();
  return POST_CONTENT(
    new Request("http://localhost/api/orders/x/content", {
      method: "POST",
      headers: { "x-forwarded-for": ADDRESS, "content-length": String(framed.byteLength) },
      body: form,
    }),
    ctx(orderId),
  );
}

async function pay(orderId: string): Promise<Response> {
  const response = await POST_CONFIRM(
    new Request("http://localhost/api/orders/x/confirm", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ADDRESS },
      body: JSON.stringify(await proofFor(orderId, "pay", BUYER_WALLET)),
    }),
    ctx(orderId),
  );
  // Paying and being painted are two events since migration 018, and this file
  // asserts on the board. See `small-purchase.test.ts` for the argument.
  if (response.status === 200) await approve(orderId, "the suite");
  return response;
}

describe("a buyer taking the largest rectangle the ceiling allows", () => {
  it("holds, fills in and pays for four of them in a row without ever being refused", async () => {
    const bytes = await picture();
    const bought: string[] = [];

    for (const x of [0, 100, 200, 300]) {
      const held = await hold({ x, y: 0, w: 100, h: 100 });
      expect(held.status, `the hold at x=${x} must not be refused`).toBe(201);
      const order = await held.json();
      expect(order.pixels).toBe(10_000);

      expect((await describeBlock(order.id, bytes)).status).toBe(200);
      expect((await pay(order.id)).status).toBe(200);
      bought.push(order.id);
    }

    // What the database says was sold, not what the loop above asked for.
    const sold = await query<{ blocks: string; pixels: string; still_expiring: string }>(
      `SELECT COUNT(*)::text AS blocks,
              COALESCE(SUM(w * h), 0)::text AS pixels,
              COUNT(*) FILTER (WHERE expires_at IS NOT NULL)::text AS still_expiring
         FROM blocks
        WHERE status = 'paid'`,
    );
    expect(Number(sold[0].blocks)).toBe(4);
    expect(Number(sold[0].pixels), "$40,000 of wall, bought from one address").toBe(40_000);
    expect(Number(sold[0].still_expiring), "a sale never expires").toBe(0);

    // And the charges those four holds ran up are gone, which is why the
    // fourth purchase was still allowed. Read as "the charge is now zero
    // minutes long", not recomputed from the budget's own arithmetic.
    const outstanding = await query<{ block_id: string }>(
      "SELECT block_id FROM hold_meter WHERE charged_until > started_at",
    );
    expect(outstanding, "paying for a rectangle must clear what holding it cost").toEqual([]);

    const board = await listBoardRects();
    expect(board.map((rect) => rect.id).sort()).toEqual([...bought].sort());
    expect(board.every((rect) => rect.status === "paid")).toBe(true);
  });
});

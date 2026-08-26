import { execute, isUniqueViolation, queryOne, violatedConstraint } from "../db";
import { publishesText } from "./block-image";
import type { ValidatedContent } from "./content";
import type { Rect } from "./geometry";

/**
 * The order's state machine: reserved -> paid.
 *
 * Every mutating function here loads the row first and throws in a fixed
 * order — OrderNotFound, then OrderNotYours, then OrderExpired, then the
 * operation's own precondition — regardless of which check would fail first
 * some other way. A stranger who does not own an order must see the exact
 * same error whether that order exists-but-isn't-theirs or exists-but-has-
 * expired; leaking that distinction would let them learn about somebody
 * else's hold without ever owning it.
 *
 * `markPaid`'s UPDATE sets status='paid' and expires_at=NULL in the same
 * statement on purpose: the blocks_paid_never_expires CHECK added in the
 * orders migration rejects a statement that sets one without the other, and
 * that CHECK is what makes a paid order immune to the reservation sweep.
 */

export type OrderStatus = "reserved" | "paid";

export type Order = {
  id: string;
  rect: Rect;
  status: OrderStatus;
  buyerPubkey: string;
  pricePerPixelBaseUnits: number;
  totalBaseUnits: number;
  paymentBaseUnits: number;
  expiresAt: string | null;
  hasContent: boolean;
  caption: string | null;
  link: string | null;
  imageFit: "contain" | "cover" | null;
  isAnimated: boolean;
};

export class OrderNotFound extends Error {
  constructor() {
    super("That order does not exist.");
    this.name = "OrderNotFound";
  }
}

export class OrderNotYours extends Error {
  constructor() {
    super("That order does not belong to you.");
    this.name = "OrderNotYours";
  }
}

export class OrderExpired extends Error {
  constructor() {
    super("That hold has expired.");
    this.name = "OrderExpired";
  }
}

export class OrderNotReady extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderNotReady";
  }
}

export class SignatureAlreadyUsed extends Error {
  constructor() {
    super("That payment signature has already been used by another order.");
    this.name = "SignatureAlreadyUsed";
  }
}

type OrderRow = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  status: string;
  buyer_pubkey: string;
  price_per_pixel_usdc: string;
  total_usdc: string;
  payment_fraction: number | null;
  payment_signature: string | null;
  expires_at: Date | null;
  has_content: boolean;
  caption: string | null;
  link: string | null;
  image_fit: string | null;
  is_animated: boolean;
};

// `pending_image` itself is never selected here: it is up to 100 KiB of
// bytes that no reader of an `Order` ever needs, only whether it is set. The
// boolean is computed in SQL instead of dragging the bytes out of Neon on
// every order read just to throw them away in `toOrder`.
const ORDER_COLUMNS = `id, x, y, w, h, status, buyer_pubkey, price_per_pixel_usdc, total_usdc,
       payment_fraction, payment_signature, expires_at,
       pending_image IS NOT NULL AS has_content, caption, link,
       image_fit, is_animated`;

function toOrder(row: OrderRow): Order {
  const total = Number(row.total_usdc);
  const fraction = row.payment_fraction ?? 0;
  return {
    id: row.id,
    rect: { x: row.x, y: row.y, w: row.w, h: row.h },
    // A `removed` or `minted` row is out of scope for this batch: it is
    // returned as-is rather than invented into one of the two statuses this
    // module knows about.
    status: row.status as OrderStatus,
    buyerPubkey: row.buyer_pubkey,
    pricePerPixelBaseUnits: Number(row.price_per_pixel_usdc),
    totalBaseUnits: total,
    paymentBaseUnits: total + fraction,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    hasContent: row.has_content,
    caption: row.caption,
    link: row.link,
    imageFit: row.image_fit as "contain" | "cover" | null,
    isAnimated: row.is_animated,
  };
}

async function loadRow(id: string): Promise<OrderRow | null> {
  return queryOne<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM blocks WHERE id = $1`, [id]);
}

/**
 * Loads a row and checks ownership and expiry, in that order, for every
 * mutating function below. Returning the raw row (not `Order`) lets each
 * caller apply its own remaining precondition against fields this shared
 * check does not know about (e.g. whether content is attached).
 */
async function loadOwnedLiveRow(id: string, buyerPubkey: string): Promise<OrderRow> {
  const row = await loadRow(id);
  if (!row) throw new OrderNotFound();
  if (row.buyer_pubkey !== buyerPubkey) throw new OrderNotYours();
  if (row.status === "reserved" && row.expires_at !== null && row.expires_at <= new Date()) {
    throw new OrderExpired();
  }
  return row;
}

export async function getOrder(id: string): Promise<Order | null> {
  const row = await loadRow(id);
  return row ? toOrder(row) : null;
}

/** An `Order` with everything a route may safely hand back to any caller. */
export type PublicOrder = Omit<Order, "buyerPubkey">;

/**
 * Strips `buyerPubkey` — and anyone else's unpaid words — before an `Order`
 * leaves this module for an HTTP response.
 *
 * `buyerPubkey` is the one thing every ownership check in this file compares
 * against — the whole reason `/content` and `/confirm` can trust a caller is
 * that only the real buyer is supposed to know it. `/board` already publishes
 * every live block's id, so an `Order` returned with its `buyerPubkey` intact
 * would let anyone chain "read the board" -> "GET this order" -> "POST
 * content as its buyer" and overwrite a stranger's hold. Every route that
 * returns an `Order` must send this, never the `Order` itself.
 *
 * `viewer` is the pubkey the caller proved, or null for a caller who proved
 * nothing — and it is REQUIRED rather than defaulted, so a new route has to
 * say which it is instead of quietly getting the wrong one. It decides only
 * the caption and the link: `publishesText` says a hold's words are not
 * public (see block-image.ts — a reservation is free, and a free phishing
 * link served to every visitor is what that rule exists to stop), and the
 * buyer of that hold is the one person it does not apply to. They wrote the
 * text and they need it back to finish the purchase.
 *
 * The comparison is the same `!==` on the same column every mutating
 * function here uses. Nothing else on an order is hidden: a stranger polling
 * a hold's status still learns its rectangle, its price and its clock, which
 * `/board` publishes anyway.
 */
export function toPublicOrder(order: Order, viewer: string | null): PublicOrder {
  const yours = viewer !== null && viewer === order.buyerPubkey;
  const showText = yours || publishesText(order.status);
  return {
    id: order.id,
    rect: order.rect,
    status: order.status,
    pricePerPixelBaseUnits: order.pricePerPixelBaseUnits,
    totalBaseUnits: order.totalBaseUnits,
    paymentBaseUnits: order.paymentBaseUnits,
    expiresAt: order.expiresAt,
    hasContent: order.hasContent,
    caption: showText ? order.caption : null,
    link: showText ? order.link : null,
    imageFit: order.imageFit,
    isAnimated: order.isAnimated,
  };
}

export async function attachContent(
  id: string,
  buyerPubkey: string,
  content: ValidatedContent,
): Promise<Order> {
  const row = await loadOwnedLiveRow(id, buyerPubkey);
  if (row.status !== "reserved") {
    throw new OrderNotReady("Content can only be attached before payment.");
  }

  const updated = await queryOne<OrderRow>(
    `UPDATE blocks
        SET pending_image = $2,
            pending_image_mime = $3,
            image_sha256 = $4,
            is_animated = $5,
            caption = $6,
            link = $7,
            image_fit = $8
      WHERE id = $1
      RETURNING ${ORDER_COLUMNS}`,
    [
      id,
      content.bytes,
      content.mime,
      content.sha256,
      content.isAnimated,
      content.caption,
      content.link,
      content.imageFit,
    ],
  );
  // The row existed a moment ago in loadOwnedLiveRow, but a concurrent sweep
  // can delete a reserved row between that read and this UPDATE — reachable
  // whenever a hold's expiry lands mid-request. That is not a server error;
  // it is the same OrderExpired a request arriving a few milliseconds later
  // would have gotten straight from loadOwnedLiveRow.
  if (!updated) throw new OrderExpired();
  return toOrder(updated);
}

export async function markPaid(id: string, buyerPubkey: string, signature: string): Promise<Order> {
  const row = await loadOwnedLiveRow(id, buyerPubkey);

  if (row.status === "paid") {
    if (row.payment_signature === signature) return toOrder(row);
    throw new OrderNotReady("This order has already been paid with a different signature.");
  }

  if (!row.has_content) {
    throw new OrderNotReady("Content must be attached before an order can be paid.");
  }

  try {
    const updated = await queryOne<OrderRow>(
      `UPDATE blocks
          SET status = 'paid',
              expires_at = NULL,
              payment_signature = $2
        WHERE id = $1
        RETURNING ${ORDER_COLUMNS}`,
      [id, signature],
    );
    // Same race as attachContent above: the row can vanish between
    // loadOwnedLiveRow's read and this UPDATE if a hold expires mid-request.
    if (!updated) throw new OrderExpired();
    return toOrder(updated);
  } catch (error) {
    if (isUniqueViolation(error) && violatedConstraint(error) === "blocks_payment_signature_unique") {
      throw new SignatureAlreadyUsed();
    }
    throw error;
  }
}

const RELEASE_REFUSED =
  "These pixels are paid for and permanently yours, so there is no hold left to let go of.";

/**
 * Give a held rectangle back before the thirty minutes are up.
 *
 * This is the only function in this file that DELETES, which makes it the
 * most dangerous one here, so it is written to be safe twice over.
 *
 * The checks run in the same fixed order every other mutating function uses —
 * OrderNotFound, then OrderNotYours, then the operation's own precondition —
 * and for the same reason: a stranger poking at ids must not be able to tell
 * "that order does not exist" from "that order exists, is somebody else's,
 * and is already paid". They get 404 for the first and 403 for both of the
 * others, and learn nothing either way.
 *
 * Then the DELETE repeats both preconditions in its own WHERE clause. The
 * read above is not a lock: between it and this statement the order can be
 * paid by the buyer's other tab, or swept for expiry. Without `status =
 * 'reserved'` in the WHERE, that race would delete a PAID block — a sale,
 * permanent, with money against it. The CHECK constraints in the orders
 * migration cannot help here, because a DELETE violates none of them. So the
 * statement itself refuses, and a paid order is undeletable rather than
 * merely discouraged from being deleted.
 *
 * Expiry is deliberately NOT a refusal. `loadOwnedLiveRow` throws
 * OrderExpired, which is right when a buyer is trying to *do* something with
 * a hold; here they are trying to get rid of one, and an expired hold is
 * already what they asked for. It is still deleted rather than left for the
 * sweep.
 */
export async function releaseOwnReservation(id: string, buyerPubkey: string): Promise<void> {
  const row = await loadRow(id);
  if (!row) throw new OrderNotFound();
  if (row.buyer_pubkey !== buyerPubkey) throw new OrderNotYours();
  if (row.status !== "reserved") throw new OrderNotReady(RELEASE_REFUSED);

  const deleted = await execute(
    "DELETE FROM blocks WHERE id = $1 AND buyer_pubkey = $2 AND status = 'reserved'",
    [id, buyerPubkey],
  );
  if (deleted === 1) return;

  // Zero rows means the statement's own guard fired: something changed
  // between the read and the delete. Only the real owner can get this far, so
  // classifying it costs nothing — the row is either gone (a concurrent sweep
  // or a second release, and the caller got what they wanted) or no longer a
  // reservation (paid in another tab, and it must stay).
  const after = await loadRow(id);
  if (!after) throw new OrderNotFound();
  throw new OrderNotReady(RELEASE_REFUSED);
}


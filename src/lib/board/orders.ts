import { execute, isUniqueViolation, queryOne, violatedConstraint } from "../db";
import { cancelHoldCharge, endHoldCharge } from "../callers/hold-meter";
import { publishesText } from "./block-image";
import type { ValidatedContent } from "./content";
import type { Rect } from "./geometry";
import type { OwnerChain } from "./owner";
import { USDG, robinhoodRailEnabled, treasuryAddress } from "../payments/usdg";

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
 *
 * BOTH ENDINGS SETTLE THE HOLD'S CHARGE. A hold costs its caller pixel-minutes
 * against the budget in `../callers/limits.ts`, and the two ways a hold ends
 * before its clock does are here: a sale, which costs nothing, and a release,
 * which costs the minutes it actually used. See `settleQuietly` at the foot of
 * this file for why neither one is allowed to fail the request it rides on.
 */

export type OrderStatus = "reserved" | "paid";

export type Order = {
  id: string;
  rect: Rect;
  status: OrderStatus;
  ownerAddress: string;
  ownerChain: OwnerChain;
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
  owner_address: string;
  owner_chain: string;
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
const ORDER_COLUMNS = `id, x, y, w, h, status, owner_address, owner_chain, price_per_pixel_usdc, total_usdc,
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
    ownerAddress: row.owner_address,
    ownerChain: row.owner_chain as OwnerChain,
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
async function loadOwnedLiveRow(id: string, ownerAddress: string): Promise<OrderRow> {
  const row = await loadRow(id);
  if (!row) throw new OrderNotFound();
  if (row.owner_address !== ownerAddress) throw new OrderNotYours();
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
export type PublicOrder = Omit<Order, "ownerAddress" | "paymentBaseUnits">;

/**
 * A `PublicOrder` plus the one number only its buyer may have.
 *
 * Returned exclusively by the two routes that verified a signature over a
 * single-use challenge before they wrote anything — `/content` and `/confirm`
 * — so the amount reaches the wallet that proved the key and nothing else.
 */
export type ProvenOrder = PublicOrder & {
  paymentBaseUnits: number;
  /**
   * Where to send it, and in what — present only for a Robinhood order while
   * the rail is on, and null otherwise.
   *
   * IT TRAVELS THE SAME ROAD AS THE FRACTION, and for the same reason turned
   * around. `paymentBaseUnits` is withheld from the public order because it
   * would let a stranger watch the treasury and learn who bought what; the
   * treasury address is withheld from `/api/status` because a status page that
   * publishes an operator's configuration is a habit worth not having. Neither
   * is a secret — both are on a public chain the moment anybody pays — so both
   * are handed to the ONE caller who has proved they own this order and needs
   * them to finish paying.
   *
   * A browser that built the transfer from its own copy of the address would be
   * a second place the treasury is written down, and the failure mode of two
   * copies disagreeing is buyers paying a wallet nobody holds.
   */
  payTo: string | null;
  /** The token contract to call `transfer` on. Null with `payTo`. */
  payToken: string | null;
  /** The chain the wallet must be on before it signs. Null with `payTo`. */
  payChainId: number | null;
};

/**
 * Strips `buyerPubkey`, the payable amount, and anyone else's unpaid words
 * before an `Order` leaves this module for an HTTP response.
 *
 * `buyerPubkey` was, until the signed routes landed, the whole credential this
 * codebase had. It is no longer trusted on its own anywhere, and it is still
 * not published: an address is what an ownership check compares against, and
 * handing it out invites the next reader to build a check that trusts it.
 *
 * `paymentBaseUnits` is the total plus this order's unique payment fraction,
 * and the fraction is the attribution key — it is what will let the payment
 * verifier say which order an incoming transfer settled (`reserve.ts`). A
 * stranger who can read that number off `GET /api/orders/:id` can watch the
 * treasury for a transfer of exactly that amount and learn the pair (order id,
 * payer pubkey) from a public chain. That pair used to BE the credential for
 * `/content`; it no longer is, and this stays withheld anyway, because the
 * pairing is a fact about a buyer that nothing on this site needs to publish.
 * The buyer's own client gets it from `toProvenOrder` below.
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
  const yours = viewer !== null && viewer === order.ownerAddress;
  const showText = yours || publishesText(order.status);
  return {
    id: order.id,
    rect: order.rect,
    status: order.status,
    // The CHAIN is public and the address is not: a reader of `/b/<id>` is told
    // which chain a rectangle was bought on — see `DECISIONS.md` on why that is
    // not a step towards naming anybody — while the address stays behind the
    // same door it always has.
    ownerChain: order.ownerChain,
    pricePerPixelBaseUnits: order.pricePerPixelBaseUnits,
    totalBaseUnits: order.totalBaseUnits,
    expiresAt: order.expiresAt,
    hasContent: order.hasContent,
    caption: showText ? order.caption : null,
    link: showText ? order.link : null,
    imageFit: order.imageFit,
    isAnimated: order.isAnimated,
  };
}

/**
 * The same order, with the payable amount, for a caller who has just proved
 * they hold the key it belongs to.
 *
 * Its two callers are `/content` and `/confirm`, and both reach it on the far
 * side of `consumeChallenge` returning this order's own `buyerPubkey` — a
 * signature over a single-use nonce, not an address somebody typed. Neither
 * route could assemble this itself without restating what `toPublicOrder`
 * withholds and why, which is the copy that would be edited in one place and
 * not the other.
 *
 * It takes no `viewer`: there is exactly one caller this is ever correct for,
 * and passing the order's own buyer says that at the callsite rather than
 * leaving a second route free to hand a stranger the amount by passing null.
 */
export function toProvenOrder(order: Order): ProvenOrder {
  /*
    THE RAIL DECIDES, AND IT DECIDES OFF THE ORDER'S OWN CHAIN. A Solana order
    gets nulls because there is no Solana rail to point it at; a Robinhood order
    gets nulls too while the flag is off, which is what makes "the rail is
    switched off" a fact the interface can see rather than a request that fails
    at the end.
  */
  const onRail = order.ownerChain === "robinhood" && robinhoodRailEnabled();
  return {
    ...toPublicOrder(order, order.ownerAddress),
    paymentBaseUnits: order.paymentBaseUnits,
    payTo: onRail ? treasuryAddress() : null,
    payToken: onRail ? USDG.address : null,
    payChainId: onRail ? USDG.chainId : null,
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
      WHERE id = $1 AND status = 'reserved'
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
    // The hold became a sale, so it never cost anything. Refunding the whole
    // charge is what keeps the budget from taxing the one outcome it exists
    // to protect.
    await settleQuietly(() => cancelHoldCharge(id), "cancel");
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
 * Give a held rectangle back before its clock runs out.
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
  if (row.owner_address !== buyerPubkey) throw new OrderNotYours();
  if (row.status !== "reserved") throw new OrderNotReady(RELEASE_REFUSED);

  const deleted = await execute(
    "DELETE FROM blocks WHERE id = $1 AND owner_address = $2 AND status = 'reserved'",
    [id, buyerPubkey],
  );
  if (deleted === 1) {
    // Charged for the minutes it was actually held, not for the clock it was
    // given. AFTER the DELETE, never before: a charge cut short for a hold
    // that then turned out to still be standing would hand the caller back
    // budget for pixels they still have.
    await settleQuietly(() => endHoldCharge(id), "end");
    return;
  }

  // Zero rows means the statement's own guard fired: something changed
  // between the read and the delete. Only the real owner can get this far, so
  // classifying it costs nothing — the row is either gone (a concurrent sweep
  // or a second release, and the caller got what they wanted) or no longer a
  // reservation (paid in another tab, and it must stay).
  const after = await loadRow(id);
  if (!after) throw new OrderNotFound();
  throw new OrderNotReady(RELEASE_REFUSED);
}


/**
 * Settles a hold's charge without ever failing the request it rides on.
 *
 * The two callers above have both just written the thing that matters — a
 * payment, or a release — and the meter is bookkeeping that follows it. If the
 * meter write fails, the caller keeps a charge they should not have kept: an
 * allowance slightly smaller than it ought to be for at most one window. That
 * is the safe direction. Throwing instead would report a completed payment as
 * a failure, and that is not.
 *
 * It is logged rather than swallowed silently, because a meter that is
 * persistently failing is a limit slowly turning into a lockout for real
 * buyers, and the log is the only place that would show.
 */
async function settleQuietly(work: () => Promise<void>, what: string): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(`hold meter: failed to ${what} a charge:`, error);
  }
}

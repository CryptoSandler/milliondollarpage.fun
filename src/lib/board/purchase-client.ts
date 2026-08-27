import type { ContentRejection } from "./content";
import type { Rect } from "./geometry";
import type { PublicOrder } from "./orders";

/**
 * The browser side of the four order endpoints.
 *
 * Every export here does one thing: turn a `fetch` outcome into
 * `{ ok: true; order } | { ok: false; status; message; rejections?; retryAt? }`
 * and never let a rejected promise escape. `problem()` on the server (see
 * `src/lib/http.ts`) already guarantees `message` is safe to render as-is, so
 * nothing here re-derives or rewrites it.
 *
 * `PublicOrder` and `Rect` are imported with `import type` only: both are
 * erased at compile time, so this module never pulls `../db` (which
 * `orders.ts` imports) into a client bundle. That is deliberate — this file
 * is consumed by "use client" components, and `../db` opens a real `pg`
 * connection at module scope.
 *
 * `ClientOrder` is `PublicOrder`, not `Order`: the server never sends a
 * buyer's pubkey back over the wire (see `toPublicOrder` in `orders.ts`), and
 * this type says so at compile time rather than a caller finding out by
 * reading `undefined` off a field that used to be there.
 */

export type ClientOrder = PublicOrder;

/**
 * The header a buyer proves a hold is theirs with, on a GET.
 *
 * A HEADER and not a query string, for the same reason `releaseHold` puts the
 * pubkey in a DELETE body: it is the only credential this codebase has, and a
 * URL ends up in access logs, in `Referer`, and in a browser's own history.
 *
 * It lives in this file — imported by `src/app/api/orders/[id]/route.ts`,
 * which reads it — because this is the one module describing these four
 * endpoints that pulls in neither `pg` nor a node built-in, so both halves of
 * the wire can share one spelling of it instead of two literals that agree
 * until somebody edits one.
 *
 * Sending it is optional. Without it a caller is a stranger and simply gets a
 * stranger's view — no 400, no 403. Polling a hold's status must keep working
 * for anyone who has the id.
 */
export const BUYER_PUBKEY_HEADER = "x-buyer-pubkey";

export type ClientFailure = {
  ok: false;
  status: number;
  message: string;
  rejections?: ContentRejection[];
  retryAt?: string;
  /**
   * On a 409 from `/reserve`: the ids of blocking holds that belong to THIS
   * buyer. Only ever their own — the server puts nobody else's row in here
   * (see RectangleTaken in reserve.ts) — so a client may offer to release
   * every id it finds without ever having learned anything about anyone else.
   */
  yourOrderIds?: string[];
};

export type ClientResult = { ok: true; order: ClientOrder } | ClientFailure;

const NETWORK_FAILURE_MESSAGE = "Could not reach the server. Check your connection and try again.";

// The shape POST /api/reserve actually returns (see reserveRect in
// reserve.ts): a reservation, not a full Order. It carries everything an
// Order does except status, ownership-independent fields, and content —
// none of which exist yet the instant a hold is created. reservationToOrder
// below fills those in with the values a brand-new hold always has, so every
// exported function here settles on the one ClientOrder shape rather than
// making every caller branch on which endpoint it came from.
type Reservation = {
  id: string;
  rect: Rect;
  pixels: number;
  pricePerPixelBaseUnits: number;
  totalBaseUnits: number;
  paymentBaseUnits: number;
  expiresAt: string;
};

function reservationToOrder(reservation: Reservation): ClientOrder {
  return {
    id: reservation.id,
    rect: reservation.rect,
    status: "reserved",
    pricePerPixelBaseUnits: reservation.pricePerPixelBaseUnits,
    totalBaseUnits: reservation.totalBaseUnits,
    paymentBaseUnits: reservation.paymentBaseUnits,
    expiresAt: reservation.expiresAt,
    hasContent: false,
    caption: null,
    link: null,
    imageFit: null,
    isAnimated: false,
  };
}

/**
 * Runs one request and maps its outcome. `toOrder` lets `createHold` turn a
 * reservation into an order shape; every other caller leaves it as the
 * identity, since their endpoints already return a full order.
 */
async function send(
  perform: () => Promise<Response>,
  toOrder: (body: unknown) => ClientOrder = (body) => body as ClientOrder,
): Promise<ClientResult> {
  let response: Response;
  try {
    response = await perform();
  } catch {
    return { ok: false, status: 0, message: NETWORK_FAILURE_MESSAGE };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok) {
    return { ok: true, order: toOrder(body) };
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const message = typeof record.message === "string" ? record.message : "Something went wrong. Please try again.";
  const failure: ClientFailure = { ok: false, status: response.status, message };
  if (Array.isArray(record.rejections)) failure.rejections = record.rejections as ContentRejection[];
  if (typeof record.retryAt === "string") failure.retryAt = record.retryAt;
  if (Array.isArray(record.yourOrderIds)) {
    failure.yourOrderIds = record.yourOrderIds.filter((id): id is string => typeof id === "string");
  }
  return failure;
}

/**
 * Holds a rectangle. 201 on success, 400/409/429 otherwise.
 *
 * A 201 whose `id` the caller has seen before is a RESUMED hold, not a new
 * one: the server hands an existing order back in the same shape rather than
 * refusing a buyer their own pixels. Nothing on the wire marks it, and nothing
 * needs to — the only party who can tell is the one who already knows the id,
 * which is exactly the property that keeps this out of a stranger's reach.
 */
export function createHold(rect: Rect, buyerPubkey: string): Promise<ClientResult> {
  return send(
    () =>
      fetch("/api/reserve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rect, buyerPubkey }),
      }),
    (body) => reservationToOrder(body as Reservation),
  );
}

/**
 * An order's current state, for polling a hold or a confirmation screen.
 *
 * `buyerPubkey` is optional and only ever widens the answer: a hold that has
 * not been paid for publishes no caption and no link to anybody but the buyer
 * who wrote them, so a caller who has one sends it and gets their own words
 * back. A caller who has none still gets the status, the rectangle and the
 * clock, which is all polling needs.
 */
export function fetchOrder(orderId: string, buyerPubkey?: string): Promise<ClientResult> {
  const headers = buyerPubkey ? { [BUYER_PUBKEY_HEADER]: buyerPubkey } : undefined;
  return send(() => fetch(`/api/orders/${orderId}`, { headers }));
}

/**
 * Attaches an image, link and caption to a held order. `form` is built by the
 * caller (it must include `buyerPubkey`, `image`, `link`, `caption` and
 * `imageFit`) so this module stays request/response mapping and does not
 * also own form assembly.
 */
export function submitContent(orderId: string, form: FormData): Promise<ClientResult> {
  return send(() => fetch(`/api/orders/${orderId}/content`, { method: "POST", body: form }));
}

/** Confirms payment via the batch-3 payment stub. */
export function confirmOrder(orderId: string, buyerPubkey: string): Promise<ClientResult> {
  return send(() =>
    fetch(`/api/orders/${orderId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ buyerPubkey }),
    }),
  );
}

/** A release either happened or it didn't; there is no order left to describe. */
export type ReleaseResult = { ok: true } | ClientFailure;

/**
 * Shows the buyer a sentence and hands back what their wallet signed.
 *
 * The message is built by the server (see `src/lib/wallet/signature.ts`) and
 * passed through untouched: a client that reassembled the format would be a
 * second copy of it, free to drift from the one the verifier uses.
 */
export type ReleaseSigner = (message: string) => Promise<{ publicKey: string; signature: string }>;

/**
 * The wallet that would sign a release. There isn't one.
 *
 * A function rather than a constant so nothing narrows it to `null` at the
 * point of use, and so wiring a real adapter in later is an edit to one
 * return statement rather than a hunt through the dialog.
 *
 * `buyerPubkey` in this app is a string somebody typed into a field. Nothing
 * in the browser holds the key behind it, so nothing in the browser can sign
 * anything, and `releaseHold` says so rather than sending a request the
 * server will rightly refuse. See DESIGN.md for what the buyer is told.
 */
export function releaseSigner(): ReleaseSigner | null {
  return null;
}

const NO_WALLET_MESSAGE =
  "Letting a hold go has to be signed by the wallet that started it, and there is no wallet " +
  "connected to this page yet.";

/** Reads `problem()`'s body off a failed response, falling back to `fallback`. */
async function failureFrom(response: Response, fallback: string): Promise<ClientFailure> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  return {
    ok: false,
    status: response.status,
    message: typeof record.message === "string" ? record.message : fallback,
  };
}

const RELEASE_FALLBACK = "That hold could not be let go.";

type IssuedChallenge = { nonce: string; message: string };

/**
 * Hands a hold back before its clock runs out.
 *
 * Two requests, because releasing is now something you prove rather than
 * something you claim: ask `/release-challenge` for a single-use sentence,
 * have the wallet sign it, and present nonce + address + signature to the
 * DELETE. The address used to travel on its own, which authenticated nobody —
 * a wallet address is public, so anyone who could read the board could
 * release anyone's rectangle.
 *
 * Its own function rather than another `send` call: the endpoint answers 204
 * with no body, and `send` exists to turn a body into a `ClientOrder`. Forcing
 * this through it would mean inventing an order that no longer exists.
 *
 * Like everything else here, every failure comes back as `ok: false` rather
 * than a rejected promise — a network error, a refused signature, and no
 * wallet at all included — so a caller never has to wrap it in a try/catch to
 * keep a button from getting stuck. `release-outcome.ts` turns what comes
 * back into what the buyer is told.
 */
export async function releaseHold(
  orderId: string,
  sign: ReleaseSigner | null,
): Promise<ReleaseResult> {
  if (!sign) return { ok: false, status: 0, message: NO_WALLET_MESSAGE };

  let issued: Response;
  try {
    issued = await fetch(`/api/orders/${orderId}/release-challenge`, { method: "POST" });
  } catch {
    return { ok: false, status: 0, message: NETWORK_FAILURE_MESSAGE };
  }
  if (!issued.ok) return failureFrom(issued, RELEASE_FALLBACK);

  let challenge: IssuedChallenge;
  try {
    challenge = (await issued.json()) as IssuedChallenge;
  } catch {
    return { ok: false, status: 0, message: RELEASE_FALLBACK };
  }

  let signed: { publicKey: string; signature: string };
  try {
    signed = await sign(challenge.message);
  } catch {
    // A wallet throws when the person says no. That is an answer, not a fault.
    return {
      ok: false,
      status: 0,
      message: "That signature was not given, so the hold was left exactly as it was.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`/api/orders/${orderId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nonce: challenge.nonce, ...signed }),
    });
  } catch {
    return { ok: false, status: 0, message: NETWORK_FAILURE_MESSAGE };
  }

  if (response.ok) return { ok: true };
  return failureFrom(response, RELEASE_FALLBACK);
}

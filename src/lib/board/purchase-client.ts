import type { ContentRejection } from "./content";
import type { Rect } from "./geometry";
import type { ProvenOrder, PublicOrder } from "./orders";
import type { ChallengeAction } from "../wallet/signature";

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
 * `ClientOrder` is built from `PublicOrder`, not from `Order`: the server
 * never sends a buyer's pubkey back over the wire (see `toPublicOrder` in
 * `orders.ts`), and this type says so at compile time rather than a caller
 * finding out by reading `undefined` off a field that used to be there.
 */

/**
 * An order as this browser holds it.
 *
 * `paymentBaseUnits` is OPTIONAL, and the `?` is the wire contract rather than
 * an oversight. The amount is only ever sent to a caller who proved the key —
 * the reservation this browser created, and the two signed responses — so a
 * poll of `GET /api/orders/:id` comes back without it (see `toPublicOrder`).
 * Anything that comes to need it has to handle its absence, which is exactly
 * the situation a stranger's view puts it in.
 */
export type ClientOrder = PublicOrder & Partial<Pick<ProvenOrder, "paymentBaseUnits">>;

/**
 * The header a buyer proves a hold is theirs with, on a GET.
 *
 * A HEADER and not a query string, for the same reason `releaseHold` puts its
 * proof in a DELETE body: a URL ends up in access logs, in `Referer`, and in a
 * browser's own history. Unlike that proof this header is a claim and nothing
 * more, which is why the only thing it unlocks is the caption and link the
 * caller wrote themselves.
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

const ATTACH_FALLBACK = "That content could not be attached.";
const PAY_FALLBACK = "That order could not be settled.";

/**
 * Attaches an image, link and caption to a held order.
 *
 * `form` is built by the caller (it must include `image`, `link`, `caption`
 * and `imageFit`) so this module stays request/response mapping and does not
 * also own form assembly. The proof is NOT the caller's to assemble: the three
 * fields below are added here, from a challenge this function asked for and
 * the wallet signed, because what the buyer is shown before they sign is a
 * sentence about attaching content and a form that could name its own act
 * would be a form that could ask for a signature over something else.
 *
 * `buyerPubkey` used to be one of those fields, and it authenticated nobody:
 * an address is public, so a stranger who knew it could write their own
 * picture and link onto a hold moments before its buyer paid — permanently,
 * because content on a paid block can never be edited.
 */
export async function submitContent(
  orderId: string,
  form: FormData,
  sign: WalletSigner | null,
): Promise<ClientResult> {
  const proven = await prove(orderId, "attach", sign, ATTACH_FALLBACK);
  if (!proven.ok) return proven;

  form.set("nonce", proven.proof.nonce);
  form.set("publicKey", proven.proof.publicKey);
  form.set("signature", proven.proof.signature);

  return send(() => fetch(`/api/orders/${orderId}/content`, { method: "POST", body: form }));
}

/**
 * Confirms payment via the batch-3 payment stub, signed the same way.
 *
 * The signature is the buyer saying "settle this order", and it is what the
 * server checks before it marks anything paid. When the on-chain half lands
 * this call does not change shape: the transfer is read from the chain, and
 * this proof is still what says the wallet asked for it.
 */
export async function confirmOrder(orderId: string, sign: WalletSigner | null): Promise<ClientResult> {
  const proven = await prove(orderId, "pay", sign, PAY_FALLBACK);
  if (!proven.ok) return proven;

  return send(() =>
    fetch(`/api/orders/${orderId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proven.proof),
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
export type WalletSigner = (message: string) => Promise<{ publicKey: string; signature: string }>;

/**
 * The wallet that would sign. There isn't one.
 *
 * A function rather than a constant so nothing narrows it to `null` at the
 * point of use, and so wiring a real adapter in later is an edit to one
 * return statement rather than a hunt through the dialog.
 *
 * `buyerPubkey` in this app is a string somebody typed into a field. Nothing
 * in the browser holds the key behind it, so nothing in the browser can sign
 * anything, and every call below that needs a signature says so rather than
 * sending a request the server will rightly refuse. It was `releaseSigner`
 * when letting a hold go was the only signed step; attaching content and
 * settling an order are signed now too. See DESIGN.md for what the buyer is
 * told while there is nothing here to sign with.
 */
export function walletSigner(): WalletSigner | null {
  return null;
}

/**
 * Why a signed step cannot start, said per act.
 *
 * Three sentences rather than one, because a buyer meets these at three
 * different moments and a generic "no wallet connected" would not tell them
 * what they have just failed to do.
 */
const NO_WALLET_MESSAGE: Record<ChallengeAction, string> = {
  release:
    "Letting a hold go has to be signed by the wallet that started it, and there is no wallet " +
    "connected to this page yet.",
  attach:
    "What goes in a block has to be signed by the wallet holding it, and there is no wallet " +
    "connected to this page yet.",
  pay:
    "Settling an order has to be signed by the wallet that holds it, and there is no wallet " +
    "connected to this page yet.",
};

/**
 * What a buyer reads when they said no to their own wallet.
 *
 * A wallet throws when the person declines, and declining is an answer rather
 * than a fault — so each of these says what did NOT happen, in the words of
 * the step they were on.
 */
const REFUSED_MESSAGE: Record<ChallengeAction, string> = {
  release: "That signature was not given, so the hold was left exactly as it was.",
  attach: "That signature was not given, so nothing was attached to your block.",
  pay: "That signature was not given, so nothing was paid and these pixels are still held for you.",
};

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

/** The three strings the server checks. Assembled here and never anywhere else. */
type OwnershipProof = { nonce: string; publicKey: string; signature: string };

/**
 * Ask for a single-use sentence, have the wallet sign it, and hand back what
 * to present — or the sentence the buyer reads instead.
 *
 * The one place in the browser that talks to `/api/orders/:id/challenge`, so
 * all three signed steps ask in the same shape and get the same handling of a
 * missing wallet, a refused prompt and a network failure. The message is never
 * rebuilt here: it is signed exactly as the server wrote it, which is what
 * lets the server rebuild it from the challenge row and compare.
 */
async function prove(
  orderId: string,
  action: ChallengeAction,
  sign: WalletSigner | null,
  fallback: string,
): Promise<{ ok: true; proof: OwnershipProof } | ClientFailure> {
  if (!sign) return { ok: false, status: 0, message: NO_WALLET_MESSAGE[action] };

  let issued: Response;
  try {
    issued = await fetch(`/api/orders/${orderId}/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
  } catch {
    return { ok: false, status: 0, message: NETWORK_FAILURE_MESSAGE };
  }
  if (!issued.ok) return failureFrom(issued, fallback);

  let challenge: IssuedChallenge;
  try {
    challenge = (await issued.json()) as IssuedChallenge;
  } catch {
    return { ok: false, status: 0, message: fallback };
  }

  try {
    const signed = await sign(challenge.message);
    return { ok: true, proof: { nonce: challenge.nonce, ...signed } };
  } catch {
    // A wallet throws when the person says no. That is an answer, not a fault.
    return { ok: false, status: 0, message: REFUSED_MESSAGE[action] };
  }
}

/**
 * Hands a hold back before its clock runs out.
 *
 * Two requests, because releasing is something you prove rather than
 * something you claim: ask for a single-use sentence, have the wallet sign
 * it, and present nonce + address + signature to the DELETE. The address used
 * to travel on its own, which authenticated nobody — a wallet address is
 * public, so anyone who could read the board could release anyone's rectangle.
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
  sign: WalletSigner | null,
): Promise<ReleaseResult> {
  const proven = await prove(orderId, "release", sign, RELEASE_FALLBACK);
  if (!proven.ok) return proven;

  let response: Response;
  try {
    response = await fetch(`/api/orders/${orderId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proven.proof),
    });
  } catch {
    return { ok: false, status: 0, message: NETWORK_FAILURE_MESSAGE };
  }

  if (response.ok) return { ok: true };
  return failureFrom(response, RELEASE_FALLBACK);
}

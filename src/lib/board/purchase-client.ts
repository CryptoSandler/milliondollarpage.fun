import type { ContentRejection } from "./content";
import type { Rect } from "./geometry";
import type { ProvenOrder, PublicOrder } from "./orders";
import { base58Encode } from "../wallet/base58";
import type { ChallengeAction } from "../wallet/signature";
import { shortAddress } from "../wallet/standard";
import type { OwnerChain, ProvenOwner } from "./owner";

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
 * `orders.ts` imports) into a client bundle. That is deliberate — this file is
 * consumed by "use client" components, and `../db` opens a real `pg` connection
 * at module scope. `base58Encode` is the one VALUE import here, and it is safe
 * for the same reason said the other way round: `../wallet/base58` imports
 * nothing whatsoever.
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
export type ClientOrder = PublicOrder &
  Partial<Pick<ProvenOrder, "paymentBaseUnits" | "payTo" | "payToken" | "payChainId">>;

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

/**
 * `chain` is passed in rather than read out of the reservation, because the
 * reserve response does not carry one — and a hardcoded "solana" here would
 * label every Robinhood hold with the wrong rail the moment one existed. It is
 * the chain this browser just SENT, which is the chain the row was written
 * with: the server refuses a body that names none, so the two cannot disagree.
 */
function reservationToOrder(reservation: Reservation, chain: OwnerChain): ClientOrder {
  return {
    id: reservation.id,
    rect: reservation.rect,
    status: "reserved",
    pricePerPixelBaseUnits: reservation.pricePerPixelBaseUnits,
    totalBaseUnits: reservation.totalBaseUnits,
    paymentBaseUnits: reservation.paymentBaseUnits,
    expiresAt: reservation.expiresAt,
    ownerChain: chain,
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
export function createHold(rect: Rect, owner: ProvenOwner): Promise<ClientResult> {
  return send(
    () =>
      fetch("/api/reserve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // `buyerPubkey` keeps its wire name — it is what every existing caller
        // and test sends — and `chain` joins it. The pair is what the server
        // stores; the field names are the only thing that stayed still.
        body: JSON.stringify({ rect, buyerPubkey: owner.address, chain: owner.chain }),
      }),
    (body) => reservationToOrder(body as Reservation, owner.chain),
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
  form.set("chain", proven.proof.chain);

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
export async function confirmOrder(
  orderId: string,
  sign: WalletSigner | null,
  /**
   * The transfer the buyer already made, on a rail that has one.
   *
   * IT IS A HASH AND NOTHING ELSE. The server reads the amount, the
   * destination and the network off the chain; this string only says WHICH
   * transaction to go and read. Absent on the stub path, which has nothing to
   * read — see `payment-stub.ts`, and the eight-point contract in
   * `src/lib/payments/robinhood.ts` for why the body may contribute no more
   * than this.
   */
  txHash?: string,
): Promise<ClientResult> {
  const proven = await prove(orderId, "pay", sign, PAY_FALLBACK);
  if (!proven.ok) return proven;

  return send(() =>
    fetch(`/api/orders/${orderId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(txHash ? { ...proven.proof, txHash } : proven.proof),
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
export type WalletSigner = ((message: string) => Promise<{ publicKey: string; signature: string }>) & {
  /**
   * The address this signer signs with, carried on the function so a refusal
   * can name it. See `refusedMessage`: a wallet that has moved to another
   * account throws exactly like a person pressing Cancel, and the two cannot be
   * told apart from here — so the message covers both and names the account
   * this rectangle actually belongs to.
   */
  address?: string;
  /**
   * WHICH CHAIN THIS SIGNER SIGNS FOR, carried by the signer rather than picked
   * at the call site. A wallet knows what it is; three routes guessing would be
   * three places to get it wrong, and CLAUDE.md's rule is that the chain is
   * named and never inferred.
   */
  chain: OwnerChain;
};

/**
 * What a connected wallet looks like from here: an address, and something
 * that turns bytes into a signature.
 *
 * Two fields and no wallet vocabulary at all, so this module stays the browser
 * half of four HTTP endpoints and does not become a second place that knows
 * about the Wallet Standard. `src/components/useWallet.ts` builds one of these
 * out of a live `solana:signMessage` feature; `standard.ts` explains why that
 * is the only feature this product asks a wallet for.
 */
export type MessageSigner = {
  /** base58, exactly as `verifySignature` on the server decodes it. */
  address: string;
  /** Resolves with the raw 64 signature bytes, or rejects when the person says no. */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

/**
 * The wallet that signs, or null when nothing is connected.
 *
 * A function rather than a constant so nothing narrows it to `null` at the
 * point of use, and it takes the connected wallet rather than reaching for one
 * so that this module keeps no state and the dialog cannot be handed a signer
 * for an address its hold does not belong to. It returned a bare `null` for
 * the whole of batch 3 — there was no wallet in the browser, only an address
 * somebody typed into a field, which proved nothing because an address is
 * public. This is the one return statement that comment said would change.
 *
 * The two conversions are here rather than in the hook because they are what
 * the WIRE needs: the server signs and verifies UTF-8 bytes of the exact text
 * `challengeMessage` built (`src/lib/wallet/signature.ts`), and it reads the
 * signature as base58. Doing them beside the fetch that carries them keeps one
 * spelling of the proof rather than two.
 *
 * It does not catch. A wallet rejects when the person declines, and `prove`
 * below is what turns that into the sentence they read — one place, for all
 * three acts.
 */
export function walletSigner(signer: MessageSigner | null): WalletSigner | null {
  if (!signer) return null;
  /*
    THIS IS THE SOLANA SIGNER, and it says so rather than reading a chain off
    something that does not have one. `MessageSigner` is a Wallet Standard
    account — base58, ed25519, Solana by construction — so the chain here is a
    fact about which function you are calling, not a value to be passed in. The
    EVM side gets its own constructor beside this one, and the two never share
    a code path that has to decide which is which.
  */
  const sign: WalletSigner = async (message: string) => ({
    publicKey: signer.address,
    signature: base58Encode(await signer.signMessage(new TextEncoder().encode(message))),
  });
  sign.address = signer.address;
  sign.chain = "solana";
  return sign;
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
    "Letting a hold go has to be signed by the wallet that started it, and no wallet is " +
    "connected to this page.",
  attach:
    "What goes in a block has to be signed by the wallet holding it, and no wallet is " +
    "connected to this page.",
  pay:
    "Settling an order has to be signed by the wallet that holds it, and no wallet is " +
    "connected to this page.",
};

/**
 * What a buyer reads when they said no to their own wallet.
 *
 * A wallet throws when the person declines, and declining is an answer rather
 * than a fault — so each of these says what did NOT happen, in the words of
 * the step they were on.
 */
const REFUSED_TAIL: Record<ChallengeAction, string> = {
  release: "the hold was left exactly as it was.",
  attach: "nothing was attached to your block.",
  pay: "nothing was paid and these pixels are still held for you.",
};

/**
 * What a buyer is told when no signature came back.
 *
 * TWO CAUSES, ONE ERROR, AND WE CANNOT TELL THEM APART. A wallet throws the
 * same way whether the person pressed Cancel or the extension has since moved
 * to a different account — there is no `standard:events` subscription here (see
 * `useWallet.ts` for why that is deliberate), so this page still believes in the
 * account it connected with. Saying "you declined" would be a guess, and it is
 * the wrong guess for the buyer who cannot work out why the button does
 * nothing.
 *
 * So the message names the account instead. Only that key can sign for this
 * rectangle — the server accepts no other — which makes "switch back to it"
 * useful advice whichever of the two actually happened.
 */
function refusedMessage(action: ChallengeAction, address?: string): string {
  const tail = REFUSED_TAIL[action];
  if (!address) return `That signature was not given, so ${tail}`;
  return (
    `No signature came back, so ${tail} If you cancelled, press it again. If you ` +
    `switched accounts in your wallet, switch back to ${shortAddress(address)} — ` +
    "these pixels are held by that account and only it can sign for them."
  );
}

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
type OwnershipProof = { nonce: string; chain: OwnerChain; publicKey: string; signature: string };

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
    /*
      THE CHAIN COMES OFF THE SIGNER, not off the response it returned. A wallet
      reporting its own chain in the payload would be the claim naming the
      cryptography that judges it; the signer IS the chain, and this is the one
      place the two are joined.
    */
    return { ok: true, proof: { nonce: challenge.nonce, chain: sign.chain, ...signed } };
  } catch {
    // A wallet throws when the person says no. That is an answer, not a fault.
    return { ok: false, status: 0, message: refusedMessage(action, sign.address) };
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

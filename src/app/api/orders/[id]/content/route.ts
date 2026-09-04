import { CONTENT_LIMITS, MULTIPART_FRAMING_ALLOWANCE_BYTES, validateContent } from "../../../../../lib/board/content";
import { isBlocked } from "../../../../../lib/board/blocklist";
import {
  attachContent,
  getOrder,
  OrderExpired,
  OrderNotFound,
  OrderNotReady,
  OrderNotYours,
  toProvenOrder,
} from "../../../../../lib/board/orders";
import { consumeChallenge } from "../../../../../lib/board/challenge";
import { checkContentSubmissionLimits } from "../../../../../lib/callers/limits";
import { NO_STORE, identify, isUuid, json, problem } from "../../../../../lib/http";

const MAX_REQUEST_BYTES = CONTENT_LIMITS.maxBytes + MULTIPART_FRAMING_ALLOWANCE_BYTES;

/**
 * The one thing every 403 here says, whatever went wrong.
 *
 * A missing proof, an expired challenge, a replayed one, a challenge issued
 * for a different order, a challenge issued to let a hold go rather than to
 * write on it, and a signature from somebody else's wallet all answer this —
 * the same shape `DELETE /api/orders/:id` uses, and for the same reason: the
 * differences between them are facts about somebody else's order.
 */
const UNSIGNED =
  "What goes in a block has to be signed by the wallet holding it, and this was not. " +
  "Ask for a fresh challenge and sign that.";

/**
 * Attach the image, link and caption a buyer chose to their held rectangle.
 *
 * ## What replaced the address in the form
 *
 * This route used to read `buyerPubkey` out of the multipart body and treat a
 * match against `blocks.buyer_pubkey` as proof the caller was the buyer. That
 * proved nothing: a wallet address is public by construction, `/api/board`
 * publishes every live block's id, and the payable amount published beside it
 * made the pair (order id, payer) readable off a public chain the moment a
 * transfer landed. Anyone holding that pair could write their own picture,
 * link and caption onto a stranger's hold seconds before the buyer's own
 * confirm — and content on a paid block can never be edited, by anyone, so
 * that write is permanent. The 2026-08-28 audit called it F1; the argument is
 * the one `migrations/003_release_challenges.sql` had already made about the
 * DELETE next door.
 *
 * Now the caller signs. `POST /api/orders/:id/challenge` with
 * `{"action":"attach"}` mints a single-use nonce bound to this order and to
 * this act; the wallet signs the sentence that comes back; and the proof —
 * nonce, address, signature — travels as three more fields in this form.
 * `consumeChallenge` spends the nonce and verifies the signature, and only an
 * address it hands back is compared to the order's.
 *
 * ## The order the checks run in, which is the same order it always was
 *
 * Ownership is proved BEFORE the uploaded bytes are ever handed to
 * `validateContent` (which decodes them with `sharp`): decoding is the
 * expensive, attacker-controlled step, and a stranger must never be able to
 * trigger it against an id they don't own just by POSTing a file to it.
 *
 * The proof arrives INSIDE the body, so it genuinely cannot be checked before
 * the body is read at all. What can be bounded is the damage: the
 * content-length gate below refuses an oversized request before a single byte
 * is buffered, and `checkContentSubmissionLimits` caps how often one caller
 * can even reach that point.
 *
 * A 422 here always carries the WHOLE `rejections` array, not just the first
 * failing field: a form that only ever reports one bad field at a time makes
 * a buyer submit repeatedly to discover the rest.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return problem(404, "That order does not exist.");

  // Checked against the DECLARED length before a single byte of the body is
  // read: an unauthenticated stranger must not be able to make this process
  // buffer an arbitrarily large request just by pointing it at any
  // well-formed uuid. A lying content-length is not a bypass — it is caught
  // downstream when the real stream disagrees with it (formData() fails, or
  // the decoded image fails validateContent's own byte cap) — this check
  // exists only to reject the obvious, cheap-to-detect case before paying
  // for it.
  const declaredLength = request.headers.get("content-length");
  const declaredBytes = declaredLength ? Number(declaredLength) : NaN;
  if (!Number.isFinite(declaredBytes) || declaredBytes > MAX_REQUEST_BYTES) {
    return problem(413, `The request body must not exceed ${MAX_REQUEST_BYTES} bytes.`);
  }

  const caller = identify(request);
  if (!caller.ok) return problem(400, caller.message);

  const limit = checkContentSubmissionLimits(caller.ipHash);
  if (!limit.ok) {
    const seconds = Math.max(1, Math.ceil((Date.parse(limit.retryAt) - Date.now()) / 1000));
    return problem(429, limit.message, { retryAt: limit.retryAt }, { "retry-after": String(seconds) });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem(400, "That request body is not a form.");
  }

  const order = await getOrder(id);
  if (!order) return problem(404, "That order does not exist.");

  // The nonce is spent whatever happens next, including on a wrong key: the
  // caller presented it, so it is used up. A form field that is missing or is
  // a file rather than a string arrives here as something `consumeChallenge`
  // refuses, which is the same 403 as a bad signature — a stranger learns
  // nothing from which mistake they made.
  const proven = await consumeChallenge(id, "attach", {
    nonce: form.get("nonce"),
    publicKey: form.get("publicKey"),
    signature: form.get("signature"),
  });
  if (proven === null || proven !== order.buyerPubkey) return problem(403, UNSIGNED);

  if (order.status === "reserved" && order.expiresAt !== null && Date.parse(order.expiresAt) <= Date.now()) {
    return problem(410, new OrderExpired().message);
  }

  const image = form.get("image");
  const bytes = image instanceof Blob ? Buffer.from(await image.arrayBuffer()) : Buffer.alloc(0);
  const declaredMime = image instanceof Blob ? image.type : "";
  const link = readString(form.get("link"));
  const caption = readString(form.get("caption"));
  const imageFit = readString(form.get("imageFit"));

  // The block comes off the ORDER, never off the form: it is what decides
  // whether a `contain` fit can actually be drawn, and a caller who could
  // name their own rectangle could name one that lets any fit through.
  const validated = await validateContent({
    bytes,
    declaredMime,
    link,
    caption,
    imageFit,
    block: { width: order.rect.w, height: order.rect.h },
  });
  if (!validated.ok) {
    return problem(422, "That content could not be accepted.", { rejections: validated.rejections });
  }

  /*
    AND THE ONE CHECK THAT NEEDS THE DATABASE, which is why it is here rather
    than inside `validateContent`: that function is pure, and every one of its
    rules is testable without a database because of it.

    THE REASON IS NOT REPEATED BACK. The row carries why the picture was
    refused, and that sentence was written by a person about somebody else's
    upload — it may name a law, a complaint or a judgement, and none of that is
    this uploader's business. What they are told is that this exact file cannot
    be used and that a different one can, which is the whole of what they can
    act on. `blocklist.ts` has the reasoning; `/admin` is where the reason is
    read.
  */
  const blocked = await isBlocked(validated.content.sha256);
  if (blocked) {
    return problem(422, "That content could not be accepted.", {
      rejections: [
        {
          field: "image",
          code: "image_blocked",
          reason: "This exact image cannot be used on this wall. Choose a different one.",
        },
      ],
    });
  }

  try {
    const updated = await attachContent(id, proven, validated.content);
    // The caller proved the key a few statements ago, so they get back their
    // own caption and link — and the payable amount, which is the number they
    // need next and the one `toPublicOrder` withholds from everybody else.
    return json(toProvenOrder(updated), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OrderNotFound) return problem(404, error.message);
    if (error instanceof OrderNotYours) return problem(403, UNSIGNED);
    if (error instanceof OrderExpired) return problem(410, error.message);
    if (error instanceof OrderNotReady) return problem(409, error.message);
    throw error;
  }
}

function readString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

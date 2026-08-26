import { CONTENT_LIMITS, MULTIPART_FRAMING_ALLOWANCE_BYTES, validateContent } from "../../../../../lib/board/content";
import {
  attachContent,
  getOrder,
  OrderExpired,
  OrderNotFound,
  OrderNotReady,
  OrderNotYours,
  toPublicOrder,
} from "../../../../../lib/board/orders";
import { checkContentSubmissionLimits } from "../../../../../lib/callers/limits";
import { NO_STORE, identify, isUuid, json, problem } from "../../../../../lib/http";

const MAX_REQUEST_BYTES = CONTENT_LIMITS.maxBytes + MULTIPART_FRAMING_ALLOWANCE_BYTES;

/**
 * Attach the image, link and caption a buyer chose to their held rectangle.
 *
 * Ownership and expiry are checked BEFORE the uploaded bytes are ever handed
 * to `validateContent` (which decodes them with `sharp`): decoding is the
 * expensive, attacker-controlled step, and an unauthenticated stranger must
 * never be able to trigger it against an id they don't own just by POSTing a
 * file to it.
 *
 * But `buyerPubkey` — the only thing that check compares against — arrives
 * INSIDE the body, so ownership genuinely cannot be checked before the body
 * is read at all. What can be bounded is the damage: the content-length gate
 * below refuses an oversized request before a single byte is buffered, and
 * `checkContentSubmissionLimits` caps how often one caller can even reach
 * that point.
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

  const buyerPubkey = form.get("buyerPubkey");
  if (typeof buyerPubkey !== "string" || buyerPubkey.trim() === "") {
    return problem(400, "A wallet address is required.");
  }

  const order = await getOrder(id);
  if (!order) return problem(404, "That order does not exist.");
  if (order.buyerPubkey !== buyerPubkey) return problem(403, new OrderNotYours().message);
  if (order.status === "reserved" && order.expiresAt !== null && Date.parse(order.expiresAt) <= Date.now()) {
    return problem(410, new OrderExpired().message);
  }

  const image = form.get("image");
  const bytes = image instanceof Blob ? Buffer.from(await image.arrayBuffer()) : Buffer.alloc(0);
  const declaredMime = image instanceof Blob ? image.type : "";
  const link = readString(form.get("link"));
  const caption = readString(form.get("caption"));
  const imageFit = readString(form.get("imageFit"));

  const validated = await validateContent({ bytes, declaredMime, link, caption, imageFit });
  if (!validated.ok) {
    return problem(422, "That content could not be accepted.", { rejections: validated.rejections });
  }

  try {
    const updated = await attachContent(id, buyerPubkey, validated.content);
    // The caller proved ownership two statements ago, so they get their
    // own caption and link back — the redaction in `toPublicOrder` is for
    // strangers reading somebody else's unpaid hold, not for the buyer
    // reading back what they just uploaded.
    return json(toPublicOrder(updated, buyerPubkey), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OrderNotFound) return problem(404, error.message);
    if (error instanceof OrderNotYours) return problem(403, error.message);
    if (error instanceof OrderExpired) return problem(410, error.message);
    if (error instanceof OrderNotReady) return problem(409, error.message);
    throw error;
  }
}

function readString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

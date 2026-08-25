import { validateContent } from "../../../../../lib/board/content";
import {
  attachContent,
  getOrder,
  OrderExpired,
  OrderNotFound,
  OrderNotReady,
  OrderNotYours,
} from "../../../../../lib/board/orders";
import { NO_STORE, isUuid, json, problem } from "../../../../../lib/http";

/**
 * Attach the image, link and caption a buyer chose to their held rectangle.
 *
 * Ownership and expiry are checked BEFORE the uploaded bytes are ever handed
 * to `validateContent` (which decodes them with `sharp`): decoding is the
 * expensive, attacker-controlled step, and an unauthenticated stranger must
 * never be able to trigger it against an id they don't own just by POSTing a
 * file to it.
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
    return json(updated, { headers: NO_STORE });
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

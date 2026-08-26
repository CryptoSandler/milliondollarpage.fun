import { createHash } from "node:crypto";
import sharp from "sharp";
import { STORED_MAX_BYTES, STORED_MAX_LONG_EDGE } from "./image-plan";
import { LINK_MAX_LENGTH, checkLink, normaliseLink } from "./link";

/**
 * Validating the three things a buyer supplies before any money is asked for:
 * an image, a link, and a caption.
 *
 * The 100 KiB byte cap is not a storage-cost decision. Arweave uploads under
 * 100 KiB are free through the provider the spec names, and free uploads are
 * what let the signing key stay permanently unfunded — which is the
 * enforceable half of the security posture in SECURITY.md. It is a security
 * control that happens to look like a file-size limit, and it is checked
 * before the bytes are ever handed to `sharp`, so a hostile file is never
 * decoded.
 *
 * The MIME type and dimensions always come from `sharp().metadata()` — never
 * from what the caller claims — because a caller can name any Content-Type
 * it likes. A `sharp` throw means "this is not a decodable image", not a
 * crash.
 */

export const CONTENT_LIMITS = {
  // Both from image-plan.ts, which the browser also reads: the page that
  // shrinks an upload and the server that accepts it have to be working to
  // the same two numbers, and a second copy of either is a second number to
  // forget to change.
  maxBytes: STORED_MAX_BYTES,
  maxDimension: STORED_MAX_LONG_EDGE,
  captionMaxLength: 32,
  // From link.ts, which the browser also reads: the form that normalises a
  // link and the server that stores it work to one set of rules, not two.
  linkMaxLength: LINK_MAX_LENGTH,
} as const;

// Multipart framing — boundary markers, per-part headers, field names, and
// the link, caption, fit and wallet address travelling in the same body —
// adds bytes on top of the image. 16 KiB covers all of it with room to
// spare, including a link at its own 2048-character cap.
//
// This is the REQUEST-level allowance, and it says nothing about what gets
// stored: the content-length gate in content/route.ts uses it to refuse an
// oversized request before a single byte of the body is read, while
// `maxBytes` above is what the stored image itself may weigh. Widening this
// buys framing margin; it does not widen the upload.
export const MULTIPART_FRAMING_ALLOWANCE_BYTES = 16_384;

const ACCEPTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// The same two values migration 001's blocks_image_fit_known CHECK allows.
const IMAGE_FIT_VALUES = new Set(["contain", "cover"]);
type ImageFit = "contain" | "cover";

/**
 * Why one field was refused, in two halves.
 *
 * `code` is the machine-readable half and it is what the CLIENT reads: the
 * browser maps a code to a sentence WE wrote, in the dialog's own voice (see
 * upload-errors.ts). `reason` is the human half, and it is for a developer
 * reading a response by hand or a log line — it is deliberately never what a
 * buyer is shown, because a validator's sentence and a buyer's sentence are
 * written for different readers.
 */
export type RejectionCode =
  | "image_empty"
  | "image_too_heavy"
  | "image_unreadable"
  | "image_wrong_type"
  | "image_too_large"
  | "link_too_long"
  | "link_not_https"
  | "link_invalid"
  | "caption_too_long"
  | "fit_unknown";

export type ContentRejection = {
  field: "image" | "link" | "caption" | "imageFit";
  code: RejectionCode;
  reason: string;
};

export type ValidatedContent = {
  bytes: Buffer;
  mime: string;
  sha256: string;
  isAnimated: boolean;
  width: number;
  height: number;
  link: string;
  // NULL when the buyer left it blank: the caption is optional, and a block
  // without one shows no chip rather than an empty one.
  caption: string | null;
  imageFit: ImageFit;
};

type ContentInput = {
  bytes: Buffer;
  // Carried so callers can pass what the browser reported (e.g. from the
  // upload's Content-Type), but deliberately never read: the module trusts
  // only what `sharp` decodes from the bytes themselves. See validateImage.
  declaredMime: string;
  link: string;
  caption: string;
  // A plain string, not the ImageFit union: at an HTTP boundary this arrives
  // from request.formData(), where every value is a string the caller
  // chose, and the union is unenforceable there. validateImageFit narrows
  // it below; that narrowing is the entire point of checking it here.
  imageFit: string;
};

type ValidateContentResult =
  | { ok: true; content: ValidatedContent }
  | { ok: false; rejections: ContentRejection[] };

type ImageValidation =
  | { ok: true; mime: string; isAnimated: boolean; width: number; height: number }
  | { ok: false; rejection: ContentRejection };

async function validateImage(bytes: Buffer): Promise<ImageValidation> {
  if (bytes.length === 0) {
    return { ok: false, rejection: { field: "image", code: "image_empty", reason: "The image file is empty." } };
  }

  // Enforced before decoding: a hostile file must never reach sharp.
  if (bytes.length > CONTENT_LIMITS.maxBytes) {
    return {
      ok: false,
      rejection: {
        field: "image",
        code: "image_too_heavy",
        reason: `The image must be ${CONTENT_LIMITS.maxBytes} bytes or smaller.`,
      },
    };
  }

  let metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch {
    return { ok: false, rejection: { field: "image", code: "image_unreadable", reason: "That file is not a recognizable image." } };
  }

  const mime = metadata.format ? `image/${metadata.format}` : undefined;
  if (!mime || !ACCEPTED_MIME_TYPES.has(mime)) {
    return { ok: false, rejection: { field: "image", code: "image_wrong_type", reason: "The image must be PNG, JPEG, WebP, or GIF." } };
  }

  const { width, height } = metadata;
  if (!width || !height) {
    return {
      ok: false,
      rejection: { field: "image", code: "image_unreadable", reason: "That file is not a recognizable image." },
    };
  }

  if (width > CONTENT_LIMITS.maxDimension || height > CONTENT_LIMITS.maxDimension) {
    return {
      ok: false,
      rejection: {
        field: "image",
        code: "image_too_large",
        reason: `The image must be ${CONTENT_LIMITS.maxDimension}px or smaller on each side.`,
      },
    };
  }

  return {
    ok: true,
    mime,
    isAnimated: (metadata.pages ?? 1) > 1,
    width,
    height,
  };
}

type ImageFitValidation =
  | { ok: true; imageFit: ImageFit }
  | { ok: false; rejection: ContentRejection };

function validateImageFit(imageFit: string): ImageFitValidation {
  if (IMAGE_FIT_VALUES.has(imageFit)) {
    return { ok: true, imageFit: imageFit as ImageFit };
  }
  return {
    ok: false,
    rejection: { field: "imageFit", code: "fit_unknown", reason: 'imageFit must be "contain" or "cover".' },
  };
}

/**
 * The rules themselves are in link.ts, which the browser shares; this only
 * turns their answer into the rejection shape this module reports.
 *
 * What comes back as `normalised` is what gets STORED, so a buyer who typed a
 * bare `adan.com` gets `https://adan.com` on their block — the same string the
 * form put in front of them on the confirmation screen before they paid.
 */
const LINK_REASONS: Record<Exclude<ReturnType<typeof checkLink>, null>, string> = {
  link_too_long: `The link must be ${LINK_MAX_LENGTH} characters or fewer.`,
  link_not_https: "The link must use https.",
  link_invalid: "That is not a valid link.",
};

function validateLink(link: string): { rejection: ContentRejection | null; normalised: string } {
  const normalised = normaliseLink(link);
  const problem = checkLink(normalised);
  if (!problem) return { rejection: null, normalised };
  return {
    rejection: { field: "link", code: problem, reason: LINK_REASONS[problem] },
    normalised,
  };
}

/**
 * The caption is OPTIONAL, and this reverses what this module used to say.
 *
 * An empty caption — or one that is nothing but whitespace — is a valid
 * answer to "what would you like written under this?", and it is stored as
 * NULL rather than as an empty string, so there is exactly one way for a
 * block to have no caption. `BoardCanvas` already draws the chip only for a
 * truthy caption, so a NULL one paints nothing at all rather than an empty
 * plate over the artwork.
 */
function validateCaption(caption: string): { rejection: ContentRejection | null; trimmed: string | null } {
  const trimmed = caption.trim();
  if (trimmed.length === 0) {
    return { rejection: null, trimmed: null };
  }
  if (trimmed.length > CONTENT_LIMITS.captionMaxLength) {
    return {
      rejection: {
        field: "caption",
        code: "caption_too_long",
        reason: `The caption must be ${CONTENT_LIMITS.captionMaxLength} characters or fewer.`,
      },
      trimmed,
    };
  }
  return { rejection: null, trimmed };
}

export async function validateContent(input: ContentInput): Promise<ValidateContentResult> {
  const rejections: ContentRejection[] = [];

  const imageResult = await validateImage(input.bytes);
  if (!imageResult.ok) rejections.push(imageResult.rejection);

  const { rejection: linkRejection, normalised: link } = validateLink(input.link);
  if (linkRejection) rejections.push(linkRejection);

  const { rejection: captionRejection, trimmed: caption } = validateCaption(input.caption);
  if (captionRejection) rejections.push(captionRejection);

  const imageFitResult = validateImageFit(input.imageFit);
  if (!imageFitResult.ok) rejections.push(imageFitResult.rejection);

  if (!imageResult.ok || !imageFitResult.ok || rejections.length > 0) {
    return { ok: false, rejections };
  }

  return {
    ok: true,
    content: {
      bytes: input.bytes,
      mime: imageResult.mime,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      isAnimated: imageResult.isAnimated,
      width: imageResult.width,
      height: imageResult.height,
      link,
      caption,
      imageFit: imageFitResult.imageFit,
    },
  };
}

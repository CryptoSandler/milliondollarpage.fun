import { createHash } from "node:crypto";
import sharp from "sharp";

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
  maxBytes: 102_400,
  maxDimension: 1000,
  captionMaxLength: 32,
  // The conventional practical URL limit — long enough for any real link,
  // short enough that a caller cannot store a megabyte of text in a column
  // meant for a URL.
  linkMaxLength: 2048,
} as const;

// Multipart framing — boundary markers, per-part headers, and field names
// other than the image itself — adds bytes on top of the image. 8 KiB
// comfortably covers that overhead. Used by the content route's
// content-length gate (see content/route.ts) to reject an oversized request
// before a single byte of the body is read.
export const MULTIPART_FRAMING_ALLOWANCE_BYTES = 8192;

const ACCEPTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// The same two values migration 001's blocks_image_fit_known CHECK allows.
const IMAGE_FIT_VALUES = new Set(["contain", "cover"]);
type ImageFit = "contain" | "cover";

export type ContentRejection = {
  field: "image" | "link" | "caption" | "imageFit";
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
  caption: string;
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
    return { ok: false, rejection: { field: "image", reason: "The image file is empty." } };
  }

  // Enforced before decoding: a hostile file must never reach sharp.
  if (bytes.length > CONTENT_LIMITS.maxBytes) {
    return {
      ok: false,
      rejection: {
        field: "image",
        reason: `The image must be ${CONTENT_LIMITS.maxBytes} bytes or smaller.`,
      },
    };
  }

  let metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch {
    return { ok: false, rejection: { field: "image", reason: "That file is not a recognizable image." } };
  }

  const mime = metadata.format ? `image/${metadata.format}` : undefined;
  if (!mime || !ACCEPTED_MIME_TYPES.has(mime)) {
    return { ok: false, rejection: { field: "image", reason: "The image must be PNG, JPEG, WebP, or GIF." } };
  }

  const { width, height } = metadata;
  if (!width || !height) {
    return { ok: false, rejection: { field: "image", reason: "That file is not a recognizable image." } };
  }

  if (width > CONTENT_LIMITS.maxDimension || height > CONTENT_LIMITS.maxDimension) {
    return {
      ok: false,
      rejection: {
        field: "image",
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
    rejection: { field: "imageFit", reason: 'imageFit must be "contain" or "cover".' },
  };
}

function validateLink(link: string): { rejection: ContentRejection | null; trimmed: string } {
  const trimmed = link.trim();

  // Checked before `new URL()`: a link this long is rejected for its length
  // alone, the same way an oversized image is rejected before it is decoded.
  if (trimmed.length > CONTENT_LIMITS.linkMaxLength) {
    return {
      rejection: {
        field: "link",
        reason: `The link must be ${CONTENT_LIMITS.linkMaxLength} characters or fewer.`,
      },
      trimmed,
    };
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") {
      return { rejection: { field: "link", reason: "The link must use https." }, trimmed };
    }
    return { rejection: null, trimmed };
  } catch {
    return { rejection: { field: "link", reason: "That is not a valid link." }, trimmed };
  }
}

function validateCaption(caption: string): { rejection: ContentRejection | null; trimmed: string } {
  const trimmed = caption.trim();
  if (trimmed.length === 0) {
    return { rejection: { field: "caption", reason: "The caption cannot be empty." }, trimmed };
  }
  if (trimmed.length > CONTENT_LIMITS.captionMaxLength) {
    return {
      rejection: {
        field: "caption",
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

  const { rejection: linkRejection, trimmed: link } = validateLink(input.link);
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

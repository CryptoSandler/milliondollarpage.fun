import { willBecomeStill } from "./gif";
import {
  MAX_INPUT_BYTES,
  STORED_MAX_BYTES,
  TARGET_STORED_BYTES,
  encodeAttempts,
  plannedEncode,
  shouldSendUntouched,
  type Box,
  type Fit,
} from "./image-plan";

/**
 * The browser half of the upload: decode whatever the buyer picked, draw it
 * at the size the block actually stores, and squeeze until it fits.
 *
 * Everything decided here is decided in `image-plan.ts`, which is pure and
 * tested; this file is the part that needs a canvas, and it is kept as thin
 * as a file that cannot be unit tested without a browser should be. What
 * proves it works is the whole flow driven through headless Chrome with a
 * real 8 MB photograph — see the task report.
 *
 * The point of all this: an image never leaves the browser at its original
 * weight, and a buyer is never told their picture is too heavy. The 100 KiB
 * that reaches the server is what the page made, not what the buyer had to
 * make themselves.
 */

/** Everything that can go wrong before a byte is sent, in our own vocabulary. */
export type ImageProblem = "image_input_too_large" | "image_unreadable" | "image_unencodable";

export type PreparedImage = {
  blob: Blob;
  width: number;
  height: number;
  /** The name the multipart part carries; the server reads the bytes, not this. */
  filename: string;
};

export type PrepareResult =
  | {
      ok: true;
      image: PreparedImage;
      /**
       * The buyer picked an animated GIF and this is a still of its first
       * frame. Reported rather than acted on: the confirmation screen says so
       * before any money is asked for, and the buyer decides.
       */
      stillFromAnimation: boolean;
    }
  | { ok: false; problem: ImageProblem };

const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
};

/**
 * Turns the buyer's file into the bytes this block should store.
 *
 * The only weight rule the buyer ever meets is `MAX_INPUT_BYTES`, and it is
 * enforced here — the file never leaves the browser at that size, so nothing
 * downstream ever has to defend against it.
 */
export async function prepareImage(file: File, block: Box, fit: Fit): Promise<PrepareResult> {
  if (file.size > MAX_INPUT_BYTES) return { ok: false, problem: "image_input_too_large" };

  // The whole file, and only for a GIF: a frame count cannot be read from a
  // prefix, because the second frame's descriptor sits after however many
  // bytes the first one took. Nothing else is ever read this way, and a GIF is
  // capped at the same ten megabytes as everything else.
  const gifBytes =
    file.type === "image/gif" ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array(0);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, problem: "image_unreadable" };
  }

  try {
    // Whether the animation is about to be lost — which is exactly "this is a
    // GIF that moves AND it is not going out untouched". Decided before the
    // branch below so both paths report the same answer.
    const stillFromAnimation = willBecomeStill(
      gifBytes,
      file.type,
      file.size,
      bitmap.width,
      bitmap.height,
    );

    if (shouldSendUntouched(file.type, file.size, bitmap.width, bitmap.height)) {
      return {
        ok: true,
        image: { blob: file, width: bitmap.width, height: bitmap.height, filename: "block.gif" },
        stillFromAnimation,
      };
    }

    const type = supportsWebp() ? "image/webp" : "image/jpeg";
    const filename = `block.${EXTENSIONS[type]}`;
    let smallest: PreparedImage | null = null;

    for (const attempt of encodeAttempts(block)) {
      const plan = plannedEncode(bitmap.width, bitmap.height, block, fit, attempt.maxLongEdge);
      const canvas = document.createElement("canvas");
      canvas.width = plan.target.width;
      canvas.height = plan.target.height;
      const context = canvas.getContext("2d");
      if (!context) return { ok: false, problem: "image_unencodable" };

      // JPEG has no alpha: without this, a transparent PNG would arrive with
      // black behind it rather than the paper the board is drawn on.
      if (type === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        bitmap,
        plan.source.x,
        plan.source.y,
        plan.source.width,
        plan.source.height,
        plan.dest.x,
        plan.dest.y,
        plan.dest.width,
        plan.dest.height,
      );

      const blob = await toBlob(canvas, type, attempt.quality);
      if (!blob) continue;
      const encoded: PreparedImage = {
        blob,
        width: canvas.width,
        height: canvas.height,
        filename,
      };
      if (blob.size <= TARGET_STORED_BYTES) return { ok: true, image: encoded, stillFromAnimation };
      if (!smallest || blob.size < smallest.blob.size) smallest = encoded;
    }

    // Every rung tried and none landed under the target. The smallest of them
    // is still worth sending if it is under the stored cap itself — the
    // target is headroom, the cap is the rule.
    if (smallest && smallest.blob.size <= STORED_MAX_BYTES) {
      return { ok: true, image: smallest, stillFromAnimation };
    }
    return { ok: false, problem: "image_unencodable" };
  } finally {
    bitmap.close();
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

let webpSupport: boolean | null = null;

/**
 * Whether this browser's canvas can encode WebP.
 *
 * A canvas asked for a type it cannot write silently answers PNG, and a PNG
 * of a photograph is several times the size of the WebP we were counting on
 * — so the fallback has to be chosen up front, not discovered from a blob
 * that came back the wrong type. Measured once per page.
 */
function supportsWebp(): boolean {
  if (webpSupport !== null) return webpSupport;
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  webpSupport = probe.toDataURL("image/webp").startsWith("data:image/webp");
  return webpSupport;
}

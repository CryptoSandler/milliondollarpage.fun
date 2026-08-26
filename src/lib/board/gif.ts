/**
 * Whether a GIF moves, and whether the copy that goes on the board still will.
 *
 * Drawing a GIF onto a canvas keeps its first frame and silently throws the
 * rest away. That is fine for a still and it is a lie for an animation, so
 * before a buyer is asked for money they get told which of the two is about to
 * happen to their picture. Telling them takes knowing the frame count, and
 * nothing in the browser will say: `createImageBitmap` hands back one frame
 * without comment, and `ImageDecoder` is not everywhere. So the bytes get
 * walked here.
 *
 * It is a WALK, not a decode. The GIF block structure is a header, a screen
 * descriptor, an optional colour table, and then a run of blocks each of which
 * says how long it is — so counting image descriptors means stepping over
 * lengths, never interpreting a pixel. Nothing here can be made to allocate on
 * a hostile file: every step moves forward, and the answer is "one frame" the
 * moment the structure stops making sense.
 *
 * Called by `image-encode.ts` (which reports it up through ContentForm to the
 * confirmation screen) and tested in `__tests__/gif.test.ts`.
 */

import { shouldSendUntouched } from "./image-plan";

const HEADER = [0x47, 0x49, 0x46, 0x38]; // "GIF8"
const EXTENSION = 0x21;
const IMAGE_DESCRIPTOR = 0x2c;
const TRAILER = 0x3b;

/** Past a run of length-prefixed sub-blocks, or to the end if it never terminates. */
function afterSubBlocks(bytes: Uint8Array, from: number): number {
  let at = from;
  while (at < bytes.length) {
    const length = bytes[at];
    if (length === 0) return at + 1;
    at += length + 1;
  }
  return bytes.length;
}

/** The size in bytes of a colour table, from the packed field that describes it. */
function colourTableBytes(packed: number): number {
  return packed & 0x80 ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
}

/**
 * True when these bytes are a GIF carrying more than one frame.
 *
 * False for every other format, for a single-frame GIF, and for anything
 * truncated or malformed — an unreadable file is the image validator's problem
 * (see content.ts), and guessing "animated" about one would put a warning in
 * front of a buyer whose picture is not animated at all.
 */
export function isAnimatedGif(bytes: Uint8Array): boolean {
  if (bytes.length < 13) return false;
  if (HEADER.some((byte, index) => bytes[index] !== byte)) return false;

  let at = 13 + colourTableBytes(bytes[10]);
  let frames = 0;

  while (at < bytes.length) {
    const block = bytes[at];
    if (block === TRAILER) break;

    if (block === EXTENSION) {
      // Introducer, label, then the extension's own sub-blocks.
      at = afterSubBlocks(bytes, at + 2);
      continue;
    }

    if (block === IMAGE_DESCRIPTOR) {
      frames += 1;
      if (frames > 1) return true;
      const packed = bytes[at + 9];
      // Descriptor, optional local colour table, the LZW code size, the data.
      at = afterSubBlocks(bytes, at + 10 + colourTableBytes(packed) + 1);
      continue;
    }

    // A byte that is none of the three: the structure has stopped making
    // sense, so stop rather than hunting for something that looks like a frame.
    break;
  }

  return frames > 1;
}

/**
 * Whether this upload is about to lose its animation, which is the only case
 * worth warning a buyer about.
 *
 * An animated GIF small enough to store is sent exactly as the buyer chose it
 * and keeps every frame — `shouldSendUntouched` is the same test the encoder
 * makes — so it gets no notice. One that has to be re-encoded to fit does.
 */
export function willBecomeStill(
  bytes: Uint8Array,
  type: string,
  size: number,
  width: number,
  height: number,
): boolean {
  return isAnimatedGif(bytes) && !shouldSendUntouched(type, size, width, height);
}

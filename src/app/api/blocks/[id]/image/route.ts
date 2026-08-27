import { getBlockImage } from "../../../../../lib/board/blocks";
import { isUuid, problem } from "../../../../../lib/http";

/**
 * One sold block's bitmap, as bytes.
 *
 * Called by the browser: `BoardCanvas` points an `Image` at this URL for
 * every block whose `/api/board` entry says `hasImage`, and nothing else
 * links here.
 *
 * The bytes deliberately do not travel in the board payload. A thousand sold
 * blocks would make that JSON tens of megabytes, and the board is refetched
 * every thirty seconds; here each bitmap is its own request, fetched once and
 * then never again.
 *
 * WHO GETS TO SEE IT: `getBlockImage` serves `paid` and `minted` only. A
 * `reserved` block's upload is unpaid, unfinished, and may never be bought —
 * publishing it would let anyone walk the block ids `/api/board` already
 * hands out and scrape what strangers are midway through uploading. That is
 * a 404 here, indistinguishable from a block that never existed.
 *
 * The status ladder is the one every other `[id]` route walks: an id that is
 * not a uuid answers 404 rather than reaching Postgres and raising 22P02 as
 * an unauthenticated 500, and it answers the SAME 404 an absent id gets, so
 * a caller cannot tell a malformed guess from a wrong one.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return problem(404, "That block has no image.");

  const image = await getBlockImage(id);
  if (!image) return problem(404, "That block has no image.");

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.mime,
      "content-length": String(image.bytes.byteLength),
      // A year, immutable, and cached by shared caches too. These bytes are
      // frozen the moment the block is paid for: content can only be
      // attached to a reservation, a paid row's expiry is nulled and it is
      // never swept, and there is no endpoint that replaces an image. The
      // URL is keyed by the block's uuid, so different pixels are always a
      // different URL — the case `immutable` would be wrong for cannot
      // arise. The one way these bytes stop being correct is a takedown, and
      // `hidden_at` takes this route's answer to a 404 the moment one lands —
      // which is why this says a year and not "forever", and why a takedown
      // is a cache purge rather than only a database update.
      "cache-control": "public, max-age=31536000, immutable",
      // These are bytes a stranger uploaded. `content-type` above is the
      // validated one; without this a browser is free to ignore it, sniff
      // the body, and decide the file is something else entirely.
      "x-content-type-options": "nosniff",
    },
  });
}

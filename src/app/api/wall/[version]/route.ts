import { isWallVersion, wallImage } from "../../../../lib/board/composite";
import { problem } from "../../../../lib/http";

/**
 * One version of the wall, as a PNG.
 *
 * Called by the browser: `BoardCanvas` points an `Image` at whatever URL the
 * `wall` field of `/api/board` names, and nothing else links here. The URL is
 * built in one place, `wallUrl` in composite.ts, so the payload and this route
 * cannot disagree about its shape.
 *
 * WHY THE VERSION IS IN THE PATH. It is the sha256 of these exact bytes, so
 * the URL is immutable by construction and can be cached for a year by the
 * browser and by every shared cache in between. A new wall is a NEW URL rather
 * than the same URL with different contents, which means a purchase reaches
 * every visitor without anybody purging a CDN — the old URL simply stops being
 * asked for. That is the property the whole versioning scheme exists for.
 *
 * A version that is no longer kept answers 404, and that is survivable rather
 * than a failure: a browser gets a fresh version from `/api/board` twice a
 * minute, and `composite.ts` keeps the last few walls precisely so a payload
 * from the previous poll still resolves.
 *
 * The status ladder is the one every other parameterised route walks: a
 * version that is not the 64-hex shape answers 404 rather than reaching
 * Postgres, and it answers the SAME 404 an unknown-but-well-formed version
 * gets.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ version: string }> },
): Promise<Response> {
  const { version } = await params;
  if (!isWallVersion(version)) return problem(404, "There is no wall at that version.");

  const wall = await wallImage(version);
  if (!wall) return problem(404, "There is no wall at that version.");

  return new Response(new Uint8Array(wall.bytes), {
    headers: {
      // FROM THE ROW, NOT ASSUMED. A version is the hash of its bytes and the
      // build keeps whichever encoding came out smaller, so two versions of the
      // same wall can be two formats — and a header that guessed would serve a
      // WebP as a PNG to every browser that asked.
      "content-type": wall.mime,
      "content-length": String(wall.bytes.byteLength),
      // A year, immutable, shared caches included. These bytes cannot change
      // under this URL: the URL IS their hash.
      "cache-control": "public, max-age=31536000, immutable",
      // The bytes are ours — composed by sharp, never a caller's file — but
      // the header costs nothing and the rule is that nothing this server
      // serves is left to a browser to sniff.
      "x-content-type-options": "nosniff",
    },
  });
}

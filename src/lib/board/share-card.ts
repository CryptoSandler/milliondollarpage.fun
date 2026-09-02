import sharp from "sharp";
import { queryOne } from "../db";
import { IMAGE_BEARING_STATUSES, publishesTextSql } from "./block-image";
import { OFF_SITE as CARD } from "./off-site";
import { formatUsdc, pixelCount } from "./pricing";
import { SIGNATURE_KEPT } from "./tape";

/**
 * A sold rectangle, as a picture somebody can post.
 *
 * WHO CALLS THIS: `src/app/api/blocks/[id]/card/route.ts`, and nothing else.
 * The route is the trust boundary — id shape, status ladder, caching, rate
 * limit — and this is the composition, which is the half worth testing without
 * a Request in hand.
 *
 * ## Nothing is stored, and that is the whole design
 *
 * The obvious implementation renders a card at purchase time and keeps it. It
 * does not fit: the stored cap is 100 KiB, and that number is not a preference
 * — it is Irys's free tier, and free uploads are what let the signing key stay
 * permanently unfunded (`image-plan.ts`, `SECURITY.md`). Measured at 1200x630
 * with this same `sharp`: chrome alone is 15 KiB as webp, chrome over pixel art
 * 16 KiB, and chrome over a PHOTOGRAPH **116 KiB** — sixteen over a cap that
 * cannot move, at quality 82, with no headroom left to spend. A photograph is
 * what real uploads are full of, so the case that fails is the ordinary one.
 *
 * So the card is composed per request out of bytes that are already on disk and
 * then thrown away. Zero stored bytes, zero Irys uploads, and the cap stops
 * applying rather than being argued with.
 *
 * ## What is on it, and what is never on it
 *
 * The rectangle, its area, its coordinates, what was paid, and eight characters
 * of the signature that settled it. **No name, no address, no caption, no
 * link.** DESIGN.md's voice section is exact — "Never say who holds a
 * rectangle. When, yes. Who, never." — and a card is the most forwarded surface
 * this product has, so it is the last place to relax that.
 *
 * The caption and link are absent for a second reason as well: a card is
 * rendered from an id anybody can read off `/api/board`, and a shareable image
 * carrying a stranger's link is a phishing vector with our wordmark on it.
 *
 * ## It publishes exactly what the image route publishes
 *
 * Same predicate, imported rather than restated: a reservation's content is not
 * public, and a taken-down block has none. `publishesTextSql` is the one place
 * that rule lives, so a card can never show what `/image` would refuse.
 */

/** The size every social card is, and the size this one is measured at. */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** The panel the buyer's artwork is drawn into, inset from the right edge. */
const ART = { x: 660, y: 135, w: 480, h: 360 } as const;

/**
 * The card's palette lives in `./off-site.ts` now, with the badge's.
 *
 * They are the same object seen at two sizes — the two things this site sends
 * to other people's pages — and two files carrying the same six hexes are two
 * files that come to disagree about them. The argument for copying the values
 * out of DESIGN.md rather than reading them at runtime is unchanged and is in
 * that file.
 */

/**
 * The board's own paper, so the bars a `contain` fit leaves inside the artwork
 * panel are the same colour the wall letterboxes with.
 */
const PAPER = { r: 0xf3, g: 0xed, b: 0xe0, alpha: 1 };

export type ShareCard = { bytes: Buffer; blockPixels: number };

type CardRow = {
  x: number;
  y: number;
  w: number;
  h: number;
  total_usdc: string;
  signature: string | null;
  pending_image: Buffer;
};

/** XML-escapes text going into the SVG overlay. Nothing here is user-authored, and it still escapes. */
function safe(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * The card for one sold rectangle, or null when there is nothing to publish.
 *
 * Null covers every case the image route 404s: a hold, a block that never
 * existed, one whose content was taken down, one with no bytes. The caller
 * turns all of them into the same 404, so a stranger walking ids cannot tell
 * them apart.
 */
export async function renderShareCard(id: string): Promise<ShareCard | null> {
  const row = await queryOne<CardRow>(
    // `left(sig, n) || '…' || right(sig, n)` here for the same reason the tape
    // does it in SQL rather than in the renderer: a whole signature is a lookup
    // key, and one that never enters this process cannot be leaked by it.
    `SELECT x, y, w, h, total_usdc, pending_image,
            CASE
              WHEN payment_signature IS NULL THEN NULL
              WHEN length(payment_signature) <= $3 * 2 THEN payment_signature
              ELSE left(payment_signature, $3) || '…' || right(payment_signature, $3)
            END AS signature
       FROM blocks
      WHERE id = $1
        AND ${publishesTextSql(2)}
        AND pending_image IS NOT NULL`,
    [id, [...IMAGE_BEARING_STATUSES], SIGNATURE_KEPT],
  );
  if (!row) return null;

  const pixels = row.w * row.h;

  /*
    NEAREST NEIGHBOUR, ENLARGING, and it is the same rule the wall obeys. A
    purchase is pixel art far more often than it is a photograph, and a smooth
    resize of pixel art is the one way to make somebody's block look worse in
    the picture advertising it than it looks on the wall. Reducing uses a real
    filter for the mirror-image reason.
  */
  const enlarging = ART.w >= row.w && ART.h >= row.h;
  const art = await sharp(row.pending_image)
    .resize(ART.w, ART.h, {
      fit: "contain",
      kernel: enlarging ? "nearest" : "lanczos3",
      background: PAPER,
    })
    .png()
    .toBuffer();

  const chrome = Buffer.from(`<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${CARD.ground}"/>
  <rect x="40" y="40" width="${CARD_WIDTH - 80}" height="${CARD_HEIGHT - 80}" fill="none" stroke="${CARD.line}" stroke-width="2"/>
  <text x="72" y="116" font-family="monospace" font-size="24" fill="${CARD.quiet}" letter-spacing="4">MILLIONDOLLARPAGE.FUN</text>
  <text x="72" y="248" font-family="monospace" font-size="88" font-weight="700" fill="${CARD.ink}">${safe(`${row.w} × ${row.h}`)}</text>
  <text x="72" y="326" font-family="monospace" font-size="42" fill="${CARD.accent}">${safe(formatUsdc(Number(row.total_usdc)))}</text>
  <text x="72" y="404" font-family="monospace" font-size="26" fill="${CARD.body}">${safe(`${pixelCount(pixels)} at (${row.x}, ${row.y})`)}</text>
  <text x="72" y="452" font-family="monospace" font-size="26" fill="${CARD.quiet}">${safe(row.signature ? `settled · ${row.signature}` : "settled")}</text>
  <text x="72" y="556" font-family="monospace" font-size="24" fill="${CARD.quiet}">yours forever</text>
</svg>`);

  const bytes = await sharp(chrome)
    .composite([{ input: art, left: ART.x, top: ART.y }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { bytes, blockPixels: pixels };
}


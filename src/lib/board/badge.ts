import { OFF_SITE } from "./off-site";
import { pixelCount } from "./pricing";

/**
 * The small picture a buyer pastes on their own site.
 *
 * WHO CALLS THIS: `src/app/api/blocks/[id]/badge/route.ts`, which is the trust
 * boundary — id shape, the status ladder, the headers — and nothing else. This
 * is the drawing, which is the half worth testing without a Request in hand.
 * The arrangement is the one `share-card.ts` and its route already have.
 *
 * ## Why a badge at all
 *
 * `docs/marketing-fomo.md` argued it: the 2005 original spread because 1,400
 * buyers were advertisers with somewhere of their own to put a link, and this
 * is the smallest thing that can carry that. It is one `<a>` and one image, and
 * its whole cost is the paragraph explaining it.
 *
 * **And it cannot be measured.** There is no referrer column in this schema and
 * there is not going to be one — `migrations/014_visits_and_clicks.sql` puts
 * `referrer` on the list of things that may not be added without a decision the
 * owner takes on purpose — so nothing here will ever say whether anybody pasted
 * it. That is written down rather than discovered next year.
 *
 * ## NOTHING ON IT IS USER-AUTHORED, and that is the security design
 *
 * No caption, no link, no name, no signature. Two numbers this repository
 * computed and one string it wrote. A badge is markup we hand somebody to paste
 * into their own page, so the question "is this escaped correctly" is one worth
 * not having: there is no stranger's text in it to escape.
 *
 * The card next door makes the same subtraction for a different reason — it is
 * the most forwarded surface this product has — and both land on the same rule
 * DESIGN.md sets: "Never say who holds a rectangle. When, yes. Who, never."
 *
 * ## It fits whatever font renders it
 *
 * An SVG inside an `<img>` on somebody else's page is drawn with THEIR fonts,
 * and a generic `monospace` is 0.6em wide on most and not on all. So both lines
 * carry an explicit `textLength`, which makes the layout exact by construction
 * in every renderer instead of approximately right in ours. The cost is a
 * little glyph stretching where the local face is not 0.6em; the alternative is
 * a badge that overflows its own border on somebody's blog.
 */

/** The width of one character in a generic monospace face, in em. */
const ADVANCE = 0.6;

const WORDMARK = "MILLIONDOLLARPAGE.FUN";
const WORDMARK_SIZE = 9;
const WORDMARK_TRACKING = 1.4;
const FIGURE_SIZE = 12;

/** The pixel mark on the left: a 3×3 grid of 6px squares with 2px gutters. */
const MARK = { x: 12, cell: 6, gap: 2, cols: 3 };
const MARK_SIZE = MARK.cols * MARK.cell + (MARK.cols - 1) * MARK.gap;
const TEXT_X = MARK.x + MARK_SIZE + 12;
const PAD_RIGHT = 12;

export const BADGE_HEIGHT = 40;

/** Which cells of the mark are the accent. Two of nine, on the diagonal. */
const LIT = new Set([0, 4, 8]);

export type Badge = { svg: string; width: number; height: number };

function textWidth(text: string, size: number, tracking = 0): number {
  return text.length * size * ADVANCE + Math.max(0, text.length - 1) * tracking;
}

/**
 * The badge for one sold rectangle.
 *
 * The width is computed from the two lines rather than fixed, so a 1×1 purchase
 * gets a small badge and a 1250×800 one gets a wide badge, and neither is
 * padded out to the other's size.
 */
export function renderBadge(block: { w: number; h: number }): Badge {
  const figure = `${block.w} × ${block.h} · ${pixelCount(block.w * block.h)}`;
  const wordmarkWidth = textWidth(WORDMARK, WORDMARK_SIZE, WORDMARK_TRACKING);
  const figureWidth = textWidth(figure, FIGURE_SIZE);
  const width = Math.ceil(TEXT_X + Math.max(wordmarkWidth, figureWidth) + PAD_RIGHT);

  const mark = Array.from({ length: MARK.cols * MARK.cols }, (_, i) => {
    const x = MARK.x + (i % MARK.cols) * (MARK.cell + MARK.gap);
    const y = (BADGE_HEIGHT - MARK_SIZE) / 2 + Math.floor(i / MARK.cols) * (MARK.cell + MARK.gap);
    const fill = LIT.has(i) ? OFF_SITE.accent : OFF_SITE.line;
    return `<rect x="${x}" y="${y}" width="${MARK.cell}" height="${MARK.cell}" fill="${fill}"/>`;
  }).join("");

  /*
    NOTHING IS FETCHED AND NOTHING IS RUN. No script, no foreignObject, no
    xlink:href, no @font-face and no external anything — an SVG in an `<img>`
    cannot execute a script anyway, and a badge that quietly fetched a font
    would be this site watching a page it does not own. The route says the same
    thing again in a Content-Security-Policy header, so a future edit that adds
    one is refused by the browser rather than caught in review.
  */
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BADGE_HEIGHT}" viewBox="0 0 ${width} ${BADGE_HEIGHT}" role="img" aria-label="${figure} on milliondollarpage.fun">` +
    `<title>${figure} on milliondollarpage.fun</title>` +
    `<rect width="${width}" height="${BADGE_HEIGHT}" fill="${OFF_SITE.ground}"/>` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${BADGE_HEIGHT - 1}" fill="none" stroke="${OFF_SITE.line}"/>` +
    mark +
    `<text x="${TEXT_X}" y="17" font-family="monospace" font-size="${WORDMARK_SIZE}" letter-spacing="${WORDMARK_TRACKING}" fill="${OFF_SITE.quiet}" textLength="${wordmarkWidth.toFixed(1)}" lengthAdjust="spacingAndGlyphs">${WORDMARK}</text>` +
    `<text x="${TEXT_X}" y="32" font-family="monospace" font-size="${FIGURE_SIZE}" font-weight="700" fill="${OFF_SITE.ink}" textLength="${figureWidth.toFixed(1)}" lengthAdjust="spacingAndGlyphs">${figure}</text>` +
    `</svg>`;

  return { svg, width, height: BADGE_HEIGHT };
}

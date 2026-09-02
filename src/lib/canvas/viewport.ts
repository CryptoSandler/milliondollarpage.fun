/**
 * Zoom, pan, and the screen-to-board conversion, with no DOM in sight.
 *
 * Kept pure so the fiddly part — the part where a zoom drifts by half a pixel
 * and nobody can say why — is unit tested instead of eyeballed.
 *
 * This board is 1250x800 pixels — a million of them, and not a square. Nothing
 * in this file knows those numbers: every function takes the board's size as a
 * `{width, height}`, which is what let the wall change shape without the fit
 * maths changing at all. THE WHOLE OF IT IS ALWAYS ON SCREEN at the bottom of
 * the zoom ladder, and zoom goes in far enough to pick out a single pixel.
 *
 * The last section of the file is about crispness rather than position: the
 * backing-store size and the zoom ladder that keep a board pixel sitting on a
 * whole number of screen pixels instead of somewhere between two.
 */

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Viewport = { centreX: number; centreY: number; scale: number };

/**
 * The chrome around the board, in CSS pixels, one number per edge.
 *
 * Whatever the layout puts there — the top bar, the bottom bar on a phone, the
 * side panel on a landscape window — is an inset the board is not allowed to
 * sit under. Measured from the real elements rather than assumed, because a
 * bar's height depends on rem sizing and safe-area insets that no constant
 * can mirror.
 */
export type Chrome = { top: number; right: number; bottom: number; left: number };

/**
 * How far a pointer may travel and still count as a tap.
 *
 * Every pan on a touchscreen ends with a pointerup somewhere on the canvas. If
 * that always painted, the board would fill with pixels nobody meant to place.
 */
export const TAP_SLOP_PX = 8;

export function isTap(totalMovement: number): boolean {
  return totalMovement <= TAP_SLOP_PX;
}

export function boardToScreen(v: Viewport, screen: Size, board: Point): Point {
  return {
    x: screen.width / 2 + (board.x - v.centreX) * v.scale,
    y: screen.height / 2 + (board.y - v.centreY) * v.scale,
  };
}

export function screenToBoard(v: Viewport, screen: Size, point: Point): Point {
  return {
    x: v.centreX + (point.x - screen.width / 2) / v.scale,
    y: v.centreY + (point.y - screen.height / 2) / v.scale,
  };
}

/**
 * Zooms about a screen point, leaving whatever is under it exactly where it is.
 *
 * `target` is an ABSOLUTE scale, not a factor. That matters: the wheel snaps to
 * the rungs of `zoomLadder` below, and a rung reached by multiplying by
 * `rung / v.scale` arrives as 2.0000000000000004 rather than 2. The whole point
 * of the ladder is that a board pixel lands on a whole number of screen pixels,
 * so the exact value has to survive the trip.
 */
export function zoomToScale(
  v: Viewport,
  screen: Size,
  point: Point,
  target: number,
  limits: { min: number; max: number },
): Viewport {
  const scale = Math.min(limits.max, Math.max(limits.min, target));
  if (scale === v.scale) return v;

  const anchor = screenToBoard(v, screen, point);
  const offsetX = point.x - screen.width / 2;
  const offsetY = point.y - screen.height / 2;

  return {
    scale,
    centreX: anchor.x - offsetX / scale,
    centreY: anchor.y - offsetY / scale,
  };
}

export function panBy(v: Viewport, dxBoard: number, dyBoard: number): Viewport {
  return { ...v, centreX: v.centreX + dxBoard, centreY: v.centreY + dyBoard };
}

/** Keeps the centre on the board, so the canvas cannot be lost off-screen. */
export function clampToBoard(v: Viewport, board: Size): Viewport {
  return {
    ...v,
    centreX: Math.min(board.width, Math.max(0, v.centreX)),
    centreY: Math.min(board.height, Math.max(0, v.centreY)),
  };
}

/**
 * CONTAIN, not cover.
 *
 * The whole board is always on screen. It is scaled by its LIMITING dimension —
 * whichever of the free region's width and height runs out first — so all four
 * corners are visible at once, board pixels stay square, and nothing overflows
 * in either axis. A 1250×800 board in a free region 1400 wide and 848 tall
 * renders 1325×848 with the slack on the left and right.
 *
 * This reverses the previous contract, which filled the viewport width and
 * panned the vertical overflow. That is a deliberate change of mind by the
 * owner after using the thing, not a regression: the leftover width is no
 * longer dead margin, because in a landscape window the controls live in it.
 *
 * The clamp on scale is not decoration: a zero-sized viewport (the first paint,
 * before layout has run) yields a scale of zero, and every screen-to-board
 * conversion downstream divides by it. It is the ONE case in which the fitted
 * board can be larger than the region it is fitted into — a region that has no
 * room for a board at all.
 */
const MIN_FIT_SCALE = 0.01;

/**
 * The board's frame: 2px of ink drawn immediately OUTSIDE the paper, on all
 * four sides.
 *
 * It replaces the 1px hairline in the coarse rule's tone that used to draw the
 * sheet's edge. The hairline was the right weight for a boundary nobody had to
 * find; it was the wrong one for a boundary that has to be seen not to be
 * clipped — and it was in fact being clipped, off the right-hand edge of the
 * window, which is the bug this constant exists to make impossible.
 *
 * It is part of the board's footprint rather than decoration on top of it: the
 * fit maths below reserves room for it through BOARD_INSET, so a fit that fits
 * the board but cuts its own border cannot happen.
 */
export const BOARD_FRAME_PX = 2;

/**
 * The paper the board keeps between its frame and everything around it, on all
 * four sides, plus the frame itself.
 *
 * The sheet is pinned to a wall, and a sheet flush against the edge of the
 * window reads as cropped rather than as hung. It used to be a bottom gap
 * alone, on the argument that "every other edge already has something between
 * the board and the window — the top bar, the side panel, the bottom bar".
 * That argument was wrong about two edges and it showed: the board is scaled
 * by its LIMITING dimension, so whenever width is the limit its left and right
 * edges land exactly on the free region's, which put the sheet's own edge
 * under the side panel on one side and off the window on the other.
 *
 * It is an INSET, part of the chrome the free region is computed from, not a
 * margin on the canvas. A margin would add to the page's size and the document
 * is not allowed to scroll; an inset takes the room out of the board's share
 * before the fit maths ever sees it. DESIGN.md's gutter is 16px and the brief
 * asks for 16–24; 20 sits in the middle of both, and the frame is added to it
 * so the number is clear paper rather than paper the border is drawn over.
 *
 * IT WAS 20 AND IS NOW 8, and that is an amendment with a reason rather than a
 * slip. Twenty was chosen when the chrome around the board was a 52px bar and a
 * 288px column, where eight would have looked mean. The layout now runs on a
 * vertical chrome budget of 60px — a 34px header and a 26px rail — and against
 * that, a 20px inset top and bottom is 40px, two thirds of the entire budget
 * spent on clear paper. Eight still reads as hung rather than cropped, and the
 * 2px frame still sits inside it and still never covers a pixel.
 */
export const BOARD_INSET = 8 + BOARD_FRAME_PX;

/**
 * The top bar's height, nominally, in CSS pixels.
 *
 * It mirrors `--bar-top-h` in globals.css. Two things need it before there is
 * anything to measure: `BoardView`'s first-paint chrome, and the boot script in
 * `layout.tsx` that decides the layout before the first frame. The real height
 * is measured off the element the moment there is one — this is only ever the
 * assumption the very first paint has to make, and it is the same assumption
 * the stylesheet makes.
 */
export const BAR_TOP_PX = 34;

/**
 * The narrowest a side rail may be, and the widest it may grow.
 *
 * WHO USES THESE: `sideRailWidth` below, the boot script in `layout.tsx` that
 * stamps the layout before the first paint, and `scripts/board-share.mts`.
 *
 * 200 IS A RAIL THAT CAN BE READ, and it replaced 180 and 108 both.
 *
 * 180 was the narrowest rail nothing OVERFLOWED — the Buy button wrapping, a
 * settled row's proof wrapping, a standings row stacking — and 108 was the same
 * question asked of the controls alone. Both answered "does it fit". The owner
 * looked at a 120px rail in production and asked the other question: **can it
 * be read.** It could not. A register whose every row wraps twice and a preset
 * whose label has been cut to a number are a column that fits and says nothing.
 *
 * So the floor is what the rail needs to hold its contents AT FULL LENGTH: the
 * preset labels as `10×10` and `100×100` rather than `10` and `100`, and a
 * settled row on one legible line per item — the thumbnail, the size, the
 * amount, the age and the proof, none of them wrapped. Measured, that is 200.
 * Below it there is no rail at all, and the overlay goes back on the wall with
 * the resting rule that gets it out of the way.
 *
 * 288 IS THIS DESIGN'S OWN NUMBER: the width at which that button gets its
 * longest label, `Buy these pixels — $1,000,000.00`, back on one line. Past it
 * the leftover stays wall rather than becoming a wider rail. See DESIGN.md,
 * "The threshold, and the arithmetic that sets it".
 */
export const SIDE_RAIL_MIN = 200;
export const SIDE_RAIL_MAX = 288;

/**
 * How wide the FULL rails are at this viewport, and 0 when they do not fit.
 *
 * A thin reading of `railLayout` below, kept because two guards and a document
 * ask exactly this question — "does this viewport get the register and the
 * purchase panel in columns" — and because the answer is one word rather than a
 * shape.
 */
export function sideRailWidth(screen: Size, board: Size): number {
  const layout = railLayout(screen, board);
  return layout.kind === "full" ? layout.width : 0;
}

/**
 * The settled register's height along the bottom, nominally, in CSS pixels.
 *
 * Mirrors `--tape-h`. `BoardView` measures the real box; this is what the very
 * first paint has to assume, and what the layout without rails is fitted under.
 */
export const TAPE_H_PX = 26;

/**
 * Which pair of rails this viewport gets, and how wide they are.
 *
 * WHO CALLS THIS: the boot script in `layout.tsx`, and `rails-boot.test.ts`.
 *
 * ## RAILS COME IN PAIRS OR THEY DO NOT COME
 *
 * A rail down one side and nothing down the other puts the board off the
 * middle of the window by half a rail, which is what the owner saw at
 * 2495×1484: a column of controls on the left, an identical empty gap on the
 * right, and a wall that reads as slipped. So both sides are the same width or
 * neither side exists, and the board is centred in the VIEWPORT rather than in
 * whatever is left of it.
 *
 * ## Two pairs, one gap
 *
 * The gap is the same number for both: the letterbox left by a board fitted
 * under the header alone, because in both layouts the settled register has left
 * the bottom of the window for the right-hand rail. What differs is only what
 * the pair can hold.
 *
 * - **`full`, from 200px.** Left: the controls and the purchase panel. Right:
 *   the register as a vertical ticker, and the standings.
 * - **`off` below that**, which is the layout this stylesheet already had: the
 *   overlay on the wall with its resting rule, and the register along the
 *   bottom. There is no middle kind — a rail that has to shorten its own labels
 *   to fit is a rail that should not be there.
 *
 * THE WALL NEVER CEDES WIDTH TO EITHER. Both are sized from a letterbox a
 * height-limited board already leaves, so the board is not refitted — and
 * because the register leaves the bottom of the window, it is fitted to MORE
 * height than before and comes out larger, never smaller.
 */
export type RailLayout = { kind: "off" | "full"; width: number };

export function railLayout(screen: Size, board: Size): RailLayout {
  const free = screen.height - BAR_TOP_PX - 2 * BOARD_INSET;
  const gap = (screen.width - 2 * BOARD_INSET - (board.width / board.height) * free) / 2;

  if (gap >= SIDE_RAIL_MIN) return { kind: "full", width: Math.min(gap, SIDE_RAIL_MAX) };
  return { kind: "off", width: 0 };
}

/** The hover card's own width: `w-56` on the element in `BoardView`, 14rem. */
export const HOVER_CARD_W = 224;
/** How far the card sits from the pointer, on whichever side it ends up. */
const HOVER_CARD_GAP = 14;

/**
 * Where the hover card's left edge goes, given the pointer and the chrome.
 *
 * WHO CALLS THIS: `BoardView`, which draws that card, and nothing else. It is
 * here rather than in that file because it is geometry with no DOM in it — the
 * viewport width is a parameter, not a global — and because the flip below has
 * three branches, which is three more than a browser is a good place to debug.
 *
 * IT KEEPS THE CARD INSIDE THE BOARD'S OWN FREE REGION, not merely inside the
 * window. The old rule was `min(x + 14, innerWidth - 240)` — the window's right
 * edge, which was right when the only thing beside the board was wall and wrong
 * the moment a rail stands there: a rectangle hovered at the board's right edge
 * put the card over the settled register, which is chrome covering chrome with
 * the artwork's own metadata.
 *
 * `chrome.left` and `chrome.right` already carry the rails plus the board's
 * inset — `BoardView` measures them off the rails' real boxes — so nothing here
 * needs a second opinion about which layout is in force.
 *
 * It PREFERS the right of the pointer, FLIPS to the left where the card would
 * not fit, and clamps only as a last resort, so the card is never pushed off
 * the pointer it belongs to unless the free region is narrower than the card
 * itself. On a phone it is not: 390px leaves 370 against 224.
 */
export function hoverCardLeft(pointerX: number, viewportWidth: number, chrome: Chrome): number {
  const from = chrome.left;
  const to = viewportWidth - chrome.right;

  const right = pointerX + HOVER_CARD_GAP;
  const left = pointerX - HOVER_CARD_GAP - HOVER_CARD_W;
  const placed = right + HOVER_CARD_W <= to ? right : left;

  return Math.max(from, Math.min(placed, to - HOVER_CARD_W));
}

/** The rectangle of viewport the board may use: everything the chrome leaves. */
export function freeRegion(screen: Size, chrome: Chrome): { x: number; y: number } & Size {
  return {
    x: chrome.left,
    y: chrome.top,
    width: Math.max(0, screen.width - chrome.left - chrome.right),
    height: Math.max(0, screen.height - chrome.top - chrome.bottom),
  };
}

/** The scale at which the entire board sits inside the free region. */
export function fitScale(screen: Size, chrome: Chrome, board: Size): number {
  const free = freeRegion(screen, chrome);
  return Math.max(MIN_FIT_SCALE, Math.min(free.width / board.width, free.height / board.height));
}

/**
 * How much room the board actually asks for at the fit scale.
 *
 * Exported because "the document never scrolls" is an arithmetic claim before
 * it is a CSS one, and this is the arithmetic: for any viewport, this plus the
 * chrome must be no larger than the viewport itself. `overflow: hidden` then
 * has nothing left to hide.
 */
export function fittedBoardSize(screen: Size, chrome: Chrome, board: Size): Size {
  const scale = fitScale(screen, chrome, board);
  return { width: board.width * scale, height: board.height * scale };
}

/**
 * Where the viewport centre sits, on one axis, to put the board's own centre in
 * the middle of the free region.
 *
 * Independent of the screen size: it only depends on how lopsided the chrome
 * is. With 52px of bar above and nothing below, the board's centre has to sit
 * 26 screen pixels — 26/scale board pixels — below the middle of the window.
 */
function centredOnAxis(before: number, after: number, boardSize: number, scale: number): number {
  return boardSize / 2 + (after - before) / (2 * scale);
}

/**
 * The range the viewport centre may take on one axis while the board still
 * covers the free region there, in board pixels.
 *
 * `min` puts the board's leading edge on the region's leading edge; `max` puts
 * its trailing edge on the region's trailing edge. When the board is smaller
 * than the region on this axis — which at the base rung is true of everything
 * except the limiting dimension — the range inverts (`min > max`), and that
 * inversion is the signal that there is nothing to pan here.
 */
function panRange(
  screenSize: number,
  before: number,
  after: number,
  boardSize: number,
  scale: number,
): { min: number; max: number } {
  const half = screenSize / 2;
  return {
    min: (half - before) / scale,
    max: boardSize - (screenSize - after - half) / scale,
  };
}

function clampAxis(
  centre: number,
  screenSize: number,
  before: number,
  after: number,
  boardSize: number,
  scale: number,
): number {
  const { min, max } = panRange(screenSize, before, after, boardSize, scale);
  return min <= max ? Math.min(max, Math.max(min, centre)) : centredOnAxis(before, after, boardSize, scale);
}

/**
 * The view the board opens on: the whole thing, centred in the free region.
 *
 * No anchoring to the top edge any more, because there is no overflow to
 * anchor against — every corner of the artwork is already on screen, and the
 * first thing a visitor sees is the board's shape rather than a crop of it.
 */
export function initialViewport(screen: Size, chrome: Chrome, board: Size): Viewport {
  const scale = fitScale(screen, chrome, board);
  return {
    scale,
    centreX: centredOnAxis(chrome.left, chrome.right, board.width, scale),
    centreY: centredOnAxis(chrome.top, chrome.bottom, board.height, scale),
  };
}

/**
 * Keeps the board where the contract says it belongs while it is zoomed.
 *
 * Per axis: once the board is bigger than the free region on that axis — which
 * only happens above the base rung — pan until an edge of the board meets the
 * corresponding edge of the region and no further, so no drag can pull the
 * artwork off screen and leave cream where it was. While it is smaller, there
 * is nothing to pan and it is pinned to the middle of the region, which is
 * what makes a wheel-pan at the base rung a no-op by construction rather than
 * by a check somebody could forget to write.
 */
export function clampToFit(v: Viewport, screen: Size, chrome: Chrome, board: Size): Viewport {
  return {
    ...v,
    centreX: clampAxis(v.centreX, screen.width, chrome.left, chrome.right, board.width, v.scale),
    centreY: clampAxis(v.centreY, screen.height, chrome.top, chrome.bottom, board.height, v.scale),
  };
}

/**
 * Whether there is anything to pan.
 *
 * THE READING OF "ZOOM 1" THIS PROJECT USES, so nobody has to guess it again:
 * the base rung is the scale at which the whole board fits, NOT one screen
 * pixel per board pixel. So the ladder's floor is `fit`, the integer rungs are
 * the ones strictly above `fit`, and panning is enabled exactly when the scale
 * is strictly above `fit` — at the floor the entire board is on screen and a
 * drag or a wheel has nowhere to take it.
 */
export function canPan(scale: number, fit: number): boolean {
  return above(scale, fit);
}

/* ------------------------------------------------------------------------- *
 * Crisp pixels
 *
 * Blocks are small bitmaps of somebody's artwork. They have to read as SHARP
 * PIXELS at every scale the board offers, never as interpolated mush, which
 * takes two things: a backing store measured in real device pixels, and a zoom
 * that only ever stops where a board pixel covers a whole number of them.
 * ------------------------------------------------------------------------- */

/**
 * The canvas backing store for a CSS box at a given device pixel ratio.
 *
 * The canvas element has no intrinsic size — CSS gives it its box, and
 * `canvas.width`/`canvas.height` are a separate thing entirely: the number of
 * real pixels the browser allocates behind it. Leave them at the default 300×150
 * and the browser stretches that postage stamp across the whole viewport, which
 * is exactly the mush this board must not show. They must be the CSS size times
 * the device pixel ratio, and the drawing context scaled by the same ratio so
 * everything downstream can keep speaking CSS pixels.
 *
 * Rounded, because a backing store is a whole number of pixels: a 1440.5 CSS
 * pixel box at a ratio of 1.5 wants 2160.75, and the browser would truncate
 * silently. Rounding here makes the half-pixel a decision instead.
 *
 * A ratio of zero, NaN, or undefined (`window.devicePixelRatio` on an ancient
 * browser) falls back to 1 rather than allocating a zero-sized store.
 */
export function backingStoreSize(css: Size, dpr: number): Size {
  const ratio = dpr > 0 ? dpr : 1;
  return {
    width: Math.round(css.width * ratio),
    height: Math.round(css.height * ratio),
  };
}

/**
 * The scales the wheel is allowed to stop on.
 *
 * The bottom rung is `fit` itself — the scale at which the WHOLE BOARD is on
 * screen. It is almost never an integer (a 608px-tall free region over an
 * 800-pixel board fits at 0.76) and it is not negotiable: anything below it
 * would shrink a board that is already entirely visible, which buys nothing.
 * So the ladder is not simply the powers of two.
 *
 * Above it are the powers of two STRICTLY GREATER than fit, up to `maxZoom`.
 * Each doubles the screen pixels per board pixel, so a board pixel is a 2×2,
 * 4×4, 8×8 or 16×16 square of screen pixels and every edge in the artwork
 * lands on a pixel boundary.
 *
 *   608px of free height → fit 0.76 → [0.76, 1, 2, 4, 8, 16]
 *  1120px of free height → fit 1.40 → [1.4, 2, 4, 8, 16]
 *
 * Note the second case skips 1 entirely: 1 is below fit, so it is not a rung —
 * and "zoom 1" in this project means this bottom rung, the whole board on
 * screen, never one screen pixel per board pixel. `fit` outranks `maxZoom` if
 * they ever conflict, because a board that does not fit breaks the contract in
 * a way that a board zoomed slightly too far does not.
 */
export function zoomLadder(fit: number, maxZoom: number): number[] {
  const rungs = [fit];
  for (let rung = 1; rung <= maxZoom; rung *= 2) {
    if (above(rung, fit)) rungs.push(rung);
  }
  return rungs;
}

/**
 * One step up or down the ladder from wherever the viewport currently sits.
 *
 * This replaces multiplying by a continuous 1.15 per wheel notch, which put a
 * board pixel on 1.87 screen pixels far more often than on 2 and made every
 * upload look soft.
 *
 * `current` is not assumed to be on a rung: a window resize recomputes the fit
 * scale and can leave the scale anywhere, so the step is always "the nearest
 * rung in that direction" rather than an index.
 *
 * ONE HONEST CAVEAT, and it is not fixable from here. An integer CSS scale is
 * only an integer number of DEVICE pixels when `devicePixelRatio` is itself an
 * integer. At the 1.5 that Windows display scaling is full of, CSS scale 1 is
 * 1.5 device pixels per board pixel; at the 2.75 some Android phones report,
 * CSS scale 2 is 5.5. Snapping the ladder in device space instead would fix
 * that and break something worse — the bottom rung must be exactly `fit`, an
 * irrational-ish number fixed by the free region, and a device-space ladder
 * cannot contain it. So this ladder is deliberately in CSS space, and
 * on a fractional ratio the residual error is left to the nearest-neighbour
 * sampling that BoardCanvas turns on: the artwork degrades to some rows of
 * device pixels being one wider than their neighbours — hard edges, slightly
 * uneven — rather than to a blur. Integer ratios (1, 2, 3) are exact.
 */
export function nextZoomScale(
  current: number,
  direction: "in" | "out",
  fit: number,
  maxZoom: number,
): number {
  const rungs = zoomLadder(fit, maxZoom);
  const floor = rungs[0];
  const top = rungs[rungs.length - 1];
  // A scale that has drifted outside the ladder — a resize between wheel
  // notches — steps from the nearest end rather than falling off.
  const at = Math.min(top, Math.max(floor, current));

  if (direction === "in") return rungs.find((rung) => above(rung, at)) ?? top;
  const lower = rungs.filter((rung) => above(at, rung));
  return lower.length > 0 ? lower[lower.length - 1] : floor;
}

/**
 * `a > b`, with enough slack that a scale which has been through a float
 * round trip does not read as a rung above itself and step nowhere.
 */
function above(a: number, b: number): boolean {
  return a > b + 1e-9 * Math.max(1, Math.abs(b));
}

/**
 * Whether the ladder has a rung left in each direction.
 *
 * The wheel and the pinch can be pressed at the ends of the ladder without
 * anyone noticing — they simply do nothing. A BUTTON cannot: a + that never
 * zooms is a broken button, so the panel has to be able to disable it. This
 * is the same question `nextZoomScale` answers implicitly, asked out loud and
 * in one place, so the button's disabled state can never disagree with what
 * pressing it would actually do.
 *
 * `canZoomOut` is deliberately the same predicate as `canPan`: the bottom rung
 * is fit, and at fit there is neither anything to zoom out to nor anywhere to
 * pan to.
 *
 * Called by BoardCanvas, which reports the answer up to SelectionPanel's zoom
 * buttons.
 */
export function zoomAffordance(
  scale: number,
  fit: number,
  maxZoom: number,
): { canZoomIn: boolean; canZoomOut: boolean } {
  const rungs = zoomLadder(fit, maxZoom);
  return {
    canZoomIn: above(rungs[rungs.length - 1], scale),
    canZoomOut: above(scale, rungs[0]),
  };
}

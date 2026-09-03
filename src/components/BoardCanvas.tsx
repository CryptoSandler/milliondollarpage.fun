"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { blockImageUrl } from "../lib/board/block-image";
import type { BlockDetails, BoardRect } from "../lib/board/blocks";
import type { Wall } from "../lib/board/composite";
import { DETAIL_MIN_SCALE, detailRects, wantsDetail } from "../lib/board/detail";
import { placeImage } from "../lib/board/image-fit";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  RULE_PIXELS,
  rectContains,
  type Point,
  type Rect,
} from "../lib/board/geometry";
import {
  describeCursor,
  keyToCommand,
  nextCursor,
  rectUnderCursor,
} from "../lib/board/keyboard-cursor";
import { formatUsdc } from "../lib/board/pricing";
import {
  type Selection,
  describeSelection,
  presetSelectionForMove,
  selectionFromDrag,
  selectionFromPreset,
} from "../lib/board/selection";
import {
  BOARD_FRAME_PX,
  type Chrome,
  type Viewport,
  backingStoreSize,
  boardToScreen,
  canPan,
  clampToFit,
  fitScale,
  freeRegion,
  initialViewport,
  isTap,
  nextZoomScale,
  panBy,
  screenToBoard,
  zoomAffordance,
  zoomToScale,
} from "../lib/canvas/viewport";

/**
 * The top rung of the zoom ladder: sixteen screen pixels per board pixel, so a
 * ten-pixel block fills 160px and a single pixel of somebody's artwork is a
 * 16×16 square. The ladder only ever stops on a power of two, so this is a rung
 * and not a ceiling nothing reaches — it used to be 24, which the old
 * continuous 1.15-per-notch zoom could land on and nothing now can.
 */
const MAX_ZOOM = 16;

/**
 * The wall, as the viewport maths wants it: a width and a height that are no
 * longer the same number. Everything in this file that fits, clamps or draws
 * the board reads it from here, so the six places that used to write
 * one square board size cannot drift apart from each
 * other or from `geometry.ts`.
 */
const BOARD = { width: BOARD_WIDTH, height: BOARD_HEIGHT };

/**
 * How far two fingers have to spread before a pinch counts as one rung.
 *
 * The ladder is integer steps, so a pinch cannot be continuous either: it has
 * to accumulate into a step. A third again as far apart is a deliberate
 * gesture and not a hand resettling on the glass.
 */
const PINCH_STEP = 1.35;

/**
 * One rung of the zoom ladder about a point, clamped back into the contract.
 *
 * Module level and pure, so the native wheel listener (registered once, with
 * no React closure to go stale) and the pinch handler can share exactly one
 * definition of what a zoom step is.
 *
 * The floor is the FIT scale — the rung where the whole board is on screen —
 * not 1. See canPan in viewport.ts for why that is the reading of "zoom 1".
 */
function steppedZoom(
  v: Viewport,
  screen: { width: number; height: number },
  chrome: Chrome,
  point: Point,
  direction: "in" | "out",
): Viewport {
  const fit = fitScale(screen, chrome, BOARD);
  return clampToFit(
    zoomToScale(v, screen, point, nextZoomScale(v.scale, direction, fit, MAX_ZOOM), {
      min: fit,
      max: Math.max(fit, MAX_ZOOM),
    }),
    screen,
    chrome,
    BOARD,
  );
}

/**
 * The board's own palette, mirroring the tokens in globals.css.
 *
 * A canvas cannot read a CSS custom property without a `getComputedStyle` on
 * every frame, so these are restated here. They are the DESIGN.md values and
 * nothing else; if one changes there, it changes here.
 *
 * THE RULE THAT OUTRANKS THE REST: state never depends on the buyer's colour.
 * The paper's cream is what "available" looks like; colour or a bitmap is what
 * "sold" looks like. A buyer may upload cream — so a sold rectangle also
 * carries an ink edge wherever there is room to draw one, and the ruling, when
 * the zoom is close enough to show it, is drawn UNDER the wall bitmap and
 * therefore only survives on pixels nobody has bought.
 *
 * What covers a sold rectangle is the composite wall (see composite.ts).
 * `sold` below is what goes down UNDER it: the fallback a rectangle shows
 * while the wall is in flight, and the only thing it shows if the wall never
 * arrives. It is not the sold treatment; the artwork is.
 */
/**
 * The board's palette, READ FROM THE STYLESHEET rather than written here.
 *
 * A canvas cannot use a CSS custom property, so this file used to hold its own
 * copy of every colour the board paints — which was survivable with one
 * register and is not with two: a hard-coded palette would paint the dark
 * board's near-black paper under a reader who chose light.
 *
 * So the values come from `getComputedStyle` on the document element, which is
 * where `globals.css` has already resolved the theme, the media query and the
 * reader's own choice into one answer. There is exactly one place a colour is
 * decided, and `design-tokens.test.ts` checks that place against DESIGN.md.
 *
 * IT IS RE-READ WHEN THE THEME CHANGES. `useThemePaint` below watches the
 * `data-theme` attribute and the `prefers-color-scheme` media query, because a
 * canvas does not repaint itself when a stylesheet changes underneath it — the
 * board would keep the old register until something else forced a frame.
 */
type Paint = Record<PaintKey, string>;

const PAINT_TOKENS = {
  ground: "canvas",
  paper: "paper",
  ruleFine: "hairline",
  ruleCoarse: "hairline-strong",
  frame: "frame",
  sold: "sold-fallback",
  soldEdge: "sold-edge",
  held: "hold",
  heldEdge: "paper",
  heldRule: "hold-hatch",
  chip: "hold",
  chipText: "ink",
  lift: "hairline",
  selection: "ink",
  onSelection: "paper",
  selectionFill: "hairline",
  ring: "paper",
  danger: "danger",
  dangerFill: "danger-soft",
} as const;

type PaintKey = keyof typeof PAINT_TOKENS;

/**
 * The first paint, before the browser has been asked.
 *
 * Server-rendered HTML has no computed style to read, and the very first client
 * frame runs before this component's effect. These are the LIGHT theme's values
 * — `:root`'s, which is what an un-stamped document resolves to — so a reader
 * on the light register never sees a wrong frame at all, and a reader on the
 * dark one sees at most the frame before the effect runs.
 */
const FALLBACK_PAINT: Paint = {
  ground: "#f3ede0",
  paper: "#f3ede0",
  ruleFine: "rgba(43, 36, 28, 0.1)",
  ruleCoarse: "#c9baa0",
  frame: "#2b241c",
  sold: "#443a2c",
  soldEdge: "#2b241c",
  held: "#c9baa0",
  heldEdge: "#f3ede0",
  heldRule: "rgba(43, 36, 28, 0.62)",
  chip: "#c9baa0",
  chipText: "#2b241c",
  lift: "rgba(43, 36, 28, 0.1)",
  selection: "#2b241c",
  onSelection: "#f3ede0",
  selectionFill: "rgba(43, 36, 28, 0.1)",
  ring: "#f3ede0",
  danger: "#a8371f",
  dangerFill: "#f1d4c8",
};

/**
 * The palette the draw loop reads, as one mutable module value.
 *
 * MUTABLE ON PURPOSE, and it is the smaller of two costs. The board draws in an
 * imperative loop that touches these twenty-seven times a frame; calling
 * `getComputedStyle` there would put a layout read in the hot path of every pan
 * and zoom. Threading a palette through every helper would be the tidy
 * alternative and would change every signature in this file for a value that is
 * the same for all of them.
 *
 * So it is read once at mount and again when the theme actually changes, and
 * the draw loop keeps reading a plain object. `refreshPaint` is the only writer.
 */
let PAINT: Paint = FALLBACK_PAINT;

export function refreshPaint(): void {
  PAINT = readPaint();
}

function readPaint(): Paint {
  if (typeof window === "undefined") return FALLBACK_PAINT;
  const style = getComputedStyle(document.documentElement);
  const read = (token: string) => style.getPropertyValue(`--${token}`).trim();

  const paint = { ...FALLBACK_PAINT };
  for (const [key, token] of Object.entries(PAINT_TOKENS) as [PaintKey, string][]) {
    const value = read(token);
    if (value) paint[key] = value;
  }
  return paint;
}


// A caption chip on the board itself needs room to be read; below this it is
// noise over the artwork and the hover card carries it instead.
const CHIP_MIN_BLOCK_PX = 96;
const CHIP_HEIGHT = 18;

/**
 * The zoom at which the graph paper appears at all: eight screen pixels per
 * WALL pixel.
 *
 * There is no ruling at fit, and that is the change the pixel made. A rule
 * every ten pixels drawn over a wall scaled to 0.78 is a line every eight
 * screen pixels across the whole sheet — moiré, and worse than moiré, a lie:
 * it draws a grid on a board where a purchase is any rectangle, exact to the
 * pixel, with nothing to snap to. The ruling comes back only when a single
 * wall pixel is big enough to see, which is the zoom at which counting by tens
 * is a thing somebody might actually want to do.
 *
 * Both tiers arrive together. Below this there is nothing to navigate BY; above
 * it the fine tier gives the eye a step and the coarse one gives it a landmark.
 *
 * It is `DETAIL_MIN_SCALE`, and that is the same number rather than a
 * coincidence: the zoom at which a single wall pixel is worth counting is the
 * zoom at which a single wall pixel is worth drawing properly. See detail.ts.
 */
const RULE_VISIBLE_SCALE = DETAIL_MIN_SCALE;

/**
 * How many screen pixels wide a sold rectangle has to be before it is given
 * its ink edge.
 *
 * The edge exists so two adjacent sold rectangles stay separate when their
 * artwork is the same colour. On a one-pixel purchase at fit — well under one
 * screen pixel — a 1px stroke would be bigger than the thing it outlines, and
 * a wall of them would read as a grid of ink rather than as artwork. Below
 * this the rectangles are too small to tell apart at that zoom anyway, and
 * zooming in is what separates them.
 */
const SOLD_EDGE_MIN_PX = 4;

/**
 * How many decoded detail bitmaps may be held before the ones nobody is
 * looking at are dropped.
 *
 * Twice `DETAIL_MAX_RECTS` and a little: enough that a slow pan back and forth
 * across the same neighbourhood keeps hitting the cache, small enough that a
 * long session at high zoom cannot accumulate a decoded bitmap for every
 * purchase it has ever passed over.
 */
const DETAIL_CACHE_MAX = 64;

// The held hatch, in SCREEN pixels rather than board pixels, so a hold is
// equally legible on a ten-pixel block at cover scale and on a 100x100 block
// zoomed in. Seven is wide enough to read as separate strokes on a block small
// enough to be a few screen pixels across.
const HELD_HATCH_STEP = 7;

// The marching ants: 12px of dash cycle every 600ms, per DESIGN.md. Advancing
// one pixel every 50ms gets there without redrawing the board sixty times a
// second for an animation that moves twenty pixels in one.
const ANTS_INTERVAL_MS = 50;
const ANTS_DASH = 6;

/**
 * How long the cursor has to sit still before it is read out.
 *
 * A held arrow key repeats about thirty times a second, and a live region
 * wired straight to it would read thirty rectangles nobody asked about. This
 * is the pause that turns a run of key presses into one sentence about where
 * the cursor came to rest. Short enough that a single press still feels
 * immediate; long enough that key repeat says nothing until it stops.
 */
const MIRROR_SETTLE_MS = 350;

/** How much board is kept beside the cursor when the view has to follow it. */
const CURSOR_MARGIN_PX = 8;

/**
 * How far a span has to move, in screen pixels, to sit inside a window.
 *
 * The leading edge wins when the span is larger than the window: a cursor
 * wider than the free region shows its top-left corner, which is the corner
 * every rectangle on this board is anchored by.
 */
function overhang(low: number, high: number, min: number, max: number): number {
  if (low < min) return low - min;
  if (high > max) return high - max;
  return 0;
}

/**
 * The board's zoom, driven from outside the canvas.
 *
 * The panel's +, - and Fit press these. The viewport itself stays here — the
 * canvas is the only thing that knows how big its own box is — so the panel
 * gets three functions rather than a copy of the state.
 */
export type ZoomControls = {
  in: () => void;
  out: () => void;
  fit: () => void;
};

/** Which of those three would actually do something, so the panel can grey out the others. */
export type ZoomState = { canZoomIn: boolean; canZoomOut: boolean };

type Props = {
  /**
   * Every live rectangle, with no content in it.
   *
   * This is what the pointer hit-tests, what the selector refuses, and what
   * holds are drawn from. The artwork is not here — it is `wall` below, one
   * bitmap for the whole board — and neither are the captions, which arrive
   * through `details` for the one rectangle somebody is resting on.
   */
  rects: BoardRect[];
  /**
   * The composite wall: every visible purchase, already drawn, at 1250×800.
   *
   * Null until the first one exists. The board still draws — paper, ruling,
   * holds, the solid fallback under every sold rectangle — which is the same
   * thing it draws for the moment before the bitmap lands.
   */
  wall: Wall | null;
  /**
   * The captions and links that have been fetched so far, keyed by id.
   *
   * Owned by BoardView, because the hover card reads the same map. What this
   * component does with it is draw the caption chip on the rectangle under the
   * pointer and put the caption into the live region for the keyboard cursor.
   */
  details: Map<string, BlockDetails>;
  /** Asks BoardView to fetch one rectangle's words, if it has not already. */
  onNeedDetails: (id: string) => void;
  /**
   * The ids of holds this browser started, so the board can mark them as the
   * buyer's own.
   *
   * Derived entirely client-side from orders this session created (see
   * BoardView). The board payload carries no `buyerPubkey` and must never
   * start: whose hold a block is stays unknowable to everyone except the
   * person who made it.
   */
  ownHoldIds: string[];
  selection: Selection | null;
  activePreset: number | null;
  perPixel: number;
  /** The insets the board must stay clear of: the top bar, and the panel or bar carrying the controls. */
  chrome: Chrome;
  /** Filled in with the three zoom commands while this canvas is mounted, and emptied when it is not. */
  zoomControlsRef: RefObject<ZoomControls | null>;
  /**
   * The canvas element itself, held by BoardView.
   *
   * It is the parent's rather than this component's because the board is where
   * focus has to come back to when the purchase dialog closes — the Buy button
   * that opened it is disabled by then, and a keyboard user would otherwise be
   * dropped at the top of the page. Nothing else about the node crosses this
   * boundary: everything that reads it still reads it in here.
   */
  boardRef: RefObject<HTMLCanvasElement | null>;
  onSelectionChange: (selection: Selection | null) => void;
  onHoverChange: (rect: BoardRect | null, at: Point | null) => void;
  /**
   * A CLICK on a rectangle, which is a different question from resting on one.
   *
   * Since 2026-09-03 the two are separate gestures with separate answers:
   * hovering shows a small tooltip with the caption, and CLICKING opens the
   * full card. `DECISIONS.md` carries the reversal — the day before, hover was
   * to show nothing at all.
   *
   * Null means "close whatever is open": a click that lands on bare wall. The
   * canvas decides that rather than BoardView, because the canvas is the only
   * thing that knows what a click landed on.
   */
  onBlockOpen: (rect: BoardRect | null, at: Point | null) => void;
  /** Reports which ends of the ladder still have a rung, so the buttons can be disabled at the ends. */
  onZoomStateChange: (state: ZoomState) => void;
  /**
   * Enter on the board: the same primary action the Buy button carries.
   *
   * BoardView passes its own Buy handler, which already refuses when the
   * rectangle cannot be bought — so there is one decision about whether a
   * purchase may start, not a keyboard copy of it that could disagree.
   */
  onActivate: () => void;
  /**
   * The sentence already printed under the Buy button, for the live mirror.
   *
   * Passed in rather than written again here: it is the only place that knows
   * about the wallet control, and two wordings of "why can you not buy this"
   * would drift until the one a screen reader hears is the one nobody was
   * reading when they wrote it.
   */
  activateHint: string;
};

type Drag =
  | { kind: "none" }
  | { kind: "select"; from: Point; to: Point; movement: number }
  | { kind: "pan"; last: Point; movement: number; from: Point; touch: boolean };

export default function BoardCanvas({
  rects,
  wall,
  details,
  onNeedDetails,
  ownHoldIds,
  selection,
  activePreset,
  perPixel,
  chrome,
  zoomControlsRef,
  boardRef,
  onSelectionChange,
  onHoverChange,
  onBlockOpen,
  onZoomStateChange,
  onActivate,
  activateHint,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Two refs, one node. Everything in this file reads `canvasRef`, and
  // BoardView is handed the same node through `boardRef` so it has somewhere
  // to send focus when the purchase dialog closes. Memoised so React is not
  // detaching and reattaching the ref on every draw.
  const attachCanvas = useCallback(
    (node: HTMLCanvasElement | null) => {
      canvasRef.current = node;
      boardRef.current = node;
    },
    [boardRef],
  );
  const helpId = useId();
  // The canvas has no size before layout runs, so this starts from the
  // function's zero-screen answer and gets re-fit once the ResizeObserver
  // below reports the real size.
  const [viewport, setViewport] = useState<Viewport>(() =>
    initialViewport({ width: 0, height: 0 }, chrome, BOARD),
  );
  const [resizeTick, setResizeTick] = useState(0);
  const [ants, setAnts] = useState(0);
  /**
   * Whether the board is showing a KEYBOARD focus ring.
   *
   * `:focus-visible` decides, not the focus itself, because a click on the
   * board already says where it went. The CSS pseudo-class cannot draw this
   * one — the canvas element is the whole viewport, so an outline on it lands
   * outside the window entirely — so the ring is painted with the rest of the
   * board and this is the flag that turns it on.
   */
  const [focusRing, setFocusRing] = useState(false);
  /** The cursor, in words, for the live region under the canvas. */
  const [mirror, setMirror] = useState("");
  // Kept here as well as reported upwards, because the lift is painted on the
  // board and a hover must not depend on a round trip through the parent.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const drag = useRef<Drag>({ kind: "none" });
  // Every pointer currently down, so a second finger can be recognised as the
  // start of a pinch rather than as a second pan.
  const pointers = useRef(new Map<number, Point>());
  // The finger separation the current rung was reached at, or null when fewer
  // than two fingers are down.
  const pinch = useRef<{ distance: number } | null>(null);
  // Set on the first pointerdown or wheel; once the user has zoomed or
  // panned, a resize must not throw that away by re-fitting the board.
  const hasInteracted = useRef(false);
  /**
   * Whether the active preset has been PUT DOWN by a click.
   *
   * A preset tracks the pointer as a preview until then, so a buyer can see
   * where a 100×100 would land before committing to it. A click ends the
   * preview: the rectangle stays on the cell it was clicked on, and moving
   * the mouse afterwards only hovers. Without this a preset click placed
   * nothing — the next mouse move picked the rectangle straight back up.
   *
   * Cleared whenever the selection goes away (a different preset, Escape, the
   * panel's own clear), which is what hands the preview back for the next one.
   */
  const presetPlaced = useRef(false);
  // Read by the wheel listener, which is registered once and must not be torn
  // down and rebuilt every time a bar is re-measured.
  const chromeRef = useRef(chrome);
  useEffect(() => {
    chromeRef.current = chrome;
  }, [chrome]);

  /*
    THE PALETTE, AND A REDRAW WHEN THE THEME MOVES UNDER IT.

    A canvas is not restyled by a stylesheet. When the reader toggles, or their
    system flips at sunset, every DOM element repaints itself and the board
    keeps whatever it painted last — so the wall would sit in the old register
    until a pan or a resize happened to force a frame.

    Two sources, because there are two ways the answer changes: the attribute
    the toggle writes, and the media query for a reader who has not chosen. Both
    end in the same two lines — re-read the tokens, ask for a frame.
  */
  const [paintAt, setPaintAt] = useState(0);
  useEffect(() => {
    const restyle = () => {
      refreshPaint();
      setPaintAt((at) => at + 1);
    };
    restyle();

    const attribute = new MutationObserver(restyle);
    attribute.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const system = window.matchMedia("(prefers-color-scheme: dark)");
    system.addEventListener("change", restyle);

    return () => {
      attribute.disconnect();
      system.removeEventListener("change", restyle);
    };
  }, []);

  /**
   * THE WALL, decoded once per version and kept until the version changes.
   *
   * One image for every purchase on the board. This replaced a map of one
   * bitmap per block, which was a request per purchase — affordable at ten
   * thousand 10×10 blocks and not at a pixel a piece.
   *
   * A ref rather than state, because the image is not what the board renders
   * FROM — it is a cache the draw effect reads. Panning, zooming and the ants
   * redraw constantly and must never cause a refetch. The URL carries the
   * wall's own sha256, so a new wall is a new URL and the browser's cache does
   * the rest: nothing here has to decide whether a cached copy is stale.
   *
   * The previous version stays on screen while the next one decodes, which is
   * what stops a purchase blanking the board for a frame. `complete &&
   * naturalWidth > 0` is what tells a decoded wall from one still loading and
   * from one whose request 404'd — the last case being a version that has
   * aged out, where the right answer is to keep drawing the wall we have until
   * the next poll names a newer one.
   */
  const walls = useRef(new Map<string, HTMLImageElement>());
  const drawnWall = useRef<HTMLImageElement | null>(null);
  // Bumped when the wall finishes decoding, purely to schedule a redraw: the
  // board has to repaint when it lands, and it lands outside React.
  const [wallLoaded, setWallLoaded] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!wall) return;
    const known = walls.current.get(wall.version);
    if (known) {
      if (known.complete && known.naturalWidth > 0) drawnWall.current = known;
      return;
    }
    const image = new Image();
    walls.current.set(wall.version, image);
    image.onload = () => {
      drawnWall.current = image;
      // Every version but this one and the one on screen: a page left open
      // through a busy afternoon must not accumulate a decoded 1250×800 per
      // purchase anybody else made.
      for (const [version, held] of walls.current) {
        if (version !== wall.version && held !== drawnWall.current) walls.current.delete(version);
      }
      if (mounted.current) setWallLoaded((n) => n + 1);
    };
    // A failed load needs no handler: the image stays `complete` with a
    // naturalWidth of 0, `drawnWall` keeps whatever it had, and the board
    // keeps drawing the wall it already has. That is the whole 404 story.
    image.src = wall.url;
  }, [wall]);

  /**
   * THE DETAIL BITMAPS: one stored image per rectangle, and only above the
   * ruling's zoom.
   *
   * The wall is one image pixel per wall pixel, so zooming past 1:1 enlarges
   * an overview of detail that already exists — a purchase stores four image
   * pixels per pixel bought. Past `DETAIL_MIN_SCALE` the rectangles actually
   * on screen are drawn from their own bytes over the composite, which is the
   * resolution the buyer paid for.
   *
   * A ref rather than state, for the reason the wall itself is a ref: these
   * are a cache the draw effect reads, and panning at high zoom must never
   * cause a refetch. The URLs are `/api/blocks/{id}/image`, which is immutable
   * and cached for a year, so a rectangle crossed twice costs one request —
   * and the hover card points at the same URL, so resting on a rectangle and
   * zooming into it share a single fetch.
   *
   * Bounded by eviction rather than by never growing: anything not asked for
   * on the current frame is dropped once the map is bigger than a couple of
   * screenfuls. Zooming out to fit therefore returns the memory, and a long
   * session panning across a full wall cannot accumulate one decoded bitmap
   * per purchase ever looked at.
   */
  const detailImages = useRef(new Map<string, HTMLImageElement>());
  const [detailLoaded, setDetailLoaded] = useState(0);

  /**
   * Asks for whatever the current frame wants and forgets the rest.
   *
   * Called from the draw effect with the ids it has just decided to draw, so
   * there is one answer to "which rectangles are in view" per frame rather
   * than one for drawing and a second, possibly different one, for fetching.
   */
  const keepDetail = useCallback((ids: string[]) => {
    const wanted = new Set(ids);
    for (const id of ids) {
      if (detailImages.current.has(id)) continue;
      const image = new Image();
      detailImages.current.set(id, image);
      image.onload = () => {
        if (mounted.current) setDetailLoaded((n) => n + 1);
      };
      // A failed load needs no handler, exactly as the wall's does not: the
      // image stays `complete` with a naturalWidth of 0, the draw below skips
      // it, and the composite's own pixels are what that rectangle keeps. A
      // takedown between the board payload and this request is that case, and
      // the composite will have dropped the rectangle by the next poll anyway.
      image.src = blockImageUrl(id);
    }
    if (detailImages.current.size <= DETAIL_CACHE_MAX) return;
    for (const id of detailImages.current.keys()) {
      if (!wanted.has(id)) detailImages.current.delete(id);
    }
  }, []);

  useEffect(() => {
    if (selection === null) presetPlaced.current = false;
  }, [selection, activePreset]);

  const publish = useCallback(
    (next: Selection | null) => {
      onSelectionChange(next);
    },
    [onSelectionChange],
  );

  // The canvas has no intrinsic size; its box is set entirely by CSS (see
  // .board-canvas, which fills the viewport). On mobile that box moves
  // whenever the address bar collapses, so the backing store must be
  // re-measured independently of any prop change or it goes stale while
  // hit-testing (which reads a live getBoundingClientRect) does not.
  //
  // While the user has not interacted yet, a resize also re-fits the board
  // to the new size — this is what makes the initial fit correct once the
  // canvas's real dimensions (and not the zero-size placeholder) are known.
  // Once they have zoomed, a resize re-clamps instead: the new fit scale is
  // the new floor, and where they had zoomed to stays.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      setResizeTick((t) => t + 1);
      const el = canvasRef.current;
      if (!el) return;
      const screen = { width: el.clientWidth, height: el.clientHeight };
      if (!hasInteracted.current) {
        setViewport(initialViewport(screen, chromeRef.current, BOARD));
        return;
      }
      setViewport((v) =>
        clampToFit(
          { ...v, scale: Math.max(fitScale(screen, chromeRef.current, BOARD), v.scale) },
          screen,
          chromeRef.current,
          BOARD,
        ),
      );
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [chrome]);

  // Continuous motion, and the only continuous motion on the page: a drag in
  // progress is the one thing that genuinely differs from a thing at rest.
  //
  // AND IT IS THE ONE PIECE OF MOTION THE STYLESHEET CANNOT REACH. globals.css
  // stops every animation and transition under prefers-reduced-motion, but
  // these ants are an interval redrawing a canvas, so the media query has to be
  // asked here instead. Asked in an effect rather than at render, so the server
  // and the first client paint agree; the dashes still draw, they simply stop
  // marching.
  const hasSelection = selection !== null;
  useEffect(() => {
    if (!hasSelection) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = setInterval(() => setAnts((a) => (a + 1) % (ANTS_DASH * 2)), ANTS_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasSelection]);

  // Draw. Everything here is a rectangle; nothing here decides anything.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    // Reassigning canvas.width reallocates the backing store and clears it, so
    // it happens only when the box actually changed size — the ants redraw the
    // whole board twenty times a second and must not reallocate each time.
    //
    // The store is the CSS box in REAL device pixels; the transform then scales
    // the context by the same ratio so every coordinate below stays in CSS
    // pixels. Skip this and a retina screen draws half the pixels it has and
    // stretches them, which on a board made of 10-pixel bitmaps is the
    // difference between artwork and mush.
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const store = backingStoreSize({ width, height }, ratio);
    if (canvas.width !== store.width || canvas.height !== store.height) {
      canvas.width = store.width;
      canvas.height = store.height;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    // NEAREST NEIGHBOUR, NEVER INTERPOLATION, and re-set on every draw rather
    // than once: reassigning canvas.width above resets the whole context to
    // its defaults, and the default is smoothing ON. It survives save/restore
    // (it is part of the state the stack carries), so setting it here covers
    // everything drawn below and anything drawImage'd later — a block is a
    // small bitmap of somebody's artwork, and interpolating it is the one
    // thing this board must not do to it.
    context.imageSmoothingEnabled = false;

    const family = getComputedStyle(canvas).fontFamily || "system-ui, sans-serif";
    const screen = { width, height };
    const origin = boardToScreen(viewport, screen, { x: 0, y: 0 });
    const scale = viewport.scale;
    const spanX = BOARD_WIDTH * scale;
    const spanY = BOARD_HEIGHT * scale;

    context.fillStyle = PAINT.ground;
    context.fillRect(0, 0, width, height);

    context.fillStyle = PAINT.paper;
    context.fillRect(origin.x, origin.y, spanX, spanY);

    /*
     * THE FRAME. The wall behind the board is the same cream as the board,
     * which is what DESIGN.md asks for — so this border, drawn just outside
     * the paper, is the only thing saying where the artwork stops. Without it
     * the board has no boundary at all in the corners no ruling reaches.
     *
     * It was a 1px hairline in the coarse rule's tone, and it is 2px of ink
     * now, on the same argument the fit maths makes above: a boundary that has
     * to be SEEN not to be clipped has to be visible in the first place. The
     * room for it is reserved by BOARD_INSET rather than taken out of the
     * paper, so the frame is never drawn over a pixel somebody bought and
     * never lands outside the window.
     *
     * `strokeRect` centres the stroke on its path, so a path 1px outside the
     * paper at 2px wide covers exactly the two pixels between the paper and
     * BOARD_FRAME_PX — the frame is entirely outside the artwork, to the pixel.
     */
    const frame = {
      x: Math.round(origin.x) - BOARD_FRAME_PX,
      y: Math.round(origin.y) - BOARD_FRAME_PX,
      width: Math.round(spanX) + BOARD_FRAME_PX * 2,
      height: Math.round(spanY) + BOARD_FRAME_PX * 2,
    };
    context.strokeStyle = PAINT.frame;
    context.lineWidth = BOARD_FRAME_PX;
    context.strokeRect(
      frame.x + BOARD_FRAME_PX / 2,
      frame.y + BOARD_FRAME_PX / 2,
      frame.width - BOARD_FRAME_PX,
      frame.height - BOARD_FRAME_PX,
    );

    /*
     * Where the board was actually painted, frame included, in CSS pixels.
     *
     * WHO READS THIS: `purchase-e2e.test.ts`, and nothing in the product. A
     * canvas has no DOM box for its contents, so "the whole board including
     * its frame is inside the viewport" is a claim no selector can check —
     * this is the renderer reporting the numbers it just drew with, so the
     * guard measures the paint rather than re-deriving it from the same
     * arithmetic it is supposed to be checking. Written only when it changes:
     * the ants redraw this canvas twenty times a second and a DOM write per
     * frame would be twenty for nothing.
     */
    const painted = `${frame.x},${frame.y},${frame.width},${frame.height}`;
    if (canvas.dataset.boardRect !== painted) canvas.dataset.boardRect = painted;

    // The graph paper, and ONLY above the zoom where a wall pixel is about
    // eight screen pixels. At fit it is not a ruling, it is moiré — and it is
    // a lie besides, because nothing snaps to it and a purchase is any
    // rectangle exact to the pixel. Drawn UNDER the wall bitmap, so it
    // survives exactly on the pixels nobody has bought: the paper's cream
    // means available, and the ruling is what that cream is ruled with.
    context.save();
    context.beginPath();
    context.rect(origin.x, origin.y, spanX, spanY);
    context.clip();

    if (scale >= RULE_VISIBLE_SCALE) {
      drawRules(context, origin, scale, RULE_PIXELS, PAINT.ruleFine, screen);
      drawRules(context, origin, scale, 100, PAINT.ruleCoarse, screen);
    }
    context.restore();

    const colliding = new Set(selection?.collidesWith ?? []);
    const own = new Set(ownHoldIds);

    /*
     * THE FALLBACK, and it goes down before the wall does.
     *
     * DESIGN.md: a sold rectangle whose bitmap has not arrived is "Solid, edge
     * to edge, 1px ink border. This is the fallback, not the sold treatment:
     * what the rectangle shows in the moment before its bitmap arrives, and
     * what it keeps if the bitmap never does." There is one bitmap now instead
     * of one per block, so "the moment before" is one moment for the whole
     * board — but it is the same moment, and a sale still has to read as taken
     * from the first paint rather than as cream nobody has bought.
     *
     * Once the wall is decoded this is skipped entirely: the artwork covers
     * every sold pixel itself, and painting under it would only cost a fill.
     */
    const wallImage = drawnWall.current;
    const wallReady = wallImage !== null && wallImage.complete && wallImage.naturalWidth > 0;
    if (!wallReady) {
      context.fillStyle = PAINT.sold;
      for (const rect of rects) {
        if (rect.status === "reserved") continue;
        context.fillRect(
          origin.x + rect.x * scale,
          origin.y + rect.y * scale,
          rect.w * scale,
          rect.h * scale,
        );
      }
    }

    /*
     * THE WALL. One bitmap, every visible purchase, drawn once at exactly the
     * board's own rectangle — so a wall pixel lands on `scale` screen pixels
     * and the arithmetic is the identity.
     *
     * NEAREST NEIGHBOUR. `imageSmoothingEnabled` is already false for the
     * frame and it survives save/restore, so this is belt and braces — but
     * interpolating a wall of other people's artwork is the one thing this
     * board must never do, and it costs nothing to say so at the only place it
     * could happen.
     */
    if (wallReady) {
      context.imageSmoothingEnabled = false;
      context.drawImage(wallImage, origin.x, origin.y, spanX, spanY);
    }

    /*
     * THE DETAIL, OVER THE OVERVIEW.
     *
     * The wall is one image pixel per wall pixel, which is what makes it one
     * request for the whole board — and it is also why, above 1:1, drawing it
     * enlarges an overview of detail we already hold: every purchase stores
     * four image pixels per pixel bought. Past the zoom where the ruling comes
     * back, the rectangles actually on screen are redrawn from their own
     * stored bytes, at four times the wall's resolution, which is what the
     * buyer paid for and what they approved in the checkout preview.
     *
     * FEW REQUESTS, BY CONSTRUCTION. At that zoom about 156 × 100 wall pixels
     * are visible, `detailRects` returns the rectangles covering most of that,
     * and `DETAIL_MAX_RECTS` caps the rest. Anything not drawn here keeps the
     * composite's pixels, which are not wrong — they are the overview.
     *
     * THE PAPER GOES DOWN FIRST, and then the placement comes from
     * `placeImage`. Both are exactly what the server does when it builds the
     * wall: `contain` letterboxes onto the sheet's own cream, `cover` crops
     * centred, and an upload with an alpha channel is composited onto cream
     * rather than onto whatever is underneath. One module for the geometry, so
     * the wall, this draw and the checkout preview cannot come out as three
     * different pictures.
     *
     * The fit comes from `details`, the same on-demand fetch the caption comes
     * from. A rectangle whose fit has not arrived is left to the composite for
     * a frame rather than drawn with a guessed one — a guess would show the
     * buyer's picture cropped where they chose to fit it in.
     */
    if (wallReady && wantsDetail(scale)) {
      const inView = detailRects(rects, origin, scale, screen);
      keepDetail(inView.map((rect) => rect.id));
      for (const rect of inView) {
        // The same on-demand request the hover card makes, for the same
        // rectangle, cached by the same map in BoardView — so zooming into a
        // rectangle and resting on it cost one fetch between them, not two.
        onNeedDetails(rect.id);
        const image = detailImages.current.get(rect.id);
        if (!image || !image.complete || image.naturalWidth === 0) continue;
        const fit = details.get(rect.id)?.fit;
        if (!fit) continue;

        const box = {
          x: origin.x + rect.x * scale,
          y: origin.y + rect.y * scale,
          width: rect.w * scale,
          height: rect.h * scale,
        };
        context.fillStyle = PAINT.paper;
        context.fillRect(box.x, box.y, box.width, box.height);
        const { source, dest } = placeImage(
          { width: image.naturalWidth, height: image.naturalHeight },
          box,
          fit,
        );
        context.drawImage(
          image,
          source.x,
          source.y,
          source.width,
          source.height,
          dest.x,
          dest.y,
          dest.width,
          dest.height,
        );
      }
    }

    /*
     * The ink edge round every sold rectangle, so two neighbours stay separate
     * when their artwork is the same colour — including when it is the same
     * cream as the paper, which is the case the "cream means available" rule
     * cannot answer on its own.
     *
     * One path and one stroke for the whole board rather than a stroke per
     * rectangle: at a pixel a purchase there may be tens of thousands of them
     * on a frame that also has to keep up with the marching ants.
     */
    context.strokeStyle = PAINT.soldEdge;
    context.lineWidth = 1;
    context.beginPath();
    for (const rect of rects) {
      if (rect.status === "reserved") continue;
      const w = rect.w * scale;
      const h = rect.h * scale;
      if (w < SOLD_EDGE_MIN_PX || h < SOLD_EDGE_MIN_PX) continue;
      const x = origin.x + rect.x * scale;
      const y = origin.y + rect.y * scale;
      if (x + w < 0 || y + h < 0 || x > width || y > height) continue;
      context.rect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    context.stroke();

    for (const rect of rects) {
      const x = origin.x + rect.x * scale;
      const y = origin.y + rect.y * scale;
      const w = rect.w * scale;
      const h = rect.h * scale;
      if (x + w < 0 || y + h < 0 || x > width || y > height) continue;

      const held = rect.status === "reserved";

      // A HOLD IS NOT IN THE WALL, and this is where it gets drawn instead.
      // Those pixels are unpaid and may never be bought, so there is nothing
      // public to put on them and the whole rectangle is free for a treatment
      // of its own: the coarse rule's own tone, plainly lighter than a sale
      // and plainly heavier than the paper, an ink hatch at 45 degrees, and a
      // broken edge where a sale carries an unbroken one.
      if (held) {
        context.fillStyle = PAINT.held;
        context.fillRect(x, y, w, h);

        // Clamped to the viewport before hatching, so a rectangle zoomed until
        // it is larger than the screen costs a screenful of strokes, not a
        // blockful.
        const hx = Math.max(x, 0);
        const hy = Math.max(y, 0);
        const hw = Math.min(x + w, width) - hx;
        const hh = Math.min(y + h, height) - hy;
        if (hw > 0 && hh > 0) drawHeldHatch(context, hx, hy, hw, hh);

        context.save();
        context.strokeStyle = PAINT.heldEdge;
        context.lineWidth = 1;
        context.setLineDash([4, 4]);
        context.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
        context.restore();

        // Its own label, where a rectangle is big enough to carry one. A hold
        // has no caption to compete with — there is no content on it yet — so
        // this sits exactly where a sold rectangle's caption would, and says
        // the one thing about it anybody needs.
        if (w >= CHIP_MIN_BLOCK_PX && h >= CHIP_HEIGHT + 8) {
          drawCaptionChip(context, "On hold", x + 4, y + h - 4 - CHIP_HEIGHT, w - 8, family);
        }

        // Your own hold, marked harder, because it is the one held rectangle
        // on the board you can do something about — resume it or let it go.
        // Terracotta, which DESIGN.md reserves for the primary action and for
        // your selection, and a hold you started is exactly your selection.
        if (own.has(rect.id)) {
          context.strokeStyle = PAINT.selection;
          context.lineWidth = 2;
          context.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
        }
      }

      if (colliding.has(rect.id)) {
        context.strokeStyle = PAINT.danger;
        context.lineWidth = 2;
        context.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
        context.fillStyle = PAINT.dangerFill;
        context.fillRect(x, y, w, h);
      }

      // Hovered: a soft cream lift and nothing else. No hue changes hands,
      // because the hue belongs to the buyer.
      if (rect.id === hoveredId) {
        context.fillStyle = PAINT.lift;
        context.fillRect(x, y, w, h);
        context.strokeStyle = PAINT.ring;
        context.lineWidth = 2;
        context.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
      }

      // The caption chip, for a rectangle whose words have actually been
      // fetched — which is the one under the pointer or under the cursor.
      // Every sold rectangle used to carry one, because every caption used to
      // ride along in the board payload; none of them do now, and a chip on
      // one is honest where a chip on none would have thrown the rule away.
      // DESIGN.md's rule about the chip itself is untouched: a caption is
      // never free text over artwork.
      const words = held ? undefined : details.get(rect.id)?.caption;
      if (words && w >= CHIP_MIN_BLOCK_PX && h >= CHIP_HEIGHT + 8) {
        drawCaptionChip(context, words, x + 4, y + h - 4 - CHIP_HEIGHT, w - 8, family);
      }
    }

    if (selection) {
      const { rect } = selection;
      const x = origin.x + rect.x * scale;
      const y = origin.y + rect.y * scale;
      const w = rect.w * scale;
      const h = rect.h * scale;
      const accent = selection.buyable ? PAINT.selection : PAINT.danger;

      context.fillStyle = selection.buyable ? PAINT.selectionFill : PAINT.dangerFill;
      context.fillRect(x, y, w, h);

      // Terracotta over an ink core with a cream ring around it, in that
      // order. Three tones means the outline survives any artwork underneath
      // without depending on contrast with it — including artwork the same
      // cream as the paper.
      context.strokeStyle = PAINT.ring;
      context.lineWidth = 1;
      context.strokeRect(x - 4.5, y - 4.5, w + 9, h + 9);
      context.strokeStyle = PAINT.soldEdge;
      context.lineWidth = 4;
      context.strokeRect(x - 2, y - 2, w + 4, h + 4);
      context.strokeStyle = accent;
      context.lineWidth = 2;
      context.strokeRect(x - 2, y - 2, w + 4, h + 4);

      if (selection.buyable) {
        context.save();
        context.strokeStyle = PAINT.ring;
        context.lineWidth = 2;
        context.setLineDash([ANTS_DASH, ANTS_DASH]);
        context.lineDashOffset = -ants;
        context.strokeRect(x - 2, y - 2, w + 4, h + 4);
        context.restore();
      }

      drawSelectionTag(
        context,
        `${rect.w} × ${rect.h} · ${formatUsdc(selection.totalBaseUnits)}`,
        x - 2,
        y - 2,
        accent,
        chrome.top,
        family,
      );
    }

    /*
     * THE BOARD'S OWN FOCUS RING, painted rather than outlined.
     *
     * `:focus-visible` puts a 2px terracotta outline on every other control on
     * the page and it cannot put one here: this canvas IS the viewport, so an
     * outline at a 2px offset is drawn two pixels outside the window and
     * nobody ever sees it. So the ring goes on with the rest of the board.
     *
     * It hugs the sheet's edge, which is what a focused board should look
     * focused around — and it is clamped into the free region, so a board
     * zoomed in far enough for its own edges to be off screen still shows a
     * ring, at the boundary of the space the board is allowed to use.
     *
     * Three tones, in the same order and for the same reason as the selection
     * outline: cream, then ink, then terracotta. At the bottom rung the ring
     * lands on the cream wall and the accent alone would do (4.32:1 against
     * --canvas, WCAG 1.4.11's 3:1 with room), but zoomed in it lands on
     * whatever somebody uploaded, and no single colour survives arbitrary
     * artwork. The sandwich does.
     */
    if (focusRing) {
      // Outside the FRAME, not the paper: the sheet's edge is two pixels of
      // ink now, and a ring drawn where the hairline used to be would sit on
      // top of it. The margin the fit reserves is more than wide enough for
      // both, so nothing is clamped here that was not clamped before.
      const free = freeRegion(screen, chrome);
      const clear = 3 + BOARD_FRAME_PX;
      const left = Math.max(free.x + 2, origin.x - clear);
      const top = Math.max(free.y + 2, origin.y - clear);
      const right = Math.min(free.x + free.width - 2, origin.x + spanX + clear);
      const bottom = Math.min(free.y + free.height - 2, origin.y + spanY + clear);
      if (right > left && bottom > top) {
        const w = right - left;
        const h = bottom - top;
        context.strokeStyle = PAINT.ring;
        context.lineWidth = 1;
        context.strokeRect(left - 2.5, top - 2.5, w + 5, h + 5);
        context.strokeStyle = PAINT.soldEdge;
        context.lineWidth = 4;
        context.strokeRect(left, top, w, h);
        context.strokeStyle = PAINT.selection;
        context.lineWidth = 2;
        context.strokeRect(left, top, w, h);
      }
    }
  }, [
    rects,
    details,
    ownHoldIds,
    selection,
    viewport,
    resizeTick,
    ants,
    hoveredId,
    chrome,
    wallLoaded,
    detailLoaded,
    keepDetail,
    onNeedDetails,
    focusRing,
    // The theme. `PAINT` is a module value the draw loop reads directly, so
    // nothing in this list would otherwise change when it does — this is the
    // dependency that turns a re-read of the tokens into a repainted board.
    paintAt,
  ]);

  function pointerBoard(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return screenToBoard(
      viewport,
      { width: rect.width, height: rect.height },
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
    );
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    hasInteracted.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // A second finger is a pinch, never a second pan. Whatever the first one
    // had started is abandoned rather than continued one-handed.
    if (pointers.current.size === 2) {
      drag.current = { kind: "none" };
      pinch.current = { distance: pointerSeparation(pointers.current) };
      return;
    }

    const at = pointerBoard(event);
    const touch = event.pointerType === "touch";

    // Shift-drag pans and plain drag selects on a pointer; on a touchscreen,
    // where there is no shift key and no wheel, a drag pans, a pinch zooms,
    // and a tap places the selection. The legend says all of it.
    if (event.shiftKey || event.button === 1 || touch) {
      drag.current = {
        kind: "pan",
        last: { x: event.clientX, y: event.clientY },
        movement: 0,
        from: at,
        touch,
      };
      return;
    }

    // A preset is one click, not a drag: it lands on the clicked cell, snapped
    // and clamped by presetRect, and it stays there.
    if (activePreset !== null) {
      presetPlaced.current = true;
      publish(selectionFromPreset(at, activePreset, rects, perPixel));
      drag.current = { kind: "none" };
      return;
    }

    /*
      A CLICK ON A RECTANGLE OPENS ITS CARD, AND STARTS NO SELECTION.

      Nothing is lost by refusing the drag: a rectangle that CONTAINS a live
      pixel collides wherever it ends, so a selection begun on a sold block was
      never a selection anybody could buy — it was a click that produced a
      refusal instead of an answer. Now it produces the answer.

      A preset is the exception and it is handled above: a preset placed over
      sold pixels is a real gesture with a real refusal, and it keeps it.
    */
    const under = rects.find((candidate) => rectContains(candidate, at));
    if (under) {
      const box = event.currentTarget.getBoundingClientRect();
      onBlockOpen(under, { x: event.clientX - box.left, y: event.clientY - box.top });
      drag.current = { kind: "none" };
      return;
    }

    // Bare wall: whatever card is open is being dismissed by this click, which
    // is the same gesture as starting a new selection and not a second one.
    onBlockOpen(null, null);
    drag.current = { kind: "select", from: at, to: at, movement: 0 };
    publish(selectionFromDrag(at, at, rects, perPixel));
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pinch.current && pointers.current.size >= 2) {
      handlePinch(event.currentTarget);
      return;
    }

    const at = pointerBoard(event);
    const current = drag.current;

    if (current.kind === "none") {
      const hovered = rects.find((candidate) => rectContains(candidate, at));
      setHoveredId(hovered?.id ?? null);
      // The words for the rectangle under the pointer, and only that one.
      // This is the on-demand half of the representation change: the payload
      // carries no captions, so resting on a rectangle is what asks for its
      // caption. BoardView caches the answer, so crossing the same rectangle
      // twice costs one request.
      if (hovered) onNeedDetails(hovered.id);
      const rect = event.currentTarget.getBoundingClientRect();
      onHoverChange(hovered ?? null, hovered ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
      const preview = presetSelectionForMove(
        at,
        activePreset,
        presetPlaced.current,
        rects,
        perPixel,
      );
      if (preview) publish(preview);
      return;
    }

    if (current.kind === "pan") {
      const dx = event.clientX - current.last.x;
      const dy = event.clientY - current.last.y;
      drag.current = {
        ...current,
        last: { x: event.clientX, y: event.clientY },
        movement: current.movement + Math.abs(dx) + Math.abs(dy),
      };
      const rect = event.currentTarget.getBoundingClientRect();
      const screen = { width: rect.width, height: rect.height };
      setViewport((v) =>
        // Refused at the base rung: the whole board is already on screen, so
        // there is nowhere for a drag to take it and nudging it would only
        // open cream on one side.
        canPan(v.scale, fitScale(screen, chromeRef.current, BOARD))
          ? clampToFit(panBy(v, -dx / v.scale, -dy / v.scale), screen, chromeRef.current, BOARD)
          : v,
      );
      return;
    }

    drag.current = {
      kind: "select",
      from: current.from,
      to: at,
      movement: current.movement + 1,
    };
    publish(selectionFromDrag(current.from, at, rects, perPixel));
  }

  /** Two fingers spreading or closing, resolved into whole rungs of the ladder. */
  function handlePinch(canvas: HTMLCanvasElement) {
    const started = pinch.current;
    const distance = pointerSeparation(pointers.current);
    if (!started || distance <= 0 || started.distance <= 0) return;

    const ratio = distance / started.distance;
    if (ratio < PINCH_STEP && ratio > 1 / PINCH_STEP) return;

    const rect = canvas.getBoundingClientRect();
    const midpoint = pointerMidpoint(pointers.current);
    const point = { x: midpoint.x - rect.left, y: midpoint.y - rect.top };
    const direction = ratio > 1 ? "in" : "out";
    // Re-anchored at the new separation, so a long continuous spread keeps
    // stepping instead of firing once and then sitting on a stale baseline.
    pinch.current = { distance };
    setViewport((v) =>
      steppedZoom(v, { width: rect.width, height: rect.height }, chromeRef.current, point, direction),
    );
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const current = drag.current;
    drag.current = { kind: "none" };
    releasePointer(event);

    if (current.kind !== "pan" || !isTap(current.movement)) return;

    // A pan that barely moved was a tap. On a touchscreen that is how a
    // selection gets placed at all, so it selects the block under the finger
    // (or the active preset around it); with a mouse, shift-clicking empty
    // board is a deliberate way to clear.
    //
    // With no preset chosen the tap takes one RULING square, not the single
    // pixel the same tap would produce with a mouse. A fingertip is about
    // forty screen pixels across and a board pixel is well under one at the
    // fit scale, so a one-pixel tap target would be a lottery rather than a
    // choice. Drag or zoom in to buy fewer.
    if (current.touch) {
      // A touchscreen has no hover, so a tap is the ONLY gesture it has: a tap
      // on a rectangle has to be the one that reads it, exactly as a click is
      // on a mouse. A tap on bare wall still places the selection, which is how
      // anything gets bought on a phone at all.
      const under = rects.find((candidate) => rectContains(candidate, current.from));
      if (under) {
        const box = event.currentTarget.getBoundingClientRect();
        onBlockOpen(under, { x: event.clientX - box.left, y: event.clientY - box.top });
        return;
      }
      onBlockOpen(null, null);
      presetPlaced.current = true;
      publish(selectionFromPreset(current.from, activePreset ?? RULE_PIXELS, rects, perPixel));
      return;
    }
    onBlockOpen(null, null);
    publish(null);
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLCanvasElement>) {
    // A cancelled pointer (a touch interrupted by a system gesture) must not
    // leave drag.current pointing at a stale anchor, or the next hover will
    // rubber-band a selection with nothing held down.
    drag.current = { kind: "none" };
    releasePointer(event);
  }

  function releasePointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId);
    // One finger left is not a pinch, and the remaining one must not silently
    // become a pan halfway through a gesture either.
    if (pointers.current.size < 2) pinch.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  // React 19 registers onWheel as a passive listener, so it can never call
  // preventDefault(). Without that, a wheel over the board would also scroll
  // the page — and while the document is `overflow: hidden` and has nothing to
  // scroll, an overscroll bounce or a stray scroll chain is still a jump the
  // board did not ask for. A native non-passive listener is the only way to
  // stop it.
  //
  // THE WHEEL ZOOMS, and only zooms. It used to pan, because the board
  // overflowed downwards and a scroll is what a page taller than its window
  // means. The board fits now, so at the base rung there is nothing below to
  // scroll to and a wheel that moved the board would only be able to move it
  // wrong. A trackpad pinch arrives here as a ctrl-wheel and takes the same
  // path, which is what makes "wheel and pinch" one behaviour and not two.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handler(event: WheelEvent) {
      hasInteracted.current = true;
      event.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const screen = { width: rect.width, height: rect.height };
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const direction = event.deltaY < 0 ? "in" : "out";
      // One notch is one rung of the ladder, never a 1.15 multiplier. A
      // continuous zoom leaves a board pixel sitting on 1.87 screen pixels
      // far more often than on 2, and every buyer's bitmap goes soft.
      setViewport((v) => steppedZoom(v, screen, chromeRef.current, point, direction));
    }

    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

  /**
   * One rung of the ladder from a button rather than from a pointer.
   *
   * A wheel and a pinch both arrive with a point to zoom about; a button does
   * not, so it zooms about the middle of the FREE REGION — the middle of the
   * board as the person pressing it sees it, which in the side-panel layout is
   * a couple of hundred pixels right of the middle of the window.
   *
   * It goes through exactly the same `steppedZoom` the wheel does, so there is
   * one ladder and one definition of a step: no interpolation can creep in
   * through a second path.
   */
  const stepZoom = useCallback((direction: "in" | "out") => {
    const el = canvasRef.current;
    if (!el) return;
    hasInteracted.current = true;
    const screen = { width: el.clientWidth, height: el.clientHeight };
    const chromeNow = chromeRef.current;
    const point = {
      x: (chromeNow.left + (screen.width - chromeNow.right)) / 2,
      y: (chromeNow.top + (screen.height - chromeNow.bottom)) / 2,
    };
    setViewport((v) => steppedZoom(v, screen, chromeNow, point, direction));
  }, []);

  /** Straight back to the bottom rung, re-centred: the whole board on screen. */
  const zoomToFit = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    hasInteracted.current = true;
    setViewport(
      initialViewport({ width: el.clientWidth, height: el.clientHeight }, chromeRef.current, BOARD),
    );
  }, []);

  useEffect(() => {
    zoomControlsRef.current = { in: () => stepZoom("in"), out: () => stepZoom("out"), fit: zoomToFit };
    return () => {
      zoomControlsRef.current = null;
    };
  }, [zoomControlsRef, stepZoom, zoomToFit]);

  // Which ends of the ladder still have a rung, recomputed whenever the scale
  // or the box changes. The buttons are disabled from this, so a + that would
  // do nothing is visibly dead rather than quietly inert.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const fit = fitScale({ width: el.clientWidth, height: el.clientHeight }, chrome, BOARD);
    onZoomStateChange(zoomAffordance(viewport.scale, fit, MAX_ZOOM));
  }, [viewport.scale, resizeTick, chrome, onZoomStateChange]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") publish(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [publish]);

  /**
   * Brings the cursor back into view after a key press moved it out of one.
   *
   * It pans and it never zooms, and it obeys the same rule a drag does: above
   * the fit rung there is somewhere for the board to go, and at the fit rung
   * the whole board is already on screen so the cursor cannot be off it and
   * `canPan` refuses. `clampToFit` then has the last word, exactly as it does
   * for a mouse, so nothing here can push the artwork somewhere a drag could
   * not have.
   */
  const revealCursor = useCallback((rect: Rect) => {
    const el = canvasRef.current;
    if (!el) return;
    const screen = { width: el.clientWidth, height: el.clientHeight };
    const chromeNow = chromeRef.current;
    setViewport((v) => {
      if (!canPan(v.scale, fitScale(screen, chromeNow, BOARD))) return v;
      const free = freeRegion(screen, chromeNow);
      const near = boardToScreen(v, screen, { x: rect.x, y: rect.y });
      const far = boardToScreen(v, screen, { x: rect.x + rect.w, y: rect.y + rect.h });
      const dx = overhang(
        near.x - CURSOR_MARGIN_PX,
        far.x + CURSOR_MARGIN_PX,
        free.x,
        free.x + free.width,
      );
      const dy = overhang(
        near.y - CURSOR_MARGIN_PX,
        far.y + CURSOR_MARGIN_PX,
        free.y,
        free.y + free.height,
      );
      if (dx === 0 && dy === 0) return v;
      return clampToFit(panBy(v, dx / v.scale, dy / v.scale), screen, chromeNow, BOARD);
    });
  }, []);

  /**
   * THE ONLY WAY TO SELECT A RECTANGLE WITHOUT A POINTER.
   *
   * Arrows move the cursor one fine rule, shift moves it ten — one coarse rule
   * of the graph paper — and alt turns the same arrows into a resize from the
   * rectangle's top-left anchor. Enter is the primary action, which is the Buy
   * button's, and Escape clears. Which key means what is `keyToCommand`'s
   * decision and where the rectangle lands is `nextCursor`'s; both are pure and
   * both are tested, and both build every rectangle out of the same `snapRect`
   * and `presetRect` a drag and a click use. There is one geometry on this
   * board and this is not a second one.
   *
   * A modified key that the browser owns is left alone: ctrl and meta are how
   * a page is zoomed, a tab is closed and a bookmark is opened, and no board
   * gets to take those. Everything this DOES claim is prevented, which is also
   * what stops alt-arrow from walking Chrome's history back on Windows.
   */
  function onKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (event.ctrlKey || event.metaKey) return;

    if (event.key === "Enter") {
      event.preventDefault();
      onActivate();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      publish(null);
      return;
    }

    const command = keyToCommand(event.key, event);
    if (!command) return;
    event.preventDefault();
    setFocusRing(true);
    // A preset that has been arrowed is a preset that has been PUT DOWN: the
    // preview must not be picked back up by the next stray mouse move.
    presetPlaced.current = true;
    const rect = nextCursor(selection?.rect ?? null, command, activePreset);
    publish(describeSelection(rect, rects, perPixel));
    revealCursor(rect);
  }

  /**
   * The cursor's live text mirror, settled before it speaks.
   *
   * A canvas exposes nothing of what it has drawn, so without this a screen
   * reader can be told that the board has focus and nothing whatsoever about
   * the million pixels on it. Polite, always: this is a readout of where the
   * user has just put their own cursor, and a readout that interrupts is the
   * definition of a rude one.
   *
   * Only while the board holds keyboard focus. A drag reaches the same
   * `selection`, and narrating somebody's mouse back to them is noise.
   */
  useEffect(() => {
    if (!focusRing) return;
    const timer = setTimeout(() => {
      // Ask for the words of whatever the cursor has come to rest on, at the
      // same moment the sentence is written. The request is what eventually
      // re-runs this effect with the caption in `details`, so the mirror says
      // the rectangle first and the caption a moment later rather than
      // waiting silently for a fetch.
      const under = selection ? rectUnderCursor(selection.rect, rects) : null;
      if (under) onNeedDetails(under.id);
      setMirror(describeCursor(selection, rects, details, activateHint));
    }, MIRROR_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [focusRing, selection, rects, details, onNeedDetails, activateHint]);

  return (
    <>
      <canvas
        ref={attachCanvas}
        className="board-canvas"
        /*
         * A canvas is not focusable, has no role and hears no keys unless it
         * is told to. Without these three attributes there is no keyboard path
         * to a selection at all, and Buy can never be enabled without a mouse.
         *
         * `application` rather than `img` or nothing: it is the role that tells
         * a screen reader to stop intercepting the arrow keys for its own
         * browse mode and hand them to the page, which is the whole point.
         * What that costs is the reading a canvas cannot give anyway, and the
         * live region below pays it back in words.
         */
        tabIndex={0}
        role="application"
        aria-label="Pixel board, 1250 by 800"
        aria-describedby={helpId}
        onKeyDown={onKeyDown}
        onFocus={(event) => setFocusRing(event.currentTarget.matches(":focus-visible"))}
        onBlur={() => {
          setFocusRing(false);
          // Emptied here rather than in the effect that fills it: a live
          // region that still holds a sentence is a live region that reads it
          // again the next time anything near it moves.
          setMirror("");
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => {
          setHoveredId(null);
          onHoverChange(null, null);
        }}
      />
      <p id={helpId} className="sr-only">
        Arrow keys move the selection ten pixels. Hold shift to move a hundred at a time. Hold alt
        with an arrow key to resize it from its top-left corner. Enter buys the selected pixels.
        Escape clears the selection.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {mirror}
      </p>
    </>
  );
}

/** How far apart the two fingers of a pinch are, in screen pixels. */
function pointerSeparation(pointers: Map<number, Point>): number {
  const [a, b] = [...pointers.values()];
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The point a pinch is anchored on: halfway between the two fingers. */
function pointerMidpoint(pointers: Map<number, Point>): Point {
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** One tier of the graph paper, drawn only across the part of it on screen. */
function drawRules(
  context: CanvasRenderingContext2D,
  origin: Point,
  scale: number,
  step: number,
  colour: string,
  screen: { width: number; height: number },
) {
  context.strokeStyle = colour;
  context.lineWidth = 1;
  context.beginPath();

  const startX = Math.max(0, Math.floor(-origin.x / scale / step) * step);
  for (let p = startX; p <= BOARD_WIDTH; p += step) {
    const sx = Math.round(origin.x + p * scale) + 0.5;
    if (sx > screen.width) break;
    context.moveTo(sx, Math.max(0, origin.y));
    context.lineTo(sx, Math.min(screen.height, origin.y + BOARD_HEIGHT * scale));
  }

  const startY = Math.max(0, Math.floor((0 - origin.y) / scale / step) * step);
  for (let p = startY; p <= BOARD_HEIGHT; p += step) {
    const sy = Math.round(origin.y + p * scale) + 0.5;
    if (sy > screen.height) break;
    context.moveTo(Math.max(0, origin.x), sy);
    context.lineTo(Math.min(screen.width, origin.x + BOARD_WIDTH * scale), sy);
  }

  context.stroke();
}

/**
 * The ruling that says "held, not sold".
 *
 * Diagonals at 45 degrees, which is the one angle the graph paper's two tiers
 * never use, so it can never be mistaken for the paper showing through. They
 * are laid out on an absolute SCREEN grid rather than per block, so two
 * adjacent holds read as one hatched region instead of two patterns that
 * happen to meet at a seam.
 *
 * Ink over the hold's own card tone, which is the pair that makes a hold
 * legible at the size a 10-pixel block occupies on a fitted board: even where
 * only one stroke crosses it, the slab underneath is already the wrong value
 * to be a sale.
 */
function drawHeldHatch(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  context.save();
  context.beginPath();
  context.rect(x, y, w, h);
  context.clip();

  context.strokeStyle = PAINT.heldRule;
  context.lineWidth = 1;
  context.beginPath();
  // Each stroke runs down-right, so one starting up to `h` to the left of the
  // block still crosses it: the loop begins that far back.
  const first = Math.floor((x - h) / HELD_HATCH_STEP) * HELD_HATCH_STEP;
  for (let p = first; p < x + w; p += HELD_HATCH_STEP) {
    context.moveTo(p, y);
    context.lineTo(p + h, y + h);
  }
  context.stroke();
  context.restore();
}

/** A caption on its own opaque chip, never as free text over the artwork. */
function drawCaptionChip(
  context: CanvasRenderingContext2D,
  caption: string,
  x: number,
  y: number,
  maxWidth: number,
  family: string,
) {
  context.save();
  context.font = `600 11px ${family}`;
  const text = truncate(context, caption, maxWidth - 14);
  const width = Math.min(maxWidth, context.measureText(text).width + 14);
  context.fillStyle = PAINT.chip;
  context.fillRect(x, y, width, CHIP_HEIGHT);
  context.fillStyle = PAINT.chipText;
  context.textBaseline = "middle";
  context.fillText(text, x + 7, y + CHIP_HEIGHT / 2 + 0.5);
  context.restore();
}

/** The live selection's own tag: what is selected and what it costs, in place. */
function drawSelectionTag(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  colour: string,
  barTop: number,
  family: string,
) {
  context.save();
  context.font = `700 11px ${family}`;
  const width = context.measureText(text).width + 16;
  const height = 20;
  // Flips below the selection rather than hiding under the top bar.
  const above = y - height - 6;
  const top = above < barTop + 6 ? y + 6 : above;
  context.fillStyle = colour;
  context.fillRect(x, top, width, height);
  context.fillStyle = PAINT.ring;
  context.textBaseline = "middle";
  context.fillText(text, x + 8, top + height / 2 + 0.5);
  context.restore();
}

function truncate(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && context.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { blockImageUrl } from "../lib/board/block-image";
import type { LiveBlock } from "../lib/board/blocks";
import { BLOCK_PIXELS, BOARD_PIXELS, rectContains, type Point } from "../lib/board/geometry";
import { formatUsdc } from "../lib/board/pricing";
import { type Selection, selectionFromDrag, selectionFromPreset } from "../lib/board/selection";
import {
  type Chrome,
  type Viewport,
  backingStoreSize,
  boardToScreen,
  canPan,
  clampToFit,
  fitScale,
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
 * 10-pixel block fills 160px and a single pixel of somebody's artwork is a
 * 16×16 square. The ladder only ever stops on a power of two, so this is a rung
 * and not a ceiling nothing reaches — it used to be 24, which the old
 * continuous 1.15-per-notch zoom could land on and nothing now can.
 */
const MAX_ZOOM = 16;

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
  const board = { width: BOARD_PIXELS, height: BOARD_PIXELS };
  const fit = fitScale(screen, chrome, board);
  return clampToFit(
    zoomToScale(v, screen, point, nextZoomScale(v.scale, direction, fit, MAX_ZOOM), {
      min: fit,
      max: Math.max(fit, MAX_ZOOM),
    }),
    screen,
    chrome,
    board,
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
 * A free cell keeps its ruling; a sold block covers its rectangle edge to edge
 * and the ruling vanishes under it. Ruled means available, unruled means taken
 * — true whether the artwork is black, neon, or the same cream as the paper.
 *
 * What covers a sold rectangle is the buyer's bitmap. `sold` below is what
 * goes down UNDER it: the fallback a block shows while its image is in flight
 * and the only thing it shows if that image never arrives. It is not the sold
 * treatment; the artwork is.
 */
const PAINT = {
  // The wall the sheet hangs on, and it is the SAME cream as the sheet. The
  // board no longer fills the window, so there is always some of this beside
  // it; painting it darker would letterbox the artwork, and DESIGN.md asks for
  // a sheet of paper on a wall of the same paper instead. The board's own
  // coarse rule draws its edge, which is all the separation it needs.
  ground: "#f3ede0",
  paper: "#f3ede0",
  ruleFine: "rgba(43,36,28,0.10)",
  ruleCoarse: "#c9baa0",
  sold: "#443a2c",
  soldEdge: "#2b241c",
  // The held treatment is the paper's own cream, drawn back OVER a solid
  // block. It is a ruling, not a hue: see drawHeldHatch below.
  heldRule: "rgba(243,237,224,0.62)",
  chip: "#2b241c",
  chipText: "#f3ede0",
  lift: "rgba(255,252,245,0.16)",
  selection: "#dd4e22",
  selectionFill: "rgba(221,78,34,0.14)",
  cream: "#fff8ef",
  danger: "#a8371f",
  dangerFill: "rgba(168,55,31,0.16)",
};

// A caption chip on the board itself needs room to be read; below this it is
// noise over the artwork and the hover card carries it instead.
const CHIP_MIN_BLOCK_PX = 96;
const CHIP_HEIGHT = 18;

// The fine tier is one block. Below roughly six screen pixels per block it
// stops describing where a block would land and starts being a grey wash.
const FINE_RULE_VISIBLE_ABOVE = 6 / BLOCK_PIXELS;

// The held hatch, in SCREEN pixels rather than board pixels, so a hold is
// equally legible on a 10x10 block at cover scale and on a 100x100 block
// zoomed in. Seven is wide enough to read as separate strokes at the smallest
// block the board can sell.
const HELD_HATCH_STEP = 7;

// The marching ants: 12px of dash cycle every 600ms, per DESIGN.md. Advancing
// one pixel every 50ms gets there without redrawing the board sixty times a
// second for an animation that moves twenty pixels in one.
const ANTS_INTERVAL_MS = 50;
const ANTS_DASH = 6;

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
  blocks: LiveBlock[];
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
  onSelectionChange: (selection: Selection | null) => void;
  onHoverChange: (block: LiveBlock | null, at: Point | null) => void;
  /** Reports which ends of the ladder still have a rung, so the buttons can be disabled at the ends. */
  onZoomStateChange: (state: ZoomState) => void;
};

type Drag =
  | { kind: "none" }
  | { kind: "select"; from: Point; to: Point; movement: number }
  | { kind: "pan"; last: Point; movement: number; from: Point; touch: boolean };

export default function BoardCanvas({
  blocks,
  ownHoldIds,
  selection,
  activePreset,
  perPixel,
  chrome,
  zoomControlsRef,
  onSelectionChange,
  onHoverChange,
  onZoomStateChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The canvas has no size before layout runs, so this starts from the
  // function's zero-screen answer and gets re-fit once the ResizeObserver
  // below reports the real size.
  const [viewport, setViewport] = useState<Viewport>(() =>
    initialViewport({ width: 0, height: 0 }, chrome, { width: BOARD_PIXELS, height: BOARD_PIXELS }),
  );
  const [resizeTick, setResizeTick] = useState(0);
  const [ants, setAnts] = useState(0);
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
  // Read by the wheel listener, which is registered once and must not be torn
  // down and rebuilt every time a bar is re-measured.
  const chromeRef = useRef(chrome);
  useEffect(() => {
    chromeRef.current = chrome;
  }, [chrome]);

  /**
   * Every sold block's bitmap, decoded once and kept for the life of the page.
   *
   * A ref rather than state, because the map is not what the board renders
   * from — it is a cache the draw effect reads. Panning and zooming redraw
   * from it constantly and must never cause a refetch; the board also
   * refetches its JSON every thirty seconds, which hands this effect a brand
   * new `blocks` array each time, and an image already in the map is skipped.
   *
   * An entry goes in BEFORE the bytes arrive, which is what makes that
   * skipping work. The draw loop therefore has to ask whether each image is
   * actually decoded rather than merely present — see `complete &&
   * naturalWidth` below, which is also exactly what tells a bitmap still
   * loading apart from one whose request 404'd.
   */
  const images = useRef(new Map<string, HTMLImageElement>());
  // Bumped by each image that finishes, purely to schedule a redraw: the
  // board has to repaint when a bitmap lands, and the bitmap lands outside
  // React.
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    for (const block of blocks) {
      if (!block.hasImage || images.current.has(block.id)) continue;
      const image = new Image();
      images.current.set(block.id, image);
      // A failed load needs no handler: the image stays `complete` with a
      // naturalWidth of 0, the draw loop skips it, and the block keeps the
      // solid fallback. That is the whole 404 story.
      image.onload = () => {
        if (mounted.current) setImagesLoaded((n) => n + 1);
      };
      image.src = blockImageUrl(block.id);
    }
  }, [blocks]);

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
      const board = { width: BOARD_PIXELS, height: BOARD_PIXELS };
      if (!hasInteracted.current) {
        setViewport(initialViewport(screen, chromeRef.current, board));
        return;
      }
      setViewport((v) =>
        clampToFit(
          { ...v, scale: Math.max(fitScale(screen, chromeRef.current, board), v.scale) },
          screen,
          chromeRef.current,
          board,
        ),
      );
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [chrome]);

  // Continuous motion, and the only continuous motion on the page: a drag in
  // progress is the one thing that genuinely differs from a thing at rest.
  const hasSelection = selection !== null;
  useEffect(() => {
    if (!hasSelection) return;
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
    const span = BOARD_PIXELS * scale;

    context.fillStyle = PAINT.ground;
    context.fillRect(0, 0, width, height);

    context.fillStyle = PAINT.paper;
    context.fillRect(origin.x, origin.y, span, span);

    // The sheet's edge. The wall behind the board is the same cream as the
    // board, which is what DESIGN.md asks for — so this hairline, drawn just
    // outside the paper in the coarse rule's own tone, is the only thing
    // saying where the artwork stops. Without it the board has no boundary at
    // all in the corners no ruling reaches.
    context.strokeStyle = PAINT.ruleCoarse;
    context.lineWidth = 1;
    context.strokeRect(
      Math.round(origin.x) - 0.5,
      Math.round(origin.y) - 0.5,
      Math.round(span) + 1,
      Math.round(span) + 1,
    );

    // Two-tier graph paper. The fine tier is one block — it says where a
    // block would land. The coarse tier is a hundred pixels — it is how you
    // navigate without counting.
    context.save();
    context.beginPath();
    context.rect(origin.x, origin.y, span, span);
    context.clip();

    if (scale > FINE_RULE_VISIBLE_ABOVE) {
      drawRules(context, origin, scale, BLOCK_PIXELS, PAINT.ruleFine, screen);
    }
    drawRules(context, origin, scale, 100, PAINT.ruleCoarse, screen);
    context.restore();

    const colliding = new Set(selection?.collidesWith ?? []);
    const own = new Set(ownHoldIds);
    for (const block of blocks) {
      const x = origin.x + block.x * scale;
      const y = origin.y + block.y * scale;
      const w = block.w * scale;
      const h = block.h * scale;
      if (x + w < 0 || y + h < 0 || x > width || y > height) continue;

      // The fallback, first and always: solid, opaque, edge to edge, so the
      // ruling disappears underneath and the block reads as taken from the
      // very first frame — before its bitmap has arrived, and permanently if
      // that bitmap 404s.
      context.fillStyle = PAINT.sold;
      context.fillRect(x, y, w, h);

      // The artwork, over the top, filling exactly the same rectangle. This
      // is what a sold block actually looks like; everything above is what it
      // looks like for the moment before.
      const image = block.hasImage ? images.current.get(block.id) : undefined;
      if (image && image.complete && image.naturalWidth > 0) {
        // Cream first, then the bitmap. An upload with an alpha channel is
        // composited onto the paper's own colour rather than onto whatever
        // happens to be underneath — without this, a transparent PNG would
        // let the graph paper's ruling show through a block that has been
        // sold, and ruled means available.
        context.fillStyle = PAINT.paper;
        context.fillRect(x, y, w, h);
        // Re-asserted immediately before the draw. It is set once per frame
        // after setTransform and survives save/restore, so this is belt and
        // braces — but interpolating somebody's 10×10 bitmap up to 160px is
        // the one thing this board must never do, and it costs nothing to
        // say so at the only place it could happen.
        context.imageSmoothingEnabled = false;
        context.drawImage(image, x, y, w, h);
      }

      // A hairline ink edge, so two adjacent sold blocks stay separate even
      // when their artwork is identical.
      context.strokeStyle = PAINT.soldEdge;
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));

      // A hold is not a sale, and the board has to say so. It still paints
      // solid — those pixels genuinely are not for sale right now — but the
      // ruling comes back over the top as a hatch, and the ink edge is
      // overdrawn with a broken one. Pencilled in, not inked.
      //
      // Structural, never a hue: the hatch is the paper's own cream and the
      // edge is a dash pattern, so a hold reads the same whatever colour the
      // buyer eventually uploads.
      if (block.status === "reserved") {
        // Clamped to the viewport before hatching, so a block zoomed until it
        // is larger than the screen costs a screenful of strokes, not a
        // blockful.
        const hx = Math.max(x, 0);
        const hy = Math.max(y, 0);
        const hw = Math.min(x + w, width) - hx;
        const hh = Math.min(y + h, height) - hy;
        if (hw > 0 && hh > 0) drawHeldHatch(context, hx, hy, hw, hh);

        context.save();
        context.strokeStyle = PAINT.heldRule;
        context.lineWidth = 1;
        context.setLineDash([4, 4]);
        context.strokeRect(x + 1.5, y + 1.5, Math.max(0, w - 3), Math.max(0, h - 3));
        context.restore();

        // Your own hold, marked harder, because it is the one held rectangle
        // on the board you can do something about — resume it or let it go.
        // Terracotta, which DESIGN.md reserves for the primary action and for
        // your selection, and a hold you started is exactly your selection.
        if (own.has(block.id)) {
          context.strokeStyle = PAINT.selection;
          context.lineWidth = 2;
          context.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
        }
      }

      if (colliding.has(block.id)) {
        context.strokeStyle = PAINT.danger;
        context.lineWidth = 2;
        context.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
        context.fillStyle = PAINT.dangerFill;
        context.fillRect(x, y, w, h);
      }

      // Hovered: a soft cream lift and nothing else. No hue changes hands,
      // because the hue belongs to the buyer.
      if (block.id === hoveredId) {
        context.fillStyle = PAINT.lift;
        context.fillRect(x, y, w, h);
        context.strokeStyle = PAINT.cream;
        context.lineWidth = 2;
        context.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
      }

      if (block.caption && w >= CHIP_MIN_BLOCK_PX && h >= CHIP_HEIGHT + 8) {
        drawCaptionChip(context, block.caption, x + 4, y + h - 4 - CHIP_HEIGHT, w - 8, family);
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
      context.strokeStyle = PAINT.cream;
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
        context.strokeStyle = PAINT.cream;
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
  }, [blocks, ownHoldIds, selection, viewport, resizeTick, ants, hoveredId, chrome.top, imagesLoaded]);

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

    if (activePreset !== null) {
      publish(selectionFromPreset(at, activePreset, blocks, perPixel));
      drag.current = { kind: "none" };
      return;
    }

    drag.current = { kind: "select", from: at, to: at, movement: 0 };
    publish(selectionFromDrag(at, at, blocks, perPixel));
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
      const hovered = blocks.find((b) => rectContains(b, at));
      setHoveredId(hovered?.id ?? null);
      const rect = event.currentTarget.getBoundingClientRect();
      onHoverChange(hovered ?? null, hovered ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
      if (activePreset !== null) {
        publish(selectionFromPreset(at, activePreset, blocks, perPixel));
      }
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
      const board = { width: BOARD_PIXELS, height: BOARD_PIXELS };
      setViewport((v) =>
        // Refused at the base rung: the whole board is already on screen, so
        // there is nowhere for a drag to take it and nudging it would only
        // open cream on one side.
        canPan(v.scale, fitScale(screen, chromeRef.current, board))
          ? clampToFit(panBy(v, -dx / v.scale, -dy / v.scale), screen, chromeRef.current, board)
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
    publish(selectionFromDrag(current.from, at, blocks, perPixel));
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
    if (current.touch) {
      publish(selectionFromPreset(current.from, activePreset ?? BLOCK_PIXELS, blocks, perPixel));
      return;
    }
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
      initialViewport({ width: el.clientWidth, height: el.clientHeight }, chromeRef.current, {
        width: BOARD_PIXELS,
        height: BOARD_PIXELS,
      }),
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
    const fit = fitScale({ width: el.clientWidth, height: el.clientHeight }, chrome, {
      width: BOARD_PIXELS,
      height: BOARD_PIXELS,
    });
    onZoomStateChange(zoomAffordance(viewport.scale, fit, MAX_ZOOM));
  }, [viewport.scale, resizeTick, chrome, onZoomStateChange]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") publish(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [publish]);

  return (
    <canvas
      ref={canvasRef}
      className="board-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => {
        setHoveredId(null);
        onHoverChange(null, null);
      }}
    />
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
  for (let p = startX; p <= BOARD_PIXELS; p += step) {
    const sx = Math.round(origin.x + p * scale) + 0.5;
    if (sx > screen.width) break;
    context.moveTo(sx, Math.max(0, origin.y));
    context.lineTo(sx, Math.min(screen.height, origin.y + BOARD_PIXELS * scale));
  }

  const startY = Math.max(0, Math.floor((0 - origin.y) / scale / step) * step);
  for (let p = startY; p <= BOARD_PIXELS; p += step) {
    const sy = Math.round(origin.y + p * scale) + 0.5;
    if (sy > screen.height) break;
    context.moveTo(Math.max(0, origin.x), sy);
    context.lineTo(Math.min(screen.width, origin.x + BOARD_PIXELS * scale), sy);
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
  context.fillStyle = PAINT.cream;
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { LiveBlock } from "../lib/board/blocks";
import { BLOCK_PIXELS, BOARD_PIXELS, rectContains, type Point } from "../lib/board/geometry";
import { formatUsdc } from "../lib/board/pricing";
import { type Selection, selectionFromDrag, selectionFromPreset } from "../lib/board/selection";
import {
  type Viewport,
  backingStoreSize,
  boardToScreen,
  clampToCover,
  coverScale,
  initialViewport,
  isTap,
  nextZoomScale,
  panBy,
  screenToBoard,
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
 * The board's own palette, mirroring the tokens in globals.css.
 *
 * A canvas cannot read a CSS custom property without a `getComputedStyle` on
 * every frame, so these are restated here. They are the DESIGN.md values and
 * nothing else; if one changes there, it changes here.
 *
 * THE RULE THAT OUTRANKS THE REST: state never depends on the buyer's colour.
 * A free cell keeps its ruling; a sold block paints solid and edge to edge and
 * the ruling vanishes under it. Ruled means available, solid means taken —
 * true whether the artwork is black, neon, or the same cream as the paper.
 */
const PAINT = {
  ground: "#e9dfc9",
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
  bars: { top: number; bottom: number };
  onSelectionChange: (selection: Selection | null) => void;
  onHoverChange: (block: LiveBlock | null, at: Point | null) => void;
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
  bars,
  onSelectionChange,
  onHoverChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The canvas has no size before layout runs, so this starts from the
  // function's zero-screen answer and gets re-fit once the ResizeObserver
  // below reports the real size.
  const [viewport, setViewport] = useState<Viewport>(() =>
    initialViewport({ width: 0, height: 0 }, bars, { width: BOARD_PIXELS, height: BOARD_PIXELS }),
  );
  const [resizeTick, setResizeTick] = useState(0);
  const [ants, setAnts] = useState(0);
  // Kept here as well as reported upwards, because the lift is painted on the
  // board and a hover must not depend on a round trip through the parent.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // A board that covers the window looks like a board that ends at the window.
  // One chip says otherwise, and disappears the first time anything is moved.
  const [showPanHint, setShowPanHint] = useState(true);
  const drag = useRef<Drag>({ kind: "none" });
  // Set on the first pointerdown or wheel; once the user has zoomed or
  // panned, a resize must not throw that away by re-fitting the board.
  const hasInteracted = useRef(false);
  // Read by the wheel listener, which is registered once and must not be torn
  // down and rebuilt every time a bar is re-measured.
  const barsRef = useRef(bars);
  useEffect(() => {
    barsRef.current = bars;
  }, [bars]);

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
  // to the new size — this is what makes the initial cover correct once the
  // canvas's real dimensions (and not the zero-size placeholder) are known.
  // Once they have zoomed or panned, a resize re-clamps instead: the board
  // must still cover the new width, but where they had scrolled to stays.
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
        setViewport(initialViewport(screen, barsRef.current, board));
        return;
      }
      setViewport((v) =>
        clampToCover(
          { ...v, scale: Math.max(coverScale(screen, board), v.scale) },
          screen,
          barsRef.current,
          board,
        ),
      );
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [bars]);

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

      // Solid, opaque, edge to edge: the ruling disappears underneath, and
      // that disappearance — not any hue — is what reads as taken.
      context.fillStyle = PAINT.sold;
      context.fillRect(x, y, w, h);

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
        bars.top,
        family,
      );
    }

    const freeRegion = height - bars.top - bars.bottom;
    if (showPanHint && span > freeRegion && freeRegion > 80) {
      drawPanHint(context, width / 2, height - bars.bottom - 20, family);
    }
  }, [blocks, ownHoldIds, selection, viewport, resizeTick, ants, hoveredId, showPanHint, bars.top, bars.bottom]);

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
    setShowPanHint(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = pointerBoard(event);
    const touch = event.pointerType === "touch";

    // Shift-drag pans and plain drag selects on a pointer; on a touchscreen,
    // where there is no shift key and no wheel, a drag pans and a tap places
    // the selection. The legend in the bottom bar says both.
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
      setViewport((v) =>
        clampToCover(
          panBy(v, -dx / v.scale, -dy / v.scale),
          { width: rect.width, height: rect.height },
          barsRef.current,
          { width: BOARD_PIXELS, height: BOARD_PIXELS },
        ),
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

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const current = drag.current;
    drag.current = { kind: "none" };
    event.currentTarget.releasePointerCapture(event.pointerId);

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
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  // React 19 registers onWheel as a passive listener, so it can never call
  // preventDefault(). Without that, scrolling over the board would also scroll
  // the page. A native listener registered as non-passive is the only way to
  // stop that.
  //
  // The board covers the viewport width and overflows downwards, so a plain
  // wheel PANS — that is what a scroll means on a page taller than its window.
  // Zoom is ctrl/cmd-wheel, which is also what a trackpad pinch sends.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handler(event: WheelEvent) {
      hasInteracted.current = true;
      setShowPanHint(false);
      event.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const screen = { width: rect.width, height: rect.height };
      const board = { width: BOARD_PIXELS, height: BOARD_PIXELS };

      if (event.ctrlKey || event.metaKey) {
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const direction = event.deltaY < 0 ? "in" : "out";
        const cover = coverScale(screen, board);
        // One notch is one rung of the ladder, never a 1.15 multiplier. A
        // continuous zoom leaves a board pixel sitting on 1.87 screen pixels
        // far more often than on 2, and every buyer's bitmap goes soft.
        setViewport((v) =>
          clampToCover(
            zoomToScale(v, screen, point, nextZoomScale(v.scale, direction, cover, MAX_ZOOM), {
              min: cover,
              max: Math.max(cover, MAX_ZOOM),
            }),
            screen,
            barsRef.current,
            board,
          ),
        );
        return;
      }

      setViewport((v) =>
        clampToCover(
          panBy(v, event.deltaX / v.scale, event.deltaY / v.scale),
          screen,
          barsRef.current,
          board,
        ),
      );
    }

    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

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

/** The one hint the board itself carries: there is more of it below. */
function drawPanHint(context: CanvasRenderingContext2D, centreX: number, y: number, family: string) {
  const text = "Scroll to see more of the board";
  context.save();
  context.font = `700 11.5px ${family}`;
  const width = context.measureText(text).width + 28;
  const height = 26;
  const x = centreX - width / 2;
  context.globalAlpha = 0.85;
  context.fillStyle = PAINT.chip;
  context.beginPath();
  context.roundRect(x, y - height / 2, width, height, height / 2);
  context.fill();
  context.globalAlpha = 1;
  context.fillStyle = PAINT.chipText;
  context.textBaseline = "middle";
  context.fillText(text, x + 14, y + 0.5);
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

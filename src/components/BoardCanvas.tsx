"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { LiveBlock } from "../lib/board/blocks";
import { BLOCK_PIXELS, BOARD_PIXELS, rectContains, type Point } from "../lib/board/geometry";
import { type Selection, selectionFromDrag, selectionFromPreset } from "../lib/board/selection";
import {
  type Viewport,
  boardToScreen,
  clampToBoard,
  initialViewport,
  isTap,
  panBy,
  screenToBoard,
  zoomAt,
} from "../lib/canvas/viewport";

const ZOOM_LIMITS = { min: 0.2, max: 20 };
const GRID_VISIBLE_ABOVE = 4;

const COLOURS = {
  ground: "#12121a",
  gridLine: "#1f1f2b",
  sold: "#3a3a4d",
  soldEdge: "#4c4c63",
  selection: "#4ade80",
  collision: "#ef4444",
};

type Props = {
  blocks: LiveBlock[];
  selection: Selection | null;
  activePreset: number | null;
  perPixel: number;
  bars: { top: number; bottom: number };
  onSelectionChange: (selection: Selection | null) => void;
  onHoverChange: (block: LiveBlock | null) => void;
};

type Drag =
  | { kind: "none" }
  | { kind: "select"; from: Point; to: Point; movement: number }
  | { kind: "pan"; last: Point; movement: number };

export default function BoardCanvas({
  blocks,
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
  const drag = useRef<Drag>({ kind: "none" });
  // Set on the first pointerdown or wheel; once the user has zoomed or
  // panned, a resize must not throw that away by re-fitting the board.
  const hasInteracted = useRef(false);

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
  // Once they have zoomed or panned, a resize must not discard that.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      setResizeTick((t) => t + 1);
      if (!hasInteracted.current) {
        const el = canvasRef.current;
        if (el) {
          setViewport(
            initialViewport(
              { width: el.clientWidth, height: el.clientHeight },
              bars,
              { width: BOARD_PIXELS, height: BOARD_PIXELS },
            ),
          );
        }
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [bars]);

  // Draw. Everything here is a rectangle; nothing here decides anything.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const screen = { width, height };
    const origin = boardToScreen(viewport, screen, { x: 0, y: 0 });
    const scale = viewport.scale;

    context.fillStyle = COLOURS.ground;
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#0b0b12";
    context.fillRect(origin.x, origin.y, BOARD_PIXELS * scale, BOARD_PIXELS * scale);

    if (scale > GRID_VISIBLE_ABOVE / BLOCK_PIXELS) {
      context.strokeStyle = COLOURS.gridLine;
      context.lineWidth = 1;
      context.beginPath();
      for (let p = 0; p <= BOARD_PIXELS; p += BLOCK_PIXELS) {
        const sx = origin.x + p * scale;
        const sy = origin.y + p * scale;
        context.moveTo(sx, origin.y);
        context.lineTo(sx, origin.y + BOARD_PIXELS * scale);
        context.moveTo(origin.x, sy);
        context.lineTo(origin.x + BOARD_PIXELS * scale, sy);
      }
      context.stroke();
    }

    const colliding = new Set(selection?.collidesWith ?? []);
    for (const block of blocks) {
      const x = origin.x + block.x * scale;
      const y = origin.y + block.y * scale;
      context.fillStyle = colliding.has(block.id) ? COLOURS.collision : COLOURS.sold;
      context.fillRect(x, y, block.w * scale, block.h * scale);
      context.strokeStyle = COLOURS.soldEdge;
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, y + 0.5, block.w * scale - 1, block.h * scale - 1);
    }

    if (selection) {
      const { rect } = selection;
      const x = origin.x + rect.x * scale;
      const y = origin.y + rect.y * scale;
      context.strokeStyle = selection.buyable ? COLOURS.selection : COLOURS.collision;
      context.lineWidth = 2;
      context.strokeRect(x, y, rect.w * scale, rect.h * scale);
      context.fillStyle = selection.buyable ? "rgba(74,222,128,0.18)" : "rgba(239,68,68,0.18)";
      context.fillRect(x, y, rect.w * scale, rect.h * scale);
    }
  }, [blocks, selection, viewport, resizeTick]);

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
    const at = pointerBoard(event);

    // Shift-drag pans, plain drag selects. The legend says so on screen.
    if (event.shiftKey || event.button === 1) {
      drag.current = { kind: "pan", last: { x: event.clientX, y: event.clientY }, movement: 0 };
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
      onHoverChange(hovered ?? null);
      if (activePreset !== null) {
        publish(selectionFromPreset(at, activePreset, blocks, perPixel));
      }
      return;
    }

    if (current.kind === "pan") {
      const dx = event.clientX - current.last.x;
      const dy = event.clientY - current.last.y;
      drag.current = {
        kind: "pan",
        last: { x: event.clientX, y: event.clientY },
        movement: current.movement + Math.abs(dx) + Math.abs(dy),
      };
      setViewport((v) =>
        clampToBoard(panBy(v, -dx / v.scale, -dy / v.scale), {
          width: BOARD_PIXELS,
          height: BOARD_PIXELS,
        }),
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

    // A pan that barely moved was a tap on the canvas, not a drag; clear the
    // selection so tapping empty space deselects rather than doing nothing.
    if (current.kind === "pan" && isTap(current.movement)) publish(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
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
  // preventDefault(). Without that, scrolling over the board zooms it AND
  // scrolls the page, carrying the board out of view. A native listener
  // registered as non-passive is the only way to stop that.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handler(event: WheelEvent) {
      hasInteracted.current = true;
      event.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      setViewport((v) =>
        zoomAt(v, { width: rect.width, height: rect.height }, point, factor, ZOOM_LIMITS),
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
      onPointerLeave={() => onHoverChange(null)}
    />
  );
}

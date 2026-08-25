"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type { LiveBlock } from "../lib/board/blocks";
import { BLOCK_PIXELS, BOARD_PIXELS, type Point } from "../lib/board/geometry";
import { type Selection, selectionFromDrag, selectionFromPreset } from "../lib/board/selection";
import {
  type Viewport,
  boardToScreen,
  clampToBoard,
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
  activePreset: number | null;
  perPixel: number;
  onSelectionChange: (selection: Selection | null) => void;
  onHoverChange: (block: LiveBlock | null) => void;
};

type Drag =
  | { kind: "none" }
  | { kind: "select"; from: Point; to: Point; movement: number }
  | { kind: "pan"; last: Point; movement: number };

export default function BoardCanvas({
  blocks,
  activePreset,
  perPixel,
  onSelectionChange,
  onHoverChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<Viewport>({
    centreX: BOARD_PIXELS / 2,
    centreY: BOARD_PIXELS / 2,
    scale: 0.6,
  });
  const [selection, setSelection] = useState<Selection | null>(null);
  const drag = useRef<Drag>({ kind: "none" });

  const publish = useCallback(
    (next: Selection | null) => {
      setSelection(next);
      onSelectionChange(next);
    },
    [onSelectionChange],
  );

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
  }, [blocks, selection, viewport]);

  function pointerBoard(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return screenToBoard(
      viewport,
      { width: rect.width, height: rect.height },
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
    );
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
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
      const hovered = blocks.find(
        (b) => at.x >= b.x && at.x < b.x + b.w && at.y >= b.y && at.y < b.y + b.h,
      );
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

  function onWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    setViewport((v) =>
      zoomAt(v, { width: rect.width, height: rect.height }, point, factor, ZOOM_LIMITS),
    );
  }

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
      onPointerLeave={() => onHoverChange(null)}
      onWheel={onWheel}
    />
  );
}

import { describe, expect, it } from "vitest";
import type { BoardRect } from "../blocks";
import { DETAIL_MAX_RECTS, DETAIL_MIN_SCALE, detailRects, wantsDetail } from "../detail";

/**
 * Which rectangles the board redraws from their own bitmaps, and when.
 *
 * The cost of getting this wrong is not a wrong picture — the composite is
 * underneath either way — it is a request per purchase at the zoom where a
 * wall full of one-pixel sales has the most of them on screen. So the two
 * things asserted here are that nothing off screen is asked for, and that the
 * cap holds however many rectangles are in view.
 */

const SCREEN = { width: 1000, height: 700 };
const ORIGIN = { x: 0, y: 0 };

function sold(id: string, x: number, y: number, w = 10, h = 10): BoardRect {
  return { id, x, y, w, h, status: "paid" };
}

function held(id: string, x: number, y: number, w = 10, h = 10): BoardRect {
  return { id, x, y, w, h, status: "reserved" };
}

describe("wantsDetail", () => {
  it("stays off below the zoom where the ruling appears, and comes on with it", () => {
    expect(wantsDetail(1)).toBe(false);
    expect(wantsDetail(DETAIL_MIN_SCALE - 0.01)).toBe(false);
    expect(wantsDetail(DETAIL_MIN_SCALE)).toBe(true);
    expect(wantsDetail(16)).toBe(true);
  });

  it("is off at a fitted board's scale, where the whole wall is on screen", () => {
    // 1000 / 1250: the board fitted by width in a laptop-sized free region.
    expect(wantsDetail(0.8)).toBe(false);
  });
});

describe("detailRects", () => {
  it("takes only what is on screen", () => {
    const rects = [
      sold("visible", 10, 10),
      sold("far-right", 900, 10),
      sold("far-below", 10, 900),
      sold("negative", -40, -40),
    ];
    // At scale 8, the screen shows wall pixels 0..125 across and 0..87 down.
    const chosen = detailRects(rects, ORIGIN, 8, SCREEN).map((rect) => rect.id);
    expect(chosen).toEqual(["visible"]);
  });

  it("follows the origin when the board is panned", () => {
    const rects = [sold("left", 0, 0), sold("right", 500, 0)];
    // Panned so wall pixel 500 sits at the left edge of the screen.
    const panned = { x: -500 * 8, y: 0 };
    expect(detailRects(rects, panned, 8, SCREEN).map((r) => r.id)).toEqual(["right"]);
  });

  it("never asks for a hold, which has no public bitmap at any zoom", () => {
    const rects = [held("mine", 10, 10), sold("theirs", 30, 10)];
    expect(detailRects(rects, ORIGIN, 8, SCREEN).map((r) => r.id)).toEqual(["theirs"]);
  });

  it("puts the rectangle covering most of the view first", () => {
    const rects = [
      sold("sliver", 0, 0, 1, 1),
      sold("wide", 20, 20, 60, 40),
      sold("middling", 20, 0, 10, 10),
    ];
    expect(detailRects(rects, ORIGIN, 8, SCREEN).map((r) => r.id)).toEqual([
      "wide",
      "middling",
      "sliver",
    ]);
  });

  it("counts only the part of a rectangle that is actually on screen", () => {
    // `edge` is a hundred times the area, but at scale 8 only two of its
    // columns are on a screen 1000 across; `inside` is entirely visible and
    // wins on what is actually seen rather than on what it measures.
    const rects = [
      sold("edge", 123, 0, 200, 200),
      sold("inside", 0, 0, 20, 20),
    ];
    expect(detailRects(rects, ORIGIN, 8, SCREEN)[0].id).toBe("inside");
  });

  it("caps how many it will ask for, however many are in view", () => {
    const rects = Array.from({ length: 400 }, (_, n) =>
      sold(`r${String(n).padStart(3, "0")}`, (n % 20) * 6, Math.floor(n / 20) * 6, 5, 5),
    );
    expect(detailRects(rects, ORIGIN, 8, SCREEN)).toHaveLength(DETAIL_MAX_RECTS);
  });

  it("chooses the same rectangles twice for the same frame, so nothing flickers", () => {
    const rects = Array.from({ length: 60 }, (_, n) =>
      sold(`r${String(n).padStart(3, "0")}`, (n % 10) * 11, Math.floor(n / 10) * 11, 10, 10),
    );
    const first = detailRects(rects, ORIGIN, 8, SCREEN).map((r) => r.id);
    const shuffled = [...rects].reverse();
    expect(detailRects(shuffled, ORIGIN, 8, SCREEN).map((r) => r.id)).toEqual(first);
  });
});

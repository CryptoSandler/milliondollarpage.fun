import { BOARD_HEIGHT, BOARD_WIDTH } from "../board/geometry";
import {
  BAR_TOP_PX,
  BOARD_INSET,
  SIDE_RAIL_MAX,
  SIDE_RAIL_MIN,
  TAPE_H_PX,
  TOOLS_RAIL_MAX,
  TOOLS_RAIL_MIN,
} from "./viewport";

/**
 * The six lines that decide the page's layout before its first paint.
 *
 * WHO CALLS THIS: `src/app/layout.tsx`, which drops it into a blocking
 * `<script>` in the head, and `rails-boot.test.ts`, which runs it against
 * `sideRailWidth` over a sweep of viewports. It is a module of its own rather
 * than a constant in `layout.tsx` for the second of those: that file pulls in
 * `next/font`, and a test that had to import it would be testing the font
 * loader as well as this string.
 *
 * ## Why it is blocking, and why it is not React
 *
 * The rails are decided by arithmetic on both viewport dimensions at once,
 * which the server cannot know and `@media` cannot express — `(min-width:)`
 * cannot be told about the height in the same breath. An effect would put the
 * board on screen at one size and then move it, which on the only monitors
 * where the rails exist is a jump of forty pixels and the layout's version of a
 * flash of the wrong colourway. `THEME_BOOT` next door solves the same problem
 * the same way, and for the same reason.
 *
 * ## The duplication, which is deliberate and is tested
 *
 * This is `sideRailWidth` and `toolsRailWidth` written a second time, because
 * an inline boot script cannot import a module. Every NUMBER in it is interpolated from the constants
 * beside that function, so only the shape is repeated — and `rails-boot.test.ts`
 * evaluates this exact string against the function itself across a sweep of
 * viewports, so a change made to one and not the other fails a test rather than
 * shipping as a layout that disagrees with its own guard.
 *
 * ## `?rails=off`
 *
 * Forces the rails off at any viewport. It is not a hatch left in by accident:
 * `purchase-e2e.test.ts` loads one window both ways to assert that the board is
 * never narrower with the rails than without them, which is a comparison that
 * needs the same viewport twice, and the owner can see the before and after of
 * this amendment at their own monitor with it.
 */
export const RAILS_BOOT =
  `(function(){var d=document.documentElement;function s(){` +
  `var off=location.search.indexOf("rails=off")>=0;` +
  // The full rails: every piece of chrome in the letterbox, the register off
  // the bottom of the window, the board fitted under the header alone.
  `var w=off?0:(innerWidth-${2 * BOARD_INSET}-${BOARD_WIDTH / BOARD_HEIGHT}*(innerHeight-${
    BAR_TOP_PX + 2 * BOARD_INSET
  }))/2;` +
  `w=w>=${SIDE_RAIL_MIN}?Math.min(w,${SIDE_RAIL_MAX}):0;` +
  // The tools-only rail: the board's overlay alone, against a board that still
  // has the register under it. Only where the full rails did not fit.
  `var t=(off||w)?0:(innerWidth-${2 * BOARD_INSET}-${BOARD_WIDTH / BOARD_HEIGHT}*(innerHeight-${
    BAR_TOP_PX + TAPE_H_PX + 2 * BOARD_INSET
  }))/2;` +
  `t=t>=${TOOLS_RAIL_MIN}?Math.min(t,${TOOLS_RAIL_MAX}):0;` +
  `d.setAttribute("data-rails",w?"on":"off");` +
  `d.setAttribute("data-tools",t?"on":"off");` +
  `d.style.setProperty("--rail-w",w+"px");` +
  `d.style.setProperty("--tools-w",t+"px")}` +
  `s();addEventListener("resize",s)})()`;

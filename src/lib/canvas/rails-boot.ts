import { BOARD_HEIGHT, BOARD_WIDTH } from "../board/geometry";
import { BAR_TOP_PX, BOARD_INSET, SIDE_RAIL_MAX, SIDE_RAIL_MIN } from "./viewport";

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
 * This is `sideRailWidth` written a second time, because an inline boot script
 * cannot import a module. Every NUMBER in it is interpolated from the constants
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
  `var w=location.search.indexOf("rails=off")<0?` +
  `(innerWidth-${2 * BOARD_INSET}-${BOARD_WIDTH / BOARD_HEIGHT}*(innerHeight-${
    BAR_TOP_PX + 2 * BOARD_INSET
  }))/2:0;` +
  `w=w>=${SIDE_RAIL_MIN}?Math.min(w,${SIDE_RAIL_MAX}):0;` +
  `d.setAttribute("data-rails",w?"on":"off");` +
  `d.style.setProperty("--rail-w",w+"px")}` +
  `s();addEventListener("resize",s)})()`;

import { BOARD_HEIGHT, BOARD_WIDTH } from "../board/geometry";
import {
  BAR_TOP_PX,
  BOARD_INSET,
  SIDE_RAIL_MAX,
  SIDE_RAIL_MIN,
  STRIP_H_PX,
  TICKER_GAP_MIN,
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
 * This is `railLayout` and `tickerLayout` written a second time, because an
 * inline boot script cannot import a module. It stamps three things:
 * `data-rails` (`full` or `off`) with `--rail-w`, and `data-ticker` (`sides` or
 * `strip`) with `--ticker-w`. Every NUMBER in it is interpolated from the
 * constants beside those functions, so only the shape is repeated — and
 * `rails-boot.test.ts` evaluates this exact string against the functions
 * themselves across a sweep of viewports, so a change made to one and not the
 * other fails a test rather than shipping as a layout that disagrees with its
 * own guard.
 *
 * ## Two gaps, not one, and they are measured against different boards
 *
 * The rails' gap is the letterbox a board fitted under the HEADER ALONE leaves,
 * because with the rails on the strip disappears. The ticker's is the letterbox
 * a board fitted under the header AND the strip leaves, because in that layout
 * the strip stays — it has lost the register and kept the presets and the
 * panel. The second board is shorter, so its letterbox is wider, and using one
 * number for both would put a ticker in a gap the board is standing in.
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
  // The letterbox a board fitted under the header alone leaves — the register
  // goes into the right-hand rail, so that is the board being measured.
  `var g=off?-1:(innerWidth-${2 * BOARD_INSET}-${BOARD_WIDTH / BOARD_HEIGHT}*(innerHeight-${
    BAR_TOP_PX + 2 * BOARD_INSET
  }))/2;` +
  `var k=g>=${SIDE_RAIL_MIN}?"full":"off";` +
  `var w=k==="full"?Math.min(g,${SIDE_RAIL_MAX}):0;` +
  `d.setAttribute("data-rails",k);` +
  `d.style.setProperty("--rail-w",w+"px");` +
  // The ticker's own gap: the same arithmetic against a board that also has the
  // strip under it. `off` on the rails is the only case it can apply to.
  `var tg=off?-1:(innerWidth-${2 * BOARD_INSET}-${BOARD_WIDTH / BOARD_HEIGHT}*(innerHeight-${
    BAR_TOP_PX + STRIP_H_PX + 2 * BOARD_INSET
  }))/2;` +
  `var t=k==="off"&&tg>=${TICKER_GAP_MIN}?"sides":"strip";` +
  `d.setAttribute("data-ticker",t);` +
  `d.style.setProperty("--ticker-w",(t==="sides"?tg:0)+"px")}` +
  `s();addEventListener("resize",s)})()`;

/**
 * How to drive the board, stated on the board.
 *
 * A drag-to-size selector is not discoverable, and neither is scroll-to-pan on
 * a canvas that covers the window. Two legends rather than one: a pointer has
 * modifiers and a wheel, a touchscreen has neither.
 *
 * Of everything in the bottom bar this is the least essential — it explains an
 * interaction, it isn't one — so per DESIGN.md it is the first thing to go as
 * the bar runs out of width, hidden below `lg` rather than squeezed or wrapped.
 */
export default function InteractionLegend() {
  return (
    <div className="hidden shrink-0 flex-col gap-0.5 text-[11.5px] leading-tight text-mute lg:flex">
      <p>
        <span className="font-semibold text-body">Drag</span> to outline ·{" "}
        <span className="font-semibold text-body">scroll</span> to move down the board
      </p>
      <p>
        <span className="font-semibold text-body">⌘/ctrl-scroll</span> to zoom ·{" "}
        <span className="font-semibold text-body">shift-drag</span> to pan ·{" "}
        <span className="font-semibold text-body">esc</span> to clear
      </p>
    </div>
  );
}

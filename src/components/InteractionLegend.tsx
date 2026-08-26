/**
 * How to drive the board, stated on the board.
 *
 * A drag-to-size selector is not discoverable, and neither is shift-to-pan.
 * Two legends rather than one: a pointer has modifiers and a wheel, a
 * touchscreen has neither.
 *
 * Of everything in the bottom bar this is the least essential — it explains
 * an interaction, it isn't one — so it is the first thing to go as the bar
 * runs out of width, hidden below `md` rather than squeezed or wrapped.
 */
export default function InteractionLegend() {
  return (
    <div className="hidden shrink-0 flex-col gap-1 text-xs text-neutral-500 md:flex">
      <p className="hidden sm:block">
        scroll · zoom &nbsp;|&nbsp; shift-drag · pan &nbsp;|&nbsp; drag · select &nbsp;|&nbsp; click ·
        one block &nbsp;|&nbsp; esc · clear
      </p>
      <p className="sm:hidden">Pinch to zoom · drag to pan · tap to select a block</p>
    </div>
  );
}

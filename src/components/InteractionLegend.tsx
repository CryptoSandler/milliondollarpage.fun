/**
 * How to drive the board, stated on the board.
 *
 * A drag-to-size selector is not discoverable, and neither is shift-to-pan.
 * Two legends rather than one: a pointer has modifiers and a wheel, a
 * touchscreen has neither.
 */
export default function InteractionLegend() {
  return (
    <div className="flex flex-col gap-1 text-xs text-neutral-500">
      <p className="hidden sm:block">
        scroll · zoom &nbsp;|&nbsp; shift-drag · pan &nbsp;|&nbsp; drag · select &nbsp;|&nbsp; click ·
        one block &nbsp;|&nbsp; esc · clear
      </p>
      <p className="sm:hidden">Pinch to zoom · drag to pan · tap to select a block</p>
    </div>
  );
}

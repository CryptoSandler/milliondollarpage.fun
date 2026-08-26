/**
 * How to drive the board, stated on the board.
 *
 * A drag-to-size selector is not discoverable, and neither is a wheel that
 * zooms rather than scrolls. Two lines rather than one: a pointer has
 * modifiers and a wheel, a touchscreen has neither.
 *
 * Of everything in the controls this is the least essential — it explains an
 * interaction, it isn't one — so per DESIGN.md it is the first thing to go
 * when room runs out: hidden below `lg` in the bottom bar, and hidden again
 * in a side panel too short to hold it. Where the panel does have the room it
 * comes back, pinned to the floor of the column.
 */
export default function InteractionLegend() {
  return (
    <div className="interaction-legend hidden shrink-0 flex-col gap-0.5 text-[11.5px] leading-tight text-mute lg:flex">
      <p>
        <span className="font-semibold text-body">Click</span> to place a size ·{" "}
        <span className="font-semibold text-body">drag</span> to outline freehand
      </p>
      <p>
        <span className="font-semibold text-body">Scroll, pinch or the buttons</span> to zoom ·{" "}
        <span className="font-semibold text-body">shift-drag</span> to move once zoomed in ·{" "}
        <span className="font-semibold text-body">esc</span> to clear
      </p>
    </div>
  );
}

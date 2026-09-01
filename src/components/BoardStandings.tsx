import type { Standing } from "../lib/board/blocks";
import { formatUsdc } from "../lib/board/pricing";

/**
 * The five biggest rectangles on the wall, at the foot of the right rail.
 *
 * WHO CALLS THIS: `BoardView`, and nothing else. It is a component rather than
 * markup inside that file for the same reason `PurchaseTape` is — BoardView is
 * already the largest file here — and it sits beside the register because the
 * two answer the same question from opposite ends: what just happened, and what
 * has happened most.
 *
 * ## Why it may be on the board at all
 *
 * `/stats` carries the long form of this list and DESIGN.md is exact about why
 * the board may not carry everything `/stats` does: "nothing on the board
 * promises revenue. Not a million dollars raised, not a total, not an implied
 * one." **Nothing here is a total.** Every figure is one rectangle's own price,
 * which is the same fact the settled register above it already prints, and the
 * sum is deliberately not computed — `soldValueBaseUnits` is not in the board's
 * payload and this component is never handed it. The board cannot print a
 * number it is not told, which is a stronger guarantee than a rule about
 * rendering.
 *
 * ## And the one word `/stats` needs, which this cannot fit
 *
 * "Outbid." `/stats` spends a paragraph saying that a rank changes only when
 * somebody buys a bigger rectangle of their own, and nobody's position can be
 * taken by paying more. A 180px rail has no room for a paragraph, so the claim
 * is the heading's own tooltip and the link to the page that argues it. What is
 * NOT done is to imply the opposite by silence: nothing here suggests a
 * position is for sale.
 *
 * ## Who is never named
 *
 * Nobody, which is the same rule the register and the board keep. A rectangle
 * is four numbers and a price.
 */
export default function BoardStandings({ rows }: { rows: Standing[] }) {
  if (rows.length === 0) return null;

  return (
    <section
      className="board-standings"
      aria-label="The biggest rectangles on the wall"
      title="Ranked by pixels held. A rank changes only when somebody buys a bigger rectangle of their own — nothing here can be outbid."
    >
      <p className="board-standings__head label-caps">Biggest</p>
      <ol className="board-standings__list">
        {rows.map((row, at) => (
          <li key={row.id} className="board-standings__row">
            <span className="board-standings__rank tabular">{at + 1}</span>
            <span className="board-standings__size tabular">
              {row.w} × {row.h}
            </span>
            <span className="board-standings__amount tabular">
              {formatUsdc(row.totalBaseUnits)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

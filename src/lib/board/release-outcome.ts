import type { ReleaseResult } from "./purchase-client";

/**
 * Given what the release actually answered, what does the buyer get told?
 *
 * Called by `PurchaseDialog`'s `requestClose`, which closes the dialog after
 * handing the hold back and has to say something true about what happened to
 * it. It lives here rather than inline for the reason `single-flight.ts` and
 * `with-timeout.ts` do: a decision buried in a component is a decision you can
 * only test by rendering the component, and this one is a decision about
 * money.
 *
 * The bug it exists to stop: `requestClose` used to ignore the release's
 * result entirely. From the stalled confirmation screen, "Back to the board"
 * asked the buyer to confirm abandoning the hold, told them their pixels were
 * going back and nothing they had typed was kept — and then the DELETE
 * answered 409, because the payment HAD landed and a paid block is
 * deliberately undeletable. The buyer was told their purchase had been thrown
 * away at the exact moment it succeeded.
 *
 * Three outcomes, because three different things are true:
 *
 * - **204.** The hold is gone and the rectangle is back on the board.
 * - **409.** The order is not a reservation any more, and the only way that
 *   happens is that it was paid for. There is no hold to let go because
 *   there is a sale instead — so say the purchase went through, and drop the
 *   abandonment wording entirely.
 * - **Anything else.** 403, 404, a network failure, no wallet to sign with:
 *   we do not know that the hold is gone, so we must not say it is. The
 *   rectangle may still be reserved, and it comes back on its own when its
 *   clock runs out.
 *
 * A 404 sits in that last group rather than with the successes on purpose.
 * The buyer's own attempt may have deleted it, or a sweep may have, or the id
 * may have been wrong — and every one of those ends with the pixels free, so
 * the sentence about the clock is at worst redundant and never wrong.
 */
export type ReleaseTelling = {
  /** The board should stop marking this order as this buyer's live hold. */
  holdEnded: boolean;
  /** It became a sale. The board wants a refresh, not a hold removed quietly. */
  purchased: boolean;
  /** What the buyer reads. Safe to render as-is, like every `problem()` message. */
  notice: string;
};

export function tellRelease(result: ReleaseResult): ReleaseTelling {
  if (result.ok) {
    return {
      holdEnded: true,
      purchased: false,
      notice:
        "That hold is let go — those pixels are back on the board for anyone to buy. Nothing was charged.",
    };
  }

  if (result.status === 409) {
    return {
      holdEnded: true,
      purchased: true,
      notice:
        "Good news: that payment did land. Those pixels are bought and yours, and nothing you " +
        "wrote was thrown away — your picture, link and caption are on the block, on the board.",
    };
  }

  return {
    holdEnded: false,
    purchased: false,
    notice:
      `${result.message} Those pixels may still be held for you, and they go back on the board ` +
      "on their own once the hold's clock runs out. Nothing was charged.",
  };
}

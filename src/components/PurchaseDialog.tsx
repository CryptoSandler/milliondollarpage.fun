"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsdc } from "../lib/board/pricing";
import { confirmOrder, createHold, releaseHold, type ClientOrder } from "../lib/board/purchase-client";
import type { Selection } from "../lib/board/selection";
import { singleFlight } from "../lib/board/single-flight";
import { STEP_CEILING_MS } from "../lib/board/timing";
import { TimedOut, withTimeout } from "../lib/board/with-timeout";
import ConfirmationStep from "./ConfirmationStep";
import ContentForm, { EMPTY_DRAFT, type ContentDraft } from "./ContentForm";
import HoldTimer from "./HoldTimer";

type Step = "holding" | "describing" | "confirming" | "paying" | "done";

/** Which request ran past its ceiling. Not a step — see `stalled` below. */
type Stalled = "hold" | "confirm" | "release";

/**
 * What the screen says when a request has run past the ceiling.
 *
 * One sentence per request, because what is unknown differs: a hold that may
 * or may not exist reads nothing like a payment that may or may not have gone
 * through. Each says what happened, what is genuinely uncertain, and what
 * pressing the button will do about it — including the reassurance that
 * matters most at that moment, which is that asking again cannot make things
 * worse.
 */
const STALLED_MESSAGE: Record<Stalled, string> = {
  hold:
    "Ten seconds, and the server has not said whether these pixels are held for you. It may have " +
    "taken them the moment you pressed Buy, or it may never have heard the question at all. Ask " +
    "again and you will find out which — asking twice cannot land you two rectangles, because a " +
    "hold you already have comes back to you rather than refusing you.",
  confirm:
    "Ten seconds, and the server has not said whether the payment went through. Ask again: if it " +
    "already did, you will land straight on the receipt, and if it did not, this sends it once " +
    "more. Either way these pixels stay held until the clock above runs out.",
  release:
    "Ten seconds, and the server has not said whether that hold was let go. Ask again — if it is " +
    "already gone, there will be nothing left to release and this carries on to your rectangle.",
};

/** One label, because the answer to all three is the same: ask the server again. */
const RETRY_LABEL = "Ask again";

/**
 * The step machine a buyer walks through: holding -> describing -> confirming
 * -> paying -> done.
 *
 * The dialog owns the order and the buyer's draft content so both survive a
 * trip back and forth between `describing` and `confirming` (the back button
 * on the confirmation screen). It does not own validation — every field's
 * rules already live in `content.ts` and are tested there; this only routes
 * a 422's rejections back to the field they named, and renders whatever
 * message the server sent for anything else, per `problem()`'s contract that
 * that message is always safe to show as-is.
 *
 * It also owns the countdown. The hold is the thing every step is racing, so
 * it is stated once, at the top, beside the price — not repeated in each
 * step's footer where a buyer scrolled past it would never see it.
 *
 * `fatalMessage` is a screen, not a step: it can be reached from any step
 * (a taken rectangle, an expired hold, an order that stopped being ours) and
 * once shown there is nothing to go back to, so it overrides the switch
 * below rather than living inside it. Its one exception is a rectangle
 * blocked by the buyer's OWN hold, where there is something to do about it —
 * see `releasable`.
 *
 * Every request this dialog makes goes through `singleFlight`, so a
 * double-clicked button produces one request rather than two, the second of
 * which would lose the exclusion constraint to the first — and under a ten
 * second ceiling, so no step of this dialog can load forever. `stalled` is the
 * screen that ceiling leads to.
 */
export default function PurchaseDialog({
  selection,
  buyerPubkey,
  knownHoldIds,
  onHoldStarted,
  onHoldEnded,
  onClose,
  onPurchased,
  onRefresh,
  onGateChange,
}: {
  selection: Selection;
  buyerPubkey: string;
  /** Holds this browser already started, so a returned order can be recognised as a resumed one rather than a new one. */
  knownHoldIds: string[];
  /** A hold now exists (fresh or resumed) — the board marks it as this buyer's. */
  onHoldStarted: (orderId: string) => void;
  /** That hold is over: released, expired, or paid for. */
  onHoldEnded: (orderId: string) => void;
  onClose: (notice?: string) => void;
  onPurchased: () => void;
  /** Refetch the board immediately — used the instant a hold attempt comes back 409, so the rectangle that beat us appears behind the message. */
  onRefresh: () => void;
  /** Tell BoardView whether its background poll should skip a refresh right now: true from the moment content is on screen (describing/confirming/paying/done) until either a fatal message appears or this dialog unmounts. */
  onGateChange: (blocked: boolean) => void;
}) {
  // Snapshotted at open time: the order this dialog holds belongs to this
  // exact address for its whole life. If the buyer edits the wallet field
  // behind the dialog while it's open, later calls must keep using the
  // address the hold was created with, or attachContent/markPaid would see a
  // mismatch and answer 403 "not yours" against their own hold.
  const [ownerPubkey] = useState(buyerPubkey);

  const [step, setStep] = useState<Step>("holding");
  const [order, setOrder] = useState<ClientOrder | null>(null);
  const [draft, setDraft] = useState<ContentDraft>(EMPTY_DRAFT);
  const [fatalMessage, setFatalMessage] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // True when the hold that came back is one this browser already had, rather
  // than one this dialog just opened. Nothing on the wire says so — the server
  // returns a resumed hold in exactly the shape a fresh one takes — so it is
  // recognised by its id, which only the buyer who created it can know.
  const [resumed, setResumed] = useState(false);
  // The request that ran past its ceiling, if one has. A screen rather than a
  // step, like `fatalMessage`, and for the same reason: any step can reach it.
  // Unlike a fatal message it is not a dead end — it exists to carry a retry.
  const [stalled, setStalled] = useState<Stalled | null>(null);
  // Holds of the buyer's own that stood in the way of this rectangle. Only
  // ever their own ids: the 409 body carries nobody else's.
  const [releasable, setReleasable] = useState<string[]>([]);
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  // One wrapper per call per dialog instance, built once by the lazy
  // initialiser. This has to be an identity guarantee rather than a
  // performance hint: two wrappers would mean two in-flight slots, and the
  // double click this exists to stop would go straight through both.
  //
  // The ceiling goes INSIDE the single-flight, never outside it. That way the
  // in-flight slot is freed the instant the ceiling fires, and the retry the
  // buyer presses is a new request that reaches the network — rather than the
  // stalled one handed straight back to them. The argument is written out in
  // full in with-timeout.ts, and both orders are pinned by tests there.
  const [call] = useState(() => ({
    hold: singleFlight(withTimeout(createHold, STEP_CEILING_MS)),
    confirm: singleFlight(withTimeout(confirmOrder, STEP_CEILING_MS)),
    release: singleFlight(withTimeout(releaseHold, STEP_CEILING_MS)),
  }));

  // The holds this browser already had when the dialog opened. Snapshotted
  // like `ownerPubkey` above, because what makes a returned order a RESUMED
  // one is that it was already ours before this dialog asked — an id added
  // while it is open is one this dialog itself created.
  const [holdIdsAtOpen] = useState(knownHoldIds);

  const hasLiveHold = order !== null && step !== "done" && fatalMessage === null;

  /**
   * Asks for the rectangle, and sorts the answer into the three things it can
   * be: a hold (fresh or resumed), a refusal the buyer can undo, or a refusal
   * they cannot.
   *
   * `isLive` says whether the caller still wants the answer. The mount effect
   * below passes its own effect-local flag; an event handler passes nothing,
   * because a handler that fired from a live DOM node was called by a mounted
   * component and React 19 already makes a late `setState` on an unmounted one
   * a no-op rather than a warning.
   *
   * `afterTimeout` is set by the retry that follows a ceiling, and it changes
   * one thing: the hold that comes back is presented as a RESUMED one. The
   * request that timed out was never cancelled — a POST already sent is
   * already sent — so it may well have created the very hold this attempt is
   * now being handed. Since the server returns a resumed hold in exactly the
   * shape of a fresh one, the id alone cannot tell us, and the honest default
   * is the one that warns the buyer their clock did not start just now.
   *
   * // ponytail: guessed from "an attempt timed out", not known. In the rarer
   * // case where the first request never reached the server at all, this
   * // shows the resumed line over a hold that really is seconds old, and the
   * // countdown reads about ten seconds short of thirty minutes. Knowing for
   * // certain would mean following the abandoned request to see what it
   * // returned and racing that against this one; if that ever becomes worth
   * // the machinery, that is where it goes.
   */
  const attemptHold = useCallback(async (isLive: () => boolean = () => true, afterTimeout = false) => {
    let result;
    try {
      result = await call.hold(selection.rect, ownerPubkey);
    } catch (error) {
      if (!isLive()) return;
      // A rejection out of purchase-client has exactly one cause: the ceiling.
      // Everything else, network failure included, comes back resolved.
      if (!(error instanceof TimedOut)) throw error;
      setStalled("hold");
      return;
    }
    if (!isLive()) return;

    if (result.ok) {
      setResumed(afterTimeout || holdIdsAtOpen.includes(result.order.id));
      onHoldStarted(result.order.id);
      setOrder(result.order);
      setStep("describing");
      return;
    }

    // The rectangle that just refused us is invisible on a stale board;
    // refresh immediately so it appears behind this message instead of
    // leaving the buyer staring at empty pixels and a "taken" notice.
    if (result.status === 409) onRefresh();

    // A refusal caused by the buyer's own earlier attempt is the one refusal
    // with a way out, so it keeps the ids and offers the release below
    // instead of ending in a dead end.
    if (result.status === 409 && result.yourOrderIds && result.yourOrderIds.length > 0) {
      setReleasable(result.yourOrderIds);
      setFatalMessage(result.message);
      return;
    }

    const suffix = result.retryAt
      ? ` Try again after ${new Date(result.retryAt).toLocaleTimeString()}.`
      : "";
    setFatalMessage(`${result.message}${suffix}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Asks for the rectangle once: a dialog instance holds exactly one
  // rectangle for its whole life (BoardView mounts a fresh one per purchase
  // attempt). A retry after a release goes through `attemptHold` directly,
  // not through here.
  useEffect(() => {
    // `cancelled` is declared HERE, inside the effect, so it is FRESH on every
    // run of it. That is the whole point, and it is the shape HoldTimer's
    // cleanup already uses.
    //
    // React invokes an effect twice in development: mount, cleanup, mount. A
    // flag kept in a `useRef` survives that cleanup, because a ref survives a
    // remount — so the second run would start out already reading "gone", and
    // would discard the answer it is itself waiting for. That is not a
    // hypothetical: it is the bug this replaced, and it looked like a dialog
    // stuck forever on "Holding these pixels for you…" with a dash where the
    // countdown belongs, while the POST it was waiting on had come back 201
    // and created a real hold.
    //
    // Both runs share one request — `singleFlight` sees to that — and only the
    // run that is still live applies the result.
    let cancelled = false;
    void (async () => {
      await attemptHold(() => !cancelled);
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptHold]);

  const requestClose = useCallback(
    async (notice?: string) => {
      if (hasLiveHold && order) {
        const abandon = window.confirm(
          "Close and this hold ends: these pixels go straight back on the board for anyone to buy, " +
            "and nothing you have typed here is kept. Close anyway?",
        );
        if (!abandon) return;
        // The sentence above promises the pixels come back now, so they do.
        // Leaving the row to expire would have made it a thirty-minute lie —
        // and the buyer's own next attempt the thing it blocked.
        try {
          await call.release(order.id, ownerPubkey);
        } catch (error) {
          if (!(error instanceof TimedOut)) throw error;
          // A close that has already been agreed to must close. The hold is
          // deliberately NOT forgotten here: it may still be standing, and
          // leaving it marked as this buyer's is what lets them pick it back
          // up from the board instead of being refused by their own rectangle.
          onClose(
            "That close did not get an answer in time, so these pixels may still be held for you. " +
              "They are marked as yours on the board until the thirty minutes are up. Nothing was charged.",
          );
          return;
        }
        onHoldEnded(order.id);
      }
      onClose(notice);
    },
    [hasLiveHold, order, ownerPubkey, call, onHoldEnded, onClose],
  );

  // Reports to BoardView whether its background poll should hold off right
  // now. Blocked once the dialog is showing real content past the holding
  // step (describing/confirming/paying/done); unblocked the moment a fatal
  // message takes over the screen (nothing left to disrupt), and always
  // unblocked on unmount so a closed dialog never leaves the gate stuck shut.
  useEffect(() => {
    onGateChange(fatalMessage === null && step !== "holding");
    return () => onGateChange(false);
  }, [step, fatalMessage, onGateChange]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") void requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  const handleExpired = useCallback(() => {
    if (order) onHoldEnded(order.id);
    setFatalMessage(
      "The thirty minutes ran out before this purchase was finished, so the hold ended and these pixels went back on the board. Nothing was charged. Close this and select them again — they are still free unless somebody else got there first.",
    );
  }, [order, onHoldEnded]);

  /** Hands back the buyer's own blocking holds, then asks for the rectangle again. */
  async function handleRelease() {
    setReleasing(true);
    setReleaseError(null);

    for (const id of releasable) {
      let result;
      try {
        result = await call.release(id, ownerPubkey);
      } catch (error) {
        if (!(error instanceof TimedOut)) throw error;
        setReleasing(false);
        setStalled("release");
        return;
      }
      // A hold that is not there is a hold that has been let go, so a 404 is
      // this button's goal reached, not its failure. It is exactly what the
      // retry after a ceiling gets back when the release it stopped waiting
      // for had in fact gone through.
      if (!result.ok && result.status !== 404) {
        setReleaseError(result.message);
        setReleasing(false);
        return;
      }
      onHoldEnded(id);
    }

    onRefresh();
    setReleasable([]);
    setFatalMessage(null);
    setReleasing(false);
    setStep("holding");
    await attemptHold();
  }

  async function handleConfirm() {
    if (!order) return;
    setStep("paying");
    setConfirmError(null);
    let result;
    try {
      result = await call.confirm(order.id, ownerPubkey);
    } catch (error) {
      if (!(error instanceof TimedOut)) throw error;
      setStalled("confirm");
      return;
    }
    if (result.ok) {
      // Paid: this is a sale now, not a hold, and the board should stop
      // calling it one.
      onHoldEnded(order.id);
      setOrder(result.order);
      setStep("done");
      onPurchased();
      return;
    }
    if (result.status === 403 || result.status === 404 || result.status === 410) {
      setFatalMessage(result.message);
      return;
    }
    setConfirmError(result.message);
    setStep("confirming");
  }

  /**
   * Asks whatever ran past its ceiling one more time.
   *
   * It re-enters the very same function that stalled rather than a separate
   * retry path, so a retry gets the identical handling of every answer — the
   * resumed hold, the 409 with a release offered, the payment that turns out
   * to have landed already. A second code path here would be a second place
   * for those to be got wrong.
   */
  async function retryStalled() {
    const which = stalled;
    setStalled(null);
    if (which === "hold") {
      setStep("holding");
      await attemptHold(undefined, true);
      return;
    }
    if (which === "confirm") {
      await handleConfirm();
      return;
    }
    if (which === "release") await handleRelease();
  }

  const rect = order?.rect ?? selection.rect;
  const pixels = rect.w * rect.h;
  const total = order?.totalBaseUnits ?? selection.totalBaseUnits;
  const showTimer = order !== null && fatalMessage === null && step !== "done";

  return (
    <div
      className="dialog-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) void requestClose();
      }}
    >
      <div className="dialog-card p-6" role="dialog" aria-modal="true" aria-label="Buy these pixels">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-[21px] font-bold">Buy this block</h2>
            <p className="tabular mt-0.5 truncate text-[13.5px] text-body">
              {rect.w} × {rect.h} at ({rect.x}, {rect.y}) · {pixels.toLocaleString("en-US")} pixels
            </p>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            aria-label="Close"
            className="-mr-1 rounded-md px-2 py-1 text-[20px] leading-none text-mute hover:bg-canvas-deep hover:text-ink"
          >
            ×
          </button>
        </div>

        {fatalMessage === null && (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-hairline-strong bg-card-warm px-4 py-3">
            <div>
              <p className="label-caps">You pay</p>
              <p className="tabular font-display text-[20px] font-bold text-ink">{formatUsdc(total)}</p>
            </div>
            <div className="text-right">
              <p className="label-caps">These pixels are held for</p>
              <p className="tabular font-display text-[20px] font-bold text-primary-pressed">
                {showTimer && order?.expiresAt ? (
                  <HoldTimer expiresAt={order.expiresAt} onExpired={handleExpired} />
                ) : step === "done" ? (
                  "Yours"
                ) : (
                  "—"
                )}
              </p>
            </div>
          </div>
        )}

        {/* Why the clock reads less than thirty minutes: this is the hold that
            was already open on these pixels, not a new one. */}
        {resumed && fatalMessage === null && step !== "done" && (
          <p className="mt-3 rounded-lg border border-hairline-strong bg-canvas px-3 py-2 text-[12.5px] leading-relaxed text-ink-soft">
            Carrying on with the hold you already had here — same pixels, same price, and the clock
            has been running since you first pressed Buy.
          </p>
        )}

        {/* The ceiling's screen comes first: it is the one state that can sit on
            top of any step, and the only one carrying something to press. */}
        {stalled ? (
          <div className="mt-4 flex flex-col gap-4">
            <h3 className="font-display text-[17px] font-semibold text-ink">
              No answer from the server yet
            </h3>
            <p className="rounded-xl border border-hairline-strong bg-card-warm px-4 py-3 text-[13.5px] leading-relaxed text-ink-soft">
              {STALLED_MESSAGE[stalled]}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => void requestClose()}
                className="btn-quiet px-4 py-2 text-[13.5px]"
              >
                Back to the board
              </button>
              <button
                type="button"
                onClick={() => void retryStalled()}
                className="btn-primary px-5 py-2.5 text-[14px]"
              >
                {RETRY_LABEL}
              </button>
            </div>
          </div>
        ) : fatalMessage ? (
          <div className="mt-4 flex flex-col gap-4">
            <h3
              className={`font-display text-[17px] font-semibold ${
                releasable.length > 0 ? "text-ink" : "text-danger"
              }`}
            >
              {releasable.length > 0 ? "You are already holding these" : "This purchase stopped here"}
            </h3>
            <p
              className={`rounded-xl px-4 py-3 text-[13.5px] leading-relaxed text-ink-soft ${
                releasable.length > 0
                  ? "border border-hairline-strong bg-card-warm"
                  : "border border-[#e2b6a4] bg-danger-soft"
              }`}
            >
              {fatalMessage}
            </p>

            {releaseError && (
              <p className="rounded-lg border border-[#e2b6a4] bg-danger-soft px-3 py-2 text-[13px] text-ink-soft">
                {releaseError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => onClose(releasable.length > 0 ? undefined : fatalMessage)}
                disabled={releasing}
                className="btn-quiet px-4 py-2 text-[13.5px]"
              >
                {releasable.length > 0 ? "Leave it held" : "Back to the board"}
              </button>
              {releasable.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleRelease()}
                  disabled={releasing}
                  className="btn-primary px-5 py-2.5 text-[14px]"
                >
                  {releasing
                    ? "Letting them go…"
                    : releasable.length === 1
                      ? "Let that hold go and try again"
                      : "Let those holds go and try again"}
                </button>
              )}
            </div>
          </div>
        ) : step === "holding" ? (
          <p className="mt-6 text-[13.5px] text-body">
            Holding these pixels for you — nobody else can buy them while this is open…
          </p>
        ) : step === "describing" && order ? (
          <>
            <p className="label-caps mt-5">Step 1 of 2 · what goes in the block</p>
            <ContentForm
              order={order}
              buyerPubkey={ownerPubkey}
              draft={draft}
              onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              onSubmitted={(updated) => {
                setOrder(updated);
                setStep("confirming");
              }}
              onFatalError={setFatalMessage}
            />
          </>
        ) : (step === "confirming" || step === "paying") && order ? (
          <>
            <p className="label-caps mt-5">Step 2 of 2 · check it, then pay</p>
            <ConfirmationStep
              order={order}
              draft={draft}
              confirming={step === "paying"}
              confirmError={confirmError}
              onBack={() => setStep("describing")}
              onConfirm={() => void handleConfirm()}
            />
          </>
        ) : step === "done" && order ? (
          <div className="mt-4 flex flex-col gap-4">
            <h3 className="font-display text-[17px] font-semibold text-ink">
              Done — {pixels.toLocaleString("en-US")} pixels are yours
            </h3>
            <p className="text-[13.5px] leading-relaxed text-body">
              {formatUsdc(order.totalBaseUnits)} paid for {rect.w} × {rect.h} at ({rect.x}, {rect.y}),
              registered to {shortenAddress(ownerPubkey)}. Your image, link and caption are locked to it
              exactly as you confirmed them. Close this and the block is on the board.
            </p>
            <button
              type="button"
              onClick={() => onClose()}
              className="btn-primary self-end px-5 py-2.5 text-[14px]"
            >
              See it on the board
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A Solana address is 44 characters of noise; enough of it to recognise is not. */
function shortenAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

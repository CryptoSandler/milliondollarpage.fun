"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsdc } from "../lib/board/pricing";
import { confirmOrder, createHold, type ClientOrder } from "../lib/board/purchase-client";
import type { Selection } from "../lib/board/selection";
import ConfirmationStep from "./ConfirmationStep";
import ContentForm, { EMPTY_DRAFT, type ContentDraft } from "./ContentForm";
import HoldTimer from "./HoldTimer";

type Step = "holding" | "describing" | "confirming" | "paying" | "done";

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
 * below rather than living inside it.
 */
export default function PurchaseDialog({
  selection,
  buyerPubkey,
  onClose,
  onPurchased,
  onRefresh,
  onGateChange,
}: {
  selection: Selection;
  buyerPubkey: string;
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

  const hasLiveHold = order !== null && step !== "done" && fatalMessage === null;

  const requestClose = useCallback(
    (notice?: string) => {
      if (hasLiveHold) {
        const abandon = window.confirm(
          "Close and these pixels go straight back on the board — nothing you have typed here is kept, and anyone can buy them. Close anyway?",
        );
        if (!abandon) return;
      }
      onClose(notice);
    },
    [hasLiveHold, onClose],
  );

  // Runs exactly once: a dialog instance holds exactly one rectangle for its
  // whole life (BoardView mounts a fresh one per purchase attempt).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await createHold(selection.rect, ownerPubkey);
      if (cancelled) return;
      if (result.ok) {
        setOrder(result.order);
        setStep("describing");
        return;
      }
      // The rectangle that just refused us is invisible on a stale board;
      // refresh immediately so it appears behind this message instead of
      // leaving the buyer staring at empty pixels and a "taken" notice.
      if (result.status === 409) onRefresh();
      const suffix = result.retryAt
        ? ` Try again after ${new Date(result.retryAt).toLocaleTimeString()}.`
        : "";
      setFatalMessage(`${result.message}${suffix}`);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (event.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  const handleExpired = useCallback(() => {
    setFatalMessage(
      "The thirty minutes ran out before this purchase was finished, so the hold ended and these pixels went back on the board. Nothing was charged. Close this and select them again — they are still free unless somebody else got there first.",
    );
  }, []);

  async function handleConfirm() {
    if (!order) return;
    setStep("paying");
    setConfirmError(null);
    const result = await confirmOrder(order.id, ownerPubkey);
    if (result.ok) {
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

  const rect = order?.rect ?? selection.rect;
  const pixels = rect.w * rect.h;
  const total = order?.totalBaseUnits ?? selection.totalBaseUnits;
  const showTimer = order !== null && fatalMessage === null && step !== "done";

  return (
    <div
      className="dialog-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
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
            onClick={() => requestClose()}
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

        {fatalMessage ? (
          <div className="mt-4 flex flex-col gap-4">
            <h3 className="font-display text-[17px] font-semibold text-danger">
              This purchase stopped here
            </h3>
            <p className="rounded-xl border border-[#e2b6a4] bg-danger-soft px-4 py-3 text-[13.5px] leading-relaxed text-ink-soft">
              {fatalMessage}
            </p>
            <button
              type="button"
              onClick={() => onClose(fatalMessage)}
              className="btn-quiet self-end px-4 py-2 text-[13.5px]"
            >
              Back to the board
            </button>
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
              onConfirm={handleConfirm}
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

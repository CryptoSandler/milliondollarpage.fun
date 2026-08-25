"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsdc } from "../lib/board/pricing";
import { confirmOrder, createHold, type ClientOrder } from "../lib/board/purchase-client";
import type { Selection } from "../lib/board/selection";
import ConfirmationStep from "./ConfirmationStep";
import ContentForm, { EMPTY_DRAFT, type ContentDraft } from "./ContentForm";

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
}: {
  selection: Selection;
  buyerPubkey: string;
  onClose: (notice?: string) => void;
  onPurchased: () => void;
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
          "Closing now gives up this hold. Someone else could take these pixels before you come back. Close anyway?",
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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  function handleExpired() {
    setFatalMessage("This hold expired before you finished. Close this and start again to pick a rectangle.");
  }

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

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {selection.rect.w} × {selection.rect.h} · {formatUsdc(selection.totalBaseUnits)}
          </h2>
          <button
            type="button"
            onClick={() => requestClose()}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        {fatalMessage ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-neutral-200">{fatalMessage}</p>
            <button
              type="button"
              onClick={() => onClose(fatalMessage)}
              className="self-end rounded bg-neutral-700 px-4 py-2 text-sm font-medium"
            >
              Close
            </button>
          </div>
        ) : step === "holding" ? (
          <p className="text-sm text-neutral-400">Holding these pixels…</p>
        ) : step === "describing" && order ? (
          <ContentForm
            order={order}
            buyerPubkey={ownerPubkey}
            draft={draft}
            onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            onSubmitted={(updated) => {
              setOrder(updated);
              setStep("confirming");
            }}
            onExpired={handleExpired}
            onFatalError={setFatalMessage}
          />
        ) : (step === "confirming" || step === "paying") && order ? (
          <ConfirmationStep
            order={order}
            draft={draft}
            confirming={step === "paying"}
            confirmError={confirmError}
            onBack={() => setStep("describing")}
            onConfirm={handleConfirm}
            onExpired={handleExpired}
          />
        ) : step === "done" && order ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-neutral-200">
              Paid. This rectangle now belongs to {ownerPubkey}, exactly as confirmed.
            </p>
            <button
              type="button"
              onClick={() => onClose()}
              className="self-end rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-black"
            >
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

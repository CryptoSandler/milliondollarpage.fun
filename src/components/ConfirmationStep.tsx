"use client";

import { useEffect, useMemo } from "react";
import { formatUsdc } from "../lib/board/pricing";
import type { ClientOrder } from "../lib/board/purchase-client";
import type { ContentDraft } from "./ContentForm";
import HoldTimer from "./HoldTimer";

/**
 * The last screen before a rectangle is paid for.
 *
 * Deliberately its own component rather than a summary bolted onto the form:
 * this is the one place a buyer sees everything they are about to lock in
 * together, at the size and position it will actually appear, before the
 * point of no return. Every value shown here is read-only.
 */
export default function ConfirmationStep({
  order,
  draft,
  confirming,
  confirmError,
  onBack,
  onConfirm,
  onExpired,
}: {
  order: ClientOrder;
  draft: ContentDraft;
  confirming: boolean;
  confirmError: string | null;
  onBack: () => void;
  onConfirm: () => void;
  onExpired: () => void;
}) {
  const pixels = order.rect.w * order.rect.h;

  // Its own object URL, independent of ContentForm's: the two components are
  // never mounted at once (the form unmounts when this step mounts), so this
  // is a second reference to the same File, not a shared one — each is
  // created and revoked on its own schedule.
  const previewUrl = useMemo(() => (draft.file ? URL.createObjectURL(draft.file) : null), [draft.file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-950">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL.
            <img
              src={previewUrl}
              alt="Chosen image, at the fit that will be used"
              className="h-full w-full"
              style={{ objectFit: draft.imageFit }}
            />
          )}
        </div>
        <dl className="flex flex-1 flex-col justify-center gap-1 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-400">Rectangle</dt>
            <dd className="tabular-nums">
              {order.rect.w} × {order.rect.h} at ({order.rect.x}, {order.rect.y})
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-400">Pixels</dt>
            <dd className="tabular-nums">{pixels.toLocaleString("en-US")}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-400">Total</dt>
            <dd className="font-semibold tabular-nums">{formatUsdc(order.totalBaseUnits)}</dd>
          </div>
        </dl>
      </div>

      <dl className="flex flex-col gap-2 text-sm">
        <div>
          <dt className="text-neutral-400">Link</dt>
          <dd className="break-all">{draft.link}</dd>
        </div>
        <div>
          <dt className="text-neutral-400">Caption</dt>
          <dd className="break-words">{draft.caption}</dd>
        </div>
      </dl>

      <p className="rounded border border-amber-700/50 bg-amber-500/10 p-3 text-sm text-amber-200">
        Confirming locks the rectangle, the image, the link, and the caption above together — none of it can be
        edited, replaced, or taken back once you proceed.
      </p>

      <p className="text-xs text-neutral-400">
        No payment is collected in this preview build: there is no wallet, no signature, and no funds move.
        Pressing Confirm marks this order paid immediately, standing in for the real payment step arriving later.
      </p>

      {confirmError && <p className="text-sm text-red-400">{confirmError}</p>}

      <div className="flex items-center justify-between gap-4 border-t border-neutral-800 pt-4">
        <button
          type="button"
          onClick={onBack}
          disabled={confirming}
          className="rounded border border-neutral-700 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:text-neutral-600"
        >
          Back
        </button>

        <div className="flex items-center gap-3">
          {!confirming && order.expiresAt && (
            <p className="text-xs text-neutral-400">
              Hold expires in <HoldTimer expiresAt={order.expiresAt} onExpired={onExpired} />
            </p>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            {confirming ? "Confirming…" : "Confirm and lock it in"}
          </button>
        </div>
      </div>
    </div>
  );
}

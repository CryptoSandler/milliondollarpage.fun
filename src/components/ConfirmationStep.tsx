"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { formatUsdc } from "../lib/board/pricing";
import type { ClientOrder } from "../lib/board/purchase-client";
import type { ContentDraft } from "./ContentForm";

/**
 * The last screen before a rectangle is paid for.
 *
 * Deliberately its own component rather than a summary bolted onto the form:
 * this is the one place a buyer sees everything they are about to lock in
 * together, at the fit it will actually use, before the point of no return.
 * Every value shown here is read-only, and the sentence above the button says
 * plainly what pressing it does.
 *
 * It is also where anything the page DID to the buyer's picture gets owned up
 * to. An animated GIF that has to be shrunk comes out a still, and this is the
 * last screen where that is still free to undo.
 */
export default function ConfirmationStep({
  order,
  draft,
  stillFromAnimation,
  confirming,
  confirmError,
  onBack,
  onConfirm,
}: {
  order: ClientOrder;
  draft: ContentDraft;
  /**
   * The buyer picked a GIF that moves, and the copy small enough to store does
   * not. Said here, before the money, because it is a change to the thing
   * being bought — and it used to happen silently.
   */
  stillFromAnimation: boolean;
  confirming: boolean;
  confirmError: string | null;
  onBack: () => void;
  onConfirm: () => void;
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
    <div className="mt-3 flex flex-col gap-4">
      <div className="flex gap-4">
        {/* Zero radius, like every block on the board: this is a preview of a
            rectangle of pixels, not a card. And it is the BLOCK's shape, not a
            square — a 200×50 rectangle previewed in a square box would show a
            buyer a letterboxing they are not going to get. */}
        <div
          className="shrink-0 overflow-hidden border border-ink bg-canvas-deep"
          style={previewBox(order.rect)}
        >
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL.
            <img
              src={previewUrl}
              alt="Your image, at the fit it will use on the board"
              className="size-full"
              style={{ objectFit: draft.imageFit }}
            />
          )}
        </div>
        <dl className="flex flex-1 flex-col justify-center gap-1.5 text-[15px]">
          <Row term="Rectangle">
            {order.rect.w} × {order.rect.h} at ({order.rect.x}, {order.rect.y})
          </Row>
          <Row term="Pixels">{pixels.toLocaleString("en-US")}</Row>
          <Row term="Fit">{draft.imageFit === "cover" ? "Fill completely" : "Fit inside"}</Row>
          <Row term="You pay" strong>
            {formatUsdc(order.totalBaseUnits)}
          </Row>
        </dl>
      </div>

      <dl className="flex flex-col gap-2 rounded-xl border border-hairline-strong bg-card-warm px-4 py-3 text-[15px]">
        <div>
          <dt className="label-caps">Link</dt>
          <dd className="break-all text-ink">{draft.link}</dd>
        </div>
        <div>
          <dt className="label-caps">Caption</dt>
          {/* Optional, so a blank one is a real answer and gets said out
              loud — an empty line here would read as something lost. */}
          <dd className={`break-words ${draft.caption.trim() === "" ? "text-body" : "text-ink"}`}>
            {draft.caption.trim() === "" ? "None — your block carries no caption" : draft.caption}
          </dd>
        </div>
      </dl>

      {stillFromAnimation && (
        <p className="rounded-lg border border-hairline-strong bg-card-warm px-3 py-2 text-[15px] leading-relaxed text-ink-soft">
          <span className="font-bold text-ink">This GIF moves, and the copy on your block will not.</span>{" "}
          It has to be shrunk to fit inside the rectangle, and shrinking it keeps the first frame and
          nothing after it — so the board will show it as a still. Nothing has been charged: go back
          and pick a different picture if that is not what you meant to buy.
        </p>
      )}

      <p className="text-[14px] leading-relaxed text-body">
        Paying claims these {pixels.toLocaleString("en-US")} pixels for good and charges{" "}
        <span className="font-bold text-ink">{formatUsdc(order.totalBaseUnits)}</span>. The image, the
        link, the caption and the fit above are locked to the block together — none of them can be
        edited, replaced or taken back afterwards.
      </p>

      <p className="rounded-lg border border-hairline-strong bg-canvas px-3 py-2 text-[14px] leading-relaxed text-body">
        Nothing is charged in this preview build: no wallet is connected, no signature is asked for,
        and no funds move. Confirm marks the order paid on the spot, standing in for the payment step
        that arrives later.
      </p>

      {confirmError && (
        <p className="rounded-lg border border-[#e2b6a4] bg-danger-soft px-3 py-2 text-[15px] text-ink-soft">
          {confirmError}
        </p>
      )}

      <div className="flex items-center justify-between gap-4 border-t border-hairline pt-4">
        <button
          type="button"
          onClick={onBack}
          disabled={confirming}
          className="btn-quiet px-4 py-2 text-[15px]"
        >
          Back to edit
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="btn-primary px-5 py-2.5 text-[15px]"
        >
          {confirming ? "Paying…" : `Pay ${formatUsdc(order.totalBaseUnits)} and claim it`}
        </button>
      </div>
    </div>
  );
}

/**
 * The preview's own box: the block's aspect ratio, longest edge seven rem.
 *
 * This is half of the promise the board keeps with `placeImage` in
 * `src/lib/board/image-fit.ts`. The other half is that `object-fit` above and
 * `placeImage` compute the same rectangle — they do, deliberately — but that
 * only means anything if both are asked about the same shape. A square box
 * here would have shown every buyer a square block whatever they bought.
 */
function previewBox(rect: { w: number; h: number }): { width: string; height: string } {
  const longest = Math.max(rect.w, rect.h);
  return { width: `${(7 * rect.w) / longest}rem`, height: `${(7 * rect.h) / longest}rem` };
}

function Row({
  term,
  children,
  strong,
}: {
  term: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-body">{term}</dt>
      <dd className={`tabular text-ink ${strong ? "font-bold" : ""}`}>{children}</dd>
    </div>
  );
}

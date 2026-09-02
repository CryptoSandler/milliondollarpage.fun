"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { PreparedImage } from "../lib/board/image-encode";
import { placeImage } from "../lib/board/image-fit";
import { targetBox } from "../lib/board/image-plan";
import { formatUsdc, pixelCount } from "../lib/board/pricing";
import type { ClientOrder } from "../lib/board/purchase-client";
import BlockCard from "./BlockCard";
import type { ContentDraft } from "./ContentForm";

/**
 * The last screen before a rectangle is paid for.
 *
 * Deliberately its own component rather than a summary bolted onto the form:
 * this is the one place a buyer sees everything they are about to lock in
 * together, before the point of no return. Every value shown here is read-only,
 * and the sentence above the button says plainly what pressing it does.
 *
 * IT SHOWS THE RESULT, NOT A DESCRIPTION OF IT. Two renders, both from the
 * bytes that are actually going to be stored: the rectangle as the wall will
 * draw it, at the size it will be drawn, and the card somebody pointing at it
 * will read. It used to show the buyer's ORIGINAL file with a CSS `object-fit`
 * over it, which is a preview of the upload rather than of the purchase — it
 * showed a 4000×3000 photograph where a 1×1 rectangle stores sixteen pixels,
 * and it was the last screen where anybody could have noticed.
 *
 * It is also where anything the page DID to the buyer's picture gets owned up
 * to. An animated GIF that has to be shrunk comes out a still, and this is the
 * last screen where that is still free to undo.
 */
export default function ConfirmationStep({
  order,
  draft,
  prepared,
  stillFromAnimation,
  confirming,
  canSign,
  confirmError,
  onBack,
  onConfirm,
}: {
  order: ClientOrder;
  draft: ContentDraft;
  /**
   * The bytes the block will actually carry, straight from the shrink that
   * ContentForm just did.
   *
   * Not `draft.file`: that is the ten-megabyte photograph the buyer picked,
   * and it is not what anybody is buying. Null only in the moment before the
   * first successful submission, which this step is never mounted in.
   */
  prepared: PreparedImage | null;
  /**
   * The buyer picked a GIF that moves, and the copy small enough to store does
   * not. Said here, before the money, because it is a change to the thing
   * being bought — and it used to happen silently.
   */
  stillFromAnimation: boolean;
  confirming: boolean;
  /**
   * Whether anything on this page can sign at all.
   *
   * Settling an order is signed by the wallet that holds it, so with nothing
   * to sign with the button that spends money is off and says why — the same
   * treatment the release button gets in `PurchaseDialog`, and for the same
   * reason: a control that looks live and then fails costs more trust than
   * one that was honest about being unavailable.
   */
  canSign: boolean;
  confirmError: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const pixels = order.rect.w * order.rect.h;
  const stored = targetBox({ width: order.rect.w, height: order.rect.h });
  const rendered = useWallRender(prepared, order.rect, draft.imageFit);

  return (
    <div className="mt-3 flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        {/* Zero radius, like every block on the board: this is a preview of a
            rectangle of pixels, not a card. And it is the BLOCK's shape, not a
            square — a 200×50 rectangle previewed in a square box would show a
            buyer a letterboxing they are not going to get. It shares
            `.block-card-thumb` with the card beside it, so both are drawn
            pixelated by one rule rather than two. */}
        <div className="shrink-0">
          <div
            className="block-card-thumb"
            role="img"
            aria-label={`Your ${order.rect.w} by ${order.rect.h} rectangle, drawn the way the board will draw it, from an image stored at ${stored.width} by ${stored.height}`}
            style={previewBox(order.rect, rendered)}
          />
          <p className="label-caps mt-1.5">On the wall</p>
        </div>

        <div className="min-w-[13rem] flex-1">
          <div className="floating-card p-3">
            <BlockCard
            id={order.id}
            /* The rectangle being confirmed. Its link is not live yet — the
               card renders it as a preview — so `/go/<id>` is a URL nobody
               follows from here, and there is nothing to have clicked. */
              imageSrc={rendered}
              caption={draft.caption.trim() === "" ? null : draft.caption}
              link={draft.link}
              rect={order.rect}
              state={{ kind: "preview" }}
                          perPixel={order.pricePerPixelBaseUnits}
            />
          </div>
          <p className="label-caps mt-1.5">When somebody points at it</p>
        </div>
      </div>

      <dl className="flex flex-col gap-1.5 text-[15px]">
        <Row term="Rectangle">
          {order.rect.w} × {order.rect.h} at ({order.rect.x}, {order.rect.y})
        </Row>
        <Row term="Pixels">{pixels.toLocaleString("en-US")}</Row>
        <Row term="Stored image">
          {stored.width} × {stored.height}
        </Row>
        <Row term="Fit">{draft.imageFit === "cover" ? "Fill completely" : "Fit inside"}</Row>
        <Row term="You pay" strong>
          {formatUsdc(order.totalBaseUnits)}
        </Row>
      </dl>

      <dl className="flex flex-col gap-2 rounded-xl border border-hairline-strong bg-card-lift px-4 py-3 text-[15px]">
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
        <p className="rounded-lg border border-hairline-strong bg-card-lift px-3 py-2 text-[15px] leading-relaxed text-ink-soft">
          <span className="font-bold text-ink">This GIF moves, and the copy on your block will not.</span>{" "}
          It has to be shrunk to fit inside the rectangle, and shrinking it keeps the first frame and
          nothing after it — so the board will show it as a still. Nothing has been charged: go back
          and pick a different picture if that is not what you meant to buy.
        </p>
      )}

      <p className="text-[14px] leading-relaxed text-body">
        Paying claims {pixelCount(pixels)} for good and charges{" "}
        <span className="font-bold text-ink">{formatUsdc(order.totalBaseUnits)}</span>. The image, the
        link, the caption and the fit above are locked to the block together — none of them can be
        edited, replaced or taken back afterwards.
      </p>

      {/*
        THE SHARPEST CONSEQUENCE OF THE MODEL, AND IT IS MET BEFORE THE MONEY.
        A buyer who finds this out after paying has been sold something they
        did not agree to. It says what is true TODAY and claims nothing about
        later, because whether a block can change hands is an open decision —
        see SECURITY.md, which records both outcomes and neither promise.
      */}
      <p className="rounded-lg border border-hairline-strong bg-canvas px-3 py-2 text-[14px] leading-relaxed text-ink-soft">
        <span className="font-bold text-ink">There is no transfer and no key recovery today.</span>{" "}
        These pixels are registered to the wallet address you gave, and editing them later means
        signing with that key. Lose it and you lose the editing — the rectangle stays yours, and
        nobody else can ever buy it or change it. The{" "}
        <a href="/faq" target="_blank" rel="noopener" className="font-semibold text-primary-pressed underline">
          FAQ
        </a>{" "}
        says the rest in full.
      </p>

      <p className="rounded-lg border border-hairline-strong bg-canvas px-3 py-2 text-[14px] leading-relaxed text-body">
        No funds move in this preview build: confirming marks the order paid on the spot, standing
        in for the transfer that the payment step will read off the chain later. The signature is
        not a stand-in — the server settles nothing it was not asked to settle by the wallet that
        holds these pixels.
      </p>

      {/* Said beside the greyed-out button rather than instead of it, and
          before the money rather than after: this is the screen where a buyer
          decides to spend, and finding out at the press that they cannot is
          the worst moment to be told. */}
      {!canSign && (
        <p
          id="pay-unavailable"
          className="rounded-lg border border-hairline-strong bg-canvas px-3 py-2 text-[15px] leading-relaxed text-ink-soft"
        >
          Settling an order is signed by the wallet that holds it, and no wallet is connected to
          this page. Connect the wallet that started this hold and this button comes back. Nothing
          has been charged, and these pixels go back on the board by themselves when the
          hold&rsquo;s clock runs out.
        </p>
      )}

      {/* ASSERTIVE. The buyer pressed the button that spends their money and
          is waiting to be told it worked; this is the sentence saying it did
          not. Nothing queued behind it matters more. */}
      {confirmError && (
        <p
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[15px] text-ink-soft"
        >
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
          disabled={confirming || !canSign}
          aria-describedby={canSign ? undefined : "pay-unavailable"}
          className="btn-primary px-5 py-2.5 text-[15px]"
        >
          {confirming ? "Paying…" : `Pay ${formatUsdc(order.totalBaseUnits)} and claim it`}
        </button>
      </div>
    </div>
  );
}

/**
 * The stored bytes, drawn into a canvas of exactly the rectangle bought, as a
 * data URL.
 *
 * THIS IS THE WALL'S OWN ARITHMETIC, RUN IN THE BROWSER. `composite.ts` takes
 * the same stored image, resizes it to w×h with the buyer's fit, letterboxes a
 * `contain` onto the paper's cream and flattens any alpha onto the same cream.
 * Every one of those happens below, in the same order, and the placement comes
 * from `placeImage` — the module that exists precisely so the preview and the
 * board cannot compute two different rectangles.
 *
 * ONE HONEST DIFFERENCE. The server reduces with lanczos3 and enlarges with
 * nearest; a canvas has `imageSmoothingEnabled` and not a choice of kernel, so
 * the reduction here is whatever filter the browser ships. The picture is the
 * same picture and the geometry is identical; the last bit of a downscaled
 * photograph is not. Enlargement — every purchase small enough for it to
 * matter — is nearest on both sides, exactly.
 *
 * The result is a data URL rather than a live canvas because two things show
 * it: the wall preview and the card. One render, two `<img>`s, and no chance
 * of the two disagreeing.
 *
 * WHAT IS STORED IS THE RENDER AND THE BYTES IT CAME FROM, together, and what
 * is returned is derived from the pair. A bare url in state would be shown for
 * a moment against a different picture on the frame after `prepared` changes,
 * which on this screen would mean the buyer approving the render of a
 * photograph they had just replaced.
 */
function useWallRender(
  prepared: PreparedImage | null,
  rect: { w: number; h: number },
  fit: "contain" | "cover",
): string | null {
  const [render, setRender] = useState<{ source: PreparedImage; url: string } | null>(null);

  useEffect(() => {
    if (!prepared) return;
    let cancelled = false;
    void (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = rect.w;
      canvas.height = rect.h;
      const context = canvas.getContext("2d");
      if (!context) return;

      // The paper first, and under everything: it is what a `contain` fit's
      // bars are made of and what an alpha channel is composited onto. The
      // server does the same two things with `background` and `flatten`.
      context.fillStyle = PAPER;
      context.fillRect(0, 0, rect.w, rect.h);

      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(prepared.blob);
      } catch {
        // Undecodable here means undecodable on the wall, where DESIGN.md's
        // fallback takes over. Showing nothing is the honest preview of that.
        return;
      }
      const enlarging = rect.w * rect.h >= bitmap.width * bitmap.height;
      context.imageSmoothingEnabled = !enlarging;
      context.imageSmoothingQuality = "high";
      const { source, dest } = placeImage(
        { width: bitmap.width, height: bitmap.height },
        { x: 0, y: 0, width: rect.w, height: rect.h },
        fit,
      );
      context.drawImage(
        bitmap,
        source.x,
        source.y,
        source.width,
        source.height,
        dest.x,
        dest.y,
        dest.width,
        dest.height,
      );
      bitmap.close();
      if (!cancelled) setRender({ source: prepared, url: canvas.toDataURL("image/png") });
    })();
    return () => {
      cancelled = true;
    };
  }, [prepared, rect.w, rect.h, fit]);

  return render && render.source === prepared ? render.url : null;
}

/** The sheet's own cream, `--canvas` in globals.css and `PAPER` in composite.ts. */
const PAPER = "#070a0e";

/**
 * The preview's own box: the block's aspect ratio, longest edge seven rem.
 *
 * A square box here would have shown every buyer a square block whatever they
 * bought. What goes inside it is a bitmap of exactly `rect.w × rect.h` scaled
 * up by the browser with `image-rendering: pixelated` (see `.block-card-thumb`
 * in globals.css), so a 1×1 purchase shows one enormous pixel — which is
 * precisely what a 1×1 purchase is.
 */
function previewBox(
  rect: { w: number; h: number },
  rendered: string | null,
): { width: string; height: string; backgroundImage?: string } {
  const longest = Math.max(rect.w, rect.h);
  return {
    width: `${(7 * rect.w) / longest}rem`,
    height: `${(7 * rect.h) / longest}rem`,
    ...(rendered ? { backgroundImage: `url("${rendered}")` } : {}),
  };
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

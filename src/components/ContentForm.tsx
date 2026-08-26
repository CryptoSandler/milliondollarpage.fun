"use client";

import { useEffect, useId, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { prepareImage } from "../lib/board/image-encode";
import { MAX_INPUT_BYTES } from "../lib/board/image-plan";
import { checkLink, normaliseLink } from "../lib/board/link";
import { submitContent, type ClientOrder } from "../lib/board/purchase-client";
import { singleFlight } from "../lib/board/single-flight";
import { STEP_CEILING_MS } from "../lib/board/timing";
import {
  NO_UPLOAD_MESSAGES,
  describeUpload,
  type UploadField,
  type UploadMessages,
} from "../lib/board/upload-errors";
import { TimedOut, withTimeout } from "../lib/board/with-timeout";

export type ImageFit = "contain" | "cover";

export type ContentDraft = {
  file: File | null;
  link: string;
  caption: string;
  imageFit: ImageFit;
};

export const EMPTY_DRAFT: ContentDraft = { file: null, link: "", caption: "", imageFit: "contain" };

// Mirrors CONTENT_LIMITS.captionMaxLength in src/lib/board/content.ts. That
// module imports `sharp`, a native addon that cannot run in the browser, so
// this one number is restated here rather than imported into a "use client"
// file. The two caps that matter to the upload itself — what may be sent and
// what may be stored — are NOT restated: they come from image-plan.ts, which
// both sides import.
const CAPTION_MAX_LENGTH = 32;

const MAX_INPUT_MB = Math.round(MAX_INPUT_BYTES / (1024 * 1024));

/** What the button says, which is also where the submission has got to. */
type Stage = "idle" | "preparing" | "sending";

// The draft calls it `file`; the server, and every error sentence, call it
// `image`. One map, so an edit to the file clears the sentence about the
// image rather than a field nobody named.
const FIELD_OF: Record<keyof ContentDraft, UploadField> = {
  file: "image",
  link: "link",
  caption: "caption",
  imageFit: "imageFit",
};

/**
 * The three things a buyer supplies for their rectangle, plus the fit choice.
 *
 * THE APP SHRINKS THE IMAGE, NOT THE BUYER. Any picture the browser can
 * decode, up to ten megabytes, is drawn to a canvas at the size this block
 * actually stores and re-encoded until it fits — so a buyer is never shown a
 * weight error for a photograph their phone took. The arithmetic behind that
 * is in image-plan.ts and it is tested; image-encode.ts is the canvas.
 *
 * Every field carries its own warning about what happens once the order is
 * paid, directly under that field — not collected into a single notice
 * nobody reads. Above the button, `missing` names whatever is still blank, so
 * a disabled Continue is never a mystery.
 *
 * Nothing here writes an error sentence of its own: every one of them comes
 * from `describeUpload`, which is pure and tested and never lets a status
 * code or a server sentence onto the screen. And an error clears the moment
 * the buyer edits the field it was about — a red line under something they
 * have already fixed is worse than no line at all.
 */
export default function ContentForm({
  order,
  buyerPubkey,
  draft,
  onDraftChange,
  onSubmitted,
  onFatalError,
}: {
  order: ClientOrder;
  buyerPubkey: string;
  draft: ContentDraft;
  onDraftChange: (patch: Partial<ContentDraft>) => void;
  /**
   * Everything is attached and this order is ready for the confirmation
   * screen. `stillFromAnimation` rides along because the confirmation screen
   * has to say so BEFORE the payment, and this is the only place that knows:
   * it comes out of the shrinking, which happens here.
   */
  onSubmitted: (order: ClientOrder, notes: { stillFromAnimation: boolean }) => void;
  onFatalError: (message: string) => void;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  // Every sentence on screen, in one object, because they are one decision:
  // see upload-errors.ts. `stalled` inside it is the ceiling firing, and it
  // is styled as a wait rather than as a refusal — no answer is not the same
  // as a bad one.
  const [messages, setMessages] = useState<UploadMessages>(NO_UPLOAD_MESSAGES);
  const [dropActive, setDropActive] = useState(false);

  // One wrapper per mounted form, built once by the lazy initialiser — the
  // same identity guarantee `PurchaseDialog` keeps for its own three calls,
  // and for the same reason: two wrappers here would mean two in-flight
  // slots, and a double click on Continue would go straight through both.
  //
  // The ceiling goes inside the single-flight, not outside it, so the retry
  // this component offers after a stall is a genuinely new request rather
  // than the stalled one handed back unfinished. See with-timeout.ts.
  //
  // It wraps the REQUEST only. Shrinking the image happens before it and is
  // not on that clock: ten seconds is a promise about the server answering,
  // and a phone re-encoding a 10 MB photograph is not the server.
  const [call] = useState(() => singleFlight(withTimeout(submitContent, STEP_CEILING_MS)));

  const imageId = useId();
  const linkId = useId();
  const captionId = useId();

  // Derived, not stored: the URL is a pure function of `draft.file`, so it is
  // recomputed with useMemo rather than pushed into state from an effect.
  // The effect below exists only to revoke the previous URL once it stops
  // being the one in use — on every change of `draft.file`, and again on
  // unmount.
  const previewUrl = useMemo(() => (draft.file ? URL.createObjectURL(draft.file) : null), [draft.file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // The caption is NOT in here. It is optional by the owner's decision: a
  // blank one is a valid answer, stored as NULL, and a block without one
  // simply shows no chip. Only the image and the link are genuinely still
  // to add.
  const missing = [
    draft.file ? null : "an image",
    draft.link.trim() === "" ? "a link" : null,
  ].filter((item): item is string => item !== null);

  const ready = missing.length === 0;
  const busy = stage !== "idle";

  /**
   * Edits the draft and forgets whatever was said about the fields edited.
   *
   * A stale error under a field the buyer has already fixed is worse than no
   * error: it reads as "still wrong" about something that is now right, and
   * the only way to find out is to submit again. So the sentence goes the
   * moment the field changes, and the form-level sentence goes with it —
   * that one is about a submission that no longer describes what is on
   * screen.
   */
  function edit(patch: Partial<ContentDraft>) {
    onDraftChange(patch);
    const edited = (Object.keys(patch) as (keyof ContentDraft)[]).map((key) => FIELD_OF[key]);
    setMessages((current) => {
      const fields = { ...current.fields };
      for (const field of edited) delete fields[field];
      return { ...current, fields, form: null, stalled: false };
    });
  }

  /**
   * Takes a file from the picker or from a drop.
   *
   * The ten megabyte ceiling is checked HERE as well as in `prepareImage`,
   * because the answer should arrive the instant the file is chosen rather
   * than one Continue later — and because a file that is refused is not put
   * in the draft at all, so the preview never shows something that cannot be
   * sent.
   */
  function chooseFile(file: File | null) {
    if (file && file.size > MAX_INPUT_BYTES) {
      setMessages(describeUpload({ kind: "local", problem: "image_input_too_large" }));
      return;
    }
    edit({ file });
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDropActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) chooseFile(file);
  }

  /**
   * Shrinks the image, sends everything, and re-sends it exactly the same way
   * on a retry after a stall — there is no separate retry path.
   *
   * That is safe, not just convenient. This is the one request in the whole
   * purchase flow that ships a body the server cannot fail to accept a second
   * time: attaching content overwrites whatever is already on the order for
   * as long as it is still `reserved` (see `attachContent` in orders.ts),
   * with no guard against doing that twice. So the timed-out attempt this is
   * retrying is in one of two states — it never reached the server, or it did
   * and already attached this same image, link and caption — and asking again
   * lands on ordinary success either way: a fresh attach, or an overwrite by
   * identical bytes that reads as one from the outside. There is no "already
   * attached" failure to catch here, because the server does not have one.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.file || busy) return;

    setStage("preparing");
    setMessages(NO_UPLOAD_MESSAGES);

    // The link, settled before anything is shrunk or sent. A bare domain gets
    // its https:// here and the draft keeps it, so what the buyer confirms on
    // the next screen is the exact address their block will carry; anything
    // genuinely unusable is said beside the field rather than a round trip
    // later. Both halves come from link.ts, which the server uses too.
    const link = normaliseLink(draft.link);
    const linkProblem = checkLink(link);
    if (linkProblem) {
      setMessages(describeUpload({ kind: "local", problem: linkProblem }));
      setStage("idle");
      return;
    }
    if (link !== draft.link) onDraftChange({ link });

    // The block's own size decides the stored size: four stored pixels per
    // block pixel, so a 10x10 rectangle carries 40x40 and a 100x100 carries
    // 400x400. The fit the buyer chose decides what is cropped.
    const prepared = await prepareImage(
      draft.file,
      { width: order.rect.w, height: order.rect.h },
      draft.imageFit,
    );
    if (!prepared.ok) {
      setMessages(describeUpload({ kind: "local", problem: prepared.problem }));
      setStage("idle");
      return;
    }

    const form = new FormData();
    form.set("buyerPubkey", buyerPubkey);
    form.set("image", prepared.image.blob, prepared.image.filename);
    form.set("link", link);
    form.set("caption", draft.caption);
    form.set("imageFit", draft.imageFit);

    setStage("sending");
    let result;
    try {
      result = await call(order.id, form);
    } catch (error) {
      if (!(error instanceof TimedOut)) throw error;
      setStage("idle");
      setMessages(describeUpload({ kind: "timeout" }));
      return;
    }
    setStage("idle");

    if (result.ok) {
      onSubmitted(result.order, { stillFromAnimation: prepared.stillFromAnimation });
      return;
    }

    const said = describeUpload({
      kind: "failure",
      status: result.status,
      rejections: result.rejections,
      retryAt: result.retryAt,
    });
    // A hold that is gone, expired, somebody else's, or already paid: there
    // is nothing this form can do about any of those, so the dialog takes
    // over the screen with the sentence rather than leaving a Continue
    // button that can only fail again.
    if (said.fatal && said.form) {
      onFatalError(said.form);
      return;
    }
    setMessages(said);
  }

  return (
    // noValidate, and not as a convenience: the browser's own bubble is
    // written by the browser, in the browser's voice, in whatever language the
    // browser is in, and it appears where the browser decides. Every sentence
    // on this screen is ours (see upload-errors.ts) and sits under the field
    // it is about, so the native validator is turned off entirely rather than
    // left to race ours.
    <form noValidate onSubmit={handleSubmit} className="mt-3 flex flex-col gap-5">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-bold text-ink">Image</span>
          <span className="text-[14px] text-body">Any picture, up to {MAX_INPUT_MB} MB</span>
        </div>
        <label
          htmlFor={imageId}
          onDragOver={(event) => {
            event.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={handleDrop}
          className={`mt-1.5 flex cursor-pointer items-center gap-3.5 rounded-xl border-2 border-dashed bg-canvas p-4 transition-colors ${
            dropActive ? "border-primary" : "border-hairline-strong hover:border-primary"
          }`}
        >
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-hairline-strong bg-canvas-deep">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, not something next/image can optimize.
              <img src={previewUrl} alt="" className="size-full" style={{ objectFit: draft.imageFit }} />
            ) : (
              // The last thing in the product still set in --mute, and it is
              // aria-hidden decoration standing in for a thumbnail that has
              // not been picked yet — the sentence beside it carries the
              // meaning — so WCAG 1.4.11 does not reach it. Measured anyway:
              // 3.25:1 on the --canvas-deep well it sits in.
              <svg aria-hidden viewBox="0 0 24 24" className="size-5 text-mute" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V5" />
                <path d="m7 10 5-5 5 5" />
                <path d="M4 19h16" />
              </svg>
            )}
          </span>
          <span className="min-w-0 text-[15px] text-body">
            {draft.file ? (
              <>
                <span className="block truncate font-bold text-ink">{draft.file.name}</span>
                <span>Click or drop another to replace it</span>
              </>
            ) : (
              <>
                <span className="block font-bold text-ink">Drop an image here</span>
                <span>or click to pick one from your computer</span>
              </>
            )}
          </span>
        </label>
        <input
          id={imageId}
          type="file"
          accept="image/*"
          aria-label="Image"
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          className="sr-only"
        />
        <Permanence>
          We resize it to fit your block, so bring the picture you want rather than one you have
          shrunk. Locked to the block the moment you pay: there is no later swap or crop.
        </Permanence>
        <FieldError message={messages.fields.image} />
      </div>

      <div>
        <label htmlFor={linkId} className="text-[15px] font-bold text-ink">
          Link
        </label>
        {/* `text`, not `url`, and that follows from noValidate: a bare
            domain is a valid answer here (link.ts puts the https:// on), and
            `type="url"` would mark it invalid in the browser's own eyes. The
            keyboard hint is what `type="url"` was really for, and inputMode
            asks for that without dragging a validator along with it. */}
        <input
          id={linkId}
          type="text"
          inputMode="url"
          autoComplete="url"
          value={draft.link}
          onChange={(event) => edit({ link: event.target.value })}
          placeholder="yourproject.xyz"
          className="field-input mt-1.5"
        />
        <Permanence>
          Where your block sends people when they click it. Type just the domain if you like —
          yourproject.xyz becomes https://yourproject.xyz. Over https, and the destination for good.
        </Permanence>
        <FieldError message={messages.fields.link} />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={captionId} className="text-[15px] font-bold text-ink">
            Caption <span className="font-normal text-body">— optional</span>
          </label>
          <span className="tabular text-[14px] text-body">
            {draft.caption.length} / {CAPTION_MAX_LENGTH}
          </span>
        </div>
        <input
          id={captionId}
          type="text"
          value={draft.caption}
          maxLength={CAPTION_MAX_LENGTH}
          onChange={(event) => edit({ caption: event.target.value })}
          placeholder="A short line about your block"
          className="field-input mt-1.5"
        />
        <Permanence>
          Shown whenever someone points at your block. Leave it blank and your block carries no
          caption at all. Set once, at payment.
        </Permanence>
        <FieldError message={messages.fields.caption} />
      </div>

      <fieldset>
        <legend className="text-[15px] font-bold text-ink">How the image fills the rectangle</legend>
        <div className="mt-1.5 flex gap-2">
          <FitOption
            checked={draft.imageFit === "contain"}
            onChange={() => edit({ imageFit: "contain" })}
            label="Fit inside"
            detail="may leave space"
          />
          <FitOption
            checked={draft.imageFit === "cover"}
            onChange={() => edit({ imageFit: "cover" })}
            label="Fill completely"
            detail="may crop edges"
          />
        </div>
        <Permanence>Baked in with everything else the moment you pay.</Permanence>
        <FieldError message={messages.fields.imageFit} />
      </fieldset>

      {/* Card-warm, like PurchaseDialog's own stalled screen — not the danger
          styling below, because no answer is not the same as a bad one. */}
      {messages.stalled && messages.form && (
        <p className="rounded-xl border border-hairline-strong bg-card-warm px-4 py-3 text-[15px] leading-relaxed text-ink-soft">
          {messages.form}
        </p>
      )}

      {!messages.stalled && messages.form && (
        <p className="rounded-lg border border-[#e2b6a4] bg-danger-soft px-3 py-2 text-[15px] text-ink-soft">
          {messages.form}
        </p>
      )}

      <div className="flex items-center justify-between gap-4 border-t border-hairline pt-4">
        <p className="text-[14px] text-body">
          {ready ? (
            "Nothing is charged yet — you get one more screen to check it all."
          ) : (
            <>
              <span className="font-bold text-ink">Still to add:</span> {listMissing(missing)}.
            </>
          )}
        </p>
        <button
          type="submit"
          disabled={!ready || busy}
          className="btn-primary shrink-0 px-5 py-2.5 text-[15px]"
        >
          {stage === "preparing"
            ? "Resizing…"
            : stage === "sending"
              ? "Checking…"
              : messages.stalled
                ? "Ask again"
                : "Continue"}
        </button>
      </div>
    </form>
  );
}

function listMissing(missing: string[]): string {
  if (missing.length === 1) return missing[0];
  return `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
}

/** What this field costs you once the order is paid, said under that field. */
function Permanence({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 flex gap-1.5 text-[14px] leading-snug text-body">
      <svg aria-hidden viewBox="0 0 8 8" className="mt-1 size-2 shrink-0 text-primary-pressed" fill="currentColor">
        <path d="M4 0 8 4 4 8 0 4Z" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-[14px] font-semibold text-danger">{message}</p>;
}

function FitOption({
  checked,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  detail: string;
}) {
  return (
    <label
      className={`flex flex-1 cursor-pointer flex-col items-center rounded-lg border px-2 py-2 text-center transition-colors ${
        checked
          ? "border-ink bg-ink text-canvas"
          : "border-hairline-strong bg-canvas text-body hover:border-primary"
      }`}
    >
      <input type="radio" name="imageFit" checked={checked} onChange={onChange} className="sr-only" />
      <span className="text-[15px] font-bold">{label}</span>
      <span className={`text-[14px] ${checked ? "text-canvas-deep" : "text-body"}`}>{detail}</span>
    </label>
  );
}

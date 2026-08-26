"use client";

import { useEffect, useId, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { submitContent, type ClientOrder } from "../lib/board/purchase-client";

export type ImageFit = "contain" | "cover";

export type ContentDraft = {
  file: File | null;
  link: string;
  caption: string;
  imageFit: ImageFit;
};

export const EMPTY_DRAFT: ContentDraft = { file: null, link: "", caption: "", imageFit: "contain" };

// Mirrors CONTENT_LIMITS in src/lib/board/content.ts. That module imports
// `sharp`, a native addon that cannot run in the browser, so these numbers are
// restated here rather than imported into a "use client" file. They exist here
// only to TELL the buyer the rules up front; the server still enforces them.
const CAPTION_MAX_LENGTH = 32;
const IMAGE_MAX_BYTES = 102_400;
const IMAGE_MAX_DIMENSION = 1000;

type FieldErrors = Partial<Record<"image" | "link" | "caption" | "imageFit", string>>;

/**
 * The three things a buyer supplies for their rectangle, plus the fit choice.
 *
 * Every field carries its own warning about what happens once the order is
 * paid, directly under that field — not collected into a single notice
 * nobody reads. Above the button, `missing` names whatever is still blank, so
 * a disabled Continue is never a mystery.
 *
 * Validation itself is the server's job (`content.ts`, already tested); the
 * checks here are presence checks so the buyer is not told to wait for a
 * round trip to learn they left the caption empty. A 422 routes each
 * rejection back to the field it named.
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
  onSubmitted: (order: ClientOrder) => void;
  onFatalError: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);

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

  const missing = [
    draft.file ? null : "an image",
    draft.link.trim() === "" ? "a link" : null,
    draft.caption.trim() === "" ? "a caption" : null,
  ].filter((item): item is string => item !== null);

  const ready = missing.length === 0;

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDropActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onDraftChange({ file });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.file || submitting) return;

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const form = new FormData();
    form.set("buyerPubkey", buyerPubkey);
    form.set("image", draft.file);
    form.set("link", draft.link);
    form.set("caption", draft.caption);
    form.set("imageFit", draft.imageFit);

    const result = await submitContent(order.id, form);
    setSubmitting(false);

    if (result.ok) {
      onSubmitted(result.order);
      return;
    }

    if (result.status === 422 && result.rejections) {
      const next: FieldErrors = {};
      for (const rejection of result.rejections) next[rejection.field] = rejection.reason;
      setFieldErrors(next);
      return;
    }

    if (result.status === 403 || result.status === 404 || result.status === 410) {
      onFatalError(result.message);
      return;
    }

    setFormError(result.message);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-5">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-bold text-ink">Image</span>
          <span className="text-[11.5px] text-mute">
            PNG, JPEG, WebP or GIF · up to {Math.round(IMAGE_MAX_BYTES / 1024)} KB ·{" "}
            {IMAGE_MAX_DIMENSION}px max
          </span>
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
              <svg aria-hidden viewBox="0 0 24 24" className="size-5 text-mute" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V5" />
                <path d="m7 10 5-5 5 5" />
                <path d="M4 19h16" />
              </svg>
            )}
          </span>
          <span className="min-w-0 text-[13px] text-body">
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
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label="Image"
          onChange={(event) => onDraftChange({ file: event.target.files?.[0] ?? null })}
          className="sr-only"
        />
        <Permanence>Locked to the block the moment you pay. There is no later swap or crop.</Permanence>
        <FieldError message={fieldErrors.image} />
      </div>

      <div>
        <label htmlFor={linkId} className="text-[13px] font-bold text-ink">
          Link
        </label>
        <input
          id={linkId}
          type="url"
          value={draft.link}
          onChange={(event) => onDraftChange({ link: event.target.value })}
          placeholder="https://yourproject.xyz"
          className="field-input mt-1.5"
        />
        <Permanence>
          Where your block sends people when they click it. Must start with https, and it is the
          destination for good.
        </Permanence>
        <FieldError message={fieldErrors.link} />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={captionId} className="text-[13px] font-bold text-ink">
            Caption
          </label>
          <span className="tabular text-[12px] text-mute">
            {draft.caption.length} / {CAPTION_MAX_LENGTH}
          </span>
        </div>
        <input
          id={captionId}
          type="text"
          value={draft.caption}
          maxLength={CAPTION_MAX_LENGTH}
          onChange={(event) => onDraftChange({ caption: event.target.value })}
          placeholder="A short line about your block"
          className="field-input mt-1.5"
        />
        <Permanence>Shown whenever someone points at your block. Set once, at payment.</Permanence>
        <FieldError message={fieldErrors.caption} />
      </div>

      <fieldset>
        <legend className="text-[13px] font-bold text-ink">How the image fills the rectangle</legend>
        <div className="mt-1.5 flex gap-2">
          <FitOption
            checked={draft.imageFit === "contain"}
            onChange={() => onDraftChange({ imageFit: "contain" })}
            label="Fit inside"
            detail="may leave space"
          />
          <FitOption
            checked={draft.imageFit === "cover"}
            onChange={() => onDraftChange({ imageFit: "cover" })}
            label="Fill completely"
            detail="may crop edges"
          />
        </div>
        <Permanence>Baked in with everything else the moment you pay.</Permanence>
        <FieldError message={fieldErrors.imageFit} />
      </fieldset>

      {formError && (
        <p className="rounded-lg border border-[#e2b6a4] bg-danger-soft px-3 py-2 text-[13px] text-ink-soft">
          {formError}
        </p>
      )}

      <div className="flex items-center justify-between gap-4 border-t border-hairline pt-4">
        <p className="text-[12.5px] text-body">
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
          disabled={!ready || submitting}
          className="btn-primary shrink-0 px-5 py-2.5 text-[14px]"
        >
          {submitting ? "Checking…" : "Continue"}
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
    <p className="mt-1.5 flex gap-1.5 text-[11.5px] leading-snug text-mute">
      <svg aria-hidden viewBox="0 0 8 8" className="mt-1 size-2 shrink-0 text-primary-pressed" fill="currentColor">
        <path d="M4 0 8 4 4 8 0 4Z" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-[12.5px] font-semibold text-danger">{message}</p>;
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
      <span className="text-[13px] font-bold">{label}</span>
      <span className={`text-[11px] ${checked ? "text-canvas-deep" : "text-mute"}`}>{detail}</span>
    </label>
  );
}

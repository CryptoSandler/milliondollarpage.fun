"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { submitContent, type ClientOrder } from "../lib/board/purchase-client";
import HoldTimer from "./HoldTimer";

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
// the number is restated here rather than imported into a "use client" file.
const CAPTION_MAX_LENGTH = 32;

type FieldErrors = Partial<Record<"image" | "link" | "caption" | "imageFit", string>>;

/**
 * The three things a buyer supplies for their rectangle, plus the fit choice.
 *
 * Every field carries its own warning about what happens once the order is
 * paid, directly under that field — not collected into a single notice
 * nobody reads. Validation itself is the server's job (`content.ts`, already
 * tested); a 422 here just routes each rejection back to the field it named.
 */
export default function ContentForm({
  order,
  buyerPubkey,
  draft,
  onDraftChange,
  onSubmitted,
  onExpired,
  onFatalError,
}: {
  order: ClientOrder;
  buyerPubkey: string;
  draft: ContentDraft;
  onDraftChange: (patch: Partial<ContentDraft>) => void;
  onSubmitted: (order: ClientOrder) => void;
  onExpired: () => void;
  onFatalError: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor={imageId} className="block text-sm font-medium">
          Image
        </label>
        <input
          id={imageId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => onDraftChange({ file: event.target.files?.[0] ?? null })}
          className="mt-1 block w-full text-sm"
        />
        <p className="mt-1 text-xs text-neutral-400">
          This picture is locked in the moment the order is paid — there is no later swap, crop, or replacement.
        </p>
        {fieldErrors.image && <p className="mt-1 text-xs text-red-400">{fieldErrors.image}</p>}
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, not something next/image can optimize.
          <img
            src={previewUrl}
            alt="Selected image preview"
            className="mt-2 h-24 w-24 rounded border border-neutral-700 object-contain"
          />
        )}
      </div>

      <div>
        <label htmlFor={linkId} className="block text-sm font-medium">
          Link
        </label>
        <input
          id={linkId}
          type="url"
          value={draft.link}
          onChange={(event) => onDraftChange({ link: event.target.value })}
          placeholder="https://example.com"
          className="mt-1 w-full rounded border border-neutral-700 bg-transparent px-2 py-1 text-sm"
        />
        <p className="mt-1 text-xs text-neutral-400">
          Wherever this points once you pay is where it points for good — there is no changing the destination later.
        </p>
        {fieldErrors.link && <p className="mt-1 text-xs text-red-400">{fieldErrors.link}</p>}
      </div>

      <div>
        <label htmlFor={captionId} className="block text-sm font-medium">
          Caption
        </label>
        <input
          id={captionId}
          type="text"
          value={draft.caption}
          maxLength={CAPTION_MAX_LENGTH}
          onChange={(event) => onDraftChange({ caption: event.target.value })}
          className="mt-1 w-full rounded border border-neutral-700 bg-transparent px-2 py-1 text-sm"
        />
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="text-xs text-neutral-400">
            Shown when a visitor points at your block. It is set once, at payment, and does not change after.
          </p>
          <span className="shrink-0 text-xs tabular-nums text-neutral-500">
            {draft.caption.length}/{CAPTION_MAX_LENGTH}
          </span>
        </div>
        {fieldErrors.caption && <p className="mt-1 text-xs text-red-400">{fieldErrors.caption}</p>}
      </div>

      <fieldset>
        <legend className="text-sm font-medium">How the image fills the rectangle</legend>
        <div className="mt-1 flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="imageFit"
              checked={draft.imageFit === "contain"}
              onChange={() => onDraftChange({ imageFit: "contain" })}
            />
            Fit inside (may leave empty space)
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="imageFit"
              checked={draft.imageFit === "cover"}
              onChange={() => onDraftChange({ imageFit: "cover" })}
            />
            Fill completely (may crop the edges)
          </label>
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          This choice is baked in with everything else the moment the order is paid.
        </p>
        {fieldErrors.imageFit && <p className="mt-1 text-xs text-red-400">{fieldErrors.imageFit}</p>}
      </fieldset>

      {formError && <p className="text-sm text-red-400">{formError}</p>}

      <div className="flex items-center justify-between gap-4 border-t border-neutral-800 pt-4">
        {order.expiresAt && (
          <p className="text-xs text-neutral-400">
            Hold expires in <HoldTimer expiresAt={order.expiresAt} onExpired={onExpired} />
          </p>
        )}
        <button
          type="submit"
          disabled={!draft.file || submitting}
          className="ml-auto rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </div>
    </form>
  );
}

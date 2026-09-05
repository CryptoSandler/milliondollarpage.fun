"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { prepareImage, type PreparedImage } from "../lib/board/image-encode";
import ExactPreview from "./ExactPreview";
import { canHonourContain, defaultFit, type Box } from "../lib/board/image-fit";
import { MAX_INPUT_BYTES, targetBox } from "../lib/board/image-plan";
import { checkLink, normaliseLink } from "../lib/board/link";
import { submitContent, type ClientOrder, type WalletSigner } from "../lib/board/purchase-client";
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

/**
 * Why Continue is greyed out, said in the buyer's terms rather than in the
 * protocol's.
 *
 * Attaching content is signed by the wallet holding the rectangle, because
 * these three fields are what a payment makes permanent and an address on its
 * own proved nothing — it is public, so anyone reading the board could have
 * written on somebody else's hold.
 *
 * This is reachable now in one way rather than in every way: a buyer who
 * disconnected their wallet after starting the hold. It used to be the ONLY
 * state this form had, because there was no wallet anywhere on the page; the
 * sentence moved with the situation and no longer says "an address typed into
 * a field", which stopped being true when WalletConnect replaced that field.
 *
 * It costs the buyer nothing they cannot get back, and the sentence says so.
 */
const NOTHING_TO_SIGN_WITH =
  "What goes in a block is signed by the wallet holding it — the picture, the link and the " +
  "caption are locked to the rectangle when it is paid for, and a signature is what proves the " +
  "person choosing them holds it. No wallet is connected to this page, so there is nothing here " +
  "that can sign. Connect the wallet that started this hold and Continue comes back. Nothing has " +
  "been charged, and these pixels go back on the board by themselves when the hold's clock runs " +
  "out.";

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
  sign,
  draft,
  onDraftChange,
  onSubmitted,
  onFatalError,
}: {
  order: ClientOrder;
  /**
   * The wallet that signs "attach this content to this order", or null when
   * there is nothing on this page that can sign at all.
   *
   * Null disables Continue and says why beside it, rather than letting a
   * buyer resize a photograph and fill in three fields for a request the
   * server will refuse. See `NOTHING_TO_SIGN_WITH` above.
   */
  sign: WalletSigner | null;
  draft: ContentDraft;
  onDraftChange: (patch: Partial<ContentDraft>) => void;
  /**
   * Everything is attached and this order is ready for the confirmation
   * screen.
   *
   * Two things ride along, and both for the same reason: the confirmation
   * screen has to have them BEFORE the payment, and this is the only place
   * that knows either. `stillFromAnimation` comes out of the shrinking, and
   * `prepared` IS the shrink — the exact bytes the block will carry, which is
   * what the next screen renders instead of the buyer's original file.
   */
  onSubmitted: (
    order: ClientOrder,
    notes: { stillFromAnimation: boolean; prepared: PreparedImage },
  ) => void;
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
  const fitId = useId();
  const unsignedId = useId();

  // Derived, not stored: the URL is a pure function of `draft.file`, so it is
  // recomputed with useMemo rather than pushed into state from an effect.
  // The effect below exists only to revoke the previous URL once it stops
  // being the one in use — on every change of `draft.file`, and again on
  // unmount.
  const previewUrl = useMemo(() => (draft.file ? URL.createObjectURL(draft.file) : null), [draft.file]);

  // What this rectangle will actually keep of whatever the buyer picks. Pure
  // arithmetic out of image-plan.ts, which is also what `prepareImage` aims
  // at below — so the number printed under the field and the number the
  // encoder targets cannot be two numbers.
  const storedBox = useMemo(
    () => targetBox({ width: order.rect.w, height: order.rect.h }),
    [order.rect.w, order.rect.h],
  );

  /**
   * The picture's own shape, read off the thumbnail the form already draws.
   *
   * No second decode: the `<img>` below has to load the file anyway, and
   * `naturalWidth` is what it loaded. Kept WITH the url it came from and
   * compared against the current one, because a bare box in state would be
   * the previous file's shape for the frame after a replacement — which on
   * this field would mean answering the question below about a picture the
   * buyer has already swapped out.
   */
  const [loaded, setLoaded] = useState<{ url: string; box: Box } | null>(null);
  const sourceBox = loaded && loaded.url === previewUrl ? loaded.box : null;

  /**
   * THE BYTES THIS BLOCK WILL ACTUALLY CARRY, made as soon as there is a file
   * rather than at submit.
   *
   * `prepareImage` used to run inside the submit handler, so the first time
   * anybody saw what a rectangle would really hold was the confirmation screen
   * — after the content had been attached. What the form showed until then was
   * `URL.createObjectURL(draft.file)`: the buyer's own photograph at whatever
   * size they picked it, which on a 6×40 rectangle is not remotely the thing
   * they are buying.
   *
   * Running it here costs one encode per file and per change of fit, and buys
   * the only claim worth making about a preview: it is not a rendering OF the
   * upload, it IS the upload. `ExactPreview` draws this Blob and `submit` sends
   * this Blob, so there are not two answers that could differ.
   *
   * The key is the file and the fit together, because the fit changes the
   * bytes — a `cover` crop is a different picture from a `contain` letterbox.
   */
  const [prepared, setPrepared] = useState<
    { key: string; blob: Blob; filename: string; url: string; width: number; height: number; still: boolean } | null
  >(null);

  useEffect(() => {
    /*
      NOTHING TO SET WHEN THERE IS NO FILE. An early `setPrepared(null)` here is
      a synchronous setState inside an effect, which this repository's lint rule
      refuses and is right to: the stale value is already unreachable, because
      `preparedNow` below compares the stored key against the current one and a
      file that is gone has no key to match.
    */
    if (!draft.file) return;
    const key = `${draft.file.name}:${draft.file.size}:${draft.file.lastModified}:${draft.imageFit}`;
    let alive = true;
    let made: string | null = null;

    void prepareImage(draft.file, { width: order.rect.w, height: order.rect.h }, draft.imageFit).then(
      (result) => {
        // A file swapped while this was encoding: the answer belongs to a
        // picture the buyer has already replaced, so it is dropped rather than
        // shown for a frame.
        if (!alive || !result.ok) return;
        made = URL.createObjectURL(result.image.blob);
        setPrepared({
          key,
          blob: result.image.blob,
          filename: result.image.filename,
          url: made,
          width: result.image.width,
          height: result.image.height,
          still: result.stillFromAnimation,
        });
      },
    );

    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [draft.file, draft.imageFit, order.rect.w, order.rect.h]);

  const preparedKey = draft.file
    ? `${draft.file.name}:${draft.file.size}:${draft.file.lastModified}:${draft.imageFit}`
    : null;
  const preparedNow = prepared && prepared.key === preparedKey ? prepared : null;

  /**
   * Whether "Fit inside" is a fit this purchase can actually be given.
   *
   * TRUE UNTIL THE PICTURE IS KNOWN: with no file, or with one still
   * decoding, there is no question to answer yet and the choice stays exactly
   * as it has always been. `canHonourContain` is the board's own placement
   * arithmetic (image-fit.ts) and the server asks it the same question of the
   * bytes that arrive, so the option this form hides is the option that would
   * have been refused.
   *
   * ponytail: this measures the picture the buyer PICKED and the server
   * measures the bytes that were STORED. A `contain` encode keeps the
   * source's shape to within the rounding of one stored pixel, and the
   * answer depends on that shape alone, so the two can only disagree about a
   * picture sitting on the boundary itself. There the server's answer
   * governs and says so in its own sentence (`fit_impossible` in
   * upload-errors.ts). Measuring the encoded bytes here instead would mean
   * shrinking the image before the buyer has chosen the fit it is shrunk
   * for.
   */
  const canFitInside =
    sourceBox === null || canHonourContain(sourceBox, { width: order.rect.w, height: order.rect.h });

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  /*
    THE FIT THE FORM OPENS ON, decided once per picture and never again.

    Two things used to live here as one: a rectangle that cannot draw bars at
    all forced `cover`, and everything else started on `contain`. The second
    half was the wrong default for exactly the shapes this wall makes easy to
    buy — `docs/imagenes.md` measured twenty real flags and found 85–90% of an
    awkward rectangle going to grey — so `defaultFit` now decides both, and the
    threshold and its measurements live beside it in `image-fit.ts`.

    ONCE PER PICTURE, WHICH IS WHAT THE REF IS FOR. Without it this would fight
    the buyer: they press "Fit inside", the effect re-runs and puts it back, and
    the control appears broken. The default is a starting point, not a rule.
  */
  const defaultedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!sourceBox || !draft.file) return;
    const key = `${draft.file.name}:${draft.file.size}:${draft.file.lastModified}`;
    if (defaultedFor.current === key) return;
    defaultedFor.current = key;
    const fit = defaultFit(sourceBox, { width: order.rect.w, height: order.rect.h });
    if (fit !== draft.imageFit) onDraftChange({ imageFit: fit });
  }, [sourceBox, draft.file, draft.imageFit, order.rect.w, order.rect.h, onDraftChange]);

  // And the hard case stays a rule rather than a default: a rectangle that
  // cannot draw the bars has no "Fit inside" answer at all, so a draft that
  // still carries one is moved to the fit the server will accept.
  useEffect(() => {
    if (!canFitInside && draft.imageFit === "contain") onDraftChange({ imageFit: "cover" });
  }, [canFitInside, draft.imageFit, onDraftChange]);

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
    /*
      THE SAME BLOB THE PREVIEW DREW, not a second encode of the same file.

      If the effect above has already produced bytes for this exact file and
      fit, they are the bytes that go — which is what makes the preview's
      promise structural. It only encodes here when there is nothing ready yet,
      which is a buyer pressing Continue inside the few milliseconds the first
      encode takes.
    */
    let sending: { blob: Blob; filename: string; still: boolean; width: number; height: number };
    if (preparedNow) {
      sending = {
        blob: preparedNow.blob, filename: preparedNow.filename, still: preparedNow.still,
        width: preparedNow.width, height: preparedNow.height,
      };
    } else {
      const made = await prepareImage(
        draft.file,
        { width: order.rect.w, height: order.rect.h },
        draft.imageFit,
      );
      if (!made.ok) {
        setMessages(describeUpload({ kind: "local", problem: made.problem }));
        setStage("idle");
        return;
      }
      sending = {
        blob: made.image.blob, filename: made.image.filename, still: made.stillFromAnimation,
        width: made.image.width, height: made.image.height,
      };
    }

    const form = new FormData();
    form.set("image", sending.blob, sending.filename);
    form.set("link", link);
    form.set("caption", draft.caption);
    form.set("imageFit", draft.imageFit);

    setStage("sending");
    let result;
    try {
      result = await call(order.id, form, sign);
    } catch (error) {
      if (!(error instanceof TimedOut)) throw error;
      setStage("idle");
      setMessages(describeUpload({ kind: "timeout" }));
      return;
    }
    setStage("idle");

    if (result.ok) {
      onSubmitted(result.order, {
        stillFromAnimation: sending.still,
        // The confirmation screen renders the same Blob this request carried,
        // which is the same one the preview above drew. Three surfaces, one
        // set of bytes.
        prepared: {
          blob: sending.blob,
          filename: sending.filename,
          width: sending.width,
          height: sending.height,
        },
      });
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
          // focus-proxy: the real control is the one-pixel `.sr-only` file
          // input right after this label, and an outline on that is a focus
          // ring nobody can see. See globals.css.
          className={`focus-proxy mt-1.5 flex cursor-pointer items-center gap-3.5 rounded-xl border-2 border-dashed bg-canvas p-4 transition-[border-color] ${
            dropActive ? "border-primary" : "border-control-line hover:border-primary"
          }`}
        >
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-hairline-strong bg-canvas-deep">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, not something next/image can optimize.
              <img
                src={previewUrl}
                alt=""
                className="size-full"
                style={{ objectFit: draft.imageFit }}
                onLoad={(event) =>
                  setLoaded({
                    url: previewUrl,
                    box: {
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    },
                  })
                }
              />
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
          aria-invalid={messages.fields.image ? true : undefined}
          aria-describedby={messages.fields.image ? `${imageId}-error` : undefined}
          className="sr-only"
        />
        {/*
          WHAT THIS RECTANGLE ACTUALLY STORES, SAID BEFORE THE MONEY.

          Every purchase carries an image, a link and a caption — a 1×1 for a
          dollar as much as a 100×100 — and nothing about that is a tier. What
          DOES follow the size is the resolution: four stored pixels per pixel
          bought (`targetBox`), so a 1×1 keeps 4×4. The card somebody sees when
          they point at a small rectangle is therefore visibly pixelated, and a
          buyer must be told that here rather than discover it after paying.
          Visibility is bought with area; it is never withheld as a feature.
        */}
        <Permanence>
          Stored at {storedBox.width} × {storedBox.height} — four stored pixels for every pixel you
          buy. A small rectangle keeps a small picture, so it will look pixelated close up and on the
          card; that is the picture itself, not a rough preview of it. Bring the photograph you want
          and we shrink it. Locked to the block the moment you pay: there is no later swap or crop.
        </Permanence>
        <FieldError id={`${imageId}-error`} message={messages.fields.image} />

        {/*
          AND WHAT IT WILL ACTUALLY LOOK LIKE, from the bytes that will be
          stored, before anything is signed. The sentence above says the
          resolution in numbers; this shows it. See `ExactPreview` for why it
          renders the upload rather than a rendering of it.
        */}
        {preparedNow && (
          <ExactPreview
            prepared={{ url: preparedNow.url, width: preparedNow.width, height: preparedNow.height }}
            rect={order.rect}
            fit={draft.imageFit}
          />
        )}
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
          aria-invalid={messages.fields.link ? true : undefined}
          aria-describedby={messages.fields.link ? `${linkId}-error` : undefined}
          className="field-input mt-1.5"
        />
        <Permanence>
          Where your block sends people when they click it. Type just the domain if you like —
          yourproject.xyz becomes https://yourproject.xyz. Over https, and the destination for good.
        </Permanence>
        <FieldError id={`${linkId}-error`} message={messages.fields.link} />
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
          aria-invalid={messages.fields.caption ? true : undefined}
          aria-describedby={messages.fields.caption ? `${captionId}-error` : undefined}
          className="field-input mt-1.5"
        />
        <Permanence>
          Shown whenever someone points at your block. Leave it blank and your block carries no
          caption at all. Set once, at payment.
        </Permanence>
        <FieldError id={`${captionId}-error`} message={messages.fields.caption} />
      </div>

      <fieldset
        aria-invalid={messages.fields.imageFit ? true : undefined}
        aria-describedby={messages.fields.imageFit ? `${fitId}-error` : undefined}
      >
        <legend className="text-[15px] font-bold text-ink">How the image fills the rectangle</legend>
        <FitChoice
          rect={order.rect}
          fit={draft.imageFit}
          canFitInside={canFitInside}
          onChange={(imageFit) => edit({ imageFit })}
        />
        <Permanence>Baked in with everything else the moment you pay.</Permanence>
        <FieldError id={`${fitId}-error`} message={messages.fields.imageFit} />
      </fieldset>

      {/* Card-warm, like PurchaseDialog's own stalled screen — not the danger
          styling below, because no answer is not the same as a bad one. And
          POLITE for exactly the same reason: nothing has been refused, the
          request is simply still out. */}
      {messages.stalled && messages.form && (
        <p
          role="status"
          className="rounded-xl border border-hairline-strong bg-card-lift px-4 py-3 text-[15px] leading-relaxed text-ink-soft"
        >
          {messages.form}
        </p>
      )}

      {/* ASSERTIVE. The buyer pressed Continue and believes it worked; this
          says it did not. Everything they might be reading past this point is
          about a submission that did not happen, so it interrupts. */}
      {!messages.stalled && messages.form && (
        <p
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[15px] text-ink-soft"
        >
          {messages.form}
        </p>
      )}

      {/* Said beside the greyed-out button, not instead of it: a button that
          is off with no reason given reads as broken. The same shape the
          release button in PurchaseDialog uses, because it is the same
          situation — a step that is signed, and nothing here to sign with. */}
      {!sign && (
        <p
          id={unsignedId}
          className="rounded-lg border border-hairline-strong bg-canvas px-3 py-2 text-[15px] leading-relaxed text-ink-soft"
        >
          {NOTHING_TO_SIGN_WITH}
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
          disabled={!ready || busy || !sign}
          aria-describedby={sign ? undefined : unsignedId}
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

/**
 * One field's refusal, and it is ASSERTIVE.
 *
 * A field error appears because the buyer pressed Continue and it did not
 * continue. Their attention is on a button they believe worked, and everything
 * they hear after this until they fix it is about a submission that never
 * happened — that is precisely the case interruption exists for. It carries an
 * `id` as well, so the field it is about points at it with `aria-describedby`
 * and it can be read again on the way back to fixing it.
 */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-[14px] font-semibold text-danger">
      {message}
    </p>
  );
}

/**
 * The two ways an image can meet a rectangle — or, where only one of them can
 * be drawn, the sentence saying which one it is.
 *
 * Exported so a guard can render both states from props alone: that the
 * refused case offers no radio at all is a fact about the markup, and a test
 * on the predicate behind it would pass while the control it is supposed to
 * remove was still on screen.
 *
 * AN OPTION THAT CANNOT BE HONOURED IS NOT OFFERED, and the ones that can are
 * untouched. Where the bars fit, this is the same pair of radios in the same
 * order with the same words as before. Where they do not, there is no choice
 * to make and nothing is dressed up as one — DESIGN.md: "a button that does
 * nothing is broken". The buyer sees the result of the only fit there is on
 * the next screen, drawn at the size the wall will draw it.
 */
export function FitChoice({
  rect,
  fit,
  canFitInside,
  onChange,
}: {
  rect: { w: number; h: number };
  fit: ImageFit;
  canFitInside: boolean;
  onChange: (fit: ImageFit) => void;
}) {
  if (!canFitInside) {
    return (
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
        <span className="font-bold text-ink">Fills the rectangle completely.</span> Fitting it
        inside would leave a border thinner than one pixel on a {rect.w} × {rect.h} rectangle, so
        that is the only fit here.
      </p>
    );
  }

  return (
    <div className="mt-1.5 flex gap-2">
      <FitOption
        checked={fit === "contain"}
        onChange={() => onChange("contain")}
        label="Fit inside"
        detail="may leave space"
      />
      <FitOption
        checked={fit === "cover"}
        onChange={() => onChange("cover")}
        label="Fill completely"
        detail="may crop edges"
      />
    </div>
  );
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
    // focus-proxy: same reason as the dropzone — the radio inside is
    // `.sr-only`, so the ring goes on the box that is actually on screen.
    <label
      className={`focus-proxy flex flex-1 cursor-pointer flex-col items-center rounded-lg border px-2 py-2 text-center transition-[color,background-color,border-color] ${
        checked
          ? "border-ink bg-ink text-canvas"
          : "border-control-line bg-canvas text-body hover:border-primary"
      }`}
    >
      <input type="radio" name="imageFit" checked={checked} onChange={onChange} className="sr-only" />
      <span className="text-[15px] font-bold">{label}</span>
      <span className={`text-[14px] ${checked ? "text-canvas-deep" : "text-body"}`}>{detail}</span>
    </label>
  );
}

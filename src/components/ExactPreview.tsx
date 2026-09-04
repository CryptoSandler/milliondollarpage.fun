"use client";

import { useEffect, useMemo, useState } from "react";
import type { Fit } from "../lib/board/image-fit";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../lib/board/geometry";

/**
 * What the rectangle will look like, from the bytes that will actually be
 * stored, before anybody pays for it.
 *
 * WHO CALLS THIS: `src/components/ContentForm.tsx`, and nothing else.
 *
 * ## The whole design is one sentence: it renders the Blob that gets uploaded
 *
 * `prepareImage` runs in the BROWSER — `createImageBitmap` and a canvas — and
 * the form already calls it to produce the bytes it sends. So this component
 * reproduces nothing. It is handed that exact Blob and draws it. "What you see
 * is what you bought" is therefore true by construction rather than by two
 * implementations agreeing to stay in step, and `content-preview.test.ts`
 * checks the one identity that matters: the bytes rendered here, the bytes in
 * the multipart body, and the `image_sha256` the row ends up with are the same
 * three hashes.
 *
 * WHAT THE FORM SHOWED BEFORE THIS EXISTED was `URL.createObjectURL(draft.file)`
 * — the buyer's own photograph, at whatever size they picked it. The shrinking
 * happened at submit, so the first time anybody saw what a rectangle would
 * really carry was the confirmation screen, after the content was attached.
 *
 * ## Four views, because they are four different questions
 *
 * The wall at 1× answers "what will this look like up there", and it is the
 * only one that can, because it is the only one with the neighbours in it. The
 * register and the card answer "where will most people actually see it". And
 * 4× answers the question a 6×40 purchase makes unavoidable: what IS a picture
 * six pixels wide?
 *
 * ## Nothing here refuses anything
 *
 * Every number below is a measurement offered before payment. The buyer chose
 * the rectangle, and `docs/imagenes.md` is where the thresholds come from — they
 * were measured against real flags in real rectangles, not guessed.
 */

/** The sold ground, `SOLD_GROUND` in composite.ts and the bars a contain fit leaves. */
const SOLD_GROUND = "#2e3642";

export type Prepared = { url: string; width: number; height: number };

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * How much of the picture survives onto the wall, in board pixels.
 *
 * `cover` fills the rectangle. `contain` fits the stored image inside it and
 * leaves the rest as sold ground — which on a rectangle whose shape is nothing
 * like the picture's is most of it. `docs/imagenes.md` measured 88% bars on a
 * 31×169 column, and this is the arithmetic behind that number.
 */
export function pictureBox(stored: { width: number; height: number }, rect: Rect, fit: Fit) {
  if (fit === "cover") return { width: rect.w, height: rect.h };
  const scale = Math.min(rect.w / stored.width, rect.h / stored.height);
  return {
    width: Math.max(1, Math.round(stored.width * scale)),
    height: Math.max(1, Math.round(stored.height * scale)),
  };
}

/**
 * What is worth saying about this pairing, in the order it matters.
 *
 * Exported for its test: every threshold here is a number out of
 * `docs/imagenes.md`, and a sentence that drifted from the measurement behind
 * it would be worse than no sentence.
 */
export function notesFor(
  stored: { width: number; height: number },
  rect: Rect,
  fit: Fit,
): { tone: "plain" | "warn"; text: string }[] {
  const pic = pictureBox(stored, rect, fit);
  const pixels = pic.width * pic.height;
  const notes: { tone: "plain" | "warn"; text: string }[] = [];

  notes.push({
    tone: "plain",
    text: `On the wall your picture is ${pic.width} by ${pic.height} pixels — ${pixels.toLocaleString(
      "en-US",
    )} of the ${(rect.w * rect.h).toLocaleString("en-US")} you are buying.`,
  });

  /*
    200 PICTURE PIXELS, and it is measured rather than felt. `docs/imagenes.md`
    put three flags through three rectangles: at 187 pixels a flag still says
    blue-white-blue and nothing else, and at 60 two flags with the same stripes
    are the same picture. Above about 2,000 you have a photograph.
  */
  if (pixels < 200) {
    notes.push({
      tone: "warn",
      text: "That is small enough that only a colour or a bold shape will read. Detail will not survive it.",
    });
  }

  /*
    A GLYPH NEEDS ABOUT FIVE PIXELS OF HEIGHT, so text stops being text well
    before a picture stops being a picture. The short edge is what decides it.
  */
  if (Math.min(pic.width, pic.height) < 40) {
    notes.push({
      tone: "warn",
      text: "Words will not be readable at this size. A logo or a flat colour will.",
    });
  }

  /*
    AND THE ONE THAT COSTS THE MOST AND IS THE EASIEST TO FIX. A `contain` fit
    on a rectangle whose shape is nothing like the picture's spends the
    difference on bars: measured at 88% of a 31×169 column and 85% of a 173×16.
    Two-to-one is where it starts being most of what was bought.
  */
  const storedAspect = stored.width / stored.height;
  const rectAspect = rect.w / rect.h;
  const apart = Math.max(storedAspect / rectAspect, rectAspect / storedAspect);
  if (fit === "contain" && apart >= 2) {
    const share = Math.round((1 - pixels / (rect.w * rect.h)) * 100);
    notes.push({
      tone: "warn",
      text:
        `Your picture and this rectangle are different shapes, so ${share}% of what you are ` +
        `buying is empty. "Fill the rectangle" crops instead — cropping to about ` +
        `${rect.w}:${rect.h} before you upload keeps the part you choose.`,
    });
  }

  return notes;
}

/** A crop of the real wall with this rectangle in the middle of it. */
function crop(rect: Rect) {
  // Three times the rectangle, and never less than a readable window: a 6×40
  // purchase with no neighbours in view says nothing about where it is.
  const width = Math.min(BOARD_WIDTH, Math.max(220, rect.w * 3));
  const height = Math.min(BOARD_HEIGHT, Math.max(150, rect.h * 3));
  const x = Math.min(Math.max(0, rect.x + rect.w / 2 - width / 2), BOARD_WIDTH - width);
  const y = Math.min(Math.max(0, rect.y + rect.h / 2 - height / 2), BOARD_HEIGHT - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

export default function ExactPreview({
  prepared,
  rect,
  fit,
}: {
  prepared: Prepared;
  rect: Rect;
  fit: Fit;
}) {
  /*
    THE REAL WALL, FETCHED ONCE. The version is content-addressed, so the URL is
    immutable and the browser will already have these bytes if the board is open
    behind this dialog — which it is, always. A failure leaves the neighbours
    out and the rectangle still renders: the picture is the subject, and the
    wall around it is context.
  */
  const [wall, setWall] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/board", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (alive && body?.wall?.version) setWall(`/api/wall/${body.wall.version}`);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const window_ = useMemo(() => crop(rect), [rect]);
  const notes = useMemo(() => notesFor(prepared, rect, fit), [prepared, rect, fit]);
  const objectFit = fit === "cover" ? "cover" : "contain";

  return (
    <section className="exact-preview" aria-label="How this will look">
      <div className="exact-preview__views">
        {/* 1 · ON THE WALL, at one board pixel to one screen pixel, with whatever
            is next to it. The only view that answers where it is. */}
        <figure className="exact-preview__view">
          <div
            className="exact-preview__wall"
            style={{
              width: window_.width,
              height: window_.height,
              backgroundImage: wall ? `url("${wall}")` : undefined,
              backgroundPosition: `-${window_.x}px -${window_.y}px`,
            }}
          >
            <span
              className="exact-preview__block"
              style={{
                left: rect.x - window_.x,
                top: rect.y - window_.y,
                width: rect.w,
                height: rect.h,
                backgroundColor: SOLD_GROUND,
                backgroundImage: `url("${prepared.url}")`,
                backgroundSize: objectFit === "cover" ? "cover" : "contain",
              }}
            />
          </div>
          <figcaption>On the wall, actual size</figcaption>
        </figure>

        {/* 2 · FOUR TIMES, which is the only way to see what a small purchase
            really is. Nearest-neighbour, the same as the board at any zoom. */}
        <figure className="exact-preview__view">
          <span
            className="exact-preview__zoom"
            style={{
              width: Math.min(320, rect.w * 4),
              height: Math.min(320, rect.h * 4),
              backgroundColor: SOLD_GROUND,
              backgroundImage: `url("${prepared.url}")`,
              backgroundSize: objectFit === "cover" ? "cover" : "contain",
            }}
          />
          <figcaption>Four times, pixel by pixel</figcaption>
        </figure>

        {/* 3 and 4 · WHERE MOST PEOPLE WILL ACTUALLY SEE IT: the register that
            runs down the wall, and the card its own page shows. Both keep the
            rectangle's real proportion, which is why they are two pictures and
            not one. */}
        <figure className="exact-preview__view">
          <span
            className="exact-preview__thumb"
            style={{
              width: `${(2.75 * rect.w) / Math.max(rect.w, rect.h)}rem`,
              height: `${(2.75 * rect.h) / Math.max(rect.w, rect.h)}rem`,
              backgroundColor: SOLD_GROUND,
              backgroundImage: `url("${prepared.url}")`,
              backgroundSize: objectFit === "cover" ? "cover" : "contain",
            }}
          />
          <figcaption>In the register, and on its own page</figcaption>
        </figure>
      </div>

      <ul className="exact-preview__notes">
        {notes.map((note) => (
          <li key={note.text} className={note.tone === "warn" ? "is-warn" : undefined}>
            {note.text}
          </li>
        ))}
      </ul>

      <p className="exact-preview__ground">
        These are the bytes that will be stored — not your original file. Pick another picture, or
        change the fit, as many times as you like: nothing is sent until you sign.
      </p>
    </section>
  );
}

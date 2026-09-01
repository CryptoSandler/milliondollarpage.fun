import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, TOTAL_PIXELS } from "../../lib/board/geometry";
import { BLOCK_PIXEL_SCALE, STORED_MAX_LONG_EDGE } from "../../lib/board/image-plan";
import { RESERVATION_MINUTES, SHORT_HOLD_MINUTES } from "../../lib/board/hold-clock";
import { RESERVATION_LIMITS } from "../../lib/callers/limits";
import { pixelCount } from "../../lib/board/pricing";

/**
 * The questions a buyer has to have answered before they spend anything.
 *
 * A page rather than a paragraph in the dialog, because two of these answers
 * are longer than a dialog should be and one of them — what losing a key costs
 * — is the sharpest consequence of the whole model. The checkout carries the
 * short form of that one and links here for the rest, so nobody meets it for
 * the first time after paying.
 *
 * EVERY NUMBER ON THIS PAGE IS IMPORTED. The board's size, the million, the
 * hold's minutes and the stored-resolution rule all come from the modules that
 * enforce them, so a page of prose cannot quietly go out of date behind the
 * code it describes. What is written by hand here is only the wording.
 *
 * WHAT IT DOES NOT DO IS PROMISE. Whether a block can ever change hands is an
 * open decision (`SECURITY.md`, `DECISIONS.md`), so this page states what is
 * true today and claims nothing about tomorrow in either direction. There is no
 * sentence here saying transfer will never exist, and there must never be one
 * until somebody decides that in as many words. The word
 * "non-transferable" is as forbidden as a promise of transfer, and the arrival
 * round in `docs/cold-start-round.md` is where that is argued: a sales
 * conversation is exactly where an open door gets closed by accident.
 *
 * AND IT DISCLOSES THE LAUNCH COHORT. The owner's own projects bought
 * rectangles on day one at list price. That is discoverable whether or not this
 * page says it — the settled-purchase register prints an amount and a signature
 * fragment per sale ordered by `paid_at`, the treasury address is public by
 * construction, and a cluster of purchases in one minute followed by silence is
 * a permanent shape in that timeline. The round's verdict was that the version
 * of this which fails badly is the silent one, so it is said here in one
 * question, without dressing it up as a milestone.
 */

export const metadata: Metadata = {
  title: "Questions · milliondollarpage.fun",
  description:
    "What you get for a dollar, what permanence means here, what happens if you lose your key, and what a takedown does.",
};

export default function FaqPage() {
  return (
    <main className="prose-page">
      <div className="mx-auto max-w-[44rem] px-5 pb-24 pt-6">
        <nav className="flex items-center justify-between gap-4 border-b border-hairline-strong pb-4">
          <Link href="/" className="flex items-center gap-2 font-display text-[17px] font-bold text-ink">
            <span aria-hidden className="size-2.5 rounded-full bg-primary ring-3 ring-primary-soft" />
            milliondollarpage.fun
          </Link>
          <Link href="/" className="btn-quiet px-3 py-1.5 text-[13px]">
            Back to the board
          </Link>
        </nav>

        <h1 className="mt-8 font-display text-[34px] font-bold leading-tight tracking-tight">
          Questions, answered before you pay
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          {BOARD_WIDTH} × {BOARD_HEIGHT} is exactly {pixelCount(TOTAL_PIXELS)}, and
          every one of them is for sale on its own at a dollar. Draw any free rectangle, pay for its
          area, and put a picture, a link and a caption on it. This page is the small print, written
          out at full size.
        </p>

        <Question title="How long do I keep it?">
          <p>
            For good. A rectangle you have paid for does not change owner and does not change content
            without a signature from the wallet that bought it, and it never expires. There is no
            rent, no renewal, no balance to keep up and no code path anywhere in this project that can
            take a paid rectangle off the board.
          </p>
          <p>
            That is a mechanism rather than a policy. The database refuses an update that changes the
            owner of a rectangle somebody has paid for, and refuses to give a paid row an expiry date
            at all. Neither refusal can be talked out of by a route, a script or somebody with a
            console open.
          </p>
        </Question>

        <Question title="Can I sell it or give it to somebody else?">
          <p>
            <strong className="font-bold text-ink">
              We have not decided, and we are not going to pretend either way.
            </strong>{" "}
            There is no transfer in this product right now: a rectangle stays registered to the
            address that bought it. Whether transfer will ever exist is an open question here, and
            an open question is what we will keep calling it — you will not find us promising it,
            and you will not find us ruling it out.
          </p>
          <p>
            What we can tell you is exactly what is built, and today that is nothing. So buy on the
            basis of what is here now, not on the basis of what might arrive.{" "}
            <strong className="font-bold text-ink">
              If being able to move it later is the reason you are buying, this is not the moment.
            </strong>
          </p>
        </Question>

        <Question title="Did the owner buy pixels?">
          <p>
            <strong className="font-bold text-ink">Yes.</strong> Projects run by the person who
            built this wall bought rectangles on it, on the first day, at a dollar a pixel — the
            same price on the same terms as everybody else, paid from a real wallet through this
            same checkout.
          </p>
          <p>
            They are not marked on the board, because a sold rectangle is a sold rectangle and the
            wall does not rank who bought what. We are telling you here instead, which is the part
            that matters: a wall that starts with its own owner on it should say so rather than let
            you find out.
          </p>
        </Question>

        <Question title="What if I lose my key?">
          <p>
            <strong className="font-bold text-ink">
              There is no key recovery, and there is nothing we can do about a lost key.
            </strong>{" "}
            We do not hold it, we cannot reset it, and there is no support queue that ends in somebody
            restoring your access. That is the price of the rest of this page: a rectangle nobody can
            take from you is a rectangle nobody can hand back to you either.
          </p>
          <p>
            What you lose is the ability to edit. What you do not lose is the rectangle.{" "}
            <strong className="font-bold text-ink">
              It stays yours, it stays on the board, and nobody else can ever buy it or change it.
            </strong>{" "}
            Your picture, your link and your caption go on being displayed exactly as you left them.
            Losing the key freezes your rectangle; it does not free it.
          </p>
          <p>
            So: write the key down somewhere that is not a computer, before you buy rather than after.
          </p>
        </Question>

        <Question title="What does a dollar actually get me?">
          <p>
            One pixel, with a picture, a link and a caption on it — the same three things a hundred
            thousand pixels get. There is no tier, no threshold and no feature you have to buy your
            way up to. Visibility on this board is bought with area and never with features.
          </p>
          <p>
            What does follow the size is resolution. A rectangle stores {BLOCK_PIXEL_SCALE} image
            pixels for every pixel you buy, up to {STORED_MAX_LONG_EDGE} on its longest edge — so a
            1 × 1 keeps a {BLOCK_PIXEL_SCALE} × {BLOCK_PIXEL_SCALE} image and a 100 × 100 keeps a{" "}
            {100 * BLOCK_PIXEL_SCALE} × {100 * BLOCK_PIXEL_SCALE} one. A small purchase therefore
            looks pixelated when somebody points at it or zooms in, because it is: those really are
            all the pixels there are. The checkout shows you that render before you pay, at the size
            it will be, so nothing about it is a surprise afterwards.
          </p>
          <p>
            Bring whatever photograph you like. The page shrinks it in your own browser before it is
            sent, so you will never be told your picture is too heavy.
          </p>
        </Question>

        <Question title="Can my picture ever be taken down?">
          <p>
            Yes, and it happens in one of two ways. Both are about what is displayed. Neither touches
            who owns the rectangle.
          </p>
          <p>
            <strong className="font-bold text-ink">An ordinary takedown hides content, and it can be
            undone.</strong>{" "}
            The rectangle stops publishing its picture, its link and its caption, and the board draws
            it as ordinary paper. Nothing is deleted — the bytes sit where they were — so if a report
            turns out to be wrong, what comes back is the same picture, unchanged. Most reports are
            wrong about something, and an irreversible answer to a reversible question is how a
            mistake becomes permanent.
          </p>
          <p>
            <strong className="font-bold text-ink">A legal purge really erases the bytes.</strong>{" "}
            Where the law requires material to be destroyed rather than hidden, the image, its
            caption and its link are actually deleted and the deletion is recorded. That one cannot be
            undone and is not meant to be.
          </p>
          <p>
            <strong className="font-bold text-ink">In neither case does the rectangle stop being
            yours.</strong>{" "}
            It is not refunded, it does not go back on sale, and nobody else can buy those pixels. A
            takedown is about a picture; ownership is a separate thing and it does not move.
          </p>
        </Question>

        <Question title="What happens between picking a rectangle and paying for it?">
          <p>
            Pressing Buy holds the rectangle while you upload. An ordinary rectangle is held for{" "}
            {RESERVATION_MINUTES} minutes; a very large one is held for less, down to{" "}
            {SHORT_HOLD_MINUTES} minutes, because a big rectangle sitting unbought is a big piece of
            the wall nobody else can reach. The dialog counts your own clock down in front of you.
            Held pixels are drawn differently from sold ones and nobody else can buy them in the
            meantime. If you walk away, the hold ends by itself and the pixels go back on the board —
            nothing is charged and nothing is kept.
          </p>
          <p>
            While it is only held, your picture, link and caption are yours alone: none of them is
            published to anybody until the rectangle is actually paid for.
          </p>
        </Question>

        <Question title="Is there a limit on how much I can hold at once?">
          <p>
            Yes, and only on holding. One visitor may have{" "}
            {pixelCount(RESERVATION_LIMITS.heldPixelsPerCaller)} held at a time —
            a 100 by 100 rectangle, or several smaller ones adding up to it — and there is a limit on
            how long pixels can be kept off the board over an hour, so nobody can park the wall for
            free while everyone else waits.
          </p>
          <p>
            <strong className="font-bold text-ink">There is no limit on how much you can own.</strong>{" "}
            Paying clears what a hold cost, so a rectangle larger than that is bought as a few
            adjoining purchases, one after another. There is no grid to line them up on and edges do
            not collide, so the finished rectangles touch exactly — though each one is its own block,
            with its own picture, link and caption.
          </p>
        </Question>

        <Question title="Do my pixels overlap anybody else's?">
          <p>
            They cannot. Two live rectangles are refused by the database itself rather than by a check
            somebody has to remember to write, so a rectangle that is sold or held cannot be sold or
            held again while it stands. If the selector lets you draw it, the wall will let you buy
            it.
          </p>
        </Question>

        <p className="mt-10 border-t border-hairline-strong pt-5 text-[15px] leading-relaxed text-body">
          Something here not answered, or answered in a way that does not match what the site does?
          That is a bug in one of the two, and we would rather hear about it than have you find out
          later.
        </p>
      </div>
    </main>
  );
}

/** One question and its answer, so the page has one shape rather than seven. */
function Question({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="font-display text-[22px] font-semibold leading-snug">{title}</h2>
      <div className="mt-2 flex flex-col gap-3 text-[16px] leading-relaxed text-body">{children}</div>
    </section>
  );
}

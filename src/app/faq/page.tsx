import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "../../components/ThemeToggle";
import { Fragment, type ReactNode } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, TOTAL_PIXELS } from "../../lib/board/geometry";
import { BLOCK_PIXEL_SCALE, STORED_MAX_LONG_EDGE } from "../../lib/board/image-plan";
import { RESERVATION_MINUTES, SHORT_HOLD_MINUTES } from "../../lib/board/hold-clock";
import { RESERVATION_LIMITS } from "../../lib/callers/limits";
import { pixelCount } from "../../lib/board/pricing";
import "./landing.css";

/**
 * What this is, how it works, what you get, where it came from — and then the
 * questions a buyer has to have answered before they spend anything.
 *
 * WHO LINKS HERE: the top bar on the board, and the confirmation screen. It is
 * a page rather than a dialog because two of these answers are things somebody
 * should be able to read before a rectangle is held and a clock is running, and
 * because a page can be opened in a tab and sent to somebody.
 *
 * ## Why the small print grew a landing in front of it
 *
 * It opened on "Questions, answered before you pay", which is the right page
 * for somebody who has already understood the offer and the wrong one for
 * somebody who has not. The first five sections are the offer; the questions
 * are still here, word for word, at the end where they were always going.
 *
 * ## NOT ONE LINE OF CLIENT JAVASCRIPT
 *
 * Every effect on this page is CSS — see `landing.css`, which names the vault
 * entry each one adapts and why five of them are deliberately unused. The only
 * client component is the theme switch, which every page already carries. That
 * is what makes the owner's constraint provable rather than hoped for: the
 * board's own bundle cannot grow because of anything added here, and
 * `scripts/bundle-guard.mts` measures it.
 *
 * ## Every picture on this page is drawn by this page
 *
 * The 2005 wall is an SVG generated below from this repository's own tokens.
 * There is no screenshot of anybody's site, no embed and no stock: a page about
 * a wall whose promise is *these pixels are yours* cannot be built out of other
 * people's pictures. `docs/references-landing.md` carries the licences.
 */

export const metadata: Metadata = {
  title: "What this is · milliondollarpage.fun",
  description:
    "A million pixels at a dollar each on a wall 1250 by 800. What you get, how buying works, where the idea came from, and the small print in full.",
};

/**
 * A word, rendered as the wall would render it: one element per pixel.
 *
 * The glyphs are five columns wide and five rows tall and they are written out
 * here rather than rasterised, because a font would make the hero depend on
 * which face loaded — which is exactly the bug the preset pill had. Five by
 * five is the smallest grid a legible capital fits in.
 */
const GLYPHS: Record<string, string[]> = {
  P: ["11110", "10001", "11110", "10000", "10000"],
  I: ["11111", "00100", "00100", "00100", "11111"],
  X: ["10001", "01010", "00100", "01010", "10001"],
  E: ["11111", "10000", "11110", "10000", "11111"],
  L: ["10000", "10000", "10000", "10000", "11111"],
  S: ["01111", "10000", "01110", "00001", "11110"],
  " ": ["00000", "00000", "00000", "00000", "00000"],
};

/**
 * The hero: a word assembling out of the wall it is made of.
 *
 * The wave runs on the diagonal — `x + y` is the delay index — so the order the
 * tiles land in is the order a reader's eye already travels. Every tile is a
 * real coordinate rather than an artifact of scaling, which is the one place
 * this page can afford to be literal: these squares are the thing being sold.
 */
function PixelWord({ word }: { word: string }) {
  const letters = [...word.toUpperCase()].map((c) => GLYPHS[c] ?? GLYPHS[" "]);
  const cols = letters.length * 6 - 1;
  const cells: { on: boolean; i: number; key: string }[] = [];

  for (let row = 0; row < 5; row += 1) {
    for (let at = 0; at < letters.length; at += 1) {
      for (let col = 0; col < 5; col += 1) {
        const x = at * 6 + col;
        cells.push({ on: letters[at][row][col] === "1", i: x + row * 2, key: `${row}-${x}` });
      }
      if (at < letters.length - 1) {
        cells.push({ on: false, i: at * 6 + 5 + row * 2, key: `${row}-gap-${at}` });
      }
    }
  }

  return (
    <div className="hero-grid" style={{ ["--cols" as string]: cols }} aria-hidden>
      {cells.map((cell) => (
        <span
          key={cell.key}
          className="hero-grid__tile"
          data-ink={cell.on ? "1" : undefined}
          style={{ ["--i" as string]: cell.i }}
        />
      ))}
    </div>
  );
}

/**
 * A heading whose letters settle one after another.
 *
 * IT SPLITS INTO WORDS FIRST, AND THAT IS NOT TIDINESS. Each letter is an
 * `inline-block` so it can take a background of its own, and a line of
 * inline-blocks may be broken between any two of them — at 390 the first
 * capture read "a doll / ar each" and "one i / s the wallet". Wrapping each
 * word in a `nowrap` box puts the break points back where a reader expects
 * them, and the counter keeps running across words so the wave still crosses
 * the whole line rather than restarting on each one.
 */
function Typer({ children }: { children: string }) {
  /*
    The wave's index is derived from where each word starts rather than counted
    with a mutable cursor — the React compiler refuses a closure that reassigns
    after render, and it is right to: the offset is a pure function of the words
    before it, so computing it is clearer than accumulating it.
  */
  const words = children.split(" ");
  const offsets = words.reduce<number[]>(
    (at, word, i) => [...at, at[i] + word.length + 1],
    [0],
  );

  return (
    <span className="typer">
      {words.map((word, at) => {
        const letters = [...word].map((letter, i) => ({ letter, i: offsets[at] + i }));
        return (
          <Fragment key={`${word}-${at}`}>
            <span className="typer__word">
              {letters.map(({ letter, i }) => (
                <span key={i} className="typer__letter" style={{ ["--i" as string]: i }}>
                  {letter}
                </span>
              ))}
            </span>
            {/*
              THE SPACE IS OUTSIDE THE WORD, and that is the whole point of the
              fragment. Inside an `inline-block` a trailing space is trimmed, so
              the first version of this produced a heading whose accessible text
              read "Amillionpixels,adollareach" — the letters were spans and the
              spaces were gone. Between the boxes it is a real text node, which
              is both the gap a reader sees and the break the line takes.
            */}
            {at < words.length - 1 ? " " : null}
          </Fragment>
        );
      })}
    </span>
  );
}

/** A 10×10 rectangle stamping itself in, which is what a drag makes. */
function Stamp() {
  return (
    <div className="stamp" aria-hidden>
      {Array.from({ length: 100 }, (_, at) => (
        <span key={at} className="stamp__cell" style={{ ["--i" as string]: (at % 10) + Math.floor(at / 10) }} />
      ))}
    </div>
  );
}

/**
 * The 2005 wall, drawn here rather than shown.
 *
 * A deterministic scatter of rectangles from this repository's own palette —
 * the shape of that page without one pixel of it. The seed is fixed so the
 * drawing is the same every build, which is what makes a capture comparable
 * with the one before it.
 */
/**
 * The scatter, computed once at module scope rather than per render.
 *
 * It is the same drawing every time — a fixed seed is what makes two captures a
 * week apart comparable — so a component that recomputed it would be doing work
 * to arrive at the same answer. Hoisting it also settles the React compiler's
 * objection to a closure that reassigns after render, which is a rule about
 * exactly this shape.
 */
const WALL_2005 = (() => {
  let seed = 20050826;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const tones = ["var(--primary)", "var(--ink-soft)", "var(--control-line)", "var(--hairline-strong)"];
  return Array.from({ length: 120 }, () => {
    const w = 2 + Math.floor(random() * 9);
    const h = 2 + Math.floor(random() * 7);
    return {
      x: Math.floor(random() * (100 - w)),
      y: Math.floor(random() * (64 - h)),
      w,
      h,
      fill: tones[Math.floor(random() * tones.length)],
    };
  });
})();

function DrawnWall() {
  return (
    <svg
      viewBox="0 0 100 64"
      className="ghosty h-auto w-full"
      role="img"
      aria-label="A drawing of a wall of small rectangles, in the shape the 2005 page had"
      style={{ ["--ghosty-duration" as string]: "1400ms", animationDuration: "1400ms" }}
    >
      <rect width="100" height="64" fill="var(--card)" />
      {WALL_2005.map((box, at) => (
        <rect key={at} x={box.x} y={box.y} width={box.w} height={box.h} fill={box.fill} opacity="0.85" />
      ))}
    </svg>
  );
}

export default function AboutPage() {
  return (
    <main className="prose-page landing">
      <div className="mx-auto max-w-[44rem] px-5 pb-24 pt-6">
        <nav className="flex items-center justify-between gap-4 border-b border-hairline-strong pb-4">
          <Link href="/" className="flex items-center gap-2 font-display text-[17px] font-bold text-ink">
            <span aria-hidden className="size-2.5 rounded-full bg-ink" />
            milliondollarpage.fun
          </Link>
          <span className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/" className="btn-quiet px-3 py-1.5 text-[13px]">
              Back to the board
            </Link>
          </span>
        </nav>

        {/* ------------------------------------------------------- what it is */}
        <div className="mt-10">
          <PixelWord word="PIXELS" />
        </div>

        <h1 className="mt-8 font-display text-[34px] font-bold leading-tight tracking-tight">
          <Typer>A million pixels, a dollar each</Typer>
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          The wall is {BOARD_WIDTH} × {BOARD_HEIGHT}, which is exactly{" "}
          {pixelCount(TOTAL_PIXELS)}. Every one of them is for sale on its own at a dollar. You draw
          any free rectangle — one pixel or ten thousand, no grid to snap to and no minimum — pay for
          its area in USDC with a Solana wallet, and those pixels are yours.
        </p>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          There is no auction, no tier and no price that goes up. The last pixel costs what the first
          one did.
        </p>

        {/* ------------------------------------------------- how it works, 3 */}
        <h2 className="mt-14 font-display text-[22px] font-semibold tracking-tight">
          <Typer>Three steps, and the middle one is the wallet</Typer>
        </h2>

        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          <li className="rounded-xl border border-hairline-strong bg-card p-4">
            <span className="label-caps">Step one</span>
            <p className="mt-2 font-display text-[17px] font-semibold text-ink">Drag on the wall</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-body">
              Hold and drag anywhere free, or pick a size and click. The price counts up as you go —
              area × a dollar, exact to the pixel.
            </p>
            <div className="mt-4">
              <Stamp />
            </div>
          </li>
          <li className="rounded-xl border border-hairline-strong bg-card p-4">
            <span className="label-caps">Step two</span>
            <p className="mt-2 font-display text-[17px] font-semibold text-ink">Connect a wallet</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-body">
              Phantom, Solflare, Backpack — whatever you already use. Buying is signed by your key,
              which is what makes the rectangle answer to you and to nobody else.
            </p>
          </li>
          <li className="rounded-xl border border-hairline-strong bg-card p-4">
            <span className="label-caps">Step three</span>
            <p className="mt-2 font-display text-[17px] font-semibold text-ink">Buy, then upload</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-body">
              The rectangle is held for you for up to {RESERVATION_MINUTES} minutes while you put a
              picture, a link and a caption on it. Nothing is charged until you sign.
            </p>
          </li>
        </ol>

        {/* -------------------------------------------------- what you get */}
        <h2 className="mt-14 font-display text-[22px] font-semibold tracking-tight">
          <Typer>What you actually get</Typer>
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["Your image, at your size", `Stored at ${BLOCK_PIXEL_SCALE}× the pixels you bought, up to ${STORED_MAX_LONG_EDGE} on the long edge, so it stays sharp when somebody zooms in.`],
            ["Your link, and your clicks", "Every follow of your link is counted and the number is shown publicly on your rectangle. It is your evidence, not ours."],
            ["Your caption", "One line, on its own chip, shown to anybody who rests on your rectangle or reaches it with a keyboard."],
            ["For good", "It does not change owner or content without a signature from the wallet that bought it, and it never expires."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-xl border border-hairline-strong bg-card p-4">
              <p className="font-display text-[15px] font-semibold text-ink">{title}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-body">{body}</p>
            </li>
          ))}
        </ul>

        {/* ----------------------------------------------------------- 2005 */}
        <h2 className="mt-14 font-display text-[22px] font-semibold tracking-tight">
          <Typer>Where the idea comes from</Typer>
        </h2>
        <div className="mt-5 overflow-hidden rounded-xl border border-hairline-strong">
          <DrawnWall />
        </div>
        <p className="mt-4 text-[16px] leading-relaxed text-body">
          In 2005 a student in Wiltshire wanted to pay for university without a loan, and put up a
          page that was one million pixels arranged a thousand by a thousand. He sold them in blocks
          of ten by ten at a hundred dollars a block, each one carrying a tiny image that linked
          somewhere. It sold out inside five months, and the last thousand pixels went at auction.
        </p>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          The drawing above is ours, not his — this page describes that page and reproduces none of
          it. What it got right is the part worth keeping: a fixed amount of something, priced the
          same for everybody, where what you buy is a place rather than a promise.
        </p>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          Two things here are deliberately different. The square became{" "}
          {BOARD_WIDTH} × {BOARD_HEIGHT}, and the block of a hundred became <strong className="font-semibold text-ink">one
          pixel</strong>. The original&apos;s own argument for the block was that a single pixel cannot
          display anything — which is true about what a pixel can SHOW, and was never a reason to
          refuse to sell one.
        </p>
        {/*
          THE GENRE'S FAILURE, NAMED ON OUR OWN PAGE, and it is the most useful
          fact in `docs/marketing-fomo.md`: the buyer's real fear here is that
          this is a 2005 page whose links stopped working. Saying it first is
          worth more than any claim we could make instead.

          WHAT FOLLOWS IT IS THE INVARIANT AND NOTHING MORE. `DECISIONS.md`
          holds whether a rectangle can ever change hands OPEN, and "not to be
          answered by anything shipped" — and a reassuring paragraph about
          permanence is the likeliest sentence on this site to answer it by
          accident, in either direction. `copy-doors.test.tsx` is the guard.
        */}
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          <strong className="font-semibold text-ink">
            And twenty years on, a lot of that page does not go anywhere any more.
          </strong>{" "}
          A study in 2017 counted 547 of its 2,816 links dead and another 489 pointing somewhere
          else entirely — 342,000 pixels&apos; worth, at a dollar a pixel. The BBC put the rot at
          around 40% in 2019. The page is still up; much of what it advertised is not.
        </p>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          That is the part worth being exact about here, so: your picture is stored and served from
          this site rather than fetched from a server somebody else is paying for, which means the
          link on your rectangle can rot the way theirs did and the picture cannot. A sold pixel
          does not change owner or content without a signature from the wallet that bought it, and
          it never expires. A takedown removes what is displayed and never who owns it. What none
          of that is, is a promise about a number of years — you will not find one on this page.
        </p>

        {/* -------------------------------------------------------- why solana */}
        <h2 className="mt-14 font-display text-[22px] font-semibold tracking-tight">
          <Typer>Why Solana</Typer>
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-body">
          Because a wall sold a pixel at a time only works if buying one pixel is worth doing. A
          dollar of pixels has to cost about{" "}
          <span className="glow font-display text-[26px] font-bold" data-figure="$0.0001">
            $0.0001
          </span>{" "}
          to move, or the fee is the product. That is the whole argument, and it is an argument about
          arithmetic rather than about a chain.
        </p>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          The rest follows from it: payment in USDC so the price on the label is the price you pay,
          settlement in seconds so a held rectangle does not sit waiting, and one signature per step
          so nothing about your rectangle can be changed by anybody who is not you — including us.
        </p>

        {/* ------------------------------------------------------ the questions */}
        <h2 className="mt-14 font-display text-[22px] font-semibold tracking-tight">
          <Typer>The small print, at full size</Typer>
        </h2>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          Everything a buyer should read before spending anything, written out rather than
          summarised.
        </p>
        <div className="mt-2">
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

        </div>

        <p className="mt-10 border-t border-hairline-strong pt-5 text-[15px] leading-relaxed text-body">
          Something here not answered, or answered in a way that does not match what the site does?
          That is a bug in one of the two, and we would rather hear about it than have you find out
          later.
        </p>

        {/*
          THE DEBT, NAMED ON THE PAGE THAT OWES IT. The effects above are adapted
          from Arlan's vault, which is MIT — the technique, not the code, written
          here in this repository's own idiom. `docs/references-landing.md`
          carries the table, including the five entries deliberately not used.
        */}
        <p className="mt-6 text-[13px] leading-relaxed text-body">
          The animations on this page are adapted from techniques published in{" "}
          <a
            href="https://www.arlan.me/vault"
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-ink underline underline-offset-2"
          >
            Arlan&apos;s vault
          </a>{" "}
          under the MIT licence. Every illustration is drawn by this page.
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

---
version: alpha
name: milliondollarpage.fun
description: "A warm cream workshop wall for a permanent pixel canvas on Solana. Cream paper (#f3ede0) holds a 1250x800 board where the paper's own colour means the pixels are for sale and colour or a bitmap means they are sold, so availability never depends on what colour a buyer uploaded. The artwork arrives as one composite bitmap of exactly the wall; a faint ruling comes back only when the zoom is close enough for a wall pixel to be worth counting. The whole board is always visible and the page never scrolls; the wall around it is the same cream as the sheet. Olive-brown ink (#2b241c) sets text on the cream instead of punching through it; a single terracotta (#c2451e) carries every primary action and every selection, and appears nowhere else. Bricolage Grotesque sets display, Karla sets everything else. The board and its blocks have zero radius because they are literally pixels; only the chrome rounds. A thin fixed top bar, and the rest of the controls in a side panel or a bottom bar depending on which shape of window they are in. The system reads as a workshop wall: warm, plainly labelled, and entirely subordinate to the artwork pinned to it."
colors:
  primary: "#c2451e"
  primary-pressed: "#9f3819"
  primary-soft: "#f7dccb"
  on-primary: "#fff8ef"
  ink: "#2b241c"
  ink-soft: "#443a2c"
  body: "#6b6154"
  mute: "#827968"
  canvas: "#f3ede0"
  canvas-deep: "#e9dfc9"
  card: "#fffcf5"
  card-warm: "#fbf5e8"
  hairline: "rgba(43,36,28,0.10)"
  hairline-strong: "#c9baa0"
  control-line: "#8a795c"
  danger: "#a8371f"
  danger-soft: "#f1d4c8"
  danger-line: "#e2b6a4"
  ok: "#4c7a4a"
typography:
  display-lg: { fontFamily: "Bricolage Grotesque", fontSize: 34px, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.8px }
  display:    { fontFamily: "Bricolage Grotesque", fontSize: 22px, fontWeight: 600, lineHeight: 1.15, letterSpacing: -0.4px }
  headline:   { fontFamily: "Bricolage Grotesque", fontSize: 17px, fontWeight: 600, lineHeight: 1.25 }
  body:       { fontFamily: Karla, fontSize: 14px, fontWeight: 400, lineHeight: 1.5 }
  body-sm:    { fontFamily: Karla, fontSize: 12.5px, fontWeight: 400, lineHeight: 1.45 }
  label:      { fontFamily: Karla, fontSize: 11px, fontWeight: 600, letterSpacing: 0.06em, textTransform: uppercase }
  numeric:    { fontFamily: Karla, fontSize: 14px, fontWeight: 600, fontVariantNumeric: "tabular-nums" }
  numeric-lg: { fontFamily: "Bricolage Grotesque", fontSize: 20px, fontWeight: 700, fontVariantNumeric: "tabular-nums" }
rounded: { none: 0, xs: 4px, sm: 8px, md: 12px, lg: 20px, pill: 999px }
spacing: { bar-top: 52px, bar-bottom: 88px, panel: 288px, gutter: 16px, card-padding: 16px, board-margin: 20px, board-frame: 2px }
motion:
  ease: "cubic-bezier(.4,0,.2,1)"
  hover: "160ms"
  press: "90ms"
  enter: "220ms"
  marching-ants: "600ms linear infinite"
---

# milliondollarpage.fun

A 1250×800 canvas, which is exactly one million pixels. **Every one of them is
for sale on its own, at $1.** The strapline and the offer are the same sentence
now: a purchase is any free rectangle, priced at its area, exact to the pixel,
with no grid to snap to and no minimum size. The header and the controls both
say so in the same words. Paid in USDC on Solana. A buyer picks a rectangle,
holds it for thirty minutes, uploads an image with a link and a caption, and
the block is theirs — permanently, and on the terms `SECURITY.md` states: it
does not change owner or content without their signature, and it never expires.

The wall was 1000×1000 and sold in 10×10 blocks at $100. Both went together:
the square came from the 2005 original, and the block came from the original's
own argument that a single pixel cannot display anything. That argument is
about what a pixel can SHOW, and it was never a reason to refuse to sell one.

**The artwork is the product. The interface is the wall it hangs on.** Every rule
below exists to keep the chrome subordinate to a million pixels of other people's
pictures.

## The one rule that outranks the others

**A block's state must never depend on the colour a buyer uploaded.**

**The paper's cream means available. Colour or a bitmap means sold.** That is
the rule now, and it replaces "ruled means available, unruled means taken",
which could not survive per-pixel purchases: the ruling used to be drawn at
every zoom, and a rule every ten pixels over a wall scaled to fit is a grid
drawn on a board where a purchase is any rectangle, exact to the pixel, with
nothing to snap to. The ruling is a navigation aid at close zoom now, not the
state.

So the wall is one composite bitmap of exactly the board, and its unsold pixels
are **transparent**. The cream underneath shows through them — with its ruling,
where the zoom is close enough to draw one — and a purchase covers both.

**The cream has one honest hole in it, and two things close it.** A buyer may
upload a picture that is the same cream as the paper. So a sold rectangle also
carries a 1px ink edge wherever it is big enough to draw one; and an upload
with an alpha channel is composited onto the cream inside its own rectangle
rather than left transparent, so a sale is never a hole in the wall. Neither
of those is a hue, which is the point.

Anything that signals state through hue alone is wrong, because the buyer chooses
the hue and we do not.

## The wall is one bitmap, and it has a version

**The board draws every purchase from a single PNG of exactly 1250×800.** It
used to fetch one bitmap per block and one JSON row per block, which was the
right shape for ten thousand 10×10 blocks and is the wrong one for a wall that
can hold tens of thousands of purchases. What the page fetches now is:

- **the wall**, one image, whose URL contains its own sha256 — so it is
  immutable, cached for a year by every cache in the path, and a new purchase
  busts that cache by *being a different URL* rather than by anybody purging
  anything;
- **a rectangle list** with no content in it at all: an id and four numbers per
  live rectangle, which is what the pointer hit-tests and what the selector
  refuses;
- **one rectangle's caption and link**, fetched when a pointer or the keyboard
  cursor comes to rest on it. Nobody reads ten thousand captions.

**The wall is the overview. Above the ruling's zoom, the artwork is drawn
from the buyer's own bitmap instead.** The composite is one image pixel per
wall pixel, which is exactly what makes it one request for the whole board —
and it is also why zooming past 1:1 was enlarging an overview of detail we
already hold: a purchase stores four image pixels for every pixel bought.
So above the zoom where the ruling comes back — one wall pixel to about eight
screen pixels, which is the same threshold, deliberately — the rectangles
actually on screen are redrawn from their own stored bytes over the composite.
Few rectangles are visible at that zoom, the image route already exists and is
cached for a year by its own URL, and everything not redrawn keeps the
composite's pixels, which are not wrong: they are the overview. Nearest
neighbour still governs every scale, and the bars a `contain` fit leaves are
the sheet's own cream on this path exactly as they are on the server's.

**Holds are not in the wall.** A hold appears and expires within half an hour,
and baking one in would rebuild the whole bitmap twice for every abandoned
purchase. The canvas draws holds from the rectangle list, which is where
volatile state belongs.

**A wall that cannot be rebuilt goes stale, never blank.** A failed rebuild
leaves the previous version serving, and one undecodable upload paints its own
rectangle in the sold fallback while every other purchase composes normally.

## The board

- **Contain, not cover. The whole board is always visible.** It is scaled by
  its limiting dimension — whichever of the free region's width and height runs
  out first — so all four corners are on screen at once and pixels stay square.
  Which dimension limits is not a property of the window's shape alone now that
  the board is 1250×800: a landscape window with a wide side panel fits by
  width, one with a narrow panel by height, and portrait and phones by width.
- **The page never scrolls.** Not vertically, not horizontally, at any viewport
  size. `overflow: hidden` on the document, and the fit maths behind it, so
  there is nothing being hidden. The one box on the page allowed its own scroll
  is a side panel too short for its own contents, and only so the Buy button is
  never clipped.
- **The wall is the same cream as the sheet.** There is always some background
  beside the board now, and it is `#f3ede0` — the board's own paper — not a
  darker ground. The board should read as a sheet pinned to a wall of the same
  paper, never as a letterboxed image with bars round it. **A 2px `ink` frame
  draws the sheet's edge on all four sides**, because that is the only thing
  left saying where the artwork stops. It was a hairline in the coarse rule's
  tone, which was the right weight for a boundary nobody had to find and the
  wrong one for a boundary that has to be seen not to be clipped — and it was
  being clipped, because nothing reserved room for it. **The frame is part of
  the board's footprint, not decoration over it**: it is drawn immediately
  outside the paper, so it never covers a pixel somebody bought, and **the fit
  scale is computed with it included**. A fit that fits the board and cuts its
  own border is the same bug in a smaller size.
- **The board keeps 20px of clear paper between its frame and everything
  around it, on every side.** It was a bottom gap only, on the argument that
  every other edge already had a bar or a panel against it. That argument was
  wrong about two edges and it showed: the board is scaled by its limiting
  dimension, so whenever width is the limit its left and right edges land
  exactly on the free region's — the sheet's edge went under the side panel on
  one side and off the window on the other. The margin is an **inset**, taken
  out of the board's share before the fit maths sees it, never a CSS margin:
  a margin would add to the page's size, and the page may not scroll.
- **This reverses an earlier contract, deliberately.** The board used to fill
  the viewport width and pan its vertical overflow. The owner used that and
  changed their mind. The leftover width is no longer dead margin, because the
  controls live in it.
- **Sharp pixels, never interpolation.** Blocks are bitmaps, and a bitmap that
  has been smoothed is no longer the picture the buyer uploaded. The canvas
  allocates its backing store in real device pixels, draws with nearest-neighbour
  sampling, and the element itself renders pixelated. There is no scale at which
  the artwork is allowed to go soft.
- **Zoom is a ladder, not a slider.** Wheel, pinch, and three buttons in the
  controls — **+**, **−** and **Fit** — all step the same ladder; there is no
  second one and no interpolation on any of the three paths. The buttons exist
  because a wheel and a pinch are not reachable from a keyboard, and because a
  gesture that does nothing at the end of the ladder is invisible while a
  button that does nothing is broken: **+** is disabled at the top rung and
  **−** and **Fit** at fit, greyed and marked so rather than merely inert. They
  zoom about the middle of the free region, since a button has no pointer to
  zoom about. Every stop
  puts a board pixel on a whole number of screen pixels, and every zoom is
  centred on the pointer. The bottom rung is the **fit scale** — whatever
  irrational number the free region divided by the board produces. **"Zoom 1" means
  that rung, the whole board on screen, not one screen pixel per board pixel.**
  Above it are the powers of two greater than fit: a 980×848 free region fits
  at 0.784 and offers 0.784 then 1, 2, 4, 8, 16; a taller one fitting at 1.4
  offers 1.4 then 2, 4, 8, 16 and skips 1 entirely. Zooming out from
  the lowest integer rung lands on fit and stops there. One honest limit: an
  integer scale is an integer number of *device* pixels only when the device
  pixel ratio is itself an integer, and on the fractional ratios Windows and
  some Android phones report the ladder cannot fix that. Nearest-neighbour
  sampling is what makes the remainder a hard edge instead of a blur.
- **Panning is something you earn by zooming in.** It is enabled exactly when
  the scale is above the fit scale. At the bottom rung the whole board is on
  screen, so a drag has nowhere to take it and a wheel must not move it — and
  the wheel does not pan at all any more, it zooms.
- **Two-tier graph paper, and it appears only when it is telling the truth.**
  A faint rule every 10 pixels and a stronger one every 100, drawn **only above
  the zoom where one wall pixel is about eight screen pixels** — and drawn
  *under* the wall bitmap, so it survives exactly on the pixels nobody has
  bought. **There is no ruling at fit.** At that scale it is moiré, and worse
  than moiré it is a lie: it draws a grid on a board that has none. **Nothing
  snaps to either tier.** Where it does appear it is there to be read, not
  obeyed: the fine tier gives the eye a smallest legible step and the coarse
  tier lets you navigate without counting. A rectangle may start and end
  anywhere.
- **The board takes focus, and a keyboard drives it.** It is a canvas, so it
  is given a tab stop, an `application` role and its own keys; without them
  there is no way to select a rectangle without a pointer, and Buy can never
  be enabled at all. **Arrows move the cursor one block. Shift moves it ten —
  which is one coarse rule, not an arbitrary "faster". Alt with an arrow
  resizes it from its top-left anchor. Enter is the Buy button. Escape
  clears.** A preset moves but does not resize, because a preset's whole point
  is that it is the size the button named. Nothing here is a second geometry:
  every rectangle still comes out of `snapRect` and `presetRect`, so the
  half-open rule, the collision refusal and the slide-back near an edge are
  the pointer's own. **One honest gap:** a pointer can now draw a rectangle
  the keyboard cannot — a 1×1 at an odd coordinate — because the cursor walks
  the ten-pixel step the ruling is drawn in, and a finer step needs a third
  modifier nobody has chosen yet. The step outlived the ruling being drawn at
  every zoom, deliberately: it is a comfortable distance for an arrow key
  whether or not there is a line under it.
  It is recorded in `keyboard-cursor.ts` rather than closed here. When the cursor is walked off the visible board the
  view follows it by panning, and only where a drag could have: above the fit
  rung, clamped by the same `clampToFit`.
- **A canvas tells assistive technology nothing, so the cursor is mirrored in
  words.** A polite live region beside the board says the rectangle, its
  pixels, its price, what block is under it — caption and all, which is the
  hover card's information reaching a keyboard for the first time — and then
  the very sentence printed under the Buy button. **The caption is fetched, so
  it arrives a moment after the rest**, and the mirror says the true half
  first: a sale under the cursor is announced as a sale whether or not its
  words have landed, and never as one with no caption. It waits for the cursor to
  settle before it speaks, because a held arrow key repeats thirty times a
  second and a mirror that narrated that would be unusable.
- **Zero radius on the board and on every block.** They are pixels. Rounding them
  lies about what they are. Only chrome rounds.
- **Sold blocks** carry a 1px ink border, so the boundary between two adjacent
  blocks is visible even when both uploads are the same colour — including when
  both are the cream that means available. It is drawn in screen pixels from
  the rectangle list rather than baked into the wall, because a border in the
  bitmap would be a *wall* pixel and would eat one the buyer paid for. Below
  about four screen pixels across it is not drawn at all: a 1px stroke round a
  one-pixel purchase at fit is bigger than the thing it outlines, and a wall of
  them reads as a grid of ink rather than as artwork. Zooming in is what
  separates them.
- **Captions** sit on their own opaque chip, never as free text over artwork —
  and the chip appears on **the rectangle whose words have been fetched**,
  which is the one under the pointer or under the keyboard cursor. Every sold
  block used to carry one, because every caption used to ride along in the
  board payload; none of them do now. The hover card and the live region are
  where a caption is read.

## Colour

One accent, terracotta, and it means exactly two things: *this is the primary
action* and *this is your selection*. It appears nowhere else — not in headings,
not in borders, not as decoration.

Terracotta was chosen over the warmer yellow it descends from for a specific
reason: yellow disappears into skin tones and sand, which real uploads are full
of. A red-leaning hue stays rare against arbitrary artwork.

The selection outline is terracotta over an ink core with a cream ring, so it
survives any artwork underneath without depending on contrast with it. That
sandwich, not the terracotta, is what makes the outline visible over an upload;
the accent only says whose outline it is.

**The focus ring is the third thing terracotta means, and it is the same
claim.** A focused control is a control the keyboard has selected, so it takes
the accent: 2px of `primary` at a 2px offset, which puts the ring on the
surface behind the control rather than on the control's own fill. Measured
against the four surfaces a focusable thing lands on: **4.32:1** on `canvas`,
**4.92:1** on `card`, **4.64:1** on `card-warm`, **3.81:1** on `canvas-deep` —
the last being a ring beside a disabled neighbour, which is a real background
even though the neighbour is exempt. WCAG 1.4.11 asks 3:1.

**Two focusable things cannot take that ring, and both are answered rather
than excused.** A control whose real input is hidden — the image dropzone's
file input, the fit chooser's radios — would put a ring on a one-pixel box, so
the ring goes on the visible box that stands for it. And the board is a canvas
the size of the whole viewport, so an outline at a 2px offset is drawn outside
the window: its ring is **painted into the board**, hugging the sheet's edge
and clamped into the free region so a board zoomed past its own edges still
shows one. That ring is the selection's own sandwich — cream, ink, terracotta —
because zoomed in it lands on somebody's artwork, and no single colour survives
that.

**A focus ring never fades in.** Anywhere a colour transition covers
`outline-color`, the ring spends its first 160ms measuring under 3:1 while the
stylesheet still reads as `primary`. Transition the border, never the ring.

**And a focus ring is never clipped, which is the same failure from the other
side.** The ring is drawn 2px outside the control at a 2px offset, so any
ancestor with `overflow` other than `visible` cuts it off — `overflow-x: auto`
included, and that clips vertically too. A scrolling row of controls therefore
carries four pixels of padding for the ring to live in, handed back to the
layout with an equal negative margin so nothing moves. Found the only way it
can be found: three of the four sides of the wallet's Connect button came back
`#fbf5e8` out of a screenshot while the stylesheet said `2px solid
var(--primary)` the whole time. **The size-preset row had the same shape and the
same clipping; it was recorded here rather than changed on the way past, and has
since been fixed the same way.** Both rows are now pinned by the same screenshot
test, which samples the ring on all four sides of a control in each row and in
each layout — the presets row came back `#be441d` on one side, four points off
the accent and unmistakably the ring, so the comparison allows a blended edge
pixel while a clipped side (cream, 150-plus points away per channel) still
fails.

**The accent deepened by six points of lightness, and that was measured rather
than chosen.** It used to be `#dd4e22`. On-primary cream (`#fff8ef`) on that
measures **3.84:1**, and the label on every Buy, Continue, Confirm and "Ask
again" is 14–15px at 700 — under 18.66px bold, so WCAG 1.4.3 asks 4.5:1. The board's
selection tag sets the same cream at 11px/700 on the same fill, so one number
failed in two places. `#c2451e` measures **4.79:1** on the same cream.

**The hue did not move, and it must not.** Both tones are HSL 14° at 73%
saturation; only the lightness went 50% → 44%. The whole reason terracotta beat
the yellow it descends from is that a red-leaning hue stays rare against
arbitrary artwork, and buying contrast by sliding towards yellow or towards a
neutral would have spent exactly the property the colour was picked for. Darken
within the hue, never drift out of it.

`primary-pressed` followed it down to `#9f3819` for the same reason it exists —
it is the shoulder under the button — and for one it did not: it is set as
*text* on `primary-soft` in the counter pill at 12px/700, where it measured
**4.26:1** and now measures **5.26:1**.

**`mute` is a tone, not a text colour.** It used to set the all-caps labels, the
form hints, the interaction legend, the hover card's metadata and the input
placeholders. At `#948a79` that measured **2.92:1** on `canvas`, **3.32:1** on
`card`, **3.13:1** on `card-warm` and **2.57:1** on `canvas-deep`, and every one
of those sites is 11–16px text, which 1.4.3 puts at 4.5:1. Darkening the token
far enough to carry 11px text on the cream would have parked it on top of
`body`, which is to say it would have deleted the rung instead of fixing it. So
that text is `body` now — **5.20:1** on `canvas`, **5.92:1** on `card`,
**5.58:1** on `card-warm` — and the ramp keeps four distinct steps.

What `mute` still sets is the two things allowed to be quiet: a disabled control's
label, which 1.4.3 exempts as incidental, and one aria-hidden decorative glyph,
which 1.4.11 does not reach. Both sit on `canvas-deep`. **Exempt is not a licence
to be invisible**, so it darkened to `#827968` all the same: **2.57:1 → 3.25:1**,
which is the 3:1 floor this project claimed in a comment for months without ever
having measured it.

**There are two line colours, and the split is the point.** `hairline-strong`
(`#c9baa0`) is decoration: the sheet's edge, the rule under the top bar, the
outline round a card, the border round a box of prose. It measures **1.63:1**
on `canvas` and **1.86:1** on `card` and it stays exactly there, because WCAG
1.4.11 reaches what identifies a *control* or carries information in a graphic,
and a card is found by what is printed in it rather than by its outline. A 3:1
rule round every box would be a louder page than this document asks for.

`control-line` (`#8a795c`) is the other job: the border that is the only thing
saying an interactive area is there. Every text field, every quiet button, the
image dropzone and the fit chooser. Those are boundaries identifying a
component, 1.4.11 puts them at 3:1, and `hairline-strong` was carrying them at
1.63:1 — the one failure the last contrast pass reported and left. Measured on
the four surfaces a control lands on: **3.62:1** on `canvas`, **4.12:1** on
`card`, **3.89:1** on `card-warm`, **3.19:1** on `canvas-deep`. The scrollbar
thumb takes it too — it is a control you drag, and it is the one whose only
indication is a fill rather than a border.

**The hue did not move here either.** `control-line` is the same 38° as the
decorative line so the two read as one family; the saturation drops from 27.5%
to 20%, which is where the ink ramp already sits and which keeps the tone a
warm neutral rather than the olive that hue becomes when it is darkened at full
saturation; the lightness then comes down until the worst of the four surfaces
clears 3:1 with room to spare.

Every ratio in this document is a WCAG 2.1 relative-luminance ratio, computed
from the values above and confirmed against pixels sampled out of a rendered
screenshot. A ratio nobody computed is not a ratio.

## Type

**Bricolage Grotesque** for display, **Karla** for everything else. Both from
Google Fonts. Numbers are tabular everywhere they can change — counters, prices,
countdowns — so digits do not jump as they tick.

Hierarchy comes from size and weight, not from boxes and rules. If something needs
a border to be found, the layout is wrong first.

**Anywhere a buyer types, the text is 16px, and that is a layout rule rather
than a taste one.** iOS Safari zooms the whole page when a field under 16px
takes focus, and a buyer cannot zoom back out by hand. On a page that must
never scroll, that would push the board off screen — so 16px on every input is
what keeps the no-scroll contract standing on a phone.

**Nothing beside those fields is fine print.** In the purchase dialog, help,
hints, counters and error lines are 14px at the smallest and prose is 15px:
the ramp's `body-sm` belongs to the dense chrome around the board, not to the
one screen where somebody is being asked to part with money. The all-caps
`label` is the exception, because a label is read as a marker rather than as a
sentence.

## A bar, and either a panel or a second bar

A thin fixed bar across the top, always: the wordmark, the offer, and how much
of it is left. It is **one row and one fixed height**, and never wraps.

**The offer is one line and it is quoted exactly**: `1,000,000 pixels · $1 per
pixel · yours forever`. The million is the board's own two dimensions
multiplied, the price is the settings row the checkout charges from, and the
term is the sentence `SECURITY.md` opens with. Beside it, **a plain count of
the pixels remaining** — what is left, not what is gone, because a nearly full
board says the useful thing that way round.

**Nothing on the page promises revenue.** Not a million dollars raised, not a
total, not an implied one. A million pixels at a dollar is the offer; what it
adds up to is arithmetic a reader can do, and printing it would turn an offer
into a forecast.

**One link lives in the bar, and it goes to the questions.** What losing a key
costs, what a takedown does, and what a dollar actually buys are things
somebody should be able to read before a rectangle is held and a clock is
running. It is a real page at `/faq` rather than a dialog, so it can be opened
in a tab and sent to somebody; the confirmation screen carries the short form
of the key answer and links to the same place. **It is also the one page in
this product that scrolls** — inside a single full-height box, the same
exemption the side panel already has. The document's own `overflow: hidden`
does not move, because the board depends on it.

Everything else — the size presets, the selection readout and price, the wallet
control, the Buy button, the legend — is one block of controls that the layout
puts in one of two places. It is one set of controls either way; there is never
a second Buy button or a second Connect control for a screen reader to find.

**In a landscape window it is a side panel**, a column down the left. There is
**no bottom bar** in that layout. **Its width is 288px, and that number is
measured rather than reasoned**: the widest thing in the column that cannot
shrink is the Buy button at its longest, `Buy these pixels — $1,000,000.00`,
which renders at 255px; 16px of padding either side and the panel's own 1px
border make exactly that.

It used to be the genuine leftover — `100vw - 1.5625 × (100dvh - bar-top)`,
floored at 280px and capped at 560px — and both ends of that were guesses that
measurement contradicted. The floor was too narrow: at 280px the content box is
247px against the 255px that control needs, so the one thing that never gives
way was overflowing its own column.
The cap was too wide: on a large monitor the panel held 560px the board could
have used, and the board, fitted by width there, came back with its own edge
outside the window. **What the board does not need beside it is wall, not
letterbox** — same cream, same rule as the rest of the background.

**In portrait and on phones it is a bottom bar**, one row at one fixed height,
never wrapping — because the board's fit maths reads its measured box, and a
bar that can grow to two rows is a bar that can cover the board it was measured
against.

**Tab order is the board, then the controls, and it ends on Buy.** One DOM
tree serves both layouts, so one source order has to answer for both. In the
bottom bar it matches the visual order exactly: the board, then the row left to
right. In the side panel the board comes before the panel drawn over its left
third — the canvas's own box starts at the window's origin, the board is the
thing the panel is about, and the sequence a keyboard walks is then the
sequence a purchase takes: pick the rectangle, price it, type the address,
press Buy. Reordering to satisfy the panel would satisfy it by breaking the
bar, and would leave Buy in the middle of the walk rather than at the end of
it.

The crossover is 5:4 and 640px wide, not simply "landscape": the question is
not which way the window is turned, it is which arrangement leaves a bigger
board. At 1280×1024 a panel does; at 600×590 it does not. **Both of those
numbers were worked out against a square board and a wider one moves the
crossover** — at 1024×768 the bottom bar now leaves the bigger board. Recorded
here as an open layout question rather than changed on the way past.

What gives way as room runs out, in order, in both layouts: **the interaction
legend first**, then the zoom trio — a phone has a pinch, and the bottom bar at
that width has no room for three more buttons — then the exact rectangle
readout, then the per-preset prices, then the wallet's own label, then the
gaps. **Never** the pixel count, the
total, or the Buy button — those are what the controls are for. The bottom bar
runs out of width; the side panel runs out of height, and sheds the same things
in the same order.

## What only `/stats` says, and what the bar still may not

The bar's rule does not move: **nothing on the board promises revenue.** Not a
million dollars raised, not a total, not an implied one. That is unchanged and
it is the reason the board is not merely told not to print the number — it is
never handed it. `boardStats` is what `/api/board` ships and what the bar
renders from, and the money total is not in that shape. `soldValueBaseUnits`
is a separate call with one caller.

**`/stats` is a different contract, and the difference is who asked.** Nobody
arrives on the board having asked a question; they arrive to look at a wall,
and a total beside the offer is read as part of the offer. Somebody on `/stats`
opened a page whose title is "what the wall has done". A count of what has
already been paid is a fact about the past there, not a forecast — so **the
money taken is printed on `/stats`, against the ceiling, and nowhere else.**

The owner took that decision on 2026-09-01. It is recorded in `DECISIONS.md`
with the door it leaves open, because it is the one place this document says a
number the rest of it refuses.

**Four figures, and every one of them is a count.** How many people are on the
wall right now, how many distinct visitors there have been today, how many
pixels are sold out of the million, and how much has been taken out of what the
whole wall costs. Two of the four are about people and neither can name one: a
visitor is a salted one-way hash of an address and a minute, and there is no
path, referrer, session or cookie in the schema that could turn it back into
somebody.

**"X online" shows from one.** The obvious rule is to hide it until the number
flatters, and it is wrong twice: a number that appears only when it is
impressive is a claim rather than a count, and the first person on a wall
nobody has found yet is exactly the reader for whom "1 online" is true and
nothing is a lie. Zero is the only state it does not draw, and zero cannot
happen while somebody is reading it.

**The ranking is the genre's leaderboard with its mechanic inverted, and the
page says so in as many words.** It ranks **rectangles by pixels held** —
never people, never bids, never activity. **Nothing on it can be outbid: a rank
changes only when somebody buys a bigger rectangle of their own**, because
nothing about a sold rectangle can be changed by anybody, including us. A tie
is broken by which rectangle was there first, which is the only fact separating
two equal areas that is not a payment.

Three refusals come with it, and each one is a thing the genre does that this
page does not. **No holder is named**, on the ranking or anywhere else — the
page prints that sentence rather than leaving it to be noticed. **Nothing is
ranked by activity**, because nothing can happen to a rectangle after it is
bought and a "hot right now" sort would be the first dishonest thing here. And
**no rank can be taken by paying**, which is the whole inversion: a leaderboard
of positions that cannot be lost, rather than one that can.

## States

| State | How it reads |
| --- | --- |
| Free | The paper's own cream. Ruled, but only above the zoom where a wall pixel is about eight screen pixels; at fit it is plain cream |
| Hovered | A soft cream lift and the caption card, no colour change |
| Selecting | Terracotta outline with marching ants, so a drag never looks like a placed block |
| Refused | The offending block outlined in danger, the selection outlined in danger, Buy disabled |
| Held | **Its own value, not a variation on the sale's, and drawn by the canvas rather than baked into the wall.** Opaque like a sale, because those pixels are genuinely not for sale right now — but in the coarse rule's own tone (`#c9baa0`), plainly lighter than a sale's artwork-or-near-black and plainly heavier than the paper, so the two are told apart at a glance and not by inspection. Over it, an **ink** hatch at 45° — the one angle neither tier of the graph paper uses — and a broken ink edge where a sale carries an unbroken one. Pencilled in on card, not inked. Wherever the block is big enough to read one it carries its own chip, **On hold**, in the place a sold block puts its caption. A hold **you** started adds the terracotta ring, because it is still your selection and the only held rectangle you can act on. The countdown stays live in the control it gates. A hold never shows an upload: those pixels are unpaid and may never be bought, the wall composes `paid` and `minted` alone and the image route serves the same two, so there is nothing public to draw and the whole rectangle is free for a treatment of its own |
| Sold | **The buyer's bitmap, nearest-neighbour at every zoom** — out of the wall at the overview, and out of its own stored bytes once the zoom is close enough for the ruling — with a 1px ink edge wherever there is room for one. The artwork is the treatment — this is the whole product, and the block is the frame. The bitmap is composed into the wall at the size the rectangle was bought at: enlarged into it with nearest neighbour so pixel art stays hard-edged, reduced into it with a real filter so a photograph stays the photograph the buyer approved in the preview |
| Sold, loading or missing | Solid `#443a2c`, edge to edge, 1px ink edge. This is the **fallback**, not the sold treatment: what the rectangle shows in the moment before the wall arrives, and what it keeps if its own bytes never decode. Every sold rectangle gets it under the wall on every frame until the wall has decoded, so a sale reads as taken from the first paint; after that the artwork covers it. An upload with an alpha channel is composited onto the paper cream inside its own rectangle rather than onto this, and never onto the ruling — a sold rectangle is never ruled |
| Taken down | Exactly like free, and it is **not** free. The content is gone from the wall and from every endpoint; the rectangle is still sold, still its owner's, and the selector still refuses it. Nothing on the board says a takedown happened, because a takedown is about what is displayed and the board is not a moderation log |

## What has to be signed

Three things on this page are **signed by the wallet that holds the
rectangle**: handing a hold back, choosing what goes in the block, and
settling the purchase. The address on its own proved nothing: the board
publishes every live block's id, and a wallet address is public wherever it
exists, so anything that trusted the address alone let a stranger act on
somebody else's pixels — let go of them, or write the picture, link and
caption that the buyer's own payment then makes permanent.

Selecting a rectangle and holding it are **not** signed, and should not be. A
hold is free, it expires on its own, and asking a person to sign before they
have seen what they are buying is asking them to approve nothing in
particular.

**A wallet connects, and the typed address is gone.** This paragraph used to
open "right now nothing here can sign", and it does not any more. The controls
carry a **Connect** button per wallet the browser actually has, and once one is
connected the same slot shows the two ends of its address and a **Disconnect**
beside it. The address is READ from that connection and is never typed:
an address somebody pastes in can hold a rectangle and can then never attach
content to it, never pay for it and never let it go, because all three of those
are signed by the key behind it. A field that could start a purchase nobody
could finish was worse than no field.

**The wallets are listed, never ranked, and nothing is recommended.** They
appear in the order the browser registered them, which is at least not an
opinion we invented, and when a browser has none the control says so in one
plain sentence and names no product to go and install. A checkout is not a
place to advertise.

**The three signed buttons still read whether anything can sign**, which is why
they came back on together rather than one at a time. Disconnect mid-purchase
and all three go off again, each with the reason in plain words beside it and
`aria-describedby` pointing at it — greyed rather than looking ready and
refusing when pressed, because a control that looks live and then fails costs
more trust than one that was honest about being unavailable. Nothing is lost
while they are off, and each sentence says so: nothing has been charged, a hold
ends by itself and the pixels go back on the board, and a hold the buyer still
wants is theirs to pick up again straight off the board, ring and countdown
intact.

**Connecting is announced, and politely.** It confirms what the buyer just set
out to do rather than invalidating what they were doing, so it takes the polite
role by the rule above. The sentence is `sr-only` in the bottom bar and printed
in the side panel — not two behaviours, but this document's own shed order: the
bar runs out of width and the panel has the height to keep it.

**The wallet is frozen while a purchase dialog is open**, exactly as the typed
field was disabled in the same condition. The hold inside that dialog belongs
to the address it was created with and all three of its signed steps are
checked against it, so a wallet swapped underneath it would be a dialog whose
every button answers 403.

When a release *is* attempted, what the buyer is told afterwards is whatever
actually happened, never what was assumed beforehand: the hold is gone and the
pixels are back, or the payment turned out to have landed and the block is
bought and theirs, or nothing is certain and the clock is still running.
Closing this dialog does not get to announce that a purchase was thrown away
at the moment it succeeded.

## Motion

Functional, never announced. 160ms on hover, 90ms on press, 220ms on entrance,
all on the shared ease. The only continuous motion on the page is the selection's
marching ants, because a drag in progress is the one thing that genuinely differs
from a thing at rest.

The Buy button lifts 2px on hover and presses to 0.97. Nothing else lifts.

**`prefers-reduced-motion` stops all of it, the ants included.** The stylesheet
reaches every animation and transition on the page, and it cannot reach the
marching ants: those are an interval redrawing a canvas, so the board asks the
media query itself. The dashes still draw — the outline still says a selection
is live — they simply stop moving.

## Voice

Plain, warm, specific. Say what happened and what to do about it.

An error names the cause and the way out. "Those pixels were just taken" is the
kind of sentence this project already had to delete: it was vague, it implied a
sale when the pixels were merely held, and it offered nothing to do next. What
replaced it names which of the two situations it is and when the pixels come back.

Never say who holds a rectangle. When, yes. Who, never.

The one exception is *you*. A hold you started yourself is named as yours — on
the board, in the sentence under the Buy button, and in the refusal that offers
to hand it back. That is not a disclosure and cannot become one: the browser
recognises an order id it created itself, and the server puts nobody else's id,
key or count on the wire. "Someone is holding this" stays the only thing anyone
ever learns about anyone else.

## What gets said out loud, and what gets to interrupt

Four things are announced, and **polite or assertive is a decision per case,
not a default**. Assertive cuts across whatever somebody is being read, which
is right for something that invalidates what they are doing and rude
otherwise.

**Assertive** — every refusal that makes the buyer's current belief wrong: a
field's error and the form's, which arrive because Continue did not continue;
the payment's error, which arrives after the button that spends money; and the
fatal screen, which is the hold that expired, the rectangle somebody else took,
or the order that stopped being ours. Everything queued behind those is about a
purchase that is no longer happening.

**Polite** — the rest, and all of it for the same reason: it confirms what the
buyer already set out to do. The reservation arriving. The receipt, which is
announced as itself rather than duplicated into a hidden region. The stalled
screen, because no answer is not the same as a bad one — the styling already
said so. And the board's cursor readout, which is a mirror of the user's own
keyboard: a readout that interrupts is the definition of a rude one.

**The hold clock is the one that needed a rule rather than a role.** It redraws
ten times a second in the last minute, and *a clock that announces every second
is worse than one that never announces at all*. The final stretch is the last
**two minutes** — the same threshold at which the number already turns
danger-coloured, so the colour and the voice cannot disagree about when it
began — and inside it the clock speaks exactly **four times**: at two minutes,
one minute, thirty seconds and ten. Each gap is roughly half the last: time to
finish a sentence after the first, time to do nothing but save after the last.
Zero says nothing, because what is needed then is not a countdown; the hold
ending is the fatal screen's, and that one interrupts.

## The purchase dialog is a real modal

`showModal()` on a native `<dialog>`, not a hand-written focus trap. Focus
starts inside it and on the card rather than on the close button — a dialog
that opens by announcing "Close" tells a buyer the least useful sentence it
has. Tab cannot leave. The board behind it is inert to a pointer and to
assistive technology alike. Escape asks the same question the × does, because
closing may throw a hold away and Escape must not be the one route that does it
without asking.

**Closing hands focus back**, and to the opener wherever the opener can still
take it. The Buy button cannot: the same close that returns focus clears the
selection that enabled it. So the board is the fallback — it is what the buyer
was working on, and it is never disabled.

## Settled decisions

Decisions already taken, recorded so a later pass does not spend its time
reopening them. Each one was decided by the owner; none of them is an
invitation to weigh the alternative again.

**The tail is a counter, not an auction.** As the board fills, the last pixels
become the scarcest thing on it, and the obvious idea is to auction them. The
answer is no, settled: what the wall shows is **a plain count of the pixels
remaining**, all the way down to zero, and the price stays a dollar a pixel for
the last one exactly as for the first. Every pixel is sold on the same terms as
every other, and a buyer who arrives late pays what a buyer who arrived early
paid. An auction would also be the first thing on this page whose price is not
knowable before you press Buy, on a board whose whole readout is "these pixels,
this many, this much".

**No copy promises revenue.** See the top bar's section above. A total is not
printed, implied, or counted towards.

## Settled colour decisions

Decisions already taken, recorded so a later contrast pass does not spend its
time reopening them.

**`--danger-line` stays as it is** — 1.31:1 against its own fill and 1.79:1
against the card. It encloses error *prose*, not a control, so WCAG 1.4.11 does
not reach it: that rule governs boundaries that tell you where an interactive
area is, and this boundary tells you nothing the words inside it do not already
say. The error is communicated by the text. A saturated rule around every error
message would shout a second time and buy no legibility.

If a future pass measures it and finds it failing, the finding is correct and
the rule still does not apply. Leave it.

**`--hairline-strong` stays as it is** for decorative rules, and control
borders use `--control-line` instead. Do not solve a control's contrast by
darkening decoration.

## Attribution

This document's structure and part of its colour and voice thinking derive from
the PostHog design analysis in
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md),
MIT licensed:

> MIT License — Copyright (c) 2026 VoltAgent
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of
> this software and associated documentation files (the "Software"), to deal in
> the Software without restriction, including without limitation the rights to
> use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
> the Software, and to permit persons to whom the Software is furnished to do so,
> subject to the above copyright notice and this permission notice being included
> in all copies or substantial portions of the Software.

The MIT licence covers that analysis document. It does not license PostHog's trade
dress, and none of it is used here: no mascots, no character illustration, none of
their palette, and not their typefaces. What was taken is the argument that a
developer product can be warm and cream rather than dark and severe, and that one
saturated colour should carry every primary action.

The graph-paper-versus-solid rule and the zero-radius rule were taken from a
Pinterest analysis in the same MIT-licensed collection, and are likewise
reimplemented rather than copied. The first of the two has since been
**replaced** — a per-pixel board cannot say "ruled means available", so what
says it now is the paper's own cream, and the ruling has become a navigation
aid that appears only at close zoom. See "The one rule that outranks the
others". The zero-radius rule stands unchanged.

Explored and rejected: `vercel.com/design.md`, which carries no licence and is a
brand document instructing authors to adopt Vercel's typeface and brand CSS so the
result reads as Vercel-authored. Its discipline informed a direction we did not
choose; none of its content is here.

Five mockups of the directions considered are in [docs/design/](docs/design/).

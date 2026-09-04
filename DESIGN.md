---
version: alpha
name: milliondollarpage.fun
description: "Two registers of one page — a warm cream workshop wall and a cold near-black instrument, chosen by the reader or by their system. A cold near-black instrument for a permanent pixel canvas on Solana. Near-black paper (#070a0e) holds a 1250x800 board where the paper's own darkness means the pixels are for sale and colour or a bitmap means they are sold, so availability never depends on what colour a buyer uploaded. The artwork arrives as one composite bitmap of exactly the wall; a faint ruling comes back only when the zoom is close enough for a wall pixel to be worth counting. The whole board is always visible and the page never scrolls; the ground around it is one step lighter than the paper so the sheet reads as an object on a surface rather than a hole in it. Near-white ink (#eef2f7) sets text on the ground; a single signal green (#2ce08a) carries every primary action and every selection, and appears nowhere else. Space Grotesk sets display and prose, IBM Plex Mono sets every number, label and piece of metadata, so a measurement can be told from a sentence without reading either. The board and its blocks have zero radius because they are literally pixels; only the chrome rounds. A thin fixed top bar, a running register of settled purchases along the bottom, and the rest of the controls in a side panel or a second bar depending on which shape of window they are in. The system reads as an instrument: dense, tabular, plainly labelled, and entirely subordinate to the artwork on the wall."
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
  card-lift: "#fbf5e8"
  hairline: "rgba(43,36,28,0.10)"
  hairline-strong: "#c9baa0"
  control-line: "#8a795c"
  danger: "#a8371f"
  danger-soft: "#f1d4c8"
  danger-line: "#e2b6a4"
  ok: "#4c7a4a"
  paper: "#f3ede0"
  frame: "#2b241c"
  hold: "#c9baa0"
  hold-hatch: "rgba(43,36,28,0.62)"
  sold-fallback: "#443a2c"
  sold-edge: "#2b241c"
  wallet: "#512da8"
  on-wallet: "#ffffff"
colors-dark:
  primary: "#2ce08a"
  primary-pressed: "#14b86c"
  primary-soft: "rgba(44,224,138,0.14)"
  on-primary: "#05190f"
  ink: "#eef2f7"
  ink-soft: "#b3bdcc"
  body: "#8d97a6"
  mute: "#6b7686"
  canvas: "#0a0d12"
  canvas-deep: "#10151c"
  card: "#0e1218"
  card-lift: "#161c25"
  hairline: "rgba(122,138,160,0.10)"
  hairline-strong: "#242c38"
  control-line: "#586a89"
  danger: "#ff5c47"
  danger-soft: "rgba(255,92,71,0.14)"
  danger-line: "#7a2f26"
  ok: "#2ce08a"
  paper: "#070a0e"
  frame: "#5c6b84"
  hold: "#5a6779"
  hold-hatch: "rgba(7,10,14,0.62)"
  sold-fallback: "#2e3642"
  sold-edge: "#586a89"
  wallet: "#ab9ff2"
  on-wallet: "#150c2e"
typography-light:
  display-lg: { fontFamily: "Bricolage Grotesque", fontSize: 34px, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.8px }
  display:    { fontFamily: "Bricolage Grotesque", fontSize: 22px, fontWeight: 600, lineHeight: 1.15, letterSpacing: -0.4px }
  headline:   { fontFamily: "Bricolage Grotesque", fontSize: 17px, fontWeight: 600, lineHeight: 1.25 }
  body:       { fontFamily: "Karla", fontSize: 14px, fontWeight: 400, lineHeight: 1.5 }
  body-sm:    { fontFamily: "Karla", fontSize: 12.5px, fontWeight: 400, lineHeight: 1.45 }
  numeric:    { fontFamily: "Karla", fontSize: 14px, fontWeight: 600, fontVariantNumeric: "tabular-nums" }
typography:
  display-lg: { fontFamily: "Space Grotesk", fontSize: 34px, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.8px }
  display:    { fontFamily: "Space Grotesk", fontSize: 22px, fontWeight: 600, lineHeight: 1.15, letterSpacing: -0.4px }
  headline:   { fontFamily: "Space Grotesk", fontSize: 17px, fontWeight: 600, lineHeight: 1.25 }
  body:       { fontFamily: "Space Grotesk", fontSize: 14px, fontWeight: 400, lineHeight: 1.5 }
  body-sm:    { fontFamily: "Space Grotesk", fontSize: 12.5px, fontWeight: 400, lineHeight: 1.45 }
  label:      { fontFamily: "IBM Plex Mono", fontSize: 10.5px, fontWeight: 600, letterSpacing: 0.12em, textTransform: uppercase }
  meta:       { fontFamily: "IBM Plex Mono", fontSize: 11px, fontWeight: 400, lineHeight: 1.6 }
  numeric:    { fontFamily: "IBM Plex Mono", fontSize: 12.5px, fontWeight: 500, fontVariantNumeric: "tabular-nums" }
  numeric-lg: { fontFamily: "IBM Plex Mono", fontSize: 20px, fontWeight: 700, fontVariantNumeric: "tabular-nums" }
  numeric-xl: { fontFamily: "IBM Plex Mono", fontSize: 26px, fontWeight: 700, letterSpacing: -0.5px, fontVariantNumeric: "tabular-nums" }
  statement:  { fontFamily: "IBM Plex Mono", fontSize: 34px, fontWeight: 700, letterSpacing: -1px, fontVariantNumeric: "tabular-nums" }
rounded: { none: 0, xs: 4px, sm: 6px, md: 8px, lg: 12px, pill: 999px }
spacing: { bar-top: 52px, bar-bottom: 92px, panel: 288px, tape: 78px, gutter: 16px, card-padding: 13px, board-margin: 20px, board-frame: 2px }
motion:
  ease: "cubic-bezier(.4,0,.2,1)"
  hover: "160ms"
  press: "90ms"
  enter: "220ms"
  marching-ants: "600ms linear infinite"
  tape-roll: "46s linear infinite"
  live-pulse: "1.6s ease infinite"
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

**The paper's own near-black means available. Colour or a bitmap means sold.**
That is
the rule now, and it replaces "ruled means available, unruled means taken",
which could not survive per-pixel purchases: the ruling used to be drawn at
every zoom, and a rule every ten pixels over a wall scaled to fit is a grid
drawn on a board where a purchase is any rectangle, exact to the pixel, with
nothing to snap to. The ruling is a navigation aid at close zoom now, not the
state.

So the wall is one composite bitmap of exactly the board, and its unsold pixels
are **transparent**. The paper underneath shows through them — with its ruling,
where the zoom is close enough to draw one — and a purchase covers both.

**The paper has one honest hole in it, and two things close it.** A buyer may
upload a picture that is the same near-black as the paper. So a sold rectangle
also carries a 1px `sold-edge` wherever it is big enough to draw one; and an
upload with an alpha channel is composited onto the paper inside its own
rectangle rather than left transparent, so a sale is never a hole in the wall.
Neither of those is a hue, which is the point.

**THAT EDGE HAD TO TURN OVER WITH THE REGISTER, AND COPYING THE RULE WOULD HAVE
BROKEN IT.** On cream the edge was ink — dark, against a light sheet. Carried
across unchanged it would be a near-black line on near-black paper, which is
precisely the hole the rule exists to close, reintroduced by obeying the rule's
words instead of its argument. The edge contrasts with the PAPER, whichever way
up the paper is: `#586a89`, **3.62:1** on it.

The hold's edge goes the other way for the same reason: it is broken, and it
cuts INTO the hold's own fill, so it is the paper showing through — dark here,
exactly as it was light against the cream.

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
the sheet's own paper on this path exactly as they are on the server's.

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
- **The wall around the sheet is one step lighter than it.** There is always some background
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
  both are the paper that means available. It is drawn in screen pixels from
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

**Two themes, and the same page in both.** Light is the cream workshop wall this
project shipped with; dark is direction D, "Tape". Neither is a skin over the
other: each was designed and measured on its own, and both tables below were
computed from this document's own frontmatter and confirmed against pixels
sampled out of a rendered screenshot. A ratio nobody computed is not a ratio.

**TWO STATES, AND THE DEFAULT IS DARK.** A stored choice rules; a reader who has
never chosen gets the dark register, which is this design's own rather than
whatever their machine decided for their mail client. The choice is stamped on
the root element by a blocking script before the first paint, so no reader ever
sees a frame of the wrong register.

**"System" is retired**, and what it cost is stated rather than hidden: somebody
who has chosen light here and runs a dark machine no longer has a control that
says *go back to following the machine*. A three-position control existed to
answer a question nobody was asking, and it cost the page a text button where a
switch belongs.

**The control is a switch.** A button labelled `Dark` is either telling you
where you are or where pressing it takes you, and no wording fixes that;
`role="switch"` with `aria-checked` says *dark is on* and the knob is where the
state is. It is the one control on this page that animates: the knob crosses
18px and the chrome's own surfaces cross-fade, both in **220ms**, and the fade
is a class the toggle adds for exactly that long rather than a standing
transition that would fade the page on its first paint. **Nothing animates the
wall** — the selector list names the bars, the rails and the pills, and the
board is a canvas no stylesheet can fade. `prefers-reduced-motion` removes both.

**One honest gap:** with JavaScript off nothing is stamped and the stylesheet's
media query answers instead, so a no-JS reader on a light machine gets the light
register rather than the default. Closing it means inverting the stylesheet so
bare `:root` is dark, which is a change to every ratio in the two tables below;
it is written down rather than done.

**What is themed is only colour and the two typefaces.** The layout, the type
scale, the motion and every mechanic are one page: the settled rail, the marked
newest sale, the counter's flash and the hover price belong to both registers.
A theme is a colourway, not a second design.

### Two exceptions, and both are named rather than tolerated

**One box is the same in both registers, and one colour is not ours.** Every
other rule in this section is about a page that is one design in two colourways.
These two are not, and each is here with its reason and its measurement rather
than as a place the rules happen not to reach.

#### The purchase panel is white in both registers, because it is the receipt

It is where a number somebody is about to pay is printed, and a receipt is
white. Not a colour override but a **palette**: the panel re-declares the light
register's tokens on itself, so every child — the readout, the price, the
borders, the hint — becomes light without one component knowing, and nothing
here invents a value this document has not already measured.

**Against the panel's own white**, computed the same way as every other table:

| | ratio |
|---|---|
| `ink` `#2b241c` | **15.31** |
| `ink-soft` `#443a2c` | **11.13** |
| `body` `#6b6154` | **6.06** |
| `mute` `#827968` | 4.30 |
| `control-line` `#8a795c` | **4.23** |

**And the panel against the wall it floats on: 19.46:1** on the dark canvas and
19.83:1 on the dark paper — which is what the owner asked to see measured, and
it is the whole argument for the exception. In the CREAM register it is
**1.17:1**, which is to say the white panel is not told from the ground by tone
at all; its 1px `control-line` border is what says where it is there, at 4.23
against the panel and 3.62 against the cream. That is this document's own
`hairline-strong` argument applied one level up: a boundary is identified by a
line, not by a step.

**`--primary` is deliberately NOT re-declared.** The Buy button is the fifth of
the accent's five permitted places, so a green Buy on a white panel in the dark
register is exactly the claim it is everywhere else.

#### The wallet control is violet, and the violet is not ours

The accent means money moving now. A Connect control is not that — it is the
thing that has to happen before anything can move — and giving it the accent
would teach green a third meaning. What it wears instead is the convention:
`wallet-adapter`'s own purple and Phantom's, which every reader who has a Solana
wallet already recognises. **Borrowed, not invented, and that is the exception.**

**It is themed, because one violet cannot carry both grounds:**

| | against its bar | label on it |
|---|---|---|
| light, `#512da8` | **7.86** | white at **9.17** |
| dark, `#ab9ff2` | **8.31** | `#150c2e` at **7.98** |

Phantom's light violet measures **2.01:1** against the cream bar, which fails
1.4.11 for a control's own boundary — so the light register takes the darker
purple rather than the same value twice. `purchase-e2e.test.ts` samples the
rendered control and compares it with this document's frontmatter, in both
registers.

### The accent means one thing in both: MONEY MOVING NOW

Terracotta in light, signal green in dark, and the rule is identical. It may
appear in five places and the guardian fails the build if it appears in a sixth:

| Where | Why it is money moving |
| --- | --- |
| The newest settled sale on the rail | A purchase that just landed |
| **LIVE**, and the pip beside it | The rail is receiving them now |
| The pixels-left counter, flashing as it drops | Somebody just bought while you were reading |
| The price on the hover card | What this rectangle costs, at the moment somebody is weighing it |
| The Buy button | The act of moving the money |

**In both themes it has been withdrawn from everything that meant "your
selection"** — the dragged rectangle, the control the keyboard is on, the field
being typed in, highlighted text, a hovered quiet button. All of those are
**ink and a frame** now, in light exactly as in dark. The cream register let the
accent mean two things and called the focus ring "the third thing terracotta
means, and it is the same claim"; that reading is retired.

**The selection lost nothing by it, in either theme.** Its outline over artwork
was never made visible by the accent — the sandwich does that, paper outside
and a hard stroke inside — and only the stroke's colour changed. The focus ring
went from **3.81:1** to **11.56:1** at worst in light, and from 9.89:1 to
**15.22:1** in dark. WCAG 1.4.11 asks 3:1.

### Light, measured

| | `canvas` | `canvas-deep` | `card` | `card-lift` | `paper` |
|---|---|---|---|---|---|
| `ink` `#2b241c` | **13.12** | **11.56** | **14.94** | **14.09** | **13.12** |
| `ink-soft` `#443a2c` | **9.54** | **8.40** | **10.86** | **10.24** | **9.54** |
| `body` `#6b6154` | **5.20** | **4.58** | **5.92** | **5.58** | **5.20** |
| `mute` `#827968` | **3.69** | **3.25** | **4.20** | **3.96** | **3.69** |
| `primary` `#c2451e` | **4.32** | 3.81 | **4.92** | **4.64** | **4.32** |
| `control-line` `#8a795c` | **3.62** | **3.19** | **4.12** | **3.89** | **3.62** |
| `frame` `#2b241c` | **13.12** | **11.56** | **14.94** | **14.09** | **13.12** |
| `hold` `#c9baa0` | 1.63 | 1.44 | 1.86 | 1.75 | 1.63 |
| `danger` `#a8371f` | **5.57** | **4.91** | **6.34** | **5.98** | **5.57** |
| `hairline-strong` `#c9baa0` | 1.63 | 1.44 | 1.86 | 1.75 | 1.63 |

| Pair | Ratio |
|---|---|
| `on-primary` on `primary` | **4.79** |
| `on-primary` on `primary-pressed` | **6.52** |
| `ink` on `hold` | **8.03** |
| `sold-fallback` on `paper` | **9.54** |
| `sold-edge` on `paper` | **13.12** |

### Dark, measured

| | `canvas` | `canvas-deep` | `card` | `card-lift` | `paper` |
|---|---|---|---|---|---|
| `ink` `#eef2f7` | **17.31** | **16.30** | **16.70** | **15.22** | **17.64** |
| `ink-soft` `#b3bdcc` | **10.26** | **9.66** | **9.90** | **9.02** | **10.45** |
| `body` `#8d97a6` | **6.59** | **6.20** | **6.36** | **5.79** | **6.72** |
| `mute` `#6b7686` | **4.23** | **3.98** | **4.08** | **3.72** | **4.31** |
| `primary` `#2ce08a` | **11.25** | **10.59** | **10.85** | **9.89** | **11.46** |
| `control-line` `#586a89` | **3.56** | **3.35** | **3.43** | **3.13** | **3.62** |
| `frame` `#5c6b84` | **3.61** | **3.40** | **3.48** | **3.17** | **3.68** |
| `hold` `#5a6779` | 3.38 | 3.19 | 3.26 | 2.98 | **3.45** |
| `danger` `#ff5c47` | **6.37** | **6.00** | **6.15** | **5.60** | **6.49** |
| `hairline-strong` `#242c38` | 1.38 | 1.30 | 1.33 | 1.22 | 1.41 |

| Pair | Ratio |
|---|---|
| `on-primary` on `primary` | **10.53** |
| `on-primary` on `primary-pressed` | **7.03** |
| `ink` on `hold` | **5.12** |
| `sold-fallback` on `paper` | 1.63 |
| `sold-edge` on `paper` | **3.62** |

**The rows below 3:1 are the same two in both themes, answered the same way.**
`hairline-strong` is decoration — the rule under the bar, a divider, a card's
outline — and 1.4.11 reaches what identifies a *control*. And **the hold is carried by its hatch, not by its tone**: 1.63:1 in light and 3.45:1 in dark
against the paper, which is why the 45° hatch and the broken edge are the
load-bearing half of that treatment in both and why `--hold-hatch` is a token
rather than an opacity somebody picked. `sold-fallback` at 1.63:1 in dark is the
mirror of the same trade, and it is what the 1px `sold-edge` at 3.62:1 exists to
close.

### The one thing the wall bitmap cannot theme

**The composite is one image and there are two themes.** Unsold pixels are
transparent, so the paper shows through whichever paper is current. But two
things *inside* a sold rectangle were being baked in the cream: the bars a
`contain` fit leaves, and the ground an upload's alpha channel is flattened
onto. Both are `sold-fallback`'s tone now, in both themes, because **those
pixels belong to the sale rather than to the wall** — a bar beside somebody's
logo is part of what they bought, and making it transparent would put a hole in
a sold rectangle, which is the exact failure the sold edge exists to prevent.

The door, if a buyer's transparency ever has to sit on the reader's own
background: two composites keyed by theme, two versions of one hash, and a
second rebuild per purchase. `DECISIONS.md` carries it. No copy promises
transparency either way.

### The token names did not change, and that is the point

`--primary` is green now and it was terracotta before. `--ink` is near-white now
and it was olive-brown before. **Not one variable was renamed**, because every
one of them is named for the job it does rather than for the colour it happens
to be: primary is the accent that carries an action, ink is the strongest text,
canvas is the surface the page sits on, hairline is decoration. Those sentences
are true in both registers, which is what made the swap a change of values
rather than a change of the stylesheet.

**One name was register-specific and one was renamed:** `--card-warm` became
`--card-lift`. Nothing here is warm, and a token whose name contradicts its
value is how a stylesheet stops being readable.

**Three tokens are new**, and all three existed already as hard-coded hexes
inside `BoardCanvas.tsx`: `--paper` (the board's own surface, which used to be
the same value as `--canvas` and is not any more), `--frame`, and `--hold`.
Promoting them is what makes them checkable — see the guard at the end of this
section.

### Why the register left the cream

The cream said *workshop*, and the audience this wall sells to reads quiet as
"nothing is happening here" (`docs/references.md`, second reading). The ground
is cold and blue-leaning now — `canvas` `#0a0d12`, `paper` `#070a0e` — and
deliberately not a warm near-black, because warm near-black is a sand tone at
low lightness and the whole argument for leaving the cream was that cream is a
sand tone. **The rule that outranks every other one survives unchanged:** a
block's state must never depend on the colour a buyer uploaded, and the paper
sits 100° or more of hue from skin and sand at every lightness a photograph
occupies.

**The board's paper is one step darker than the ground it sits on.** `#070a0e`
against `#0a0d12` measures **1.02:1**, which is to say it is not a boundary and
was never meant to be one — the 2px `frame` at 3.61:1 is what says where the
sheet ends. The step is felt rather than read: it stops the sheet reading as a
hole in the surface at the corners the frame turns, and it is the same trick the
cream used in the other direction. **Nothing is allowed to depend on it.** A
state that could only be told from this pair is a state nobody can see.

### Every ratio here was computed, and none was chosen

Computed from the values in this document's own frontmatter with the WCAG 2.1
relative-luminance formula, and confirmed against pixels sampled out of a
rendered screenshot at 1440 and 1920. A ratio nobody computed is not a ratio.

| | `canvas` | `canvas-deep` | `card` | `card-lift` | `paper` |
|---|---|---|---|---|---|
| `ink` `#eef2f7` | **17.31** | **16.30** | **16.70** | **15.22** | **17.64** |
| `ink-soft` `#b3bdcc` | **10.26** | **9.66** | **9.90** | **9.02** | **10.45** |
| `body` `#8d97a6` | **6.59** | **6.20** | **6.36** | **5.79** | **6.72** |
| `mute` `#6b7686` | **4.23** | **3.98** | **4.08** | **3.72** | **4.31** |
| `primary` `#2ce08a` | **11.25** | **10.59** | **10.85** | **9.89** | **11.46** |
| `control-line` `#586a89` | **3.56** | **3.35** | **3.43** | **3.13** | **3.62** |
| `frame` `#5c6b84` | **3.61** | **3.40** | **3.48** | **3.17** | **3.68** |
| `hold` `#5a6779` | 3.38 | 3.19 | 3.26 | 2.98 | **3.45** |
| `danger` `#ff5c47` | **6.37** | **6.00** | **6.15** | **5.60** | **6.49** |
| `hairline-strong` `#242c38` | 1.38 | 1.30 | 1.33 | 1.22 | 1.41 |

And the pairs that are not a foreground on a surface:

| Pair | Ratio | What it is |
|---|---|---|
| `on-primary` on `primary` | **10.53** | every Buy, Continue and Confirm label |
| `on-primary` on `primary-pressed` | **7.03** | the same label, pressed |
| `ink` on `hold` | **5.12** | the **On hold** chip |
| `paper` on `hold` | **3.45** | the hold's broken edge against its own fill |

**The whole text ramp clears 4.5:1 on every surface it lands on**, which the
cream register could not say: there, `body` was 5.20:1 at best and `mute` had to
be argued for at 3.25:1. Leaving the cream bought that, and it is the one thing
the change bought for free.

**Two rows are deliberately below 3:1 and each is answered rather than
excused.**

`hairline-strong` is decoration — the rule under the top bar, the divider
between tape rows, the outline round a card — and WCAG 1.4.11 reaches what
identifies a *control* or carries information in a graphic. A card is found by
what is printed in it. **This is the same argument the cream register made for
the same token, and it survives the register change word for word.**

`hold` measures 2.98 on `card-lift`, and it never appears there. A hold is drawn
on the board and nowhere else, so its only real number is **3.45 on `paper`** —
which is what makes a held rectangle tellable from a free one at a glance rather
than by inspection.

### The two tokens this register had to correct, and why

**`control-line` `#586a89`, because direction D's own mockup failed here.** That
mockup borders every size preset, the wallet control and the keyboard legend
with `#38424f`, which measures **1.68 to 1.95:1** across the five surfaces.
Those borders are the only thing saying an interactive area is there; 1.4.11
puts them at 3:1; they were at 1.68.

**This is the identical failure the cream register found once already** —
`hairline-strong` was carrying control borders at 1.63:1 until `control-line`
was introduced — and it came back the moment the palette was rebuilt from a
mockup. That is the argument for keeping two line colours as two names rather
than one token used carefully: the mistake is not knowing the rule, it is
reaching for the nearest grey.

The correction was measured, not picked. `hairline-strong` is HSL 216° at 22%
saturation; the new token holds the hue at 217° and the saturation at 22% so the
two read as one family, and takes the lightness up until the worst of the five
surfaces clears 3:1 with room — 18% → 44%, landing at **3.13:1 on `card-lift`**
and 3.62 on `paper`.

**`frame` moved for the same reason and by the same method.** D's mockup draws
the board's 2px frame in `#4d5a6b`, which is **2.44 to 2.82:1**. The frame is
the boundary of the largest interactive surface on the page — the board is
dragged on — so 3:1 reaches it exactly as it reaches a text field. Same family,
four points less saturation because it sits against artwork rather than against
chrome: `#5c6b84`, **3.17:1** at worst and **3.68:1** against the paper it
actually encloses.

Neither is a taste change and neither is reversible on taste. If a later pass
wants a quieter frame, the number to move is the lightness, and it does not go
below the row in the table.

### The focus ring

**The focus ring is the third thing the accent means, and it is the same claim.**
A focused control is a control the keyboard has selected. 2px of `primary` at a
2px offset, which puts the ring on the surface *behind* the control rather than
on the control's own fill: **11.25** on `canvas`, **10.85** on `card`, **9.89**
on `card-lift`, **11.46** on `paper`. WCAG 1.4.11 asks 3:1; this register clears
it more than three times over, where the cream register cleared it by a margin
of 0.81 at its worst.

Everything the cream register learned about rings still applies and none of it
is repealed:

**A focus ring never fades in.** Anywhere a colour transition covers
`outline-color`, the ring spends its first 160ms measuring under 3:1 while the
stylesheet still reads as `primary`. Transition the border, never the ring.

**A focus ring is never clipped.** The ring is drawn 2px outside the control at
a 2px offset, so any ancestor with `overflow` other than `visible` cuts it off —
`overflow-x: auto` included, and that clips vertically too. Every scrolling row
of controls carries four pixels of padding for the ring to live in, handed back
to the layout with an equal negative margin. **Three rows on this page have that
shape and all three carry the padding**: the wallet control, the size presets,
and the settled-purchase rail, which is the newest and therefore the one that
will be got wrong next.

**Two focusable things cannot take the ring, and both are answered rather than
excused.** A control whose real input is hidden — the dropzone's file input, the
fit chooser's radios — would put a ring on a one-pixel box, so the ring goes on
the visible box that stands for it. And the board is a canvas the size of the
viewport, so a ring at a 2px offset is drawn outside the window: its ring is
**painted into the board**, hugging the sheet's edge and clamped into the free
region so a board zoomed past its own edges still shows one.

### The selection, over artwork

The selection outline is `primary` over a `paper` core with a `frame` ring, so it
survives any artwork underneath without depending on contrast with it. **That
sandwich, not the green, is what makes the outline visible over an upload**; the
accent only says whose outline it is. Unchanged from the cream register except
for which three colours are in the stack.

### `mute` is a tone, not a text colour

`mute` `#6b7686` sets exactly two things: a disabled control's label, which
1.4.3 exempts as incidental, and one aria-hidden decorative glyph, which 1.4.11
does not reach. **Exempt is not a licence to be invisible**, so it clears 3:1 on
every surface it lands on and in fact clears 3.72 at worst. Everything the cream
register moved off `mute` — the all-caps labels, the form hints, the hover
card's metadata, the input placeholders — stays off it, on `body`, and the ramp
keeps four distinct steps.

### What checks this

**`design-tokens.test.ts` reads this document and fails the suite when the code
disagrees with it.** Not a linter and not a convention: it parses the
frontmatter above and asserts four things.

1. **Every colour in the frontmatter is the value `globals.css` actually sets**,
   by name, in `:root`. A token changed in one place and not the other is a
   failing test rather than a screenshot somebody notices later.
2. **`--paper` is the same colour in all five places that hold it** — the
   stylesheet, the server-side compositor, the board canvas, the confirmation
   preview, and the browser-side encoder that flattens an alpha channel. Five
   copies of one colour is how a register change half-lands.
3. **Every ratio printed in the tables above is the ratio those two values
   actually have**, recomputed from the frontmatter. This document cannot claim
   a number it does not have — which is the written rule "a ratio nobody
   computed is not a ratio", enforced instead of restated.
4. **The two typefaces named here are the two `layout.tsx` loads**, and no other
   family is loaded from anywhere.

### Each theme keeps its own faces, and that was measured rather than assumed

Light sets **Bricolage Grotesque** and **Karla**; dark sets **Space Grotesk**
and **IBM Plex Mono**. All four are self-hosted at build time, so switching
theme fetches nothing and the faces are already there.

**The question was whether swapping typefaces makes the toggle read as a
different site.** `scripts/theme-coherence.mts` answers it with a number: it
records the box of every text-bearing element in the chrome, stamps the other
theme, and records them again. Re-flow is the measurable cause of that feeling —
a toggle that only changes colour leaves every box where it was.

**Measured at 1440×900, animations frozen, on a board seeded with one sale:**

| Element | Δx | Δy | Δw | Δh |
|---|---|---|---|---|
| The wordmark | 0.0 | 0.0 | −2.8 | 0.0 |
| The offer line | **−65.7** | 0.0 | **+20.1** | 0.0 |
| The pixels-left counter | **−45.4** | 0.0 | **+20.1** | 0.0 |
| The sold-share pill | −11.9 | 0.0 | +9.4 | 0.0 |
| The selection readout | 0.0 | 0.0 | 0.0 | 0.0 |
| The Buy button | 0.0 | 0.0 | 0.0 | 0.0 |
| The interaction legend | 0.0 | 0.0 | 0.0 | 0.0 |
| The rail's head | 0.0 | 0.0 | +7.3 | 0.0 |
| A rail row | +7.3 | 0.0 | **+67.4** | 0.0 |

**What this says, stated against what an earlier run of the same script said.**
That run reported 0.0px across the whole top bar. It was measuring an EMPTY
board, where the pixels-left counter carries `sm:hidden` — the million is
already in the offer line beside it — so the counter had no box, was skipped,
and the largest drift in the fixed chrome was silently absent from the table.
The script seeds a known board now. **The top bar does re-flow.**

**Nothing moves vertically and nothing changes height.** Every Δy and every Δh
is 0.0, in the bar, in the panel and in the rail. The page's structure is
identical in the two themes; what differs is the horizontal position of
right-aligned content in one bar, because digits set in a monospace are wider
than the same digits set in Karla, and the counter is the longest run of digits
on the page.

**The decision, taken on those numbers: light gains a monospace for the NUMERIC
ROLE only.** Counters, prices, coordinates, the rail's rows, the hover price and
the empty wall's count are set in **IBM Plex Mono in both themes**. Labels,
prose, headings and the wordmark keep each register's own face — Bricolage
Grotesque and Karla in light, Space Grotesk in dark.

**The requirement picked the face rather than taste.** Zero drift needs
identical metrics, and identical metrics means the same face at the same size: a
*different* monospace in light would carry different advance widths and put the
drift straight back. IBM Plex Mono is also already self-hosted for the dark
register, so light gains a monospace for **zero additional bytes**.

`--font-numeric` is its own token and is not themed, beside `--font-mono` which
stays each register's own and sets the labels and the dense prose.

**What it fixed, measured the same way:**

| Element | Δx before | Δx after | Δw before | Δw after |
|---|---|---|---|---|
| The pixels-left counter | −45.4 | **−2.4** | +20.1 | **0.0** |
| A rail row | +7.3 | +7.3 | +67.4 | **0.0** |
| The offer line | −65.7 | −22.7 | +20.1 | +20.1 |

**The counter and the rail carry zero width drift now.** What remains is the
offer line, which is prose — `1,000,000 pixels · $1 per pixel · yours forever`
in the body face — and prose in two faces cannot be one width unless the themes
share a body face, which is what keeping each register's own typography exists
to prevent. It is 20.1px on one element, and it is the last irreducible drift
under this decision.

**Two things the measurement caught that no amount of looking would have.**
Its first run reported a clean 0.0px everywhere — because it measured "light" by
not stamping anything, this machine's headless Chrome prefers dark, and both
passes were therefore the dark theme. It reported a perfect result over a
comparison it had not made. It prints the computed typefaces first now, which is
how that was found and is the first line to read in its output. Its second run
reported 7.0px on the rail with the row's width unchanged — the signature of a
rolling track caught at two offsets rather than a re-flow. Every animation is
frozen before it measures.

## Type

**Space Grotesk** for display and prose, **IBM Plex Mono** for every number,
every label and every piece of metadata. Both from Google Fonts.

**The mono is not a decoration, and that is the whole difference from the
register before it.** The cream wall set numbers in tabular Karla, which is a
proportional face doing a monospace job. Here the mono carries a category:
**anything that is a measurement is set in it** — a count, a price, a
coordinate, a countdown, a signature fragment, an age on the tape — and anything
that is a sentence is set in Space Grotesk. A reader can therefore tell a fact
from a claim without reading either, which is what a dense surface has to do to
stay readable at all.

Tabular figures everywhere a number can change, as before, so digits do not jump
as they tick. In the mono that is free.

Hierarchy comes from size, weight and which face it is in — not from boxes and
rules. If something needs a border to be found, the layout is wrong first.

**Density is the point, and it has a floor.** The board's chrome runs 10.5px to
12.5px: the tape rows, the panel's readout, the labels, the status strip. That
is what the audience this wall sells to reads as "plugged into something" rather
than as "nothing is happening here", and it is a deliberate reversal of the
cream register's instinct that quiet is credible.

**But the floor does not move for the two places it was written for, and both
of them are load-bearing.**

**Anywhere a buyer types, the text is 16px, and that is a layout rule rather
than a taste one.** iOS Safari zooms the whole page when a field under 16px
takes focus, and a buyer cannot zoom back out by hand. On a page that must never
scroll, that would push the board off screen — so 16px on every input is what
keeps the no-scroll contract standing on a phone. Density does not reach inside
a field.

**And nothing in the purchase dialog is fine print.** Help, hints, counters and
error lines are 14px at the smallest and prose is 15px. The dense chrome belongs
around the board; it does not belong on the one screen where somebody is being
asked to part with money, and a register change is not a reason to shrink the
sentence that explains what paying does. The all-caps `label` is the single
exception, because a label is read as a marker rather than as a sentence.

So the ramp has two halves and the boundary is a doorway: **outside the
purchase dialog, dense; inside it, 14px and up.** A component that moves across
that boundary changes size, and that is not an inconsistency.

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

Everything else — the size presets, the zoom, the selection readout and price,
the wallet control and the Buy button — is one block of controls that the layout
puts in one of three places. **It is one set of controls in all three**; there
is never a second Buy button or a second Connect control for a screen reader to
find.

**It is two pieces, and they are separated by what they are for.** The presets
and the zoom are how a rectangle GETS selected, so they can never sit behind a
selection: they are always on screen. The readout, the wallet and Buy are about
a rectangle that exists, so they come up with one and retract with it.

### The two placements, and what decides between them

**Amended 2026-09-02: there are two now, not three, and neither of them floats.**
See *Nothing stands on the wall* below for the rule that collapsed them.

**Above a 200px letterbox: the rails.** The presets and the zoom become the head
of the left column and the panel is at its foot; the register stands up into the
right one. The threshold is the gap arithmetic in *No new column takes width
from the wall*.

**Everywhere else: one strip along the bottom**, holding the tools, the panel
and the register in a single row — stacked into rows at 390, where there is no
width to share. It IS part of the chrome the fit maths sees, which is the whole
change: the board is fitted above it, and its height does not move with the
selection, so the wall does not resize when somebody finishes a drag.

**288px is a ceiling now, not a column.** It was the width of a side panel that
took that much of the board's width whether or not anybody was buying anything;
that panel is gone. The number survived because what it measures survived: the
widest thing in the controls that cannot shrink is the Buy button at its
longest, `Buy these pixels — $1,000,000.00`, which renders at 255px, plus 16px
of padding either side and a 1px border. It is what a side rail stops growing
at, and below it the button's price takes a second line.

**The old crossover is retired.** This section used to put the decision at 5:4
and 640px — "which arrangement leaves a bigger board", a panel or a bar. What
decides now is the letterbox: 200px of it buys rails, and below that there is
one strip. 640px still decides one thing, and only one: whether that strip is a
row or three.

**Tab order is the board, then the controls, and it ends on Buy.** One DOM tree
serves all three placements, so one source order has to answer for all of them:
the canvas, the top bar, the settled register, the presets and the zoom, then
the panel with Buy last in it. That is the sequence a purchase takes — pick the
rectangle, price it, connect, press Buy — and it is why the right rail comes
BEFORE the left one in the markup while being drawn on the other side. The rails
are placed by CSS; nothing about the walk changes when the register stands up
into a column.

**What gives way as room runs out, in order, in every placement:** the zoom trio
first — a phone has a pinch, and the bottom sheet at that width has no room for
three more buttons — then the exact rectangle readout, then the per-preset
prices, then the wallet's own label, then the gaps. **Never** the pixel count,
the total, or the Buy button; those are what the controls are for. In a rail the
button's price wraps rather than the label shortening, which is the same rule
said in a column.

**The interaction legend is gone, and this is where it used to be first in that
order.** Three lines explaining the drag, the wheel and the keyboard, hidden
below `lg`, hidden again in a short landscape window, and — ever since the batch
that floated the panel — rendered by nothing at all: that change dropped it from
the tree and left the component, its stylesheet rule and its entry in the
theme-coherence guard standing. All four are deleted now.

**Half of what it said is still said where it belongs.** The keyboard half is on
the canvas itself, as its own `aria-describedby` — arrows, shift, alt-arrows,
enter, escape — read out the moment focus lands on the board, which is a better
home for it than a paragraph nobody using a pointer reads.

**The pointer half is one line now, and it is only there until it has been
followed.** *Drag on the wall to choose your pixels* — docked where the purchase
panel docks, in all three placements, and gone the instant a rectangle exists.
It replaced an open gap this document carried for one batch: with the legend
deleted, nothing on screen said a pointer could draw here, and a drag on a
canvas is the one interaction on this page that is not discoverable. Everything
else is a labelled button.

**What it deliberately does not say**: the wheel, the pinch and shift-drag —
somebody who reaches for those finds them, and a line that lists every gesture
is a line nobody finishes — and the presets, which are four labelled buttons on
screen and do not need a sentence pointing at them.

**It shares the purchase panel's box, and that is a layout requirement rather
than a place to put it.** The panel is two lines; this box has to be exactly as
tall, or the strip changes height the moment a rectangle is drawn and the wall
refits under the pointer that drew it. Rather than reserve blank paper the
second line says the offer — `unitOfSale`, the same sentence the selector
uses.

## Nothing stands on the wall

**Settled 2026-09-02 by the owner, and it supersedes the exemption this section
used to carry.** Every piece of chrome lives OUTSIDE the board's 2px frame, at
every viewport, in every state. The wall is then sized from what is left.
Covering artwork somebody paid for is no longer a cost this design is allowed to
pay, at any width.

### What it replaced, and what that was worth

The preset pill and the line of instruction under it used to stand ON the board
wherever the letterbox was too narrow for a rail. With the rail floor at 200px
that is **every viewport this design is looked at except an ultrawide**: 1280
leaves 47px of gap, 1440 leaves 49, 1920 leaves 148, and the owner's own
2495×1484 leaves 120. The cover was priced here at about **36,500 board pixels
at 1440×900**, and the overlay faded itself after two still seconds to make it
bearable.

Both are gone: the exemption, and the resting rule that mitigated it. A control
that disappears is worse than one that never had to.

### Where each thing goes

**Above a 200px letterbox — the `full` pair of rails.** Unchanged. Left: the
controls and the purchase panel. Right: the register ticking, and the standings.
The vertical chrome is the header alone, 34px, and the wall pays nothing for
either column because both are sized from a gap a height-limited board leaves.

**Below it — one strip along the bottom**, holding three segments in one row:
the tools (presets and zoom), the panel, and the register. The header stays a
single 34px line.

**At 390 that strip stacks**, each segment taking a full row. The bottom sheet
the phone already had is the middle row.

**The tools did not go to the header, and that is a deviation from the owner's
own sketch with a number behind it.** A second row in the top band costs the
board a band of its own — about 38px, which at 1440×900 is 5% of the wall's
area — while the tools sitting beside the panel in a strip that has to exist
anyway costs nothing. The invariant is the same either way. Moving them is one
`order` and one `position`.

### The strip's height does not move with the selection

**The panel and the instruction line are the same box**, and the idle half is
padded to the height of the selected half rather than left short. This is not
tidiness: the strip is measured into the chrome the board is fitted against, so
a strip that grew when somebody finished a drag would refit the wall **under the
rectangle they had just drawn**. `scripts/board-share.mts` reads the same chrome
in both passes and fails if it ever reads two.

The idle half spends that space on the offer — `unitOfSale`, the same sentence
the selector uses — rather than on blank paper.

### The register goes around the wall

**Settled 2026-09-03 by the owner**, after the strip came out holding three
things and reading as three things.

**Where there is letterbox, the register leaves the strip and runs down it.** It
falls down the left-hand gap, top to bottom, and climbs the right-hand one,
bottom to top: one sequence of purchases going around the wall like a sign. The
strip is left with the presets and the panel, and 24px of air between them.

**It is ONE ROUTE, and the continuity is arithmetic rather than two rolls
synchronised by eye.** The instant an item finishes leaving the bottom of the
left column is the instant it starts entering the bottom of the right one. A
point at distance `s` along the route is at `y = s` while `s < C` and at
`y = 2C − s` after that, where `C` is the column's height — which is a
REFLECTION plus a constant offset, not a delay.

**A delay was the first answer and it cannot work.** Two animations running in
opposite directions separate at twice the speed, so a delay makes them agree at
isolated instants and nowhere else. Measured, in that order: with a half-cycle
offset the join was `61.3 + 0.0` against an item 180.7px tall; with the
reflection and the offset, `68.6 + 86.6 = 155.2`; and once the LIVE label came
out of the column, `117.6 + 63.0 = 180.7` — exact.

**The label had to go, and that was a length problem rather than a taste one.**
It sat at the top of the left column and the right had none, so the two halves
of the route were different lengths and the join could not close by
construction. The columns now run flush from under the header to the strip. The
horizontal layout still carries the label, where the register is a strip rather
than a route.

**The right-hand column is the same belt, not a second one.** Same rows, same
order, `aria-hidden`, no head, no tab stop: one register drawn twice. The
reflection is `scaleY(-1)` on the scroller with each row flipped back, so the
pictures and their lines read the right way up.

**Each item is the purchase itself, at its own proportion.** Not cropped, not
squared: the column's width is the cap and a height cap of 160px keeps a tall
rectangle from taking the column to itself. A 173×16 is wide and short, a 31×169
is tall and narrow and centred, a 6×40 comes out 24×160 — scaled up because for
a portrait the height cap is what binds, which is the legible minimum arriving
from the same two rules rather than from a special case. **One honest limit:** a
1250×1 purchase is 0.1px tall in a 119px column, so it is held to 2px. That is
the one place the ratio is not kept, and the line under it still says 1250 × 1.

**The size is written under the artwork rather than beside a flag.** The board's
payload may not say whether a rectangle has bytes — `board.test.ts` refuses such
a flag by name — so the picture is painted as an overlay and the size sits
beneath it: a rectangle with artwork covers its size, one without leaves its own
tone showing with the size across it. **The caption is not on the ticker for the
same reason**: a caption is content, and content is fetched on demand. The hover
pause is built; the words are one `/api/blocks/<id>` away and are a batch of
their own.

**The threshold is 80px of gap**, measured against a board fitted under the
header AND the strip, because in this layout the strip stays. It reaches **1280
and up**; at 390 there is no letterbox and the register stays along the bottom.
Where the RAILS are on, the register is already a column and none of this
applies.

**1280 has 119 pixels there, not the 47 usually quoted** — that is the gap
beside a board fitted under the header alone, the right question for the rails
and the wrong one here. Nothing about the wall changes either way: the strip is
the same height with the register in it or out of it.

**What the guards say.** `board-share.mts` asserts at all seven viewports that
nothing overlaps the board's box and that each column is inside its own gap. At
2495 it also adds the join up: what is visible of one item at the bottom left
plus what is visible of it at the bottom right must equal its own height, within
two pixels. Three captures a second and a half apart are what a person looks at;
the arithmetic is what fails a build.

### The strip, and the purchase panel that stopped being a card

**Settled 2026-09-03**, from two candidates shown side by side on a local server
at both widths the owner judges at.

**One baseline, four things, left to right:** the credit pill, *What this is* ·
*How to buy* as small quiet links in the counter's own mono, the segmented
control (`Freehand 10 20 50 100 │ − Fit +`), and the presence pill riding with
it. Then the purchase panel, at the right.

**The panel's right edge lands on the wall's own right frame.** `--wall-right` is
published by the canvas — the only thing that knows where it painted — and the
strip carries it as a grid TRACK rather than as a margin on the panel. That
distinction is the whole of it: a margin moves the panel after the grid has
sized every track, so it walked 203px over the tools at 1280. As a track, the
tools give way for it the way they give way for anything else, by scrolling.

**Measured, after:** the panel's right edge is exactly on the frame at 1920 and
above, with 24px of clear paper between the tools and the panel at **every**
width from 1280 up, and the strip is 81px at all of them. Below 1600 the panel
sits at the strip's own right padding instead — buying the alignment there costs
the tools 134px of their track, which would scroll the presets down to
*Freehand* and nothing else.

#### The panel is an outline, and the white receipt is reversed

**This reverses "the first exception, and why the receipt is not a colourway",
settled earlier and undone 2026-09-03.** That exception made the purchase panel
white in both registers, re-declaring the light palette on the box itself, on
the argument that a receipt is white — and it carried its own measured contrast
table against that white.

Against a dark wall it read as **a card floating on the page** rather than as
part of the strip, which is the thing the owner asked to be rid of. The panel
now takes the register's own tokens like every other element: **no fill, one
`hairline-strong` rule, the strip showing through.** Both contrast tables in this
document apply to it unchanged, which is the half of the reversal that costs
nothing — the old exception needed a table of its own precisely because it was
the one box outside the system.

**What was NOT reversed:** the Buy button stays the register's own accent. It is
the fifth of the accent's five permitted places, and a green Buy in the dark
register is the same claim it is everywhere else.

### Buttons: three roles, one shape

**Settled 2026-09-03**, after a count: the site had five different ideas of what
a button is — the preset pills, the header links, the Buy button, Connect
wallet, and the theme switch each carried their own radius, height and type
size. There are three roles now, and they differ by **weight**, never by shape.

| Role | Fill | Border | Weight | Where it is used |
|---|---|---|---|---|
| **Primary** | the register's accent | none | 700 | **Buy these pixels**, **Connect wallet** — and nowhere else. One page, one thing being asked for; two of them because a purchase genuinely has two steps |
| **Secondary** | `--card` | 1px `--control-line` | 600 | The segmented control's presets and zoom, the theme switch, the buttons on the prose pages (*Back to the board*, *Open the card*, the pager) |
| **Tertiary** | none | none | 600 | *What this is* · *How to buy* at the foot of the strip, and every link inside prose that is not a destination off-site |

**Radius, height and typography are tokens and nothing overrides them** —
`--btn-h`, `--btn-r`, `--btn-fs`, `--btn-fw`, `--btn-family`, `--btn-tracking`.
The block that applies them is **unlayered**, so a Tailwind utility in a
component's class list loses to it: that is what makes "the same button" a fact
rather than an intention. **Padding is allowed to differ** — a `+` and *Connect
wallet* cannot carry the same horizontal space and still be the same control.

**Height is 30px for every one of them**, which is why swapping direction moves
nothing in any bar: the header is 34px and the strip is 81px in both.

#### The shape is the pill, and it was chosen against a printed one

**Settled 2026-09-03.** `--btn-r: 999px`, the UI face at 12.5px, no tracking,
and a 10px corner on the panel. The candidate it beat was a stamp — 3px corners,
the numeric face, `0.02em` of tracking — which is arguably closer to the register
the rest of this design is in, and the owner looked at both at 2495 and 1440 and
took the pill.

**Both were the same 30px tall**, which is why the choice moved nothing: the
header is 34px and the strip 81px either way. The loser is deleted, along with
the attribute that carried it. **A switch left in after a decision is a second
design nobody is testing.**

### The vertical chrome budget

**≤ 115px without rails, set 2026-09-03 and it is a measurement rather than a
round number.** A 34px header plus an 81px strip, with the board's own inset
counted separately. **≤ 34px with the rails on**, which is the header alone. **≤
220px at 390**, which is a different question wearing the same units — the board
there is fitted by its WIDTH, 370px of free width against 844 of height, so
vertical chrome costs it nothing at all and the number is a sanity ceiling
rather than a claim about the wall's share.

**Every control on this page is 26px tall, and a focus ring is why.** At 30px in
a 34px header a button sits two pixels from the top of the bar — and a 2px ring
at a 2px offset needs four, so the Connect button's ring would have been drawn
at `y = −0.5`, off the top of the window. Not clipped by a container: clipped by
the screen. The alternative was a 38px header, which is four pixels of wall at
every width. The phone's strip gave back the same four pixels the segmented
control had just taken for the same rule, so its budget went 220 → 224 → 220
inside one batch and neither number was chosen.

**It was 127 earlier the same day and 130 before that.** The twelve came from
the readout's second row folding into its first when the strip was redrawn on
one baseline: the panel is one line plus a warning where it was two lines plus a
warning.

**Why the number changed, and why it did not change further.** It was 130 with
four pixels of slack in it. The header and the strip were both rebuilt on
2026-09-03 into three zones each, and the measurement afterwards is 127 — the
same as before, because the reorder moved things rather than removing them. The
owner's estimate going in was ~98. It is not 98, and the arithmetic says why:
the strip's height is the purchase panel's, and the panel is a 46px readout over
a refusal that is allowed **two lines**. Clipping the refusal to one line buys
14px of wall and costs a buyer the reason their Buy button is dead. That is the
trade this design does not take, so the budget is the honest 127 and the guard's
ceiling is exactly it — no slack, so the next thing that grows the chrome has to
say so out loud.

**The rule that outranks the number** is *nothing stands on the wall, at any
width*, settled 2026-09-02. The old ≤60 idle belonged to the regime where the
preset pill and the instruction line stood ON the board between selections. It
does not survive that rule and it is not what this budget is measured against.

**It is one number now where there were two.** The old budget was 60 idle and
140 with the panel open, because the panel came and went. Idle and selected
measure the same, and a difference between them is a bug rather than a second
budget.

### The header and the strip, in three zones each

**Settled 2026-09-03.** Both bands are grids of `1fr auto 1fr` rather than flex
rows, and that is what makes the middle of each trustworthy.

**The header.** Left is the wordmark and nothing else. Centre is the one figure
the page turns on — `712,872` in 22px mono with `PIXELS LEFT` under its own
tracking and `· 28.71% sold` as a small suffix, so the share qualifies the count
instead of arguing with it. Right is what a reader reaches for, in the order
they reach: *What this is*, *How to buy*, the theme switch, and **Connect
wallet** hard against the edge with the accent's own weight. `1 online · N
views` has left the bar — the count is on `/stats` with its history, and the
element that beats to say this browser is here rides in the register, which is
the one piece of chrome that exists in every layout.

Measured before: in a 2495 window the counter sat at x=1617, because a flex row
with `ml-auto` centres on what the two sides left over, and the wallet control
changes width the moment it holds an address. After: x=1115, width 271, centre
1250 against a window centre of 1247.

**The strip.** Presets and zoom on the left, the purchase panel centred, and
nothing else on it. The panel is **560px** — the width its own widest content
needs, `1,000,000 pixels · $1,000,000.00` beside `Buy these pixels —
$1,000,000.00` — down from the 980px it took at 2495 when it was given the
strip's slack. Inside it the readout is left, the Buy button right, and the red
refusal is **on its own line under both**, which is what stops a long sentence
setting the panel's width.

**Where the centring gives way, and the arithmetic that decides it.** Centring a
560px panel on the window needs `(V − 560) / 2 ≥ 534` — the tools are 510 wide
and the strip's padding and gap are the rest. That holds from **1920 up** and
fails at 1440 and 1280, where the panel sits to the right of the tools instead,
still 560 and still not truncating. The alternative was a panel narrow enough to
centre at 1440, which is 372px, and at 372 the readout the panel exists to show
is clipped. **Nothing wraps and the strip stays 93px at every width**, which is
the property that actually matters: the tools carry `min-width: max-content`
above 640 because a `1fr` track's automatic minimum is min-content, and the
preset pill wraps by design — without it the strip grew to 123px at 1280.

### What it cost the wall, measured before and after

`scripts/board-share.mts`, 2026-09-02, the board's own box as a percentage of
the viewport:

| Viewport | Before the rule | After it | After the strip was redrawn, 2026-09-03 |
|---|---|---|---|
| 1280×800 | 1129×724 · **79.8%** | 1024×657 · 65.7% | 1043×669 · **68.1%** |
| 1440×900 | 1285×824 · **81.7%** | 1181×757 · 69.0% | 1199×769 · **71.1%** |
| 1920×1080 | 1567×1004 · **75.9%** | 1462×937 · 66.1% | 1481×949 · **67.8%** |
| 2495×1484 | 2198×1408 · **83.6%** | 2093×1341 · 75.8% | 2112×1353 · **77.2%** |
| 2560×1440 | 2129×1364 · **78.8%** | 2024×1297 · 71.2% | 2043×1309 · **72.5%** |
| 390×844 | 374×241 · **27.4%** | 374×241 · 27.4% | 374×241 · **27.4%** |
| 3440×1440 (rails) | — | 2170×1390 · **60.9%** | 2170×1390 · **60.9%** |

**The third column is the twelve pixels coming back**, between 1.3 and 2.4
points of wall at every banded width, from the purchase panel folding onto one
line. The phone is unchanged because its board is width-limited, and the rails
layout never paid anything.

**The phone pays nothing** because its board is width-limited. **Everything else
pays between 7 and 14 points**, and that is the price of the rule rather than a
regression to fix.

**THE LEVER THAT WOULD GIVE MOST OF IT BACK, recorded because it is the owner's
to pull and nobody else's.** A rail costs the wall nothing — it stands in a
letterbox no scale could reach — so a viewport with rails is strictly better off
than one with a strip. At 2495×1484 the letterbox is 120px and at 2560×1440 it
is 187, both under the 200px floor set by *a rail only exists if it can be
read*. With a 120px floor the wall at 2495 would measure about **85.4%**, which
is larger than it was before this change. That reverses a decision the owner
took on evidence, so it stays written down rather than taken. **At 1280 and 1440
nothing helps**: there is no letterbox there to move into.

### Why a budget and not a percentage

The obvious guard is "the board is at least N% of the viewport", and it does not
survive the arithmetic. The board is 1250×800, an aspect of 1.5625; a 1920×1080
viewport is 1.778. They do not match, so the board can never fill it: with **no
chrome at all** the ceiling at 1920×1080 is 87.9%, which leaves an 18px budget
for everything if the threshold is 85%. A percentage threshold encodes the
monitor as much as the design. What the design controls is how much VERTICAL
room the chrome takes; that is what is guarded, and the percentages are
reported.

### The inset

**8px on all four sides, plus the 2px frame drawn immediately outside the
paper.** It dropped from 20 when the budget dropped, and the argument holds:
against a 130px budget, 20px top and bottom would be a third of it spent on
clear paper. Eight still reads as hung rather than cropped.

### What the guards say

**`scripts/board-share.mts`** reports the table above and asserts two things at
every row: the vertical chrome is inside its budget, and **no piece of chrome
overlaps the board's own box**. The second is checked on the BOX rather than on
one axis — a thing beside the board and a thing on top of it differ in exactly
that — and it is the mechanical form of this section's title.

**`purchase-e2e.test.ts`** asks the same question in a browser, at 1280, 1440,
1920, 2495, 390 and 3440, against a real sale seeded across the top of the wall.
**And it validates itself in the negative**: the last pass puts the tools back
over the board by hand and requires the detector to say so, because a geometry
test that has never been seen to fail may be comparing two empty boxes.

## No new column takes width from the wall

**The board is the product and width is what it is short of.** Every layout
question on this page eventually becomes the same one — where does this new
thing go — and the answer has to be settled once rather than argued each time,
because each argument on its own always sounds affordable.

**A new column comes out of the board's width. A new row comes out of its
height. On a 1250×800 board fitted into a landscape window, width is the
limiting dimension far more often, and a column costs the board more than a row
of the same size does.** So:

**Nothing new takes width FROM the wall.** Not a second panel, not a rail of
ticks, not a scoreboard, not a filmstrip. The one column that exists — the
controls panel — is 288px, and that number is measured rather than reasoned:
the widest thing in it that cannot shrink is the Buy button at its longest,
`Buy these pixels — $1,000,000.00`, which renders at 255px, plus 16px of
padding either side and the panel's own 1px border.

### The amendment: the letterbox is not the wall

**The norm used to read "nothing new goes BESIDE the board", and that sentence
was wider than the argument under it.** The argument is about width the board
would otherwise have used. It has none to spare in a window shaped like the
board — but the board is **1.5625:1** and a desktop window is 1.78:1 or wider,
so once the board has taken every pixel of height the budget leaves, there is
width beside it that **the board cannot use at any scale**. Contain, not cover:
growing into that width would mean growing past the height that is already
gone.

That leftover is not the wall's. It is the ground the sheet hangs on, and the
chrome is allowed to stand in it. **The rule is the guarantee, not the
geometry: the board is never smaller because a rail is there.**

**So the chrome moves into side rails exactly when the leftover is wide enough
to hold it, and nowhere else.** Below that it is a bar on top and one strip
along the bottom — see *Nothing stands on the wall*.

**AND RAILS COME IN PAIRS OR THEY DO NOT COME.** A column down one side and an
identical empty gap down the other puts the wall half a rail off the middle of
the window, which is what the owner saw at 2495×1484 and what a single-sided
first build deserved. Both sides carry the same width or neither exists, and
the board is centred in the VIEWPORT rather than in whatever is left of it —
asserted in `rails-boot.test.ts` and measured in the rendered page at 1920,
2495 and 2560, where the board's two margins agree to within a pixel.

**There is ONE pair, and one gap decides whether it exists.** The gap is the
letterbox a board fitted under the header alone leaves, because with the rails
on the register has left the bottom of the window:

| Kind | From | Left rail | Right rail |
|---|---|---|---|
| **full** | 200px | the controls and the purchase panel | the register and the standings |
| off | — | the strip along the bottom carries all of it | — |

**The `tools` pair is gone**, and with it the 108px floor it stood on. It was a
column for the presets alone, added when the alternative was an overlay on the
wall; the alternative now is a strip that costs the same height whether the
presets are in it or not, so a middle kind buys nothing. **200 is what a rail
needs to be READ** — `100×100` rather than `100`, and a settled row on one
legible line — which is the floor the owner set after seeing a 120px rail in
production.

### The threshold, and the arithmetic that sets it

The gap on each side, once the board has taken the height a header-only chrome
leaves it:

    gap = (viewport width − 2×10 inset − 1.5625 × (viewport height − 34 header − 2×10 inset)) / 2

The inset is 10 rather than 8 because `BOARD_INSET` is the clear paper plus the
2px frame drawn inside it, and the fit maths has always counted both.

**Rails are on when `gap ≥ 180px`, and the rail is `min(gap, 288px)` wide.**

**180 is measured, and the measurement is a refusal to overflow.** The rail was
pinned to 180px in the rendered page, idle and with a purchase panel open, and
every element inside both rails was asked whether its `scrollWidth` exceeded its
`clientWidth`. Nothing does. Three things had to change before that was true,
and each is a decision rather than a squeeze:

- **a settled row's age and its proof wrap onto a second line** where they do
  not fit, because the eight characters of signature were being cut and a
  truncated proof is not a proof;
- **a standings row puts its size and its amount on two lines**, the rank
  spanning both, because `147 × 147` beside `$24,990` is 136px of a 140px grid;
- **the Buy button's price takes a second line** rather than the button taking a
  shorter label. The shed order never reaches that button: what it says is not
  allowed to change, only how many lines it says it on. **And the readout stops
  truncating** — it is `truncate` in a horizontal bar, where a readout that grew
  would push Buy off the end, and in a column there is nothing to its right to
  push. The first build of it read `100 pixels  $…`, which is the total price
  giving way, and the total price is one of the three things that never does.

**288 is the ceiling** and it is this document's own number: the width at which
the Buy button gets its longest label, `Buy these pixels — $1,000,000.00`, back
on one line. Past it the extra stays wall.

**The board never pays for the rail, and this is why rather than a hope.** The
rail is sized to the gap a **height-limited** board leaves, so the board is
still height-limited with the rails there, and the height it is fitted to is
larger than before — the settled register left the bottom of the window, so the
vertical chrome is the 34px header alone. A board fitted to more height is
wider, not narrower. Where the gap is wider than 288 the rail stops growing and
the board is still height-limited. There is no branch in which it shrinks, and
`purchase-e2e.test.ts` asserts it in the negative at a viewport where the rails
are on.

### Which viewports this reaches, measured

Every board figure below was read off `data-board-rect` — the rectangle the
renderer actually painted, frame included — by `scripts/board-share.mts`.
Re-measured 2026-09-02, after the floor moved to 200 and the strip replaced the
overlay:

| Viewport | Gap each side | Rails | Board |
|---|---|---|---|
| 1280×800 | 47.2px | off | 1024×657 · 65.7% |
| 1440×900 | 49.1px | off | 1181×757 · 69.0% |
| 1920×1080 | 148.4px | off | 1462×937 · 66.1% |
| 2495×1484 | 120.3px | off | 2093×1341 · 75.8% |
| 2560×1440 | 187.2px | off | 2024×1297 · 71.2% |
| 390×844 | none | off | 374×241 · 27.4% |
| 3440×1440 | 627.2px, capped at 288 | **full** | 2170×1390 · 60.9% |

**WITH THE FLOOR AT 200, ONE VIEWPORT IN THIS TABLE HAS RAILS.** 1920 leaves
148, 2495 leaves 120 and 2560 leaves 187 — all short of what a rail needs to be
read. That is the consequence of *a rail only exists if it can be read*, taken
on evidence after a 120px rail in production, and it is why the strip is the
common layout rather than the exception.

**Where the door actually is.** On 16:9 the pair begins at **2770×1558** —
computed by walking the heights against `railLayout`, not by a formula — and
earlier on wider aspects: 3440×1440 clears it with 627px of gap, which is capped
at 288.

**The lever, and it is the owner's.** Every viewport in the top six would be
strictly better off with rails than with the strip, because a rail stands in a
letterbox no scale could reach and the strip does not. At 2495 a 120px pair
would put the wall at about **85.4%**, above where it was before any of this.
What that costs is the readability floor. Recorded, not taken.

### What each rail carries

**Left, top to bottom:** the size presets and the zoom, which leave the strip
and become a column; then the purchase panel, at the bottom. The panel's
contents come and go with the selection and it costs the board nothing either
way.

**Right, top to bottom:** **LIVE**, its pip and the count of who else is here;
then the settled-purchase register, vertical — a thumbnail, the size, the
amount and how long ago, newest first; then the five biggest rectangles on the
wall, which is `/stats`'s standing in short form. **It carries no total.** The
bar's rule reaches every rail on this page: a per-rectangle price is a fact
about a rectangle, and a sum of them would be a forecast.

**The register is a ticker in both, and this reverses a decision made one batch
ago.** That decision said a strip rolls because it is too narrow to hold its
rows and a column is not. The owner overruled it, and the reason is the one this
rail was built on: *the thing that moves fast IS the evidence*. A register that
has stopped is a list. So it translates by half its own width along the bottom
and by half its own height down the side, the seamless duplicate stays in both,
it **pauses on hover and on focus**, and `prefers-reduced-motion` stops it
outright and drops the duplicate with it. With nothing settled the sentence that
says so is the only item, and it does not move.

**Its speed is per row rather than per rail** — `3.2s` a row, set from the row
count — because a column of twenty rows and one of three, translated over the
same duration, are two different reading speeds.

**A rail under 150px drops the row's thumbnail.** The 108px floor was measured
against the LEFT rail's contents and the right one holds the register, whose
rows are wider: at the owner's 2495×1484 the gap is 120px and the first capture
came back reading `26 × 3`, `$988`, `capt…7K`, every line cut. The thumbnail is
the widest fixed cost in a row and the only decorative part of it, so below
150px of rail the figures take its 43 pixels. A container query, because what
decides is the rail's width and no viewport dimension names it.

**The header keeps three things when the rails are on:** the wordmark, the
count of what is left, and the theme toggle beside the way to the questions.

### What this norm has already deleted, and what the amendment does not restore

**Direction D's own measuring rails.** The mockup this register comes from puts
a 46px column of ruler ticks on each side of the board — `0`, `1250 × 800`,
`800`, `fit`.

**Half of that argument has just been repealed and the other half has not.**
The half that is gone is the width: 46px would fit in the gap at 1920 and at
2560 and cost the board nothing, so "they cost the wall 92px" is no longer
true where the rails live. What stands is the half that was never about
pixels — **three of those four labels are already said in the top bar and the
fourth is the state of the zoom control sitting next to it.** A rail that is
free is still not worth a reader's attention if what it says is already on
screen. They stay deleted on that sentence alone, which is the honest reason
they should have been deleted on all along.

**Both halves of this are the owner's to reverse.** The rails came back because
they were asked for; the tick columns can come back the same way.

### The one exception, and its size

The board's own **8px inset on all four sides**, and the **2px frame** drawn
immediately outside the paper within it. That is not a column; it is the clear
space that makes the sheet an object rather than a background, and it is
subtracted on every side in every layout.

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

**And one number that is not a figure: what sold today.** It is a rate rather
than a standing total, so it reads as a sentence under the four rather than as a
fifth cell in their row — and it names its own window, *since midnight UTC*,
because "today" without one is a different number for every reader. **It says
zero out loud**, which on most days is what it will say: hiding it until it
flatters is the same mistake "X online shows from one" already refuses. It is on
`/stats` and nowhere else, by the mechanism the money total uses — `boardStats`
is not told it, so the board cannot print it.

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

## The page one rectangle gets

**`/b/<id>`, and it is the only surface here built to be forwarded.** A buyer
owned a rectangle and had nothing to link to: an API route for machines, a
hover card for somebody already on the wall, a card image with no page under
it, and a redirect out. This is the page whose subject is one rectangle, and
`docs/marketing-fomo.md` carries the round that argued for it against
seventeen alternatives.

**Nothing on the board links to it.** The board is a wall, and a wall does not
need a page per brick. The receipt offers it the moment a purchase settles,
which is the one minute the buyer is looking for something to post.

**It is four numbers, an amount, a date, eight characters of signature, and the
buyer's own words.** Every one of them a fact about the rectangle. The rule the
standings keep reaches here unchanged and matters more: **no holder is named**,
on the most forwarded page this site has.

**The link is reached through `/go/<id>`, never as its own address** — the same
indirection the hover card uses, and what makes the click count on this page a
real number rather than a decoration.

**The card it unfurls into is the one that already existed.** `og:image` points
at `/api/blocks/<id>/card`; nothing new draws an image and nothing is stored.

**And it hands over a badge.** A small SVG, drawn and served by us, that the
buyer pastes where their picture already lives — an `<a>` and an `<img>`, shown
as text on the page for them to select, with no copy button and no second
client component. **Nothing on the badge is user-authored**: no caption, no
link, no name, no signature, so the question of whether a stranger's text is
escaped correctly into markup we hand somebody is a question this design does
not have. It references nothing and runs nothing, and the route says so in a
`Content-Security-Policy` as well as in the document.

**Nothing will ever say whether the badge worked**, because there is no
referrer in this schema and `migrations/014_visits_and_clicks.sql` puts one on
the list of columns that may not be added without a decision the owner takes on
purpose. That cost is written here rather than discovered later.

**A takedown removes this page and never the sale.** It publishes exactly what
the card publishes, so a hold has no page and neither has a rectangle whose
content is gone — a page whose card is a permanent 404 is a link that unfurls
blank forever. The register still carries the settlement and the standings
still count the pixels, because those are about the sale and this is about the
artwork.

## States

| State | How it reads |
| --- | --- |
| Free | The paper's own near-black. Ruled, but only above the zoom where a wall pixel is about eight screen pixels; at fit it is plain paper |
| Hovered | A one-step lift towards `ground-lift` and a one-line TOOLTIP, no colour change. The full card is a CLICK — see *Two gestures* below |
| Selecting | `signal` outline with marching ants over a dark core and a `paper` ring, so a drag never looks like a placed block and never depends on the artwork under it |
| Refused | The offending block outlined in `danger`, the selection outlined in `danger`, Buy disabled |
| Held | **Its own value, not a variation on the sale's, and drawn by the canvas rather than baked into the wall.** Opaque like a sale, because those pixels are genuinely not for sale right now — `hold` `#5a6779`, **3.45:1 against the paper**, plainly lighter than the paper and plainly cooler and flatter than artwork, so the two are told apart at a glance and not by inspection. Over it, a `paper` hatch at 45° — the one angle neither tier of the ruling uses — and a broken `paper` edge where a sale carries an unbroken one. Wherever the block is big enough to read one it carries its own chip, **On hold**, in `text` on `hold` at **5.12:1**, in the place a sold block puts its caption. A hold **you** started adds the `signal` ring, because it is still your selection and the only held rectangle you can act on. The countdown stays live in the control it gates. A hold never shows an upload |
| Sold | **The buyer's bitmap, nearest-neighbour at every zoom** — out of the wall at the overview, and out of its own stored bytes once the zoom is close enough for the ruling — with a 1px `paper` edge wherever there is room for one. The artwork is the treatment. The bitmap is composed into the wall at the size the rectangle was bought at: enlarged with nearest neighbour so pixel art stays hard-edged, reduced with a real filter so a photograph stays the photograph the buyer approved |
| Sold, loading or missing | Solid `#1b2230`, edge to edge, 1px `paper` edge. This is the **fallback**, not the sold treatment: what the rectangle shows before the wall arrives, and what it keeps if its own bytes never decode. It is deliberately *lighter* than the paper rather than darker, because on a near-black wall a darker fallback is indistinguishable from a hole. Every sold rectangle gets it under the wall on every frame until the wall has decoded, so a sale reads as taken from the first paint. An upload with an alpha channel is composited onto the paper inside its own rectangle rather than onto this, and never onto the ruling — a sold rectangle is never ruled |
| Taken down | Exactly like free, and it is **not** free. The content is gone from the wall and from every endpoint; the rectangle is still sold, still its owner's, and the selector still refuses it. Nothing on the board says a takedown happened, because a takedown is about what is displayed and the board is not a moderation log |

## Two gestures on a sold rectangle, and they say different amounts

**Since 2026-09-03, and it reverses 2026-09-02.** Resting on a sold rectangle
shows **one line**: the buyer's caption, or `W × H · $price` where there is no
caption, or *on hold mid-purchase* for a reservation. Clicking it opens the
**full card** — picture, caption, link, size, price, state.

The day before, hover was to show nothing at all, on the correct grounds that a
card floating under a moving pointer covers artwork somebody paid for and covers
a different rectangle every time the mouse moves. What changed is the reading of
the objection: it is about **area**, not about hovering. The original page has
always answered a hover, it is the gesture every visitor arrives knowing, and a
wall that answers nothing until you commit to a click reads as inert.

So the tooltip is held to what the objection allows. **One line, never wider
than the 224px card it replaced, no pointer events, no delay in either
direction.** What it may cover is its own footprint and nothing past it. A
tooltip that waited would arrive after a reader sweeping the wall had already
moved on.

**The card takes pointer events, which the hover card never did**, and that is
most of what clicking buys: the card carries the buyer's link, and for as long
as it only existed under a pointer passing over it, that link could not be
followed by anybody. It closes on Escape, on a click on bare wall, on its own
close button, and it hands focus back to the board when it goes.

**A tap is a click.** A touchscreen has no hover, so a tap on a rectangle opens
the card and a tap on bare wall places the selection — which is the only way
anything gets bought on a phone.

**Empty is a state, and it is the one this wall spends its first day in.**

The board draws its statement in the middle of the sheet, in mono, and it is
three lines and nothing else:

> **1,000,000**
> pixels. none taken yet. every one of them is for sale on its own, at a
> dollar, and the price is the same for the last one as for the first.
> `DRAG ANYWHERE TO START`

The number is `statement` — mono, 34px, 700, tabular — and it is
`TOTAL_PIXELS`, the board's own two dimensions multiplied. The sentence under it
is `text-2` at 12.5px in a 420px measure. The third line is not a button: it is
`signal` text in a `signal` hairline box, because **the whole board is the
control** and putting a button next to it would offer a second, worse way to do
the thing the wall is already asking for.

**And the top bar does not repeat it.** The offer line already opens with
`1,000,000 pixels`, so the remaining count gives way while the two numbers are
the same one — the rule is in `BoardCounters` and it predates this register.

**The register along the bottom has its own empty state** and it is one line:
*nothing settled yet · the first row lands here*. The rail keeps its height, so
the board does not resize the moment the first purchase arrives.

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
all on the shared ease.

The Buy button lifts 2px on hover and presses to 0.97. Nothing else lifts.

**Two continuous animations, and this register added the second one
deliberately.** The first is the selection's marching ants, because a drag in
progress is the one thing that genuinely differs from a thing at rest. The
second is **the settled-purchase rail**, which rolls at `46s linear infinite`,
and the argument for it is the argument for the whole register: *the thing that
moves fast is the thing that constitutes the evidence.* A row cannot scroll past
without carrying a signature, so the faster the wall fills, the more proof is on
screen. It is not a casino's motion — a wheel that can take it back — because
nothing on the rail can ever be reversed, which is precisely why it may be shown
moving.

The **LIVE** pip beside the rail pulses at `1.6s`. That is the third animation
and the last; anything after it needs an argument in this document before it
needs code.

**`prefers-reduced-motion` stops all of it — the ants, the roll and the pip.**
The stylesheet reaches every animation and transition on the page, and it cannot
reach the marching ants: those are an interval redrawing a canvas, so the board
asks the media query itself. The dashes still draw and the rail still shows its
rows; they simply stop moving, and the rail becomes what it is on `/stats` — a
list somebody scrolls.

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

**No copy promises revenue** — with one named exception, taken by the owner on
2026-09-01 and recorded in `DECISIONS.md`. On the board it is unchanged: a total
is not printed, implied, or counted towards, and the mechanism is that the
board is never handed the number. On `/stats`, and only there, what has been
taken is printed against what the whole wall costs. See "What only `/stats`
says" above for why those are different contracts rather than the same rule
applied twice.

## Settled colour decisions

Decisions already taken, recorded so a later contrast pass does not spend its
time reopening them.

**`--danger-line` stays as it is** — **2.02:1** against the card in this
register, where it measured 1.79:1 in the cream one. It encloses error *prose*,
not a control, so WCAG 1.4.11 does not reach it: that rule governs boundaries
that tell you where an interactive area is, and this boundary tells you nothing
the words inside it do not already say. The error is communicated by the text,
which is `--danger` at **6.15:1** on the card it sits on. A saturated rule around
every error message would shout a second time and buy no legibility.

If a future pass measures it and finds it failing, the finding is correct and
the rule still does not apply. Leave it.

**`--hairline-strong` stays as it is** for decorative rules, and control
borders use `--control-line` instead. **Do not solve a control's contrast by
moving decoration** — which in this register means lightening it rather than
darkening it, and is the same mistake either way up. It has now been made twice:
once on cream, and once again in the mockup this register came from. The two
tokens exist so the third time is a failing test instead.

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
developer product can choose its own register rather than inheriting one, and
that one saturated colour should carry every primary action. The first half of
that argument was taken literally once — this document specified a warm cream
wall for four months — and the register has since gone the other way on
evidence about who the wall sells to. What survived both is the second half.

The graph-paper-versus-solid rule and the zero-radius rule were taken from a
Pinterest analysis in the same MIT-licensed collection, and are likewise
reimplemented rather than copied. The first of the two has since been
**replaced** — a per-pixel board cannot say "ruled means available", so what
says it now is the paper's own near-black, and the ruling has become a navigation
aid that appears only at close zoom. See "The one rule that outranks the
others". The zero-radius rule stands unchanged.

Explored and rejected: `vercel.com/design.md`, which carries no licence and is a
brand document instructing authors to adopt Vercel's typeface and brand CSS so the
result reads as Vercel-authored. Its discipline informed a direction we did not
choose; none of its content is here.

Five mockups of the directions considered are in [docs/design/](docs/design/).

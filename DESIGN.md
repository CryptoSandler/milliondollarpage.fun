---
version: alpha
name: milliondollarpage.fun
description: "A warm cream workshop wall for a permanent pixel canvas on Solana. Ruled graph paper (#f3ede0) holds a 1000x1000 board where every sold block paints solid edge-to-edge and every free cell keeps its ruling, so availability never depends on what colour a buyer uploaded. The whole board is always visible and the page never scrolls; the wall around it is the same cream as the sheet. Olive-brown ink (#2b241c) sets text on the cream instead of punching through it; a single terracotta (#c2451e) carries every primary action and every selection, and appears nowhere else. Bricolage Grotesque sets display, Karla sets everything else. The board and its blocks have zero radius because they are literally pixels; only the chrome rounds. A thin fixed top bar, and the rest of the controls in a side panel or a bottom bar depending on which shape of window they are in. The system reads as a workshop wall: warm, plainly labelled, and entirely subordinate to the artwork pinned to it."
colors:
  primary: "#c2451e"
  primary-pressed: "#9f3819"
  primary-soft: "#f7dccb"
  on-primary: "#fff8ef"
  ink: "#2b241c"
  ink-soft: "#443a2c"
  body: "#6b6154"
  mute: "#948a79"
  canvas: "#f3ede0"
  canvas-deep: "#e9dfc9"
  card: "#fffcf5"
  card-warm: "#fbf5e8"
  hairline: "rgba(43,36,28,0.10)"
  hairline-strong: "#c9baa0"
  danger: "#a8371f"
  danger-soft: "#f1d4c8"
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
spacing: { bar-top: 52px, bar-bottom: 88px, panel-min: 280px, panel-max: 560px, gutter: 16px, card-padding: 16px }
motion:
  ease: "cubic-bezier(.4,0,.2,1)"
  hover: "160ms"
  press: "90ms"
  enter: "220ms"
  marching-ants: "600ms linear infinite"
---

# milliondollarpage.fun

A 1000×1000 canvas. One million pixels at a dollar each — that is the
strapline, and it is never the offer, because **the unit of sale is a 10×10
block at $100** and a single pixel cannot be bought. The header and the
controls both say so in the same words. Paid in USDC on Solana. A buyer picks a rectangle, holds it for thirty minutes,
uploads an image with a link and a caption, and the block is theirs — permanently,
and as an NFT they can resell.

**The artwork is the product. The interface is the wall it hangs on.** Every rule
below exists to keep the chrome subordinate to a million pixels of other people's
pictures.

## The one rule that outranks the others

**A block's state must never depend on the colour a buyer uploaded.**

Free cells keep their ruling. Sold blocks are covered opaquely, edge to edge —
by the buyer's own bitmap, or by solid ink until it loads — and the ruling
vanishes underneath them. Ruled means available; unruled means taken; and ruled
*back over* a covered block means held rather than sold. That holds whether the
upload is black, neon, transparent, or the same cream as the canvas.

Anything that signals state through hue alone is wrong, because the buyer chooses
the hue and we do not.

## The board

- **Contain, not cover. The whole board is always visible.** It is scaled by
  its limiting dimension — whichever of the free region's width and height runs
  out first — so all four corners are on screen at once and pixels stay square.
  In a landscape window that means it fits by height; in portrait and on phones
  it fits by width.
- **The page never scrolls.** Not vertically, not horizontally, at any viewport
  size. `overflow: hidden` on the document, and the fit maths behind it, so
  there is nothing being hidden. The one box on the page allowed its own scroll
  is a side panel too short for its own contents, and only so the Buy button is
  never clipped.
- **The wall is the same cream as the sheet.** There is always some background
  beside the board now, and it is `#f3ede0` — the board's own paper — not a
  darker ground. The board should read as a sheet pinned to a wall of the same
  paper, never as a letterboxed image with bars round it. A hairline in the
  coarse rule's tone draws the sheet's edge, because that is the only thing
  left saying where the artwork stops.
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
  irrational number the free region divided by 1000 produces. **"Zoom 1" means
  that rung, the whole board on screen, not one screen pixel per board pixel.**
  Above it are the powers of two greater than fit: in an 848px-tall free region,
  0.848 then 1, 2, 4, 8, 16; at 1400px, 1.4 then 2, 4, 8, 16. Zooming out from
  the lowest integer rung lands on fit and stops there. One honest limit: an
  integer scale is an integer number of *device* pixels only when the device
  pixel ratio is itself an integer, and on the fractional ratios Windows and
  some Android phones report the ladder cannot fix that. Nearest-neighbour
  sampling is what makes the remainder a hard edge instead of a blur.
- **Panning is something you earn by zooming in.** It is enabled exactly when
  the scale is above the fit scale. At the bottom rung the whole board is on
  screen, so a drag has nowhere to take it and a wheel must not move it — and
  the wheel does not pan at all any more, it zooms.
- **Two-tier graph paper.** A faint rule every 10 pixels — one block — and a
  stronger rule every 100. The fine tier says where a block would land; the coarse
  tier lets you navigate without counting.
- **Zero radius on the board and on every block.** They are pixels. Rounding them
  lies about what they are. Only chrome rounds.
- **Sold blocks** carry a 1px ink border, so the boundary between two adjacent
  blocks is visible even when both uploads are the same colour.
- **Captions** sit on their own opaque chip, never as free text over artwork.

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

**The accent deepened by six points of lightness, and that was measured rather
than chosen.** It used to be `#dd4e22`. On-primary cream (`#fff8ef`) on that
measures **3.84:1**, and the label on every Buy, Continue, Confirm and "Ask
again" is 15px/700 — under 18.66px bold, so WCAG 1.4.3 asks 4.5:1. The board's
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

A thin fixed bar across the top, always: the wordmark and the counters. It is
**one row and one fixed height**, and never wraps.

Everything else — the size presets, the selection readout and price, the wallet
field, the Buy button, the legend — is one block of controls that the layout
puts in one of two places. It is one set of controls either way; there is never
a second Buy button or a second wallet field for a screen reader to find.

**In a landscape window it is a side panel**, a column down the left, filling
the width the square board does not need. There is **no bottom bar** in that
layout. Its width is the genuine leftover — `100vw - (100dvh - bar-top)` —
floored at 280px so the controls stay usable and capped at 560px so an
ultrawide monitor does not hand five buttons half a screen. Past that cap the
cream either side of the board is wall, not letterbox.

**In portrait and on phones it is a bottom bar**, one row at one fixed height,
never wrapping — because the board's fit maths reads its measured box, and a
bar that can grow to two rows is a bar that can cover the board it was measured
against.

The crossover is 5:4 and 640px wide, not simply "landscape": the question is
not which way the window is turned, it is which arrangement leaves a bigger
board. At 1280×1024 a panel does; at 600×590 it does not.

What gives way as room runs out, in order, in both layouts: **the interaction
legend first**, then the zoom trio — a phone has a pinch, and the bottom bar at
that width has no room for three more buttons — then the exact rectangle
readout, then the per-preset prices, then the wallet's own label, then the
gaps. **Never** the pixel count, the
total, or the Buy button — those are what the controls are for. The bottom bar
runs out of width; the side panel runs out of height, and sheds the same things
in the same order.

## States

| State | How it reads |
| --- | --- |
| Free | Ruled graph paper, untouched |
| Hovered | A soft cream lift and the caption card, no colour change |
| Selecting | Terracotta outline with marching ants, so a drag never looks like a placed block |
| Refused | The offending block outlined in danger, the selection outlined in danger, Buy disabled |
| Held | **Its own value, not a variation on the sale's.** Opaque like a sale, because those pixels are genuinely not for sale right now — but in the coarse rule's own tone (`#c9baa0`), plainly lighter than a sale's near-black and plainly heavier than the paper, so the two are told apart at a glance and not by inspection. Over it, an **ink** hatch at 45° — the one angle neither tier of the graph paper uses — and a broken ink edge where a sale carries an unbroken one. Pencilled in on card, not inked. Wherever the block is big enough to read one it carries its own chip, **On hold**, in the place a sold block puts its caption. A hold **you** started adds the terracotta ring, because it is still your selection and the only held rectangle you can act on. The countdown stays live in the control it gates. A hold never shows an upload: those pixels are unpaid and may never be bought, the image route serves only `paid` and `minted`, so there is nothing public to draw and the whole rectangle is free for a treatment of its own |
| Sold | **The buyer's bitmap, edge to edge, nearest-neighbour at every zoom**, with a 1px ink border. The artwork is the treatment — this is the whole product, and the block is the frame |
| Sold, loading or missing | Solid, edge to edge, 1px ink border. This is the **fallback**, not the sold treatment: what the rectangle shows in the moment before its bitmap arrives, and what it keeps if the bitmap never does. It goes down under every sold block on every frame, so a sale reads as taken from the first paint. An upload with an alpha channel is composited onto the paper cream rather than onto this, and never onto the ruling — a sold block is never ruled |

## Letting a hold go

Handing a rectangle back is the one thing on this page that has to be **signed
by the wallet holding it**. The address on its own proved nothing: the board
publishes every live block's id, and a wallet address is public wherever it
exists, so anything that trusted the address alone let a stranger let go of
somebody else's pixels.

**Right now nothing here can sign.** The wallet field takes an address a buyer
types in; there is no wallet connected, no key in the browser, and so no
signature to give. The button that hands a hold back is therefore **off, and
says why** — greyed, with the reason in plain words beside it, rather than
looking ready and refusing when it is pressed. A control that looks live and
then fails costs more trust than one that was honest about being unavailable.

Nothing is lost while it is off, and the sentence beside the button says so: a
hold ends by itself after thirty minutes and the pixels go back on the board,
and a hold the buyer still wants is theirs to pick up again straight off the
board, ring and countdown intact. This is temporary, and it undoes itself the
day a wallet is connected — the button reads whether anything can sign rather
than a flag somebody has to remember to flip.

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
reimplemented rather than copied.

Explored and rejected: `vercel.com/design.md`, which carries no licence and is a
brand document instructing authors to adopt Vercel's typeface and brand CSS so the
result reads as Vercel-authored. Its discipline informed a direction we did not
choose; none of its content is here.

Five mockups of the directions considered are in [docs/design/](docs/design/).

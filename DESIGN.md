---
version: alpha
name: milliondollarpage.fun
description: "A warm cream workshop wall for a permanent pixel canvas on Solana. Ruled graph paper (#f3ede0) holds a 1000x1000 board where every sold block paints solid edge-to-edge and every free cell keeps its ruling, so availability never depends on what colour a buyer uploaded. Olive-brown ink (#2b241c) sets text on the cream instead of punching through it; a single terracotta (#dd4e22) carries every primary action and every selection, and appears nowhere else. Bricolage Grotesque sets display, Karla sets everything else. The board and its blocks have zero radius because they are literally pixels; only the chrome rounds. Two thin fixed bars float over the canvas and never grow to two rows. The system reads as a workshop wall: warm, plainly labelled, and entirely subordinate to the artwork pinned to it."
colors:
  primary: "#dd4e22"
  primary-pressed: "#b93e19"
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
spacing: { bar-top: 52px, bar-bottom: 88px, gutter: 16px, card-padding: 16px }
motion:
  ease: "cubic-bezier(.4,0,.2,1)"
  hover: "160ms"
  press: "90ms"
  enter: "220ms"
  marching-ants: "600ms linear infinite"
---

# milliondollarpage.fun

A 1000×1000 canvas. One million pixels at a dollar each, sold in 10×10 blocks,
paid in USDC on Solana. A buyer picks a rectangle, holds it for thirty minutes,
uploads an image with a link and a caption, and the block is theirs — permanently,
and as an NFT they can resell.

**The artwork is the product. The interface is the wall it hangs on.** Every rule
below exists to keep the chrome subordinate to a million pixels of other people's
pictures.

## The one rule that outranks the others

**A block's state must never depend on the colour a buyer uploaded.**

Free cells keep their ruling. Sold blocks paint solid, opaque, edge to edge, and
the ruling vanishes underneath them. Ruled means available; unruled-and-solid
means taken. That holds whether the upload is black, neon, or the same cream as
the canvas.

Anything that signals state through hue alone is wrong, because the buyer chooses
the hue and we do not.

## The board

- **Cover geometry.** The board fills the full viewport width, pixels stay square,
  and vertical overflow is panned. Never letterboxed, never stretched, no dead
  margins at the sides. A 1000×1000 board at 1440px wide is 1440px tall and
  scrolls; that is correct.
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
survives any artwork underneath without depending on contrast with it.

## Type

**Bricolage Grotesque** for display, **Karla** for everything else. Both from
Google Fonts. Numbers are tabular everywhere they can change — counters, prices,
countdowns — so digits do not jump as they tick.

Hierarchy comes from size and weight, not from boxes and rules. If something needs
a border to be found, the layout is wrong first.

## The two bars

A thin fixed bar top and bottom, floating over the canvas. Both are **one row and
one fixed height, always**. They never wrap, because the board's fit maths reads
their measured height — a bar that can grow is a bar that can cover the board it
was measured against.

What gives way as width shrinks, in order: the interaction legend first, then the
exact rectangle readout, then the per-preset prices. **Never** the pixel count,
the total, or the Buy button — those are what the bar is for.

## States

| State | How it reads |
| --- | --- |
| Free | Ruled graph paper, untouched |
| Hovered | A soft cream lift and the caption card, no colour change |
| Selecting | Terracotta outline with marching ants, so a drag never looks like a placed block |
| Refused | The offending block outlined in danger, the selection outlined in danger, Buy disabled |
| Held | Solid, with the countdown live in the control it gates |
| Sold | Solid, edge to edge, 1px ink border |

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

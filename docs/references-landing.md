# What the landing borrows, and from where

Read before touching `src/app/about/`. Every effect on that page is adapted from
something named here, and nothing on it is copied.

**Fetched 2026-09-02.** Dates are when this repository read the page, not when
the page was written; a technique described here may have changed since.

---

## Arlan's vault — <https://www.arlan.me/vault>

**Licence: MIT**, stated on the vault's own index. Each entry is a live demo
with a copyable prompt rather than a package, which matters for how this repo
uses them: **we take the technique and write our own code.** Nothing is
installed, nothing is vendored, and no file here is a copy of one of theirs.

Eighteen entries as of the fetch. The nine that a page about pixels can use:

| Entry | URL | The technique, as its own page describes it | What this landing does with it |
|---|---|---|---|
| **Arcade Pixel** | `/vault/arcade-pixel` | Draws a word *tiny* and blows it up, so the renderer's own artifacts become big squares. No pixel grid — the grid is emergent. | **The hero.** Our version is honest instead of emergent: the wordmark is rasterised to a real 1250×800-proportioned grid and the squares ARE the wall's pixels, which is the one place this page can afford to be literal. |
| **Pixel Brushes** | `/vault/pixel-brushes` | A brush is a small shape stamped over and over along a path; the numbers turn one implementation from a crisp line into a spray. | **"Drag" in the three steps.** The stamp is a 10×10 block and the path is the pointer, so the illustration of dragging is the mechanic itself. |
| **The Typer** | `/vault/typer` | A wave runs across a line and each letter passes through a solid pill, a highlight, an outlined pill, then plain text. Adjacent letters in the same state merge into one bar. | **Section headings.** Three states instead of four and no merge — the merge is charming and unreadable at a heading's size. |
| **Ghosty Reveal** | `/vault/ghosty-reveal` | A tall feathered gradient mask moved across an image with `mask-position`, so the picture forms out of fog. | **The 2005 section.** Our own drawn wall assembles out of fog, which is the only way to show that page without showing that page. |
| **Chromatic Glow** | `/vault/chroma-glow` | Blurred at a few sizes and added back, then split into a warm copy and a cool copy that drift apart; the split leans toward the cursor. | **"Why Solana".** One number glows. Deliberately the smallest use on the page: it is the effect most likely to look like a crypto advert. |
| **Kinetic Typography** | `/vault/kinetic-typography` | A letter is cut into a grid of tiles and each tile slips on its own wave, so the letter ripples like water. | **Not used, and here is why.** A letter cut into tiles is a pixel grid that is not the wall's pixel grid, and two different pixel grids on one page is a page that has stopped meaning anything. |
| **Symbols Effect** | `/vault/sandbox` | — | Not used. Same reason. |
| **Apple's Corners (squircle)** | `/vault/squircle` | Superellipse corners rather than circular ones. | **Not used.** DESIGN.md: "zero radius on the board and on every block — they are pixels. Only chrome rounds." A better corner is still a corner. |
| **Holo** | `/vault/holo` | Iridescent foil that shifts with the pointer. | **Not used.** It reads as a trading card, and this wall sells pixels rather than cards. |

The remaining nine — Fade Motion, Liquid UI, Ransom Note, Realistic Emboss, The
Art of Color Depth, Dia Browser's Gradient, Figma Vector Editor, Amo Hover
Button, Midjourney Medical's ASCII — are catalogued for the next person and used
by nothing.

**What is adapted and what is not.** Their pages describe each technique in
prose and this repository did not lift their source. Every effect on the landing
is written here, in this repo's own idiom, against this repo's tokens, and every
one of them is switched off by `prefers-reduced-motion`. The debt is real and it
is named on the page itself, in the footer, with a link.

---

## Landings worth stealing from

Found 2026-09-02. Each one is here for a specific thing rather than as a mood.

| Site | URL | What to steal |
|---|---|---|
| **Awwwards, "Minigames & Playful Interactions"** | <https://www.awwwards.com/awwwards/collections/minigames-playful-interactions/> | The collection's own lesson: the toy is the explanation. Every entry that works teaches its product by letting you *do* the product's verb in miniature. Ours is the drag. |
| **Pixel Vault** (E-commerce Honors, March 2026) | <https://www.awwwards.com/sites/The-Pixel> | Dither as a texture rather than a filter — a pattern that reads as a material at any zoom. Useful for the 2005 section's ground. |
| **1-bit Pixel Art Dev Portfolio** | <https://www.awwwards.com/sites/1-bit-pixel-art-dev-portfolio> | One-bit discipline: a whole page from two values. It is the argument for our illustrations being generated from the palette rather than drawn in colour. |
| **PixelArtworks** | <https://www.awwwards.com/sites/pixelartworks> | Scale jumps between sections — a page that changes its own zoom level to keep attention, which a page about a zoomable wall can do honestly. |
| **Cryptoys** | <https://www.flowverse.co/flow-news/cryptoys-building-digital-toy-collectibles> | The counter-example, and it is here to be argued with. Kawaii 3D characters are how this genre signals "fun", and it is exactly the register `docs/references.md` says this audience reads as a toy rather than an asset. We take the playfulness and none of the mascots. |

**What none of them get to give us:** an image. Every illustration on the
landing is generated in this repository — SVG written by hand or a canvas drawn
from the board's own geometry. No screenshot of the 2005 page, no third-party
asset, no stock. That is not only a licence position: a page about a wall whose
whole promise is *these pixels are yours* cannot be built out of other people's
pictures.

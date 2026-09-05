# Pictures on a wall sold by the pixel

What breaks when a rectangle is the unit and an image has to fit it, measured
against the twenty flags seeded on the preview branch, with a recommendation per
section and a note on what to build now.

**The original did not have this problem, and that is the whole point.** Alex
Tew sold in **10×10 blocks, in multiples**, and pasted the images into the page
by hand. Two consequences follow from that and both are load-bearing here:
every purchase was a multiple of one square, so **nothing ever had an awkward
aspect ratio** — a buyer wanting a wide banner bought 10×1 blocks and supplied a
100×10 image — and **a person looked at every upload** before it went on the
wall. This wall sells any rectangle from 1×1 up and nobody looks at anything.
The first choice bought us a selector with no grid; it also bought us every
problem below.

---

## 1 · Legibility: where a picture stops being one

**Measured**, on the preview branch, through the same planner a buyer's upload
goes through. "Picture" is the part of the rectangle that carries image rather
than the bars a `contain` fit leaves.

| Block | Board px | Picture | Picture px | Share | Argentina's colours (source → wall) |
|---|---|---|---|---|---|
| 6×40 | 240 | 6×4 | **24** | 10% | 14 → 9 |
| 10×10 *(the original's unit)* | 100 | 10×6 | **60** | 60% | 14 → 8 |
| 17×14 | 238 | 17×11 | **187** | 79% | 14 → 15 |
| 173×16 | 2,768 | 26×16 | **416** | 15% | 14 → 17 |
| 31×169 | 5,239 | 31×20 | **620** | 12% | 14 → 21 |
| 120×90 | 10,800 | 120×75 | **9,000** | 83% | 14 → 67 |

**The colour count going UP is the finding.** A flag has between eight and
fourteen flat colours. At 120×90 it comes back with 67 — those are not details,
they are the interpolated edges a Lanczos reduction invents. At 6×40 it comes
back with 9, and the Argentine sun, the Ghanaian star and the Brazilian banner
are all gone: what survives is the stripe order and nothing else.

**The threshold is about 200 picture pixels.** Below it you have a colour
swatch: at 17×14 (187 px) a flag is still telling you *blue-white-blue*, and at
10×10 (60 px) two flags with the same stripes are indistinguishable. Above about
2,000 you have a picture.

**What we show instead — nothing, and that is already right.** There is no
"image too small" state and there should not be. A 6×40 purchase renders its
picture at 6×4 and the buyer chose the rectangle knowing its size; the checkout
shows them the exact reduction before they pay (`image-fit.ts` exists so the
board keeps the preview's promise). A wall that refused small pictures would be
a wall that refused small purchases, which is the product.

> **Recommendation.** Say the number in the upload step: *at this size your
> picture is 6 by 4 pixels*. Not a refusal, not a warning colour — a
> measurement, beside the preview that already shows it. **Build now.**

## 2 · Proportion: when the image and the rectangle disagree

**The rule already exists** and it is in `DESIGN.md` and `image-fit.ts`: two
fits and no third. `contain` letterboxes onto the **sold ground** `#2e3642` —
not the paper, because these bytes sit on a wall shared by two registers — and
`cover` crops **centred**. **Nothing is ever stretched.** The board applies the
same two rules the buyer saw in the browser preview, which is why `placeImage`
and CSS `object-fit` are deliberately the same pair of words.

**What the flags exposed is the cost of `contain`, and it is large.** The form
defaults to `contain` and only switches a buyer to `cover` when contain cannot
be honoured — so all twenty flags came out contained, and on the three awkward
shapes most of the rectangle is bars:

| Block | Board px | Carrying picture | Bars |
|---|---|---|---|
| 31×169 | 5,239 | 620 | **88%** |
| 173×16 | 2,768 | 416 | **85%** |
| 6×40 | 240 | 24 | **90%** |

A buyer who pays $5,239 for a 31×169 column and uploads a flag gets 12% of what
they paid for showing a picture and 88% showing flat grey. That is the honest
default doing something nobody wants.

**Letterboxing with the dominant colour** — the third option in the brief — is
tempting and should be refused. It invents a colour the buyer never chose, it
makes the bars look like part of the artwork rather than like unused room, and
on a flag it produces a field of red beside a flag with red in it. The bars are
honest precisely because they are the sold ground and read as "nothing here".

> **Recommendation.** Keep the two fits. Change the DEFAULT: when the image's
> aspect and the rectangle's differ by more than about 2×, open the form on
> **`cover`** rather than `contain`, with `contain` one click away and the
> preview showing both. The buyer still decides; the default stops being the
> wrong one for exactly the shapes this wall makes easy to buy. **Build now.**

## 3 · Scaling: nearest going up, filtered coming down

**The split is already written and it is right.** `composite.ts`'s `layer()`
picks `nearest` when the stored image is being **enlarged** into its rectangle
and `lanczos3` when it is being **reduced**. `DESIGN.md`'s rule — *a bitmap that
has been smoothed is no longer the picture the buyer uploaded* — is a rule about
enlarging. A stored image is **four times** its rectangle's size by design
(`BLOCK_PIXEL_SCALE`), so the common case is a 4:1 reduction, and throwing away
fifteen of every sixteen pixels of a photograph is not sharpness, it is a
different picture.

**Where each one is seen:**

| Surface | Scale | Filter | Why |
|---|---|---|---|
| The wall, at fit | 1 board px ≈ 0.96 screen px at 1440 | the composite's, baked in | one PNG for the whole wall; the browser only maps it 1:1 |
| The wall, zoomed in | up to 8× | `image-rendering: pixelated` | enlarging: a bought pixel must stay a square |
| The register's parade | 24–160px tall | `pixelated` | the shape is the thing being shown |
| `/b/<id>` and the cards | ~44px thumbnails | `pixelated` | a 1×1 purchase stores 4×4, and 4×4 smoothed is a picture nobody uploaded |

**At 1× on the wall the filter has already happened** — the composite is 1250×800
and the browser draws it at 0.96, so what a visitor sees is the Lanczos
reduction plus a sub-pixel browser resample. In the register and on `/b/<id>` the
stored image is being **enlarged**, so it is nearest and hard-edged. Those two
are different pictures of the same purchase, and that is correct rather than
inconsistent: one is the wall, the other is the artefact.

> **Recommendation.** No change. Write down the "four surfaces" table above in
> `DESIGN.md` so the next person does not discover the difference as a bug.
> **Build now** (documentation only).

## 4 · Moderation: what runs, and what does not

**What runs on upload**, in `content.ts`'s `validateContent`, on the server,
after the browser has already shrunk the file:

| Check | Value |
|---|---|
| Format | PNG, JPEG, WebP, GIF — anything else refused by **decoded** format, not by the filename |
| Weight | ≤ **100 KiB** stored (`STORED_MAX_BYTES`); ≤ 10 MiB before the browser shrinks it |
| Dimensions | ≤ **1024px** on the long edge (`STORED_MAX_LONG_EDGE`) |
| Geometry | a `contain` fit that cannot be honoured is refused with the numbers in the message |
| Caption | ≤ 32 characters |
| Link | normalised and checked (`link.ts`) |
| Hash | `image_sha256` is computed and stored |

**What does not run, and this is the gap.** The hash is stored and **nothing is
ever compared against it**: it exists to fingerprint the wall for cache
invalidation. There is **no blocklist**, no perceptual hash, no CSAM scan, no
classifier, and no human in the loop. The only moderation this wall has is
**after** publication: `takedown.ts`'s `hide` (reversible, removes the content
from the wall, the page, the card and the API while the sale stands) and `purge`
(irreversible, nulls the bytes and the words).

**The original had a person.** Tew looked at every image before pasting it.
Ours publishes on payment, which is the trade a self-serve wall makes.

> **Recommendation, and it is the most urgent thing in this document.**
> 1. ~~**An exact-hash blocklist**~~ — **BUILT 2026-09-04**, and it was one table,
>    one index and one `SELECT`. A takedown is a rule now rather than a single
>    event: the same file cannot be re-uploaded onto a different rectangle five
>    minutes later. The one thing this section got wrong is that it read as
>    purge-only — a list nothing but `purge` can write to still refuses a picture
>    only AFTER somebody bought a rectangle for it, so `/api/admin/blocked` ships
>    with it.
> 2. **A published address to report to** — already shipped: `contact@`.
> 3. A perceptual hash (pHash) so a one-pixel edit does not defeat (1), and a
>    third-party scan for illegal imagery before anything is indexed. **Decide
>    before launch, not after** — `DECISIONS.md` should carry it as an open
>    question with a cost, because it is the one item here with a legal edge.

## 5 · What a full wall weighs, and how it is served

**Measured**, composing a real 1250×800 PNG at `compressionLevel: 9`:

| Wall | PNG | Built in |
|---|---|---|
| The preview's twenty flags (19.18% covered) | **43 KiB** | — |
| Flat colour, whole wall | 5 KiB | 7 ms |
| 10,000 flat 10×10 blocks *(the original's shape)* | **60 KiB** | 1,627 ms |
| Half flat, half photographic | 1,613 KiB | 43 ms |
| Photographic worst case (incompressible) | **3,914 KiB** | 45 ms |

**So the range is 60 KiB to 3.8 MiB and the content decides, not the coverage.**
Flags, logos and pixel art are flat and compress to almost nothing; photographs
do not. A full wall of photographs is a **4 MiB** first paint, which is the
number to design against rather than the 43 KiB we have today.

**How it is served, and this part is already good.** One PNG at
`/api/wall/<version>`, where the version is a **content hash** of every visible
purchase — so the URL is immutable by construction and carries
`cache-control: public, max-age=31536000, immutable`. A visitor fetches the wall
once, ever, for that version. **There are no tiles**, and at 1250×800 there is no
case for them: tiling exists to avoid sending pixels nobody is looking at, and
this wall is always looked at whole.

**What does not scale is the BUILD**, not the serve. Composing 10,000 layers took
**1.6 seconds**, and every purchase invalidates the version. At a few hundred
purchases a day that is fine; at the original's ten thousand blocks it is a
1.6-second stall on the request that happens to trigger the rebuild.

> **Recommendation.**
> 1. **Encode as WebP with a PNG fallback.** Same pixels, roughly a third of the
>    bytes on photographic content — 4 MiB becomes about 1.3. **Build now**; it
>    is one `sharp` call and one `Accept` check.
> 2. **Rebuild off the request path** once purchases are frequent: the version
>    is content-addressed, so a stale wall for a few seconds is already a state
>    the design handles (`ensureWall` returns the old version rather than
>    failing). **Build when purchases per hour reach double digits**, not before.
> 3. Tiles: **not now, and here is the trigger** — if the wall ever grows past
>    its 1250×800 or gains a deep zoom that serves more than one resolution.

## 6 · Link rot: the pictures are ours

**Confirmed, in the schema.** A block's image lives in `pending_image`, a
`bytea` column in our own Postgres, written once at `/api/orders/<id>/content`
and read by `composite.ts` and `/api/blocks/<id>/image`. **There is no URL
anywhere in the image path** — nothing is fetched from a buyer's server at
render time, at build time, or ever. The only third-party thing a block carries
is its `link`, which is a destination for a click and is never dereferenced by
us.

**This is the whole answer to the failure that defines the genre.** The 2017
study of the original found 547 of its 2,816 links dead and another 489
redirected — 342,000 pixels' worth. Those were *links*, and ours can rot exactly
the same way. **The pictures cannot**, because there is no request to fail: they
are bytes in a row, and a row that is `paid` is protected by the permanence
trigger.

**The two honest residual risks**, neither of which is hotlinking: the database
itself (one provider, and backups are a separate question this document does not
answer), and `purge`, which deletes bytes on purpose and is irreversible by
design.

> **Recommendation.** Say it on `/faq`, which already says it: *your picture is
> stored and served from this site rather than fetched from a server somebody
> else is paying for*. **Already shipped.** Add the backup story to
> `SECURITY.md` — it is the only part of "the picture cannot rot" that is
> currently a claim rather than a mechanism. **Decide.**

---

## What to build now, in order

1. ~~**The exact-hash blocklist** (§4)~~ — **built 2026-09-04.** `blocked_images`,
   written by `purge` inside its own transaction and by `/api/admin/blocked`,
   read by the content route before it accepts an upload. `DECISIONS.md` carries
   the reasoning, including why the uploader is not told the reason.
2. ~~**Default to `cover` when the aspects differ by more than 2×** (§2)~~ —
   **built 2026-09-05.** `defaultFit` in `image-fit.ts`, applied once per
   picture in `ContentForm` so it is a starting point and not a rule the buyer
   has to fight. The threshold is exactly the measurement above.
3. ~~**Print the picture's pixel size in the upload step** (§1)~~ — **built
   2026-09-04** as part of the exact preview, which prints the stored size and
   the picture-pixel count beside every view.
4. ~~**WebP for the wall** (§5)~~ — **built 2026-09-05, and not the way this
   file recommended.** The `Accept` fallback was refused: the version is a hash
   of the bytes, so content negotiation would mean one URL with two bodies, a
   `Vary` header and a split in every shared cache. The build encodes both and
   keeps the smaller, and migration 017 gives the row a `mime` so the route
   serves what it stored rather than guessing. **Lossless**, which is where most
   of this section's saving was: lossy WebP is smoothing, and DESIGN.md says a
   smoothed bitmap is no longer the picture the buyer uploaded.
5. ~~**Write the four-surfaces scaling table into `DESIGN.md`** (§3)~~ — **done
   2026-09-05**, as "The same purchase, on four surfaces, at four scales".

**Left as decisions rather than work:** the perceptual hash and the illegal-imagery
scan (§4), and the backup story behind "the picture cannot rot" (§6).

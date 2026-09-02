import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The guard that makes `DESIGN.md` the source rather than the summary.
 *
 * WHO CALLS THIS: nobody — it is a test. But it is the only thing in this
 * repository that reads the design document, and without it that document is a
 * description of what the code used to look like. Every other file here cites
 * `DESIGN.md` in a comment; this one checks.
 *
 * WHY IT EXISTS NOW AND NOT BEFORE. The register changed. Twenty-odd colours
 * moved at once, one of them lives in five different files, and the mockup the
 * palette came from had two contrast failures in it that the document had to
 * correct. Any one of those is a thing somebody re-breaks in a hurry six weeks
 * from now, and the failure mode is silent: the page still renders, it is
 * simply wrong in a way only a screenshot would show.
 *
 * WHAT IT REFUSES TO DO. It does not check that the page LOOKS like the
 * document — that is the owner's gate, and a test cannot hold it. It checks
 * four things that are facts rather than judgements, and every one of them is a
 * rule the document already states in words.
 */

const DESIGN = readFileSync("DESIGN.md", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");

/**
 * The frontmatter's `colors:` block, as a map.
 *
 * Deliberately a small parser rather than a YAML dependency. The block is
 * `name: "value"` at one level of indentation and nothing else; a dependency
 * for that would be the kind of thing `ponytail` exists to refuse, and a real
 * YAML parser would happily accept a shape this file is not written to handle.
 * If the frontmatter ever grows nesting, this throws rather than guessing.
 */
function documentedColors(theme: "light" | "dark" = "light"): Map<string, string> {
  const key = theme === "light" ? "colors" : "colors-dark";
  const block = new RegExp(`^${key}:\\n((?:  .*\\n)+)`, "m").exec(DESIGN);
  if (!block) throw new Error(`DESIGN.md has no \`${key}:\` block. That is the bug.`);

  const colors = new Map<string, string>();
  for (const line of block[1].split("\n")) {
    if (line.trim() === "") continue;
    const entry = /^ {2}([a-z0-9-]+): "([^"]+)"$/.exec(line);
    if (!entry) throw new Error(`DESIGN.md colours are not name: "value" — ${line}`);
    colors.set(entry[1], entry[2]);
  }
  return colors;
}

/**
 * What a theme's block in globals.css actually sets, by custom-property name.
 *
 * TWO THEMES, TWO BLOCKS, and each is checked on its own. `:root` carries the
 * light values; `:root[data-theme="dark"]` carries the dark ones. The media
 * query repeats the dark block for readers who have not chosen, and a test
 * below asserts the two dark blocks agree — a theme defined twice is a theme
 * that can drift from itself.
 */
function tokensIn(block: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens.set(name, value.trim());
  }
  return tokens;
}

function stylesheetTokens(theme: "light" | "dark" = "light"): Map<string, string> {
  if (theme === "light") {
    const root = /:root\s*\{([\s\S]*?)\n\}/.exec(CSS);
    if (!root) throw new Error("globals.css has no :root block.");
    return tokensIn(root[1]);
  }
  const dark = /:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/.exec(CSS);
  if (!dark) throw new Error("globals.css has no explicit dark block.");
  return tokensIn(dark[1]);
}

/** Same colour, however it is spelled. Whitespace inside rgba() is not a value. */
function sameColour(a: string, b: string): boolean {
  // Whitespace inside rgba() is not a value, and neither is a trailing zero:
  // `0.10` and `0.1` are one number written two ways, and a guard that calls
  // them different is a guard that fails on correct code.
  const key = (c: string) =>
    c
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/(\d)0+(?=[,)])/g, "$1")
      .replace(/\.(?=[,)])/g, "");
  return key(a) === key(b);
}

const COLORS = documentedColors("light");
const TOKENS = stylesheetTokens("light");
const COLORS_DARK = documentedColors("dark");
const TOKENS_DARK = stylesheetTokens("dark");

describe("the stylesheet sets what the document says", () => {
  it.each([...COLORS.keys()])("--%s", (name) => {
    const documented = COLORS.get(name)!;
    const set = TOKENS.get(name);

    expect(set, `--${name} is in DESIGN.md and not in globals.css`).toBeDefined();
    expect(
      sameColour(set!, documented),
      `--${name}: DESIGN.md says ${documented}, globals.css sets ${set}`,
    ).toBe(true);
  });

  /**
   * The other direction, which is the one that rots quietly. A colour added to
   * the stylesheet and never written down is a colour nobody decided.
   */
  it("has no colour the document has not decided", () => {
    const undocumented = [...TOKENS.entries()]
      .filter(([name, value]) => /^(#|rgba?\()/.test(value) && !COLORS.has(name))
      .map(([name]) => name);

    expect(undocumented, "colours in globals.css that DESIGN.md does not name").toEqual([]);
  });
});

/**
 * The board's own surface, in every file that draws it.
 *
 * FIVE COPIES OF ONE COLOUR, and each one is somewhere the paper has to be
 * painted by something that is not CSS: the server composes the wall bitmap
 * with `sharp`, the board paints itself into a canvas, the confirmation step
 * previews a block, and the browser flattens an alpha channel before upload.
 * Miss one and the register half-lands — which is exactly what happened to the
 * encoder, which was flattening onto `#ffffff` while its own comment said it
 * was flattening onto "the paper the board is drawn on".
 */
describe("what paints the board outside CSS", () => {
  /**
   * FOUR FILES PAINT WITHOUT A STYLESHEET, and after the register became two
   * registers they do not all paint the same thing any more.
   *
   * The board canvas reads its palette from `getComputedStyle`, so it follows
   * the theme and has no colours of its own to check — only a fallback for the
   * frame before the effect runs, which is `:root`'s and therefore light's.
   *
   * The server compositor and the browser's upload encoder paint the SOLD
   * GROUND, not either theme's paper: the wall bitmap is shared by both themes
   * and the pixels in question — a `contain` fit's bars, the ground behind an
   * alpha channel — belong to the sale rather than to the wall.
   */
  it("the board canvas reads the stylesheet rather than holding a palette", () => {
    const canvas = readFileSync("src/components/BoardCanvas.tsx", "utf8");

    expect(canvas).toContain("getComputedStyle(document.documentElement)");
    // Its fallback is the light theme's, because an un-stamped document
    // resolves to `:root` and that is what the first frame paints.
    expect(canvas).toContain(COLORS.get("paper"));
  });

  it.each([
    ["src/lib/board/composite.ts", "the wall the server composes"],
    ["src/lib/board/image-encode.ts", "the flatten behind a transparent upload"],
  ])("%s paints the sold ground, not a theme's paper — %s", (path) => {
    const source = readFileSync(path, "utf8");
    const soldGround = COLORS_DARK.get("sold-fallback")!;

    expect(source.toLowerCase()).toContain(soldGround.toLowerCase());
    // And neither theme's paper is baked in, which is the failure this exists
    // to catch: a cream slab inside every letterboxed purchase on the dark
    // register, or a near-black one on the light.
    expect(source.toLowerCase()).not.toContain(COLORS.get("paper")!.toLowerCase());
    expect(source.toLowerCase()).not.toContain(COLORS_DARK.get("paper")!.toLowerCase());
  });

  it("keeps the sheet distinguishable from the surface behind it, where it has to be", () => {
    // In DARK the sheet is a step darker than the ground and the step is felt
    // rather than read. In LIGHT they are the same value by design — the cream
    // register's wall IS the sheet's cream, and the frame is what says where
    // one ends.
    const darkStep = contrast(COLORS_DARK.get("paper")!, COLORS_DARK.get("canvas")!);
    expect(darkStep).toBeGreaterThan(1);
    expect(darkStep).toBeLessThan(1.15);
    expect(COLORS.get("paper")).toBe(COLORS.get("canvas"));

    // Either way the frame is what carries the boundary, in both themes.
    expect(contrast(COLORS.get("frame")!, COLORS.get("paper")!)).toBeGreaterThanOrEqual(3);
    expect(contrast(COLORS_DARK.get("frame")!, COLORS_DARK.get("paper")!)).toBeGreaterThanOrEqual(3);
  });
});

/**
 * WCAG 2.1 relative luminance, so a claimed ratio can be checked against the
 * two values it was claimed about.
 */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/**
 * "A ratio nobody computed is not a ratio" — the document's own sentence,
 * enforced rather than restated.
 *
 * The Colour section prints a table of foregrounds against surfaces. This
 * recomputes every cell from the frontmatter and fails when the document
 * claims a number it does not have. It is what stops the table becoming
 * decoration the first time a value moves.
 */
describe("every ratio the document prints is a ratio it has", () => {
  const SURFACES = ["canvas", "canvas-deep", "card", "card-lift", "paper"] as const;

  /**
   * The document prints one table per theme now, so the rows are read per
   * theme and checked against that theme's palette. A row whose numbers were
   * computed against the other theme is the exact mistake this catches.
   */
  function rowsUnder(heading: string) {
    const from = DESIGN.indexOf(heading);
    expect(from, `DESIGN.md has no "${heading}"`).toBeGreaterThan(-1);
    const to = DESIGN.indexOf("\n### ", from + heading.length);
    const section = DESIGN.slice(from, to === -1 ? undefined : to);
    return [
      ...section.matchAll(/^\| `([a-z-]+)` `(#[0-9a-f]{6})` \|((?: \*?\*?\d+\.\d\d\*?\*? \|){5})$/gm),
    ];
  }

  const THEMES = [
    ["### Light, measured", COLORS] as const,
    ["### Dark, measured", COLORS_DARK] as const,
  ];

  it("prints a table for each theme, with every foreground in it", () => {
    for (const [heading] of THEMES) {
      expect(rowsUnder(heading).length, heading).toBeGreaterThanOrEqual(9);
    }
  });

  it.each(THEMES.map(([heading]) => heading))("%s recomputes exactly", (heading) => {
    const palette = THEMES.find(([h]) => h === heading)![1];

    for (const row of rowsUnder(heading)) {
      const [, name, hex, cells] = row;
      expect(
        sameColour(hex, palette.get(name)!),
        `${name} in the ${heading} table is ${hex}, the palette says ${palette.get(name)}`,
      ).toBe(true);

      const claimed = [...cells.matchAll(/(\d+\.\d\d)/g)].map((m) => Number(m[1]));
      expect(claimed).toHaveLength(SURFACES.length);

      claimed.forEach((value, index) => {
        const surface = SURFACES[index];
        expect(
          Number(contrast(hex, palette.get(surface)!).toFixed(2)),
          `${name} on ${surface} under ${heading}: the document says ${value}`,
        ).toBe(value);
      });
    }
  });
});

describe("the typefaces", () => {
  const families = [
    ...DESIGN.matchAll(/fontFamily: "([^"]+)"/g),
    ...DESIGN.matchAll(/\*\*([A-Z][A-Za-z ]+)\*\* for (?:display|every number)/g),
  ].map((m) => m[1]);

  it("names the faces both themes use, and no others", () => {
    expect(new Set(families)).toEqual(
      new Set(["Space Grotesk", "IBM Plex Mono", "Bricolage Grotesque", "Karla"]),
    );
  });

  it("loads exactly those two, and nothing else", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");

    // The IMPORT is what decides which families next/font fetches and
    // self-hosts, so that is what this reads. An earlier version scanned for
    // `Name({` anywhere in the file and matched `RootLayout({` — a guard that
    // fails on correct code is worse than no guard, because the first thing
    // anybody does with one is widen it until it stops complaining.
    const imported = /import \{([^}]+)\} from "next\/font\/google";/.exec(layout);
    expect(imported, "layout.tsx does not import from next/font/google").not.toBeNull();

    const families = imported![1]
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .sort();

    // FOUR, because each theme keeps its own pair and all four are
    // self-hosted so switching fetches nothing. DESIGN.md's type section
    // carries the measurement behind that decision.
    expect(families).toEqual([
      "Bricolage_Grotesque",
      "IBM_Plex_Mono",
      "Karla",
      "Space_Grotesk",
    ]);
  });

  /**
   * The standing prohibition, written down at last. `CLAUDE.md` explains why it
   * may not be named in a source file even to disown it; a test is the one
   * place it can be checked, because a test is not a file anybody reads for
   * direction.
   */
  it("loads no other family from anywhere", () => {
    for (const path of ["src/app/layout.tsx", "src/app/globals.css"]) {
      const source = readFileSync(path, "utf8");
      const googleFonts = [...source.matchAll(/fonts\.googleapis\.com\/css2\?family=([^"'&\s]+)/g)];
      for (const [, family] of googleFonts) {
        expect(["Space+Grotesk", "IBM+Plex+Mono"]).toContain(family);
      }
    }
  });
});

/**
 * The accent means one thing, and this is the allow-list that keeps it true.
 *
 * A rule stated in prose survives until the first hurry. This collects every
 * selector in `globals.css` whose declarations reach for the accent, in any of
 * its three tokens, and fails when that set is not exactly what DESIGN.md
 * permits — so adding a green thing means editing the document first, which is
 * the point of writing it as a table there.
 */
describe("the accent means money moving now, and nothing else", () => {
  /** Exactly the selectors DESIGN.md's table permits. */
  const PERMITTED = new Set([
    ".btn-primary",
    ".btn-primary:hover:not(:disabled)",
    ".btn-primary:active:not(:disabled)",
    ".board-tape__live",
    ".board-tape__pip",
    ".board-tape__row--newest",
    ".block-card-price",
    "@keyframes pixels-tick",
    "0%",
  ]);

  /** Every selector whose own declarations mention the accent. */
  function accentSelectors(): string[] {
    const found = new Set<string>();
    for (const match of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = match[2];
      if (!/var\(--primary(-soft|-pressed)?\)/.test(body)) continue;
      // The last line of the prelude is the selector; the lines above it are
      // whatever comment or nesting preceded it.
      const selector = match[1].trim().split("\n").pop()!.trim();
      // `:root` and the Tailwind theme block DEFINE these tokens rather than
      // using them, and defining a colour is not spending it.
      if (selector === ":root" || selector.startsWith("@theme")) continue;
      found.add(selector);
    }
    return [...found].sort();
  }

  it("is spent only where the document permits", () => {
    const surprising = accentSelectors().filter((selector) => !PERMITTED.has(selector));

    expect(
      surprising,
      "these reach for the accent and DESIGN.md's table does not list them",
    ).toEqual([]);
  });

  /**
   * The half the owner named by hand. These are the exact selectors that used
   * to be green, so a regression puts them back and the allow-list above would
   * catch it — but naming them says WHICH rule was broken, which is the
   * difference between a failing test and a useful one.
   */
  it.each([
    [":focus-visible"],
    [".focus-proxy:has(input:focus-visible)"],
    [".field-input:focus"],
    ["::selection"],
  ])("no selection state carries the accent — %s", (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = new RegExp(`${escaped}[^{}]*\\{([^{}]*)\\}`).exec(CSS);

    expect(block, `${selector} is no longer in globals.css`).not.toBeNull();
    expect(block![1]).not.toMatch(/var\(--primary/);
  });

  it("keeps the board's own selection off the accent too", () => {
    const canvas = readFileSync("src/components/BoardCanvas.tsx", "utf8");
    const stroke = /selection: "(#[0-9a-f]{6})"/.exec(canvas);
    const fill = /selectionFill: "(rgba\([^"]+\))"/.exec(canvas);

    expect(stroke, "BoardCanvas has no selection colour").not.toBeNull();
    expect(stroke![1]).not.toBe(COLORS.get("primary"));
    // Ink, which is what the document says the selection is now.
    expect(stroke![1]).toBe(COLORS.get("ink"));
    // And the fill is no longer the cream register's terracotta, which it was
    // until this batch — rgba survived a swap that only looked for hex.
    expect(fill![1]).not.toContain("194,69,30");
  });
});

/**
 * The second theme, held to exactly the same standard as the first.
 *
 * A two-theme page fails in one direction far more often than the other: the
 * theme somebody is looking at while they work stays right, and the other one
 * quietly drifts. So every check the light theme gets, the dark theme gets.
 */
describe("the dark theme", () => {
  it.each([...COLORS_DARK.keys()])("--%s", (name) => {
    const documented = COLORS_DARK.get(name)!;
    const set = TOKENS_DARK.get(name);

    expect(set, `--${name} is in DESIGN.md's dark palette and not in globals.css`).toBeDefined();
    expect(
      sameColour(set!, documented),
      `--${name}: DESIGN.md says ${documented}, the dark block sets ${set}`,
    ).toBe(true);
  });

  it("defines exactly the tokens the light theme does", () => {
    // A token themed in one direction and not the other is a colour that
    // silently falls back to the other register's value.
    // The prefixes excluded here are the measurements and the motion — radii,
    // easings, durations, the two bars' heights, the settled strip's, the
    // panel's, and the width of each of the two rails. None of them is themed,
    // because DESIGN.md is explicit that "a theme is a colourway, not a second
    // design": the layout is one page in both registers.
    const colourish = (names: string[]) =>
      names
        .filter((name) => !/^(radius|ease|dur|bar-|tape-|panel-|rail-|tools-)/.test(name))
        .sort();

    expect(colourish([...TOKENS_DARK.keys()])).toEqual(colourish([...TOKENS.keys()]));
  });

  /**
   * The dark palette is written twice — once behind the media query for readers
   * who have not chosen, once behind the attribute for readers who have. Two
   * copies of one theme is two things that can drift apart.
   */
  it("says the same thing behind the media query as behind the attribute", () => {
    const media = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([\s\S]*?)\n  \}/.exec(CSS);
    expect(media, "globals.css has no prefers-color-scheme block").not.toBeNull();

    const fromMedia = tokensIn(media![1]);
    for (const [name, value] of TOKENS_DARK) {
      expect(fromMedia.get(name), `--${name} differs between the two dark blocks`).toBe(value);
    }
  });

  it("keeps every ratio the document prints for it", () => {
    const SURFACES = ["canvas", "canvas-deep", "card", "card-lift", "paper"] as const;
    for (const surface of SURFACES) {
      for (const tone of ["ink", "ink-soft", "body"]) {
        expect(
          contrast(COLORS_DARK.get(tone)!, COLORS_DARK.get(surface)!),
          `${tone} on ${surface}, dark`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const boundary of ["control-line", "frame"]) {
        expect(
          contrast(COLORS_DARK.get(boundary)!, COLORS_DARK.get(surface)!),
          `${boundary} on ${surface}, dark`,
        ).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(COLORS_DARK.get("mute")!, COLORS_DARK.get(surface)!)).toBeGreaterThanOrEqual(3);
    }
    expect(
      contrast(COLORS_DARK.get("on-primary")!, COLORS_DARK.get("primary")!),
    ).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * The accent's allow-list is a rule about SELECTORS, and selectors do not
   * belong to a theme — every rule in globals.css styles through the tokens, so
   * checking it once covers both. What is theme-specific is the VALUE, and
   * these are the two that must never be the same as a selection's.
   */
  it("spends its accent under the same allow-list, on a different hue", () => {
    expect(COLORS_DARK.get("primary")).not.toBe(COLORS.get("primary"));
    // And neither theme's accent is its ink, which is what a selection is now.
    expect(COLORS_DARK.get("primary")).not.toBe(COLORS_DARK.get("ink"));
    expect(COLORS.get("primary")).not.toBe(COLORS.get("ink"));
  });
});

/**
 * The light theme's own ratios, which had never been checked by anything.
 *
 * The cream register's numbers lived in prose for four months. They are the
 * document's claim in both directions now.
 */
describe("the light theme's floors", () => {
  const SURFACES = ["canvas", "canvas-deep", "card", "card-lift", "paper"] as const;

  it("keeps text and control boundaries where WCAG puts them", () => {
    for (const surface of SURFACES) {
      for (const tone of ["ink", "ink-soft", "body"]) {
        expect(
          contrast(COLORS.get(tone)!, COLORS.get(surface)!),
          `${tone} on ${surface}, light`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const boundary of ["control-line", "frame"]) {
        expect(
          contrast(COLORS.get(boundary)!, COLORS.get(surface)!),
          `${boundary} on ${surface}, light`,
        ).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(COLORS.get("mute")!, COLORS.get(surface)!)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the Buy label legible on the accent it sits on", () => {
    expect(contrast(COLORS.get("on-primary")!, COLORS.get("primary")!)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(COLORS.get("on-primary")!, COLORS.get("primary-pressed")!),
    ).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * The hold is 1.63:1 against the cream paper, and that is not a failure — it
   * is why the hatch exists. Pinned so nobody "fixes" the tone and deletes the
   * reason the hatch is there.
   */
  it("leans on the hatch rather than the tone, and says so", () => {
    expect(contrast(COLORS.get("hold")!, COLORS.get("paper")!)).toBeLessThan(3);
    expect(COLORS.get("hold-hatch")).toBeDefined();
    expect(DESIGN).toContain("the hold is carried by its hatch");
  });
});

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
function documentedColors(): Map<string, string> {
  const block = /^colors:\n((?:  .*\n)+)/m.exec(DESIGN);
  if (!block) throw new Error("DESIGN.md has no `colors:` block. That is the bug.");

  const colors = new Map<string, string>();
  for (const line of block[1].split("\n")) {
    if (line.trim() === "") continue;
    const entry = /^ {2}([a-z0-9-]+): "([^"]+)"$/.exec(line);
    if (!entry) throw new Error(`DESIGN.md colours are not name: "value" — ${line}`);
    colors.set(entry[1], entry[2]);
  }
  return colors;
}

/** What `:root` in globals.css actually sets, by custom-property name. */
function stylesheetTokens(): Map<string, string> {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(CSS);
  if (!root) throw new Error("globals.css has no :root block.");

  const tokens = new Map<string, string>();
  for (const [, name, value] of root[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens.set(name, value.trim());
  }
  return tokens;
}

/** Same colour, however it is spelled. Whitespace inside rgba() is not a value. */
function sameColour(a: string, b: string): boolean {
  const key = (c: string) => c.toLowerCase().replace(/\s+/g, "");
  return key(a) === key(b);
}

const COLORS = documentedColors();
const TOKENS = stylesheetTokens();

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
describe("the paper is one colour", () => {
  const paper = COLORS.get("paper")!;

  it.each([
    ["src/lib/board/composite.ts", "the wall the server composes"],
    ["src/components/BoardCanvas.tsx", "the board the browser paints"],
    ["src/components/ConfirmationStep.tsx", "the preview before paying"],
    ["src/lib/board/image-encode.ts", "the flatten behind a transparent upload"],
  ])("%s — %s", (path) => {
    const source = readFileSync(path, "utf8");
    const hexes = [...source.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase());

    expect(
      hexes.some((hex) => sameColour(hex, paper)),
      `${path} paints the board and never mentions ${paper}`,
    ).toBe(true);
  });

  it("is not the same as the surface around it, and is not far from it either", () => {
    // The sheet reads as an object on a surface rather than a hole in one, and
    // the document says nothing may depend on the difference. Both halves.
    const step = contrast(paper, COLORS.get("canvas")!);
    expect(step).toBeGreaterThan(1);
    expect(step).toBeLessThan(1.15);
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

  /** The rows of the main table: `| `name` `#hex` | 1.23 | ... |`. */
  const rows = [
    ...DESIGN.matchAll(
      /^\| `([a-z-]+)` `(#[0-9a-f]{6})` \|((?: \*?\*?\d+\.\d\d\*?\*? \|){5})$/gm,
    ),
  ];

  it("prints a table with every foreground in it", () => {
    // If the table is reformatted into something this cannot read, that is a
    // failing test rather than a check that silently stops checking.
    expect(rows.length).toBeGreaterThanOrEqual(9);
  });

  it.each(rows.map((row) => [row[1], row[2], row[3]]))(
    "%s on all five surfaces",
    (name, hex, cells) => {
      expect(sameColour(hex, COLORS.get(name)!), `${name} in the table is not the token`).toBe(true);

      const claimed = [...cells.matchAll(/(\d+\.\d\d)/g)].map((m) => Number(m[1]));
      expect(claimed).toHaveLength(SURFACES.length);

      claimed.forEach((value, index) => {
        const surface = SURFACES[index];
        const actual = contrast(hex, COLORS.get(surface)!);
        expect(
          Number(actual.toFixed(2)),
          `${name} on ${surface}: the document says ${value}`,
        ).toBe(value);
      });
    },
  );

  /**
   * The two floors the document argues for in words. If a value ever moves,
   * this is what says the argument no longer holds — rather than the table
   * quietly reporting a smaller number that still looks fine.
   */
  it("keeps every control boundary at the 3:1 WCAG 1.4.11 asks for", () => {
    for (const surface of SURFACES) {
      for (const boundary of ["control-line", "frame"]) {
        expect(
          contrast(COLORS.get(boundary)!, COLORS.get(surface)!),
          `${boundary} on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("keeps every text tone at the 4.5:1 WCAG 1.4.3 asks for, mute excepted", () => {
    for (const surface of SURFACES) {
      for (const tone of ["ink", "ink-soft", "body"]) {
        expect(
          contrast(COLORS.get(tone)!, COLORS.get(surface)!),
          `${tone} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      // `mute` is exempt — a disabled label and one decorative glyph — and
      // exempt is not a licence to be invisible.
      expect(contrast(COLORS.get("mute")!, COLORS.get(surface)!)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the accent's own label legible on it", () => {
    expect(contrast(COLORS.get("on-primary")!, COLORS.get("primary")!)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(COLORS.get("on-primary")!, COLORS.get("primary-pressed")!),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a hold tellable from the paper it is drawn on", () => {
    expect(contrast(COLORS.get("hold")!, COLORS.get("paper")!)).toBeGreaterThanOrEqual(3);
    expect(contrast(COLORS.get("ink")!, COLORS.get("hold")!)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a sale that has not loaded tellable from a rectangle nobody bought", () => {
    expect(
      contrast(COLORS.get("sold-fallback")!, COLORS.get("paper")!),
      "the fallback under an undecoded sale",
    ).toBeGreaterThanOrEqual(1.5);
  });
});

describe("the typefaces", () => {
  const families = [
    ...DESIGN.matchAll(/fontFamily: "([^"]+)"/g),
    ...DESIGN.matchAll(/\*\*([A-Z][A-Za-z ]+)\*\* for (?:display|every number)/g),
  ].map((m) => m[1]);

  it("names exactly the two the document's type section names", () => {
    expect(new Set(families)).toEqual(new Set(["Space Grotesk", "IBM Plex Mono"]));
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

    expect(families).toEqual(["IBM_Plex_Mono", "Space_Grotesk"]);
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

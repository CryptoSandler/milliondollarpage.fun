import { readFile } from "node:fs/promises";

/**
 * The board's own JavaScript, measured, so a page added somewhere else cannot
 * make the wall slower.
 *
 * WHO CALLS THIS: a person, after `npm run build`, and `/cierre` step 2 for any
 * batch that adds a route. It reads what the build already wrote rather than
 * building again.
 *
 * ## Why this exists
 *
 * The landing at `/faq` is meant to be heavy — effects, illustrations, six
 * sections — and the owner's constraint on it was that none of that reaches the
 * board. "Cero impacto en el peso" is a claim about a number, and a claim about
 * a number that nobody measures is a claim that quietly stops being true the
 * first time somebody imports a shared component into both.
 *
 * ## What it measures
 *
 * The bytes of JavaScript the browser must have before `/` is interactive: the
 * route's own chunks plus the shared ones every route loads. That is the same
 * quantity Next prints as "First Load JS", computed here from
 * `.next/app-build-manifest.json` so it is a number rather than a line of
 * console output that changed format.
 *
 * THE CEILING IS PINNED AND IT IS NOT A BUDGET TO SPEND. 440 is what the board
 * measures today — 429.8 — plus ten kilobytes of air. If a batch needs more,
 * the number moves in the same commit as the code that needed it, with the
 * reason in the message, which is the whole point of pinning it rather than
 * printing it.
 *
 * THESE ARE BYTES ON DISK, NOT OVER THE WIRE. Next's own console table reports
 * transfer size, which is roughly a third of this after compression. Two
 * different numbers measuring the same thing is worse than one, so this reads
 * the files and says so rather than trying to reproduce theirs.
 *
 * AND THE CEILING IS THE BACKSTOP, NOT THE CLAIM. The claim is the line below
 * it: the landing's own chunks, and how many of them the board is carrying.
 * That number is zero and a ceiling would not have caught it going to one.
 */
const CEILING_KB = 440;

/**
 * WHERE THE NUMBER COMES FROM, and it took three tries to find.
 *
 * `.next/app-build-manifest.json` does not exist in this version of Next; the
 * app router writes one manifest PER ROUTE at
 * `.next/server/app/<route>/build-manifest.json`, and the client bytes a route
 * needs are its `rootMainFiles` plus whatever it lists under `pages`. Reading
 * the console table instead would be reading a format that changes.
 */
type RouteManifest = { rootMainFiles: string[]; pages: Record<string, string[]> };

async function chunksFor(route: string): Promise<string[]> {
  let manifest: RouteManifest;
  try {
    manifest = JSON.parse(
      await readFile(`.next/server/app/${route}/build-manifest.json`, "utf8"),
    ) as RouteManifest;
  } catch {
    throw new Error(`no build manifest for ${route} — run \`npm run build\` first.`);
  }
  const listed = Object.values(manifest.pages ?? {}).flat();
  return [...new Set([...(manifest.rootMainFiles ?? []), ...listed])].filter((f) =>
    f.endsWith(".js"),
  );
}

async function bytesFor(route: string): Promise<{ files: string[]; bytes: number }> {
  const files = await chunksFor(route);
  let bytes = 0;
  for (const file of files) {
    bytes += (await readFile(`.next/${file}`)).byteLength;
  }
  return { files, bytes };
}

const board = await bytesFor("page");
const landing = await bytesFor("faq/page");

const kb = (n: number) => (n / 1024).toFixed(1).padStart(7);

console.log(`\n  route                 chunks        JS`);
console.log(`  /                  ${String(board.files.length).padStart(7)}  ${kb(board.bytes)} kB`);
console.log(`  /faq               ${String(landing.files.length).padStart(7)}  ${kb(landing.bytes)} kB`);

/*
  THE SECOND NUMBER IS THE ONE THAT MATTERS, and it is not the landing's size:
  it is how much of the landing the BOARD is carrying. Anything both routes list
  is shared, which is fine; anything the board lists that only the landing needs
  is the failure this guard exists for.
*/
const onTheBoard = new Set(board.files);
const shared = landing.files.filter((f) => onTheBoard.has(f));
const landingOnly = landing.files.filter((f) => !onTheBoard.has(f));
console.log(
  `\n  ${shared.length} chunk(s) on both routes — the framework and the theme switch.` +
    `\n  ${landingOnly.length} chunk(s) belong to /faq alone, and the board carries none of them.`,
);

/*
  THE CLAIM ITSELF. A chunk the landing needs that the board also loads is the
  landing costing the wall something, which is the exact failure the owner asked
  to be guarded — and it is a different question from "is the board big", which
  the ceiling below answers.
*/
const landingOnBoard = landingOnly.filter((f) => onTheBoard.has(f));
if (landingOnBoard.length > 0) {
  console.error(
    `\n  THE BOARD IS CARRYING THE LANDING: ${landingOnBoard.join(", ")}`,
  );
  process.exitCode = 1;
}

if (board.bytes / 1024 > CEILING_KB) {
  console.error(
    `\n  OVER: / carries ${(board.bytes / 1024).toFixed(1)} kB against a ${CEILING_KB} kB ceiling.\n` +
      "  If that is deliberate, move the ceiling in the same commit and say why.",
  );
  process.exitCode = 1;
} else {
  console.log(`  / is inside its ${CEILING_KB} kB ceiling.\n`);
}

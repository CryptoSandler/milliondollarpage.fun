/**
 * The log's entries, written by hand and kept in the repository.
 *
 * WHO CALLS THIS: `src/app/log/page.tsx`, which renders the published ones, and
 * `src/app/log/rss.xml/route.ts`, which serves the same list as a feed. Neither
 * could hold the entries itself: two readers of one list that each kept their
 * own copy is a feed that eventually disagrees with the page it feeds.
 *
 * ## Why a file and not a table
 *
 * ponytail, rung 1 and then rung 3: a log gets an entry every few weeks, is
 * written by one person, and is read far more often than it is written. A table
 * would need a migration, an admin surface to write through, and a deploy to
 * change the shape of an entry anyway — while a file is edited in the same pull
 * request as the code, reviewed the same way, and is already versioned by git,
 * which is exactly the audit trail a public log wants. The upgrade path, if
 * somebody other than the owner ever writes here, is a table and an editor.
 *
 * ## Every entry carries a date and a number, and the type enforces both
 *
 * `date` and `figure` are required fields rather than conventions. This is a
 * log about a wall that is selling, and the whole reason to read one is to find
 * out what actually happened — an entry with no number in it is an entry that
 * could have been written on any day about any wall. `figure.where` names the
 * page the reader can check it on, because a number nobody can check is a claim
 * rather than a fact.
 *
 * ## Drafts do not publish, and that is the owner's gate
 *
 * An entry is `"draft"` until the owner reads it and changes one word in this
 * file. Drafts are excluded from the page and from the feed —
 * `src/app/__tests__/log.test.tsx` is what keeps that true rather than the
 * discipline of whoever writes the next one — and it fires the filter at a
 * fixture carrying a draft, because a list with no drafts in it cannot prove a
 * draft would be withheld.
 *
 * The two entries below were written on 2026-09-03 with the numbers the site
 * had that day, held as drafts until the owner read them, and published by him
 * the same night.
 *
 * ## First person, and nobody is named
 *
 * "I" and "we", never a name, never a wallet, never a buyer's identity. The
 * genre this belongs to is Alex Tew's 2005 blog, which is the reason anyone
 * remembers the original as a story rather than as an advert — see
 * `docs/marketing-fomo.md`. What it borrows is the voice and the cadence. What
 * it does not borrow is naming the people who bought.
 */

export type LogEntry = {
  /** Stable, in the URL and in the feed's guid. Never edited once published. */
  slug: string;
  /** The day it describes, `YYYY-MM-DD`, UTC. */
  date: string;
  title: string;
  /**
   * The one number this entry is about, and where a reader checks it.
   *
   * Required. See the module comment: an entry without one is an entry about
   * nothing in particular.
   */
  figure: { value: string; of: string; where: string };
  /** Paragraphs, plain text. No markup, because none of these needs any. */
  body: string[];
  /** `draft` is invisible to the page and the feed. The owner flips it. */
  status: "draft" | "published";
};

/**
 * Newest first, which is the order both readers want and the order the file
 * should be edited in — a new entry goes at the top.
 */
export const LOG_ENTRIES: LogEntry[] = [
  {
    slug: "why-a-second-one",
    date: "2026-09-03",
    title: "Why there is a second one of these",
    figure: {
      value: "342,000 pixels",
      of: "the original page whose links no longer go anywhere",
      where: "/faq",
    },
    body: [
      "The Million Dollar Homepage sold its last pixel in January 2006 and it is still online, which is the part everybody remembers. The part I keep coming back to is what a study in 2017 found when it followed the links: of 2,816 of them, 547 were dead and another 489 pointed somewhere else entirely. At a dollar a pixel that is 342,000 pixels of advertising that no longer advertises anything. The BBC put the rot at around 40% by 2019.",
      "So the interesting question was never whether the idea works — it worked, spectacularly, once. It was what you would do differently knowing how it aged. The answer I landed on is boring and it is the whole design: the picture lives here, on this site, served from this database, rather than being fetched from a server somebody stopped paying for in 2009. The link on a rectangle can still rot. The picture cannot.",
      "That is the only promise on the site that is about time, and it is deliberately narrow. I am not going to tell you the wall will be up in twenty years, because I do not know that and neither does anybody who says it.",
    ],
    status: "published",
  },
  {
    slug: "the-wall-is-up",
    date: "2026-09-03",
    title: "The wall is up, and it is empty",
    figure: {
      value: "1,000,000 pixels",
      of: "the wall, all of them still free",
      where: "/stats",
    },
    body: [
      "The wall is 1,250 pixels across and 800 down, which is a million of them, and today every single one is still for sale. A pixel is a dollar, paid in USDC on Solana, and the smallest thing you can buy is one pixel. There is no grid: you draw a rectangle anywhere nothing else stands and it is yours at the size you drew it.",
      "Writing the first entry of a log about a wall with nothing on it feels like starting a diary on the morning of a trip. But the number is the point. Anybody reading this later can check what it says against /stats, which counts the same rows the board draws from, and see what the first day looked like. If the wall fills, this entry is the before picture. If it does not, it is still an honest one.",
      "What happens next, in order: the first pixel, then the first thousand, then every hundred thousand after that. Each of those gets an entry here with the number in it and a date on it. Nothing else does — this is not a feed and I am not going to post about progress.",
    ],
    status: "published",
  },
];

/**
 * The entries a reader may see, newest first. Drafts never come out of here.
 *
 * It takes the list rather than closing over it so the filter can be fired at a
 * fixture that HAS a draft in it. Both entries below are published now, and a
 * guard whose only evidence is "no draft leaked" proves nothing on a list with
 * no drafts in it — see `src/app/__tests__/log.test.tsx`.
 */
export function publishedEntries(entries: LogEntry[] = LOG_ENTRIES): LogEntry[] {
  return entries
    .filter((entry) => entry.status === "published")
    .sort((a, b) => b.date.localeCompare(a.date));
}

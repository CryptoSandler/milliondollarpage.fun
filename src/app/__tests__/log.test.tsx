import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LogPage from "../log/page";
import PressPage from "../press/page";
import { GET as feed } from "../log/rss.xml/route";
import { logFeedXml, rfc822, xmlEscape } from "../../lib/log/feed";
import { LOG_ENTRIES, publishedEntries, type LogEntry } from "../../lib/log/entries";

/**
 * The gate on the log, which is the owner's and not a reviewer's.
 *
 * An entry is a draft until the owner changes one word in
 * `src/lib/log/entries.ts`. That is a convention, and a convention is exactly
 * what a merge on a busy night walks past — so these are the assertions that
 * make it a mechanism. The failure being prevented is specific: an entry the
 * owner has not read appearing on a public page and in a feed people subscribe
 * to, where it cannot be recalled.
 */

async function feedText(): Promise<string> {
  return await feed().text();
}

/** One draft and one published entry, so the filter can be seen to choose. */
const FIXTURE: LogEntry[] = [
  {
    slug: "published-one",
    date: "2026-09-03",
    title: "A published entry",
    figure: { value: "1", of: "a thing", where: "/stats" },
    body: ["I wrote this and it was approved."],
    status: "published",
  },
  {
    slug: "draft-one",
    date: "2026-09-04",
    title: "A draft entry nobody has approved",
    figure: { value: "2", of: "another thing", where: "/stats" },
    body: ["I wrote this and nobody has read it yet."],
    status: "draft",
  },
];

describe("the log publishes nothing the owner has not approved", () => {
  /*
    THE MECHANISM, FIRED AT A FIXTURE THAT HAS A DRAFT IN IT. Both real entries
    are published now, so an assertion that "no draft leaked" over the real list
    would pass while the filter did nothing at all. This is the one that would
    fail if the word stopped meaning anything.
  */
  it("withholds a draft and keeps the published one", () => {
    expect(publishedEntries(FIXTURE).map((entry) => entry.slug)).toEqual(["published-one"]);
  });

  it("keeps a draft out of the feed, newest first", () => {
    const xml = logFeedXml(publishedEntries(FIXTURE));
    expect(xml).toContain("A published entry");
    expect(xml).not.toContain("A draft entry nobody has approved");
    expect(xml).not.toContain("draft-one");
  });

  it("puts every published entry on the page and nothing else", () => {
    const html = renderToStaticMarkup(<LogPage />);
    for (const entry of LOG_ENTRIES) {
      if (entry.status === "published") {
        expect(html).toContain(entry.title);
        expect(html).toContain(entry.figure.value);
      } else {
        expect(html).not.toContain(entry.title);
        expect(html).not.toContain(entry.body[0]);
      }
    }
  });

  it("puts every published entry in the feed and nothing else", async () => {
    const xml = await feedText();
    for (const entry of LOG_ENTRIES) {
      if (entry.status === "published") {
        expect(xml).toContain(entry.title);
        expect(xml).toContain(entry.slug);
      } else {
        expect(xml).not.toContain(entry.title);
        expect(xml).not.toContain(entry.slug);
      }
    }
  });

  it("says so on the page rather than looking broken, when there is nothing", () => {
    if (publishedEntries().length > 0) return;
    expect(renderToStaticMarkup(<LogPage />)).toContain("Nothing published yet");
  });
});

/**
 * The rule that makes this a log rather than a stream of announcements: every
 * entry carries a date and a number, and says where the number can be checked.
 *
 * The type already requires the fields. What the type cannot require is that
 * they are FILLED IN — `figure: { value: "", of: "", where: "" }` type-checks —
 * and an entry with an empty figure is the shape this rule exists to refuse.
 */
describe("every entry carries a date and a checkable figure", () => {
  it.each(LOG_ENTRIES.map((entry) => [entry.slug, entry] as const))("%s", (_slug, entry) => {
    expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(`${entry.date}T00:00:00Z`))).toBe(false);
    expect(entry.figure.value.trim()).not.toBe("");
    expect(entry.figure.of.trim()).not.toBe("");
    // A page on this site, so a reader can actually go and look.
    expect(entry.figure.where).toMatch(/^\//);
    expect(entry.body.length).toBeGreaterThan(0);
    // First person, anonymous. Nobody is named in this log — not a buyer, not
    // the owner. The voice is the borrowed half of Alex Tew's blog; naming
    // people is the half deliberately not borrowed.
    expect(entry.body.join(" ")).toMatch(/\b(I|we|my|our)\b/);
  });

  it("has no two entries sharing a slug", () => {
    const slugs = LOG_ENTRIES.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("the feed", () => {
  it("is served as RSS and parses as one channel", async () => {
    const response = feed();
    expect(response.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await response.text();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<channel>");
    expect(xml).toContain("</rss>");
    // Absolute, because a feed is read somewhere else entirely.
    expect(xml).toContain("https://milliondollarpage.fun/log");
  });

  it("carries no ampersand that is not part of an entity", async () => {
    expect(await feedText()).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  /*
    THE ESCAPING, SEEN TO FAIL. A guard that has never fired is a guard that can
    quietly stop matching — and this one is the reason the document parses at
    all. The apostrophe is not hypothetical: the log's own voice is first person
    and half the sentences in it will carry one.
  */
  it("escapes every character XML cannot carry raw", () => {
    expect(xmlEscape(`Tew's & <b>"x"</b>`)).toBe(
      "Tew&apos;s &amp; &lt;b&gt;&quot;x&quot;&lt;/b&gt;",
    );
  });

  it("survives an entry written with all five of them in it", () => {
    const xml = logFeedXml([
      {
        slug: "hostile",
        date: "2026-09-03",
        title: `An entry with 'quotes' & <tags>`,
        figure: { value: "1 & 1", of: `two <things> we've counted`, where: "/stats" },
        body: [`A paragraph with "quotes", an & and a <tag>.`],
        status: "published",
      },
    ]);
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    // The tag never reaches the document as a tag.
    expect(xml).not.toContain("<tags>");
    expect(xml).toContain("&lt;tags&gt;");
  });

  it("dates entries in the format RSS asks for", () => {
    expect(rfc822("2026-09-03")).toBe("Thu, 03 Sep 2026 00:00:00 GMT");
  });
});

describe("/press", () => {
  it("starts empty and says so", () => {
    const html = renderToStaticMarkup(<PressPage />);
    expect(html).toContain("Nothing yet");
  });
});

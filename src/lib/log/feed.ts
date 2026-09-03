import { absoluteUrl } from "../site";
import { publishedEntries, type LogEntry } from "./entries";

/**
 * The log, as the XML a feed reader wants.
 *
 * WHO CALLS THIS: `src/app/log/rss.xml/route.ts`, and nothing else. It is a
 * module rather than the body of that route for one reason that is worth a
 * file: a route handler may export only what Next recognises, so the escaping
 * this document's correctness rests on could not be reached by a test while it
 * lived in there — and `xmlEscape` is exactly the function that has to be seen
 * to fail before it is trusted. `src/app/__tests__/log.test.tsx` fires it.
 *
 * ## RSS 2.0 and not JSON Feed or Atom
 *
 * ponytail: whichever one every reader accepts. That is RSS 2.0, it needs no
 * dependency, and the whole document is a template literal below.
 *
 * ## Everything interpolated is escaped, and that is the trust boundary
 *
 * The entries are written by hand in this repository, so nothing hostile is
 * expected here — and that is precisely why every interpolation is wrapped
 * rather than the ones that look risky. An apostrophe in a title is enough to
 * produce a feed no reader will parse, and a feed nobody notices is broken is
 * worse than no feed at all.
 */

/** The five characters XML cannot carry raw. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** `YYYY-MM-DD` as the RFC 822 date RSS wants, at midnight UTC. */
export function rfc822(date: string): string {
  return new Date(`${date}T00:00:00Z`).toUTCString();
}

function item(entry: LogEntry): string {
  /*
    THE FIGURE LEADS THE DESCRIPTION, because a feed reader shows the first line
    and this log's whole shape is "a date and a number". An entry whose summary
    opened on prose would read, in a river of other feeds, like every other post
    about a project going well.
  */
  const description = [`${entry.figure.value} — ${entry.figure.of}.`, ...entry.body].join("\n\n");

  return `    <item>
      <title>${xmlEscape(entry.title)}</title>
      <link>${xmlEscape(absoluteUrl(`/log#${entry.slug}`))}</link>
      <!-- Not a permalink: an entry is an anchor on one page, so the id has to
           stay stable even if that page is ever split into one URL per entry. -->
      <guid isPermaLink="false">${xmlEscape(`milliondollarpage.fun:log:${entry.slug}`)}</guid>
      <pubDate>${xmlEscape(rfc822(entry.date))}</pubDate>
      <description>${xmlEscape(description)}</description>
    </item>`;
}

export function logFeedXml(entries = publishedEntries()): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>milliondollarpage.fun · Log</title>
    <link>${xmlEscape(absoluteUrl("/log"))}</link>
    <atom:link href="${xmlEscape(absoluteUrl("/log/rss.xml"))}" rel="self" type="application/rss+xml" />
    <description>What has actually happened to this wall, one entry per milestone, each with a date and a number you can check.</description>
    <language>en</language>
${entries.map(item).join("\n")}
  </channel>
</rss>
`;
}

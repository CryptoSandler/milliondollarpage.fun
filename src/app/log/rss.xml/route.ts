import { logFeedXml } from "../../../lib/log/feed";

export const dynamic = "force-static";

/**
 * The log as a feed.
 *
 * WHO CALLS THIS: a reader's feed reader, and `src/app/log/page.tsx`, which
 * links to it and declares it in `alternates`. The page could not serve it
 * itself — a feed is XML with its own content type — and the two share the one
 * list in `src/lib/log/entries.ts`, so they can never disagree about what has
 * been published.
 *
 * WHY A FEED AT ALL, on a site with seven pages: this log will have an entry
 * every few weeks at best, which is exactly the publishing rhythm nobody comes
 * back to a page for. `docs/marketing-fomo.md` makes the case — what made the
 * original a story was that people could follow it. This costs no runtime and
 * no dependency, and it is the only way to follow this that does not require an
 * account with anybody.
 *
 * The document itself is `src/lib/log/feed.ts`; see there for why it is not in
 * this file.
 */
export function GET(): Response {
  return new Response(logFeedXml(), {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      // A log gets an entry every few weeks. An hour of cache costs a reader
      // nothing and costs this site every poll from every reader in between.
      "cache-control": "public, max-age=3600",
    },
  });
}

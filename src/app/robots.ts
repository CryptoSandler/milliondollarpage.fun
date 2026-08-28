import type { MetadataRoute } from "next";

/**
 * The whole site is closed to crawlers until the owner launches it by hand.
 *
 * WHO READS THIS: crawlers, before they fetch anything. Next serves it at
 * `/robots.txt` from this file's presence alone — there is no caller in this
 * repository, which is the one exception to CLAUDE.md's rule that a module
 * names its callers, and it is named here so the absence reads as deliberate.
 *
 * THIS IS ONE OF THREE LOCKS AND NONE OF THEM COVERS THE OTHERS' GROUND:
 *
 *  - this file, which is advisory and read before the fetch;
 *  - `metadata.robots` in `src/app/layout.tsx`, the `<meta>` tag that governs a
 *    page somebody has already fetched — a URL linked from anywhere gets
 *    crawled whatever robots.txt says, and only the tag keeps it out of an
 *    index;
 *  - `X-Robots-Tag` in `next.config.ts`, the same instruction for responses
 *    with no `<head>` to put a tag in: the API routes, the wall PNG, JSON.
 *
 * `Disallow: /` is blunt on purpose. Nothing here is ready to be indexed, and a
 * per-path rule would be a claim about which pages are.
 *
 * **LIFTING THIS IS A THREE-FILE CHANGE, ALL THREE OR NONE.** Two out of three
 * is a site that is indexed anyway and looks protected.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}

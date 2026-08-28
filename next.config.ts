import type { NextConfig } from "next";

/**
 * The third of the three noindex locks, for responses that have no `<head>`.
 *
 * A `<meta>` tag cannot be attached to the wall PNG, to `/robots.txt` itself,
 * or to any JSON an API route returns, and those are exactly the URLs a crawler
 * reaches by following a link rather than by asking for a page. This header
 * covers them.
 *
 * **LIFTING THE NOINDEX IS A THREE-FILE CHANGE** — this entry,
 * `metadata.robots` in `src/app/layout.tsx`, and `src/app/robots.ts`. All three
 * or none: any two of them leaves a door open while looking shut.
 */
const NOINDEX_UNTIL_LAUNCH = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: NOINDEX_UNTIL_LAUNCH }];
  },

  // The dev-only route indicator has to sit in one of four corners
  // (devIndicators takes a corner `position` or `false`; there is no pixel
  // offset in this Next version), and the redesigned bars now occupy all
  // four: the wordmark, the counters, the presets and the Buy button. The
  // top-left corner is the only one whose content never changes and never
  // reports anything — the wordmark reads the same on every page — so the
  // badge lands there rather than over a number, a price or the one button
  // that matters.
  devIndicators: {
    position: "top-left",
  },
};

export default nextConfig;

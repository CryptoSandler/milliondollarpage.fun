import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

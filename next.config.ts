import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only route indicator defaults to the bottom-left corner, which in
  // this layout lands squarely on the bottom bar's selection text. Both bars
  // are left-aligned, so the top bar's right side is empty at every width
  // this app supports — moving the indicator there keeps it off everything
  // the bars actually say. (devIndicators only accepts a corner `position`
  // or `false` to hide it entirely in this Next version; there is no way to
  // offset it by a pixel amount.)
  devIndicators: {
    position: "top-right",
  },
};

export default nextConfig;

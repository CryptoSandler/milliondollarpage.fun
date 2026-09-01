import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Two faces, both variable, both self-hosted by next/font at build time so no
 * request leaves for Google at runtime.
 *
 * Space Grotesk sets display and prose. IBM Plex Mono sets every NUMBER, every
 * label and every piece of metadata — which is a category rather than a
 * decoration: a measurement is set in the mono and a sentence is not, so a
 * reader can tell a fact from a claim without reading either. DESIGN.md picks
 * both; nothing else on the page declares a family, and `design-tokens.test.ts`
 * is what keeps that true.
 */
const display = Space_Grotesk({
  variable: "--font-display-family",
  subsets: ["latin"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-family",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "milliondollarpage.fun",
  // A dollar a pixel is both the strapline and the offer now: the pixel is
  // the unit, so this sentence and the one beside the Buy button finally say
  // the same thing. What it deliberately does NOT say is anything about
  // reselling. It used to end "yours to keep or resell", which promised a
  // transfer nobody has decided to build — see SECURITY.md, where that is
  // recorded as an open decision with neither answer claimed.
  description:
    "A million pixels at a dollar each, on a wall 1250 by 800. Buy any free rectangle — one pixel or ten thousand — pay in USDC on Solana, and those pixels stay yours.",
  // Closed to crawlers until the owner launches by hand. This is the lock that
  // works on a page a crawler already has in its hands — robots.txt is only
  // advisory and is read before the fetch, so a URL shared anywhere would be
  // indexed without this tag. See `src/app/robots.ts` for the other two, and
  // lift all three together or none of them.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas font-ui text-ink">{children}</body>
    </html>
  );
}

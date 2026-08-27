import type { Metadata } from "next";
import { Bricolage_Grotesque, Karla } from "next/font/google";
import "./globals.css";

/**
 * Two faces, both variable, both self-hosted by next/font at build time so no
 * request leaves for Google at runtime.
 *
 * Bricolage Grotesque sets display: the wordmark, headings, and the big
 * numbers. Karla sets everything else. DESIGN.md picks both; nothing else on
 * the page declares a family.
 */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

const karla = Karla({
  variable: "--font-karla",
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${karla.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas font-ui text-ink">{children}</body>
    </html>
  );
}

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
  description:
    "A 1000×1000 canvas sold ten pixels at a time. Pick a rectangle, pay in USDC on Solana, and the block is yours to keep or resell.",
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

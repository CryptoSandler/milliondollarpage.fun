import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { query } from "../../lib/db";
import BlockPageRoute from "../b/[id]/page";
import BuyersPage from "../buyers/page";
import FaqPage from "../faq/page";
import HowToBuyPage from "../how-to-buy/page";
import LogPage from "../log/page";
import PressPage from "../press/page";
import StatsPage from "../stats/page";
import { CONTACT_EMAIL } from "../../lib/site";

/**
 * There is an address on this site, it is the same address everywhere, and it
 * is not a link yet.
 *
 * THE THIRD CLAUSE IS THE ONE WITH A DATE ON IT. The mailbox does not exist:
 * the domain is at Namecheap and the owner has chosen to put Private Email on
 * it at the end of the build. Until then the address is printed as text, so a
 * reader copies it rather than firing a message into a mailbox that will bounce
 * without telling them. `src/lib/site.ts` carries the reasoning and the one-line
 * upgrade.
 *
 * This guard exists because the fix — wrapping it in an `<a href="mailto:">` —
 * is the most natural edit anybody looking at this markup would make, and it
 * would look like an improvement right up until the first message vanished.
 */

const PER_PIXEL = 1_000_000;

async function seed(): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                         buyer_pubkey, payment_signature, caption, link)
     VALUES (12, 34, 50, 20, 'paid', $1, $2, '2026-03-04T05:06:07Z',
             'AWalletNobodyMayLearn', 'a-signature', 'My shop', 'https://example.com/shop')
     RETURNING id`,
    [PER_PIXEL, 50 * 20 * PER_PIXEL],
  );
  return rows[0].id;
}

const PAGES: [string, () => Promise<string>][] = [
  ["the landing and the FAQ", async () => renderToStaticMarkup(<FaqPage />)],
  ["how to buy", async () => renderToStaticMarkup(<HowToBuyPage />)],
  ["what the wall has done", async () => renderToStaticMarkup(await StatsPage())],
  ["the log", async () => renderToStaticMarkup(<LogPage />)],
  ["press", async () => renderToStaticMarkup(<PressPage />)],
  [
    "who has bought",
    async () =>
      renderToStaticMarkup(await BuyersPage({ searchParams: Promise.resolve({}) })),
  ],
  [
    "one rectangle's own page",
    async () =>
      renderToStaticMarkup(await BlockPageRoute({ params: Promise.resolve({ id: await seed() }) })),
  ],
];

describe("the contact address", () => {
  it.each(PAGES)("is at the foot of %s", async (_name, render) => {
    expect(await render()).toContain(CONTACT_EMAIL);
  });

  it.each(PAGES)("is not a mailto on %s", async (_name, render) => {
    expect(await render()).not.toContain("mailto:");
  });

  it("is answered on the FAQ as well as in the footer", async () => {
    // Three times on that page since 2026-09-04: the invitation to report a
    // mismatch, the answer about changing a sold rectangle, and the footer
    // every page carries. A missing one would mean a route out was dropped.
    const html = renderToStaticMarkup(<FaqPage />);
    expect(html.split(CONTACT_EMAIL)).toHaveLength(4);
  });

  /**
   * THE WORDING IS THE PROMISE, and it was chosen over a stronger one.
   *
   * The owner's first phrasing was "changes only by claim", which promises a
   * PROCESS — that a claim exists, is read, and can be granted. There is no
   * claims table and no signed request, deliberately (see `takedown.ts` and
   * `DECISIONS.md`), so that sentence would have been a mechanism the site does
   * not have. This one is true of the code as well as the copy: `attachContent`
   * refuses anything but a reserved row and three migrations freeze the rest.
   */
  it("says a sold rectangle is not editable, and promises nothing beyond that", () => {
    const html = renderToStaticMarkup(<FaqPage />);
    expect(html).toContain("A sold rectangle is not editable from this site");
    const words = html.replace(/<[^>]*>/g, " ").toLowerCase();
    expect(words).not.toContain("changes only by claim");
    expect(words).not.toContain("we will change");
  });

  it("is at this domain, so a forward at the registrar can reach it", () => {
    expect(CONTACT_EMAIL.endsWith("@milliondollarpage.fun")).toBe(true);
  });
});

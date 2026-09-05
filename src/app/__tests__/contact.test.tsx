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
 * There is an address on this site, it is the same address everywhere, and
 * since 2026-09-05 it is a link.
 *
 * THE THIRD CLAUSE HAS A DATE ON IT IN BOTH DIRECTIONS. It was deliberately NOT
 * a link while the mailbox did not exist — a `mailto:` on an address that
 * bounces invites a reader to spend a message that silently fails — and this
 * file guarded that. The mailbox is open, so the guard now holds the other end:
 * a page that quietly went back to bare text would be a page where pressing the
 * address does nothing. `src/lib/site.ts` keeps both halves of the reasoning,
 * because the reason it was text is the reason it would have to be text again.
 */

const PER_PIXEL = 1_000_000;

async function seed(): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                         owner_address, payment_signature, caption, link, approved_at)
     VALUES (12, 34, 50, 20, 'paid', $1, $2, '2026-03-04T05:06:07Z',
             'AWalletNobodyMayLearn', 'a-signature', 'My shop', 'https://example.com/shop', now())
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

  /*
    THE GUARD TURNED ROUND ON 2026-09-05. It asserted the address was NOT a
    link, because the mailbox did not exist and a `mailto:` would have spent
    readers' messages silently. The mailbox is open, so the same guard now
    holds the other end: every page that prints the address links it, and a
    page that printed it as bare text again would be a page where the most
    natural thing a reader does — press it — does nothing.
  */
  it.each(PAGES)("is a mailto on %s", async (_name, render) => {
    expect(await render()).toContain(`mailto:${CONTACT_EMAIL}`);
  });

  it("is answered on the FAQ as well as in the footer", async () => {
    // Three PLACES on that page: the invitation to report a mismatch, the
    // answer about changing a sold rectangle, and the footer every page
    // carries. A missing one would mean a route out was dropped.
    //
    // Counted as `mailto:` rather than as the address, because since
    // 2026-09-05 each place spends the address twice — once in the href and
    // once as the text somebody can still copy. Counting the address would
    // have made this assertion a fact about the markup rather than about how
    // many ways out of this page there are.
    const html = renderToStaticMarkup(<FaqPage />);
    expect(html.split(`mailto:${CONTACT_EMAIL}`)).toHaveLength(4);
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

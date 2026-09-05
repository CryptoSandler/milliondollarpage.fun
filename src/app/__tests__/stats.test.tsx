import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { execute } from "../../lib/db";
import { GET } from "../api/board/route";
import StatsPage from "../stats/page";
import { boardStandings, soldToday, soldValueBaseUnits } from "../../lib/board/blocks";

/**
 * What `/stats` says, and the one number that is allowed to be here and
 * nowhere else.
 *
 * The page is rendered rather than asserted through its queries, because two of
 * the three claims are sentences: that nothing on the ranking can be outbid,
 * and that no holder is named. A query test would pass with either sentence
 * missing from the screen.
 */

const PER_PIXEL = 1_000_000;

async function sell(x: number, w: number, h: number, at: string, buyer = "AWalletNobodyMayLearn") {
  await execute(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                         owner_address, payment_signature)
     VALUES ($1, 0, $2, $3, 'paid', $4, $5, $6, $7, $8)`,
    [x, w, h, PER_PIXEL, w * h * PER_PIXEL, at, buyer, `sig-${x}`],
  );
}

async function render(): Promise<string> {
  return renderToStaticMarkup(await StatsPage());
}

describe("the ranking", () => {
  it("ranks rectangles by pixels held, biggest first", async () => {
    await sell(0, 10, 10, "2026-01-01T00:00:00Z");
    await sell(20, 100, 100, "2026-01-02T00:00:00Z");
    await sell(220, 50, 50, "2026-01-03T00:00:00Z");

    expect((await boardStandings()).map((b) => b.pixels)).toEqual([10_000, 2_500, 100]);
  });

  /**
   * The mechanic, inverted. The genre's leaderboard can be climbed by paying
   * more; this one cannot, because nothing about a sold rectangle can be
   * changed by anyone. A tie therefore has to be broken by something that is
   * not a bid, and the only such fact is which one was there first.
   */
  it("breaks a tie by which rectangle was there first, never by what was paid", async () => {
    await sell(0, 50, 50, "2026-01-03T00:00:00Z");
    await sell(60, 50, 50, "2026-01-01T00:00:00Z");
    await sell(120, 50, 50, "2026-01-02T00:00:00Z");

    expect((await boardStandings()).map((b) => b.x)).toEqual([60, 120, 0]);
  });

  it("says out loud that nothing on it can be outbid", async () => {
    await sell(0, 100, 100, "2026-01-01T00:00:00Z");
    const html = await render();

    expect(html).toContain("Nothing here can be outbid");
    expect(html).toContain("a rank changes only when somebody buys a bigger rectangle of their own");
  });

  it("names nobody, and says that it names nobody", async () => {
    await sell(0, 100, 100, "2026-01-01T00:00:00Z");
    const html = await render();

    expect(html).not.toContain("AWalletNobodyMayLearn");
    expect(html).toContain("No holder is named anywhere on this page");
    expect(html).toContain("Rectangles are ranked; people are not.");
  });

  it("says what an empty ranking is waiting for", async () => {
    const html = await render();
    expect(html).toContain("The first rectangle on the wall is the first rectangle on this list");
  });
});

describe("the four figures", () => {
  it("puts pixels sold and money taken against the same ceiling", async () => {
    await sell(0, 100, 100, "2026-01-01T00:00:00Z");
    const html = await render();

    expect(html).toContain("10,000");
    expect(html).toContain("of 1,000,000");
    expect(html).toContain("$10,000");
    expect(html).toContain("of $1,000,000, which is what the whole wall costs");
  });

  it("shows one person as one person rather than as nothing", async () => {
    await execute(
      `INSERT INTO presence_seen (caller_hash, minute) VALUES ('somebody', date_trunc('minute', now()))`,
    );
    const html = await render();

    expect(html).toContain("that is one person, and it may be you");
  });
});

/**
 * The number that lives here and may not live on the board.
 *
 * DESIGN.md's top-bar section: "Nothing on the page promises revenue. Not a
 * million dollars raised, not a total, not an implied one." The way that is
 * held up is that the board is never TOLD the number — so this asserts the
 * absence from the payload rather than the absence from some markup, which is
 * a guarantee a future component cannot undo by accident.
 */
describe("what the board is never told", () => {
  it("keeps the money total out of /api/board entirely", async () => {
    await sell(0, 100, 100, "2026-01-01T00:00:00Z");

    expect(await soldValueBaseUnits()).toBe(10_000 * PER_PIXEL);

    const body = JSON.parse(await (await GET()).text());
    expect(Object.keys(body)).not.toContain("soldValueBaseUnits");
    expect(Object.keys(body.stats)).toEqual(["pixelsSold", "blocksSold", "percentSold"]);
  });
});

/**
 * The one number this batch added, and the two ways it could be dishonest: by
 * counting a day that is not the day it names, and by appearing on the board.
 */
describe("what sold today", () => {
  it("counts rectangles and pixels settled since midnight UTC, and nothing older", async () => {
    // Two today, one yesterday. `now()` rather than a literal, because "today"
    // is a moving target and a fixture with a date in it stops being today.
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at, payment_signature)
       VALUES (0,   0, 10, 10, 'paid', $1, $2, now(), 'today-a'),
              (20,  0, 20, 20, 'paid', $1, $3, date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 'today-b'),
              (60,  0, 30, 30, 'paid', $1, $4, now() - interval '2 days', 'older')`,
      [PER_PIXEL, 100 * PER_PIXEL, 400 * PER_PIXEL, 900 * PER_PIXEL],
    );

    expect(await soldToday()).toEqual({ blocks: 2, pixels: 500 });
  });

  it("counts a minute before midnight UTC as yesterday", async () => {
    await execute(
      `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at, payment_signature)
       VALUES (0, 0, 10, 10, 'paid', $1, $2,
               (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - interval '1 minute',
               'just-missed')`,
      [PER_PIXEL, 100 * PER_PIXEL],
    );

    expect(await soldToday()).toEqual({ blocks: 0, pixels: 0 });
  });

  it("reads zero as its own sentence rather than as a figure that flatters", async () => {
    const html = await render();
    expect(html).toContain("Nothing has sold today yet");
  });

  it("says the count and the window on the page", async () => {
    await sell(0, 40, 40, new Date().toISOString());
    const html = await render();

    // The count is in its own span — a measurement is mono and the sentence
    // around it is not — so the number and its noun are asserted as the markup
    // actually renders them rather than as they read.
    expect(html).toContain(">1</span> rectangle");
    expect(html).toContain("sold today");
    expect(html).toContain("1,600 pixels");
    expect(html).toContain("counting since midnight UTC");
  });

  /**
   * DESIGN.md: "nothing on the board promises revenue […] the board is never
   * handed the number." A count of today's sales is not revenue, and it is
   * forecast-shaped in exactly the way that rule is about — so the mechanism is
   * the same one `soldValueBaseUnits` uses: it is not in the payload.
   */
  it("never reaches the board's payload", async () => {
    await sell(0, 40, 40, new Date().toISOString());
    const body = await (await GET()).json();

    expect(Object.keys(body.stats)).toEqual(["pixelsSold", "blocksSold", "percentSold"]);
    expect(JSON.stringify(body)).not.toContain("soldToday");
  });
});

import { describe, expect, it } from "vitest";
import { GET } from "../../go/[id]/route";
import { clicksFor } from "../../../lib/board/audience";
import { queryOne } from "../../../lib/db";

/**
 * The counting redirect, and the one property that makes it safe to have.
 *
 * A redirector is the classic open redirect: read a destination out of the
 * request and send the visitor there, and this domain's good name is on
 * somebody else's phishing page. This one has no parameter to read. Every test
 * below is a different way of asking it to go somewhere it was not told to by
 * the DATABASE, and the answer is always the block's own link or a 404.
 */

async function block(fields: {
  link?: string | null;
  status?: string;
  hidden?: boolean;
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, caption, link, price_per_pixel_usdc, total_usdc,
                         expires_at, hidden_at)
     VALUES (0, 0, 10, 10, $1, 'A caption', $2, 1000000, 100000000,
             CASE WHEN $1 = 'reserved' THEN now() + interval '30 minutes' END,
             CASE WHEN $3 THEN now() END)
     RETURNING id`,
    /*
      `"link" in fields`, not `??`. The first version wrote `fields.link ??
      default`, which turns an explicit null into the default and made the
      "sale with no link" case silently test a sale WITH one — it passed with a
      302 where it wanted a 404, which is the fixture lying rather than the
      route misbehaving.
    */
    [
      fields.status ?? "paid",
      "link" in fields ? fields.link : "https://example.com/buyer",
      fields.hidden ?? false,
    ],
  );
  return row!.id;
}

const go = (id: string) =>
  GET(new Request(`https://milliondollarpage.fun/go/${id}`), {
    params: Promise.resolve({ id }),
  });

describe("GET /go/[id]", () => {
  it("redirects to the link stored on the block, and counts the follow", async () => {
    const id = await block({ link: "https://example.com/buyer" });

    const response = await go(id);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/buyer");
    expect(await clicksFor(id)).toBe(1);
  });

  /**
   * THE OPEN REDIRECT, ASKED FOR FOUR WAYS.
   *
   * Every one of these is a URL an attacker controls entirely, and none of them
   * changes where the response goes — because the route never reads the request
   * for a destination. If this ever fails, the fix is not to sanitise the
   * parameter; it is to stop reading one.
   */
  it("never takes its destination from anything in the request", async () => {
    const id = await block({ link: "https://example.com/buyer" });

    for (const attempt of [
      `?to=https://evil.example/phish`,
      `?url=https://evil.example/phish`,
      `?next=//evil.example`,
      `?redirect_uri=https%3A%2F%2Fevil.example`,
    ]) {
      const response = await GET(
        new Request(`https://milliondollarpage.fun/go/${id}${attempt}`),
        { params: Promise.resolve({ id }) },
      );
      expect(response.status, `for ${attempt}`).toBe(302);
      expect(response.headers.get("location"), `for ${attempt}`).toBe(
        "https://example.com/buyer",
      );
    }
  });

  it("refuses an id that is not a uuid, the same way it refuses one that is not there", async () => {
    for (const id of ["../../etc/passwd", "https://evil.example", "not-a-uuid", ""]) {
      const response = await GET(new Request(`https://milliondollarpage.fun/go/${id}`), {
        params: Promise.resolve({ id }),
      });
      expect(response.status, `for ${JSON.stringify(id)}`).toBe(404);
    }
    // And an id that IS a uuid but names nothing.
    expect((await go("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  /**
   * A HOLD'S LINK IS NOT PUBLIC, so it has no way out of here either.
   *
   * The same rule the image route and the details route keep: a reservation is
   * thirty free minutes, and without this it would be thirty free minutes of a
   * redirect that carries this domain's name to anywhere the holder typed —
   * for free, repeatably, and without ever paying.
   */
  it("refuses a hold, which has not paid for a link this domain vouches for", async () => {
    const id = await block({ status: "reserved", link: "https://evil.example/free-ride" });
    const response = await go(id);
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(await clicksFor(id), "a refused follow is not a click").toBe(0);
  });

  it("refuses a rectangle that has been taken down", async () => {
    const id = await block({ hidden: true });
    expect((await go(id)).status).toBe(404);
  });

  it("refuses a sale with no link at all rather than redirecting nowhere", async () => {
    const id = await block({ link: null });
    expect((await go(id)).status).toBe(404);
  });

  it("is never cached, because a cached redirect is a click nobody hears about", async () => {
    const id = await block({});
    const response = await go(id);
    expect(response.headers.get("cache-control")).toContain("no-store");
    // And this page does not hand its own address to a destination it vouches
    // for but does not control.
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("counts every follow, not one per rectangle", async () => {
    const id = await block({});
    await go(id);
    await go(id);
    await go(id);
    expect(await clicksFor(id)).toBe(3);
  });

  /*
    NOT TESTED HERE: that a failing counter still redirects. The route swallows
    it — the visitor asked to go somewhere and bookkeeping is not their problem —
    and the only way to make the write fail from a test is to drop the table
    the whole run shares. A test that leaves the schema broken when it crashes
    between the drop and the restore is a worse bargain than an unproven catch,
    and this is the honest place to say so rather than a silent omission.
  */
});

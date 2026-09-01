import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { query } from "../../../lib/db";
import { GET } from "../blocks/[id]/card/route";

/**
 * The card route: the ladder, the cache header and the ceiling.
 *
 * The composition is tested next door against the database. What is here is the
 * half that only exists once there is a Request: that a malformed id and an
 * absent one answer the same 404, that the header says what `/image`'s says,
 * and that the limit is a real 429 with a real `Retry-After` — a limit a client
 * cannot obey is not a limit.
 */

const PER_PIXEL = 1_000_000;
const IP = "203.0.113.7";

function ask(id: string, ip = IP): Promise<Response> {
  return GET(new Request(`http://localhost/api/blocks/${id}/card`, { headers: { "x-forwarded-for": ip } }), {
    params: Promise.resolve({ id }),
  });
}

async function sell(): Promise<string> {
  // Encoded by `sharp` rather than typed as hex. The first version of this
  // fixture was a hand-written PNG that libpng refused, and the failure came
  // out of the renderer as `vipspng: libpng read error` — which reads like a
  // defect in the code under test and was a defect in the test.
  const image = await sharp({
    create: { width: 12, height: 9, channels: 3, background: "#1f4fd8" },
  })
    .png()
    .toBuffer();
  const [row] = await query<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, price_per_pixel_usdc, total_usdc, paid_at,
                         payment_signature, pending_image, pending_image_mime)
     VALUES (0, 0, 120, 90, 'paid', $1, $2, now(), $3, $4, 'image/png')
     RETURNING id`,
    [PER_PIXEL, 10_800 * PER_PIXEL, "5Kq2xVn7".repeat(11), image],
  );
  return row.id;
}

describe("GET /api/blocks/:id/card", () => {
  it("serves a PNG for a sold block", async () => {
    const response = await ask(await sell());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Number(response.headers.get("content-length"))).toBeGreaterThan(0);
  });

  /**
   * The same header the bitmap beside it carries, and deliberately identical:
   * two routes serving one block's content must not have two arguments for how
   * long it is good for.
   */
  it("is cached for a year, immutably, by shared caches too", async () => {
    const response = await ask(await sell());
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("answers the same 404 for a malformed id and an absent one", async () => {
    const malformed = await ask("not-a-uuid");
    const absent = await ask("11111111-1111-4111-8111-111111111111");

    expect(malformed.status).toBe(404);
    expect(absent.status).toBe(404);
    expect(await malformed.json()).toEqual(await absent.json());
  });

  it("refuses a caller whose address cannot be trusted", async () => {
    const response = await GET(new Request("http://localhost/api/blocks/x/card"), {
      params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
    });
    expect(response.status).toBe(400);
  });

  it("stops a caller walking ids in a loop, and says when to come back", async () => {
    const id = await sell();
    // A window's worth from one address, then one more.
    const ip = "198.51.100.42";
    let last: Response | undefined;
    for (let i = 0; i < 31; i += 1) last = await ask(id, ip);

    expect(last!.status).toBe(429);
    const retry = Number(last!.headers.get("retry-after"));
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(60);
  });

  it("counts each address on its own", async () => {
    const id = await sell();
    // The previous test spent one address's allowance. A different one is
    // unaffected, which is what makes this a per-caller ceiling rather than a
    // global one.
    expect((await ask(id, "198.51.100.99")).status).toBe(200);
  });
});

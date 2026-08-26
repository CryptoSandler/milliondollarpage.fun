import { describe, expect, it } from "vitest";
import { queryOne } from "../../../lib/db";
import { GET } from "../blocks/[id]/image/route";

// Not a real WebP — the route never decodes, it only hands bytes back, and a
// test that asserts "exactly these bytes" is stronger with bytes chosen to be
// recognisable.
const BYTES = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x01, 0x02, 0xff, 0xfe]);

async function insert(status: string, image: Buffer | null, mime: string | null): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, expires_at, price_per_pixel_usdc, total_usdc,
                         pending_image, pending_image_mime)
     VALUES (0, 0, 10, 10, $1, $2, 1000000, 100000000, $3, $4)
     RETURNING id`,
    [status, status === "reserved" ? "2999-01-01T00:00:00Z" : null, image, mime],
  );
  return row!.id;
}

function call(id: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/blocks/${id}/image`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/blocks/[id]/image", () => {
  it("serves a paid block's bytes back byte for byte", async () => {
    const id = await insert("paid", BYTES, "image/webp");
    const response = await call(id);
    expect(response.status).toBe(200);
    const body = Buffer.from(await response.arrayBuffer());
    expect(Buffer.compare(body, BYTES)).toBe(0);
  });

  it("declares the type the upload was stored with, not a guess", async () => {
    const id = await insert("paid", BYTES, "image/png");
    const response = await call(id);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe(String(BYTES.byteLength));
  });

  it("forbids a browser from sniffing past that type", async () => {
    const id = await insert("paid", BYTES, "image/webp");
    expect((await call(id)).headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("lets the bytes be cached hard, because a sale's pixels never change", async () => {
    const id = await insert("paid", BYTES, "image/webp");
    const cacheControl = (await call(id)).headers.get("cache-control");
    expect(cacheControl).toContain("immutable");
    expect(cacheControl).toContain("max-age=31536000");
  });

  it("serves a minted block too", async () => {
    const id = await insert("minted", BYTES, "image/webp");
    expect((await call(id)).status).toBe(200);
  });

  it("404s a reserved block: an unpaid upload is not public", async () => {
    const id = await insert("reserved", BYTES, "image/webp");
    const response = await call(id);
    expect(response.status).toBe(404);
    // And the bytes really are absent, not merely mislabelled.
    expect(Buffer.from(await response.arrayBuffer()).includes(BYTES)).toBe(false);
  });

  it("404s a sale with no image attached", async () => {
    const id = await insert("paid", null, null);
    expect((await call(id)).status).toBe(404);
  });

  it("404s an id that is not a uuid, rather than raising a 500 out of Postgres", async () => {
    for (const id of ["not-a-uuid", "1", "../../etc/passwd", ""]) {
      expect((await call(id)).status).toBe(404);
    }
  });

  it("404s a well-formed id that names nothing", async () => {
    expect((await call("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("says the same thing however the id fails, so a guess learns nothing", async () => {
    const held = await insert("reserved", BYTES, "image/webp");
    const missing = "00000000-0000-4000-8000-000000000000";
    const malformed = "not-a-uuid";
    const bodies = await Promise.all(
      [held, missing, malformed].map(async (id) => (await call(id)).text()),
    );
    expect(new Set(bodies).size).toBe(1);
  });
});

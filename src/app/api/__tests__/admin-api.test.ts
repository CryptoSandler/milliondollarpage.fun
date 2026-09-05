import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { ADMIN_COOKIE, createAdminSession } from "../../../lib/admin";
import { hashIp } from "../../../lib/callers/client-ip";
import { query, queryOne } from "../../../lib/db";
import { ensureWall, wallImage } from "../../../lib/board/composite";
import { reserveRect } from "../../../lib/board/reserve";
import { GET as detailsRoute } from "../blocks/[id]/route";
import { GET as imageRoute } from "../blocks/[id]/image/route";
import { POST as actionRoute } from "../admin/blocks/[id]/route";
import { GET as takedownsRoute } from "../admin/takedowns/route";
import { DELETE as signOutRoute, POST as signInRoute } from "../admin/session/route";

/**
 * The moderation console, driven the way an operator drives it.
 *
 * WHAT THESE ASSERT AGAINST. Not the columns. A takedown's job is that the
 * content stops being served, so the proofs below read the WALL, the image
 * route and the details route — the three things that actually publish — and
 * compare their answers before and after. A test that asserted `hidden_at IS
 * NOT NULL` would pass on the day a route forgot to filter on it, which is the
 * only bug worth catching here.
 *
 * The rule being guarded is `SECURITY.md` § Takedown: "The block stops being
 * published: the composite wall is regenerated without it, the image route
 * does not serve it, the caption and link are not returned. Nothing is
 * deleted"; and for the second level, the image, mime, hash, caption and link
 * "are actually erased", while "in neither case does ownership of the
 * rectangle transfer or lapse".
 *
 * Every test talks to Postgres several times over, and the guard floors every
 * refusal at 250ms on purpose, so the timeout is raised here rather than
 * repo-wide.
 */
vi.setConfig({ testTimeout: 30_000 });

const TOKEN = "an-admin-secret-for-tests-4a91c7";
const OWNER = "OwnerWalletAddress11111111111111";
const IP = "203.0.113.7";
const REASON = "a report we are still checking";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("ADMIN_TOKEN", TOKEN);
  // Pin the hop count so a developer's .env.local cannot change what the
  // fixtures below mean. The suite already deletes ALLOW_UNTRUSTED_CLIENT_IP.
  vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
});

/** A real, decodable picture, so the wall assertions have something to sample. */
async function magenta(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 250, g: 0, b: 250 } } })
    .png()
    .toBuffer();
}

/** A sold rectangle with an image, a caption and a link, at the top-left. */
async function sold(): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO blocks (x, y, w, h, status, owner_address, caption, link,
                         price_per_pixel_usdc, total_usdc,
                         pending_image, pending_image_mime, image_fit, image_sha256, approved_at)
     VALUES (0, 0, 20, 20, 'paid', $1, 'My shop', 'https://example.com/shop',
             1000000, 400000000, $2, 'image/png', 'cover', $3, now())
     RETURNING id`,
    [OWNER, await magenta(), "a".repeat(64)],
  );
  return row!.id;
}

async function signedIn(): Promise<string> {
  const session = await createAdminSession("admin", hashIp(IP));
  return `${ADMIN_COOKIE}=${session.id}`;
}

/** POST /api/admin/blocks/[id], as an operator or as a stranger. */
function act(id: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return actionRoute(
    new Request(`http://localhost/api/admin/blocks/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": IP, ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function takedowns(headers: Record<string, string> = {}): Promise<Response> {
  return takedownsRoute(
    new Request("http://localhost/api/admin/takedowns", {
      headers: { "x-forwarded-for": IP, ...headers },
    }),
  );
}

function fetchImage(id: string): Promise<Response> {
  return imageRoute(new Request(`http://localhost/api/blocks/${id}/image`), {
    params: Promise.resolve({ id }),
  });
}

function fetchDetails(id: string): Promise<Response> {
  return detailsRoute(new Request(`http://localhost/api/blocks/${id}`), {
    params: Promise.resolve({ id }),
  });
}

/** The bytes the image route is serving right now, or null if it serves none. */
async function servedBytes(id: string): Promise<Buffer | null> {
  const response = await fetchImage(id);
  if (response.status !== 200) return null;
  return Buffer.from(await response.arrayBuffer());
}

/** One pixel of the current wall, decoded — and the version serving it. */
async function wallPixelAt(x: number, y: number) {
  const wall = await ensureWall();
  if (!wall) throw new Error("there should be a wall");
  const image = await wallImage(wall.version);
  // sharp reads either encoding, which is the point: the assertion below is
  // about pixels, and the wall's format is whichever came out smaller.
  const { data, info } = await sharp(image!.bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * 4;
  return { version: wall.version, r: data[at], g: data[at + 1], b: data[at + 2], a: data[at + 3] };
}

/** Everything about a Response a caller can observe. */
async function shape(response: Response) {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers].sort(),
    body: await response.text(),
  };
}

describe("a stranger gets the guard's single refusal, from every admin route", () => {
  it("answers the list and all three actions identically", async () => {
    const id = await sold();
    const refusals = [
      await shape(await takedowns()),
      await shape(await act(id, { action: "hide", reason: REASON })),
      await shape(await act(id, { action: "unhide" })),
      await shape(await act(id, { action: "purge", reason: REASON, confirm: `PURGE ${id}` })),
      // A malformed id must not answer differently either: the guard runs
      // before the id is looked at, so this is refused rather than 404'd.
      await shape(await act("not-a-uuid", { action: "hide", reason: REASON })),
      // Nor an id that names nothing. A 404 here would confirm which block ids
      // exist to a caller who has not authenticated.
      await shape(await act("00000000-0000-0000-0000-000000000000", { action: "unhide" })),
      // A wrong token is the same answer as no token at all.
      await shape(await takedowns({ "x-admin-token": "not-the-token" })),
    ];

    for (const refusal of refusals) expect(refusal).toEqual(refusals[0]);
    expect(refusals[0].status).toBe(401);
  });

  it("changes nothing while refusing, even with a perfect purge confirmation", async () => {
    const id = await sold();
    const before = await servedBytes(id);
    expect(before).not.toBeNull();

    expect((await act(id, { action: "purge", reason: REASON, confirm: `PURGE ${id}` })).status).toBe(401);

    expect(Buffer.compare((await servedBytes(id))!, before!)).toBe(0);
    expect((await fetchDetails(id)).status).toBe(200);
  });
});

describe("hiding, through the route", () => {
  it("takes the block off the wall, out of the image route and out of the words", async () => {
    const cookie = await signedIn();
    const id = await sold();

    const painted = await wallPixelAt(10, 10);
    expect(painted).toMatchObject({ r: 250, g: 0, b: 250, a: 255 });
    const bytesBefore = await servedBytes(id);
    expect(bytesBefore).not.toBeNull();

    const hidden = await act(id, { action: "hide", reason: REASON }, { cookie });
    expect(hidden.status).toBe(200);
    expect((await hidden.json()).block).toMatchObject({ id, x: 0, y: 0, w: 20, h: 20, purgedAt: null });

    // The wall is a different wall now — the fingerprint filters on
    // `hidden_at`, so the composite rebuilt itself without this block.
    const gone = await wallPixelAt(10, 10);
    expect(gone.a).toBe(0);
    expect(gone.version).not.toBe(painted.version);

    expect((await fetchImage(id)).status).toBe(404);
    const details = await (await fetchDetails(id)).text();
    expect(details).not.toContain("My shop");
    expect(details).not.toContain("example.com");
  });

  it("gives the same bytes back on unhide, and the same wall", async () => {
    const cookie = await signedIn();
    const id = await sold();

    const painted = await wallPixelAt(10, 10);
    const contentType = (await fetchImage(id)).headers.get("content-type");
    const bytesBefore = (await servedBytes(id))!;

    expect((await act(id, { action: "hide", reason: REASON }, { cookie })).status).toBe(200);
    expect(await servedBytes(id)).toBeNull();

    const back = await act(id, { action: "unhide" }, { cookie });
    expect(back.status).toBe(200);
    expect((await back.json()).block).toMatchObject({ hiddenAt: null, takedownReason: null });

    const after = await fetchImage(id);
    expect(after.headers.get("content-type")).toBe(contentType);
    expect(Buffer.compare(Buffer.from(await after.arrayBuffer()), bytesBefore)).toBe(0);
    expect(await wallPixelAt(10, 10)).toMatchObject({ version: painted.version, r: 250, g: 0, b: 250, a: 255 });
    expect(JSON.parse(await (await fetchDetails(id)).text())).toMatchObject({
      caption: "My shop",
      link: "https://example.com/shop",
    });
  });

  it("refuses a hide with no reason, and hides nothing", async () => {
    const cookie = await signedIn();
    const id = await sold();
    expect((await act(id, { action: "hide", reason: "   " }, { cookie })).status).toBe(400);
    expect((await fetchImage(id)).status).toBe(200);
  });

  it("answers a non-uuid id with 404 rather than a 500 from Postgres", async () => {
    const cookie = await signedIn();
    const response = await act("not-a-uuid", { action: "hide", reason: REASON }, { cookie });
    expect(response.status).toBe(404);
    // The same 404 an id that names nothing gets: 22P02 never reaches the pool.
    expect(await shape(response)).toEqual(
      await shape(await act("00000000-0000-0000-0000-000000000000", { action: "hide", reason: REASON }, { cookie })),
    );
  });

  it("refuses to flag a hold, which has nothing anybody bought", async () => {
    const cookie = await signedIn();
    const held = await reserveRect({ x: 100, y: 100, w: 10, h: 10 }, { chain: "solana", address: OWNER }, "e".repeat(64));
    expect((await act(held.id, { action: "hide", reason: REASON }, { cookie })).status).toBe(404);
    const rows = await query<{ hidden_at: Date | null }>("SELECT hidden_at FROM blocks WHERE id = $1", [
      held.id,
    ]);
    expect(rows[0].hidden_at).toBeNull();
  });
});

describe("the typed confirmation, which a browser dialog could not enforce", () => {
  it("refuses a purge with no confirmation, and the row keeps every byte", async () => {
    const cookie = await signedIn();
    const id = await sold();
    const before = (await servedBytes(id))!;

    const refused = await act(id, { action: "purge", reason: "a court order" }, { cookie });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toContain(`PURGE ${id}`);

    // The proof that the refusal happened before anything was destroyed.
    expect(Buffer.compare((await servedBytes(id))!, before)).toBe(0);
    const row = await queryOne<{ caption: string; link: string; purged_at: Date | null }>(
      "SELECT caption, link, purged_at FROM blocks WHERE id = $1",
      [id],
    );
    expect(row).toMatchObject({ caption: "My shop", link: "https://example.com/shop", purged_at: null });
  });

  it("refuses a confirmation for a different block, and one that is nearly right", async () => {
    const cookie = await signedIn();
    const id = await sold();
    const other = "00000000-0000-0000-0000-000000000000";

    for (const confirm of [`PURGE ${other}`, `purge ${id}`, `PURGE ${id} `, "PURGE", id]) {
      expect((await act(id, { action: "purge", reason: "a court order", confirm }, { cookie })).status).toBe(400);
    }
    expect(await servedBytes(id)).not.toBeNull();
    expect((await fetchDetails(id)).status).toBe(200);
  });
});

describe("a legal purge, through the route", () => {
  it("erases the content and leaves the sale exactly where it was", async () => {
    const cookie = await signedIn();
    const id = await sold();
    expect((await wallPixelAt(10, 10)).a).toBe(255);

    const purged = await act(id, { action: "purge", reason: "a court order", confirm: `PURGE ${id}` }, { cookie });
    expect(purged.status).toBe(200);
    expect((await purged.json()).block.purgedAt).not.toBeNull();

    const row = await queryOne<{
      pending_image: Buffer | null;
      pending_image_mime: string | null;
      image_sha256: string | null;
      caption: string | null;
      link: string | null;
      status: string;
      owner_address: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }>(
      `SELECT pending_image, pending_image_mime, image_sha256, caption, link,
              status, owner_address, x, y, w, h
         FROM blocks WHERE id = $1`,
      [id],
    );
    expect(row).toMatchObject({
      pending_image: null,
      pending_image_mime: null,
      image_sha256: null,
      caption: null,
      link: null,
      // Ownership never lapses: same owner, same sold status, same rectangle.
      status: "paid",
      owner_address: OWNER,
      x: 0,
      y: 0,
      w: 20,
      h: 20,
    });

    expect((await fetchImage(id)).status).toBe(404);
    expect((await wallPixelAt(10, 10)).a).toBe(0);

    // And nobody else can buy those pixels, which is the half of the promise a
    // status change would have broken.
    await expect(
      reserveRect({ x: 5, y: 5, w: 5, h: 5 }, { chain: "solana", address: "SomebodyElse2222222222" }, "d".repeat(64)),
    ).rejects.toThrow();
  });

  it("is not reversible: unhide afterwards resurrects nothing", async () => {
    const cookie = await signedIn();
    const id = await sold();
    await act(id, { action: "purge", reason: "a court order", confirm: `PURGE ${id}` }, { cookie });

    const attempted = await act(id, { action: "unhide" }, { cookie });
    expect(attempted.status).toBe(404);

    expect(await servedBytes(id)).toBeNull();
    expect((await wallPixelAt(10, 10)).a).toBe(0);
    const row = await queryOne<{ hidden_at: Date | null; caption: string | null }>(
      "SELECT hidden_at, caption FROM blocks WHERE id = $1",
      [id],
    );
    expect(row!.hidden_at).not.toBeNull();
    expect(row!.caption).toBeNull();
  });

  it("cannot be purged twice, so the record of when it happened stands", async () => {
    const cookie = await signedIn();
    const id = await sold();
    const first = await act(id, { action: "purge", reason: "a court order", confirm: `PURGE ${id}` }, { cookie });
    const purgedAt = (await first.json()).block.purgedAt;

    const second = await act(id, { action: "purge", reason: "another order", confirm: `PURGE ${id}` }, { cookie });
    expect(second.status).toBe(404);

    const row = await queryOne<{ purged_at: Date; takedown_reason: string }>(
      "SELECT purged_at, takedown_reason FROM blocks WHERE id = $1",
      [id],
    );
    expect(row!.purged_at.toISOString()).toBe(new Date(purgedAt).toISOString());
    expect(row!.takedown_reason).toBe("a court order");
  });
});

describe("the list of what is hidden", () => {
  it("says what an operator needs, and does not republish the material", async () => {
    const cookie = await signedIn();
    const id = await sold();
    await act(id, { action: "hide", reason: REASON }, { cookie });

    const response = await takedowns({ cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const raw = await response.text();
    // The caption and the link are the material, and often the abuse itself.
    expect(raw).not.toContain("My shop");
    expect(raw).not.toContain("example.com");

    const { takedowns: listed } = JSON.parse(raw);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id,
      x: 0,
      y: 0,
      w: 20,
      h: 20,
      takedownReason: REASON,
      purgedAt: null,
    });
    expect(Date.parse(listed[0].hiddenAt)).not.toBeNaN();
  });

  it("keeps a purged block on it, marked as purged", async () => {
    const cookie = await signedIn();
    const id = await sold();
    await act(id, { action: "purge", reason: "a court order", confirm: `PURGE ${id}` }, { cookie });

    const { takedowns: listed } = await (await takedowns({ cookie })).json();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(id);
    expect(listed[0].purgedAt).not.toBeNull();
  });

  it("drops a block that has been brought back", async () => {
    const cookie = await signedIn();
    const id = await sold();
    await act(id, { action: "hide", reason: REASON }, { cookie });
    await act(id, { action: "unhide" }, { cookie });
    expect((await (await takedowns({ cookie })).json()).takedowns).toEqual([]);
  });
});

describe("signing in and out", () => {
  function signIn(token: string): Promise<Response> {
    const form = new FormData();
    form.set("token", token);
    return signInRoute(
      new Request("http://localhost/api/admin/session", {
        method: "POST",
        headers: { "x-forwarded-for": IP },
        body: form,
      }),
    );
  }

  /** The `mdp_admin=...` pair from a Set-Cookie header, ready to send back. */
  function cookieFrom(response: Response): string | null {
    const header = response.headers.get("set-cookie");
    const pair = header?.split(";")[0];
    return pair?.startsWith(`${ADMIN_COOKIE}=`) && !pair.endsWith("=") ? pair : null;
  }

  it("hands back a session that the takedown routes then accept", async () => {
    const response = await signIn(TOKEN);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin");

    const cookie = cookieFrom(response);
    expect(cookie).not.toBeNull();
    expect((await takedowns({ cookie: cookie! })).status).toBe(200);

    // The cookie carries a session id and never the secret.
    expect(cookie).not.toContain(TOKEN);
  });

  it("hands back nothing for a wrong token, and records the attempt", async () => {
    const response = await signIn("not-the-token");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?error=1");
    expect(cookieFrom(response)).toBeNull();

    const attempts = await query<{ succeeded: boolean }>("SELECT succeeded FROM admin_login_attempts");
    expect(attempts).toEqual([{ succeeded: false }]);
  });

  it("signs out on the server, not only in the browser", async () => {
    const id = await sold();
    const cookie = cookieFrom(await signIn(TOKEN))!;
    expect((await takedowns({ cookie })).status).toBe(200);

    const out = await signOutRoute(
      new Request("http://localhost/api/admin/session", {
        method: "DELETE",
        headers: { "x-forwarded-for": IP, cookie },
      }),
    );
    expect(out.status).toBe(200);

    // The browser was asked to drop the cookie; the revocation is what holds
    // if it does not.
    expect((await takedowns({ cookie })).status).toBe(401);

    // READING is refused above. This is the half that would actually cost
    // something: a revoked cookie must not be able to CHANGE anything either.
    // Self-service revocation is the only revocation this product has (see
    // `admin.ts`), so "signed out" has to mean the session cannot act, not
    // merely that it cannot look.
    const acted = await act(id, { action: "hide", reason: REASON }, { cookie });
    expect(acted.status).toBe(401);

    // And the block it tried to hide is still published, so the refusal was a
    // refusal rather than a failure that happened to also do the work.
    expect(await servedBytes(id)).not.toBeNull();
  });

  /**
   * The asymmetry `admin-guard.ts` describes, proved rather than trusted: the
   * sign-in route tells an operator standing in front of the form why it does
   * not work, and the routes behind the form say nothing at all.
   */
  it("tells an operator when the deployment has no admin surface — and only there", async () => {
    vi.stubEnv("ADMIN_TOKEN", "");

    const signedOut = await signIn(TOKEN);
    expect(signedOut.status).toBe(503);
    expect((await signedOut.json()).error).toContain("not configured");

    const list = await takedowns({ "x-admin-token": TOKEN });
    expect(list.status).toBe(401);
    expect(await shape(list)).toEqual(await shape(await takedowns()));
  });
});

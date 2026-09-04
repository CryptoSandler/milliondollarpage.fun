import { beforeEach, describe, expect, it, vi } from "vitest";
import { execute } from "../../../lib/db";
import { isBlocked } from "../../../lib/board/blocklist";
import { GET as listRoute, POST as editRoute } from "../admin/blocked/route";

/**
 * The door a person edits the blocklist through, and the one it does not open
 * for anybody else.
 *
 * A blocklist only `purge` can write to is a CONSEQUENCE rather than a rule: it
 * can refuse a picture after somebody has already bought a rectangle for it and
 * after a person has already had to look at it. This route is what lets the same
 * decision be made once, in advance.
 *
 * The refusal matters as much as the writing. A blocklist that answers questions
 * to an unauthenticated caller can be ENUMERATED by trying — so an anonymous
 * request must learn nothing at all, not the hashes, not how many there are, and
 * not whether a particular one is on the list.
 */

const TOKEN = "an-admin-token-for-the-suite";
const IP = "203.0.113.9";
const HASH = "d".repeat(64);

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("ADMIN_TOKEN", TOKEN);
  vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
  await execute("DELETE FROM blocked_images");
});

const auth = { authorization: `Bearer ${TOKEN}` };

function list(headers: Record<string, string> = {}): Promise<Response> {
  return listRoute(
    new Request("http://localhost/api/admin/blocked", {
      headers: { "x-forwarded-for": IP, ...headers },
    }),
  );
}

function edit(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return editRoute(
    new Request("http://localhost/api/admin/blocked", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": IP, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("without the token", () => {
  it("tells a stranger nothing, on either verb", async () => {
    expect((await list()).status).toBe(401);
    expect((await edit({ action: "block", sha256: HASH, reason: "x" })).status).toBe(401);
  });

  it("and writes nothing while refusing", async () => {
    await edit({ action: "block", sha256: HASH, reason: "x" });
    expect(await isBlocked(HASH)).toBeNull();
  });
});

describe("with it", () => {
  it("adds a hash, and the row records that a person decided it", async () => {
    const response = await edit({ action: "block", sha256: HASH, reason: "reported twice" }, auth);
    expect(response.status).toBe(200);
    expect(await isBlocked(HASH)).toMatchObject({ source: "admin", reason: "reported twice" });
  });

  it("lists what is on it, newest first, and never caches the answer", async () => {
    await edit({ action: "block", sha256: HASH, reason: "one" }, auth);
    const response = await list(auth);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { blocked: { sha256: string }[] };
    expect(body.blocked.map((b) => b.sha256)).toEqual([HASH]);
  });

  it("takes one off, and says so when there was nothing to take", async () => {
    await edit({ action: "block", sha256: HASH, reason: "a mistake" }, auth);
    expect((await edit({ action: "unblock", sha256: HASH }, auth)).status).toBe(200);
    expect(await isBlocked(HASH)).toBeNull();
    // Not a silent 200: an operator who mistyped one character must find out.
    expect((await edit({ action: "unblock", sha256: HASH }, auth)).status).toBe(404);
  });

  it("insists on a reason, because the row is the only record of why", async () => {
    expect((await edit({ action: "block", sha256: HASH, reason: "   " }, auth)).status).toBe(400);
    expect(await isBlocked(HASH)).toBeNull();
  });

  /*
    WHAT COUNTS AS A HASH, and the first draft of this test got it wrong in a
    way worth keeping: it expected an all-uppercase hash to be REFUSED, and the
    route accepts it — because it trims and lower-cases before checking, which
    is the whole point of doing so. An operator pasting out of a terminal should
    not be fighting the form over whitespace and case. What is refused is
    anything that is not sixty-four hex characters once those two things have
    been done.
  */
  it("refuses anything that is not a hash, rather than storing it", async () => {
    for (const sha256 of ["abc", "0".repeat(63), "z".repeat(64), 42, null, ""]) {
      expect(
        (await edit({ action: "block", sha256, reason: "x" }, auth)).status,
        `sha256 ${JSON.stringify(sha256)}`,
      ).toBe(400);
    }
  });

  it("takes a hash the way a person pastes one — spaced, newlined, upper-case", async () => {
    expect(
      (await edit({ action: "block", sha256: `  ${HASH.toUpperCase()}\n`, reason: "x" }, auth)).status,
    ).toBe(200);
    expect(await isBlocked(HASH)).not.toBeNull();
  });

  it("refuses an action it does not have, and a body that is not JSON", async () => {
    expect((await edit({ action: "delete-everything", sha256: HASH }, auth)).status).toBe(400);
    expect((await edit("not json at all", auth)).status).toBe(400);
  });
});

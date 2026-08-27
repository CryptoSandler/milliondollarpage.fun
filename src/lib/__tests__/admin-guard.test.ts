import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFUSAL_FLOOR_MS, holdRefusal, requireAdmin } from "../admin-guard";
import { ADMIN_COOKIE, ADMIN_LOGIN_LIMITS, createAdminSession, revokeAdminSession } from "../admin";
import { hashIp } from "../callers/client-ip";
import { query } from "../db";

/**
 * The single refusal, and the floor under it.
 *
 * The rule: an unauthenticated request must get a BYTE-IDENTICAL answer to a
 * wrong token, and a deployment with no admin surface must be
 * indistinguishable from one that has an admin surface you have failed to get
 * into. So the assertions below compare the real refusals to EACH OTHER —
 * status, headers and body text as the guard actually produced them — rather
 * than each to a literal. A test that checked every path returns
 * `{ error: "Not authorised." }` with 401 would still pass on the day one path
 * started setting an extra header, which is exactly the tell it exists to
 * prevent.
 */

const TOKEN = "an-admin-secret-for-tests-4a91c7";
const IP = hashIp("203.0.113.7");

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://milliondollarpage.fun/api/admin/takedowns", {
    headers: { "x-forwarded-for": "203.0.113.7", ...headers },
  });
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

/** The refusal `requireAdmin` produced, or a failure if it let the caller in. */
async function refusalFor(headers: Record<string, string> = {}) {
  const guard = await requireAdmin(request(headers), "GET /api/admin/takedowns");
  expect(guard.ok).toBe(false);
  if (guard.ok) throw new Error("the guard admitted a caller this test expected it to refuse");
  return shape(guard.response);
}

describe("one answer for every way of failing", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ADMIN_TOKEN", TOKEN);
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
  });

  it("answers a wrong token exactly as it answers no token", { timeout: 30_000 }, async () => {
    const nothing = await refusalFor();
    const wrong = await refusalFor({ "x-admin-token": "not-the-token" });

    expect(wrong).toEqual(nothing);
    // Named separately so a failure says which half moved, and so nobody
    // reads the deep-equal above as covering only the body.
    expect(wrong.status).toBe(nothing.status);
    expect(wrong.body).toBe(nothing.body);
  });

  it(
    "answers a dead session cookie exactly as it answers no cookie",
    { timeout: 30_000 },
    async () => {
      const revoked = await createAdminSession("admin", IP);
      await revokeAdminSession(revoked.id);

      const expired = await createAdminSession("admin", IP);
      await query(`UPDATE admin_sessions SET expires_at = now() - interval '1 hour' WHERE id = $1`, [
        expired.id,
      ]);

      const nothing = await refusalFor();
      expect(await refusalFor({ cookie: `${ADMIN_COOKIE}=${revoked.id}` })).toEqual(nothing);
      expect(await refusalFor({ cookie: `${ADMIN_COOKIE}=${expired.id}` })).toEqual(nothing);
      expect(await refusalFor({ cookie: `${ADMIN_COOKIE}=nosuchsession` })).toEqual(nothing);
      // A malformed percent-escape: a junk cookie is a failed authentication,
      // not a 500 and not a different answer.
      expect(await refusalFor({ cookie: `${ADMIN_COOKIE}=%` })).toEqual(nothing);
    },
  );

  it(
    "refuses the correct token when ADMIN_TOKEN is unset, and says nothing about it",
    { timeout: 30_000 },
    async () => {
      // First prove this exact request gets in while the token is set —
      // otherwise the refusal below could be a refusal of something else.
      const admitted = await requireAdmin(
        request({ "x-admin-token": TOKEN }),
        "GET /api/admin/takedowns",
      );
      expect(admitted).toEqual({ ok: true, label: "admin (token)" });

      const configuredRefusal = await refusalFor({ "x-admin-token": "not-the-token" });

      vi.stubEnv("ADMIN_TOKEN", "");
      const unconfigured = await refusalFor({ "x-admin-token": TOKEN });

      // "Does this deployment have an admin surface at all" is the first
      // question a prober asks. The answer must be the same object either way.
      expect(unconfigured).toEqual(configuredRefusal);
      expect(await refusalFor()).toEqual(configuredRefusal);
    },
  );

  it("answers a locked-out caller the same way too", { timeout: 30_000 }, async () => {
    const nothing = await refusalFor();
    for (let i = 0; i < ADMIN_LOGIN_LIMITS.maxFailures; i++) {
      await refusalFor({ "x-admin-token": "guess" });
    }
    // Locked out now, holding the RIGHT token, and the refusal is still the
    // same one. A distinct "you are locked out" answer would confirm both the
    // existence of the surface and that the lockout had been reached.
    expect(await refusalFor({ "x-admin-token": TOKEN })).toEqual(nothing);
  });
});

describe("the refusal floor, on the real clock", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
  });

  it(
    "takes at least REFUSAL_FLOOR_MS even with no database work to do",
    { timeout: 30_000 },
    async () => {
      // The unconfigured path spends ZERO round trips. Measured on the wall
      // clock rather than on fake timers, because the property being defended
      // is about wall time: if `holdRefusal` were dropped from `requireAdmin`,
      // this path would return in under a millisecond and a prober would know
      // the deployment has no admin surface. Same clock `holdRefusal` reads.
      vi.stubEnv("ADMIN_TOKEN", "");
      const startedAt = Date.now();
      await refusalFor({ "x-admin-token": TOKEN });
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(REFUSAL_FLOOR_MS);
    },
  );

  it("takes at least REFUSAL_FLOOR_MS on the path that does the work", { timeout: 30_000 }, async () => {
    vi.stubEnv("ADMIN_TOKEN", TOKEN);
    const startedAt = Date.now();
    await refusalFor({ "x-admin-token": "not-the-token" });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(REFUSAL_FLOOR_MS);
  });

  it("lets an authenticated caller straight through", { timeout: 30_000 }, async () => {
    vi.stubEnv("ADMIN_TOKEN", TOKEN);
    const session = await createAdminSession("admin", IP);
    const guard = await requireAdmin(
      request({ cookie: `${ADMIN_COOKIE}=${session.id}` }),
      "GET /api/admin/takedowns",
    );
    expect(guard).toEqual({ ok: true, label: "admin" });
  });

  /**
   * NOT ASSERTED HERE, deliberately: that success is faster than the floor.
   *
   * Success is not padded — `requireAdmin` says so and means it — but the
   * floor is a `max`, not an addition, so a floored success would take
   * `max(250ms, one round trip)`. One round trip to this project's Neon branch
   * measures around 175ms, which leaves 75ms between the assertion passing and
   * the assertion flaking. A timing test with that little room is green on
   * broken code the day the database is slow, which is the one outcome a
   * security test must never produce. The property is defended by the shape of
   * `requireAdmin` instead: the success return is the only one that does not
   * go through `holdRefusal`.
   */
});

/**
 * The floor's mechanics, on fake timers.
 *
 * The wall-clock tests above prove the floor is actually applied. These prove
 * how it behaves at the boundary, where a real-time assertion would be the
 * flakiest thing in the suite — and flaky here means green on broken code,
 * which is the one outcome a security test must never produce. No database, so
 * no per-test timeout is needed.
 */
describe("the floor is a floor, not a constant", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Has `promise` settled by now? Never resolves to a value the caller waits on. */
  function settled(promise: Promise<unknown>): Promise<boolean> {
    return Promise.race([promise.then(() => true), Promise.resolve().then(() => false)]);
  }

  it("holds a refusal that arrived instantly until the floor", async () => {
    const startedAtMs = Date.now();
    const pending = holdRefusal(startedAtMs);

    await vi.advanceTimersByTimeAsync(REFUSAL_FLOOR_MS - 1);
    expect(await settled(pending)).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await settled(pending)).toBe(true);
  });

  it("holds a refusal that already took some time for only the remainder", async () => {
    // The configured path spends four database round trips before refusing.
    // It must end up at the same place on the clock as the path that spent
    // none — that is the whole point.
    const startedAtMs = Date.now();
    await vi.advanceTimersByTimeAsync(REFUSAL_FLOOR_MS - 10);

    const pending = holdRefusal(startedAtMs);
    await vi.advanceTimersByTimeAsync(9);
    expect(await settled(pending)).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await settled(pending)).toBe(true);
  });

  it("does not pad a refusal that already exceeded the floor", async () => {
    // Padding a slow path to floor + elapsed would give every refusal the
    // variance the floor exists to hide.
    const startedAtMs = Date.now();
    await vi.advanceTimersByTimeAsync(REFUSAL_FLOOR_MS * 3);

    const pending = holdRefusal(startedAtMs);
    await vi.advanceTimersByTimeAsync(0);
    expect(await settled(pending)).toBe(true);
  });

  it("keeps the floor above the database work it is hiding", () => {
    // The gap being closed is four Neon round trips. If someone lowers this
    // below the work it hides, the floor stops hiding anything and this is the
    // only thing that would say so.
    expect(REFUSAL_FLOOR_MS).toBeGreaterThanOrEqual(200);
  });
});

import { describe, expect, it } from "vitest";
import { query } from "../../../lib/db";
import { POST, GET } from "../presence/route";

/**
 * The heartbeat route.
 *
 * Two things are asserted that the module test next door cannot: that a caller
 * with no trustworthy address is refused rather than counted, and that the
 * per-minute ceiling is served as a real 429 with a real `Retry-After` — a
 * limit that is only a boolean somewhere is a limit a client cannot obey.
 */

/*
  ONE ENTRY, and the reason is worth writing down because the first draft of
  this file got it wrong and passed four of its six tests anyway. `clientIp`
  reads x-forwarded-for from the RIGHT, because proxies append and the
  left-most entry is whatever the caller sent — which is what stopped anybody
  picking their own rate-limit bucket with a forged header. So a fixture that
  varies the LEFT-hand address varies nothing: both requests hash the same
  right-hand entry, and "two addresses" turns out to be one.
*/
function beat(ip = "203.0.113.7"): Request {
  return new Request("http://localhost/api/presence", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

describe("POST /api/presence", () => {
  it("counts a heartbeat and says nothing back", async () => {
    const response = await POST(beat());

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const [row] = await query<{ count: string }>("SELECT count(*)::text FROM presence_seen");
    expect(Number(row.count)).toBe(1);
  });

  /**
   * The ceiling, asserted without depending on where the minute hand is.
   *
   * The first version of this fired two heartbeats and expected the second to
   * be refused. It is right about the rule and wrong about the clock: a round
   * trip to Postgres is a couple of hundred milliseconds, so two calls
   * occasionally straddle a minute boundary and the second is legitimately
   * ACCEPTED. It passed for days and then failed once, which is the worst way
   * for a test to be wrong — it reads as a regression in the limiter.
   *
   * What is true at every instant is that an accepted heartbeat and a stored
   * row are the same event. That is the invariant, and it holds however the
   * calls fall.
   */
  it("accepts exactly as many heartbeats as it stores rows", async () => {
    let accepted = 0;
    for (let i = 0; i < 6; i += 1) {
      const response = await POST(beat());
      if (response.status === 204) accepted += 1;
      else expect(response.status).toBe(429);
    }

    const [row] = await query<{ count: string }>("SELECT count(*)::text FROM presence_seen");
    expect(Number(row.count)).toBe(accepted);
    // Six calls cannot touch six minutes in the time six round trips take, so
    // at least one of them was refused — which is the ceiling doing its job.
    expect(accepted).toBeLessThan(6);
  });

  it("tells a refused caller when to come back", async () => {
    // Retried, because a single attempt can straddle a minute and be accepted.
    // Three attempts missing is a coincidence no run will see.
    let refused: Response | undefined;
    for (let attempt = 0; attempt < 3 && !refused; attempt += 1) {
      await POST(beat());
      const again = await POST(beat());
      if (again.status === 429) refused = again;
    }

    expect(refused, "no heartbeat was refused in three attempts").toBeDefined();
    const seconds = Number(refused!.headers.get("retry-after"));
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  /**
   * `vitest.setup.ts` deletes ALLOW_UNTRUSTED_CLIENT_IP from this process, so
   * the strict path is what runs here: a request with no trustworthy address
   * has no counting key, and counting it under a shared bucket would let one
   * caller be many.
   */
  it("refuses a caller whose address cannot be trusted", async () => {
    const response = await POST(new Request("http://localhost/api/presence", { method: "POST" }));

    expect(response.status).toBe(400);
    const [row] = await query<{ count: string }>("SELECT count(*)::text FROM presence_seen");
    expect(Number(row.count)).toBe(0);
  });

  it("stores nothing that could name the visitor", async () => {
    await POST(beat("203.0.113.7"));

    const [row] = await query<{ caller_hash: string }>("SELECT caller_hash FROM presence_seen");
    expect(row.caller_hash).not.toContain("203.0.113.7");
    expect(row.caller_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives two addresses two counts", async () => {
    await POST(beat("203.0.113.7"));
    await POST(beat("203.0.113.8"));

    const [row] = await query<{ count: string }>("SELECT count(*)::text FROM presence_seen");
    expect(Number(row.count)).toBe(2);
  });
});

describe("GET /api/presence", () => {
  it("is not a way to read the count", async () => {
    expect((await GET()).status).toBe(405);
  });
});

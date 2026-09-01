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

  it("refuses a second heartbeat inside the same minute, with a time to come back", async () => {
    await POST(beat());
    const again = await POST(beat());

    expect(again.status).toBe(429);
    const seconds = Number(again.headers.get("retry-after"));
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

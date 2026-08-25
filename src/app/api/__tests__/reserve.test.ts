import { describe, expect, it } from "vitest";
import { RESERVATION_LIMITS } from "../../../lib/callers/limits";
import { POST } from "../reserve/route";

const BUYER = "BuyerPubkey1111111111111111111111111111111";

function request(body: unknown, ip = "203.0.113.7"): Request {
  return new Request("http://localhost/api/reserve", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reserve", () => {
  it("holds a free rectangle and returns its price and expiry", async () => {
    const response = await POST(request({ rect: { x: 0, y: 0, w: 20, h: 20 }, buyerPubkey: BUYER }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.pixels).toBe(400);
    expect(body.totalBaseUnits).toBe(400_000_000);
    expect(body.paymentBaseUnits).toBeGreaterThan(body.totalBaseUnits);
    expect(typeof body.id).toBe("string");
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("is never cached", async () => {
    const response = await POST(request({ rect: { x: 0, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 409, not 500, when the pixels were just taken", async () => {
    await POST(request({ rect: { x: 0, y: 0, w: 20, h: 20 }, buyerPubkey: BUYER }));
    const second = await POST(
      request({ rect: { x: 10, y: 10, w: 20, h: 20 }, buyerPubkey: BUYER }, "203.0.113.8"),
    );
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(typeof body.message).toBe("string");
  });

  it("answers 400 for a rectangle off the grid", async () => {
    const response = await POST(request({ rect: { x: 5, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }));
    expect(response.status).toBe(400);
  });

  it("answers 400 for a malformed body", async () => {
    for (const body of [{}, { rect: {} }, { rect: { x: 0, y: 0, w: 10, h: 10 } }, { buyerPubkey: BUYER }]) {
      const response = await POST(request(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("answers 429 with a retry-after once the caller's ceiling is reached", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      const ok = await POST(request({ rect: { x: i * 30, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }));
      expect(ok.status).toBe(201);
    }
    const refused = await POST(request({ rect: { x: 500, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).not.toBeNull();
  });

  it("counts callers separately", async () => {
    for (let i = 0; i < RESERVATION_LIMITS.liveHoldsPerCaller; i++) {
      await POST(request({ rect: { x: i * 30, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }, "198.51.100.1"));
    }
    const other = await POST(
      request({ rect: { x: 500, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }, "198.51.100.2"),
    );
    expect(other.status).toBe(201);
  });

  it("refuses a caller with no trustworthy address", async () => {
    const anonymous = new Request("http://localhost/api/reserve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rect: { x: 0, y: 0, w: 10, h: 10 }, buyerPubkey: BUYER }),
    });
    const response = await POST(anonymous);
    expect([400, 429]).toContain(response.status);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { actOnBlock, fetchTakedowns, signOutAdmin } from "../admin-client";

/**
 * `admin-client.ts` turns a `fetch` outcome into a result the console can
 * render, and its one difference from `purchase-client.ts` is the key it reads:
 * admin routes answer `{ error }`, public ones answer `{ message }`. Reading
 * the wrong one is silent — every refusal would come out as the generic
 * fallback — so it is pinned here.
 *
 * Nothing here touches a DOM or a real network: `globalThis.fetch` is replaced
 * for the duration of each test and restored after.
 */

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetchOnce(response: Response): ReturnType<typeof vi.fn> {
  const stub = vi.fn().mockResolvedValue(response);
  globalThis.fetch = stub as unknown as typeof fetch;
  return stub;
}

function stubFetchThrowing(): ReturnType<typeof vi.fn> {
  const stub = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  globalThis.fetch = stub as unknown as typeof fetch;
  return stub;
}

const ID = "33333333-3333-3333-3333-333333333333";

describe("fetchTakedowns", () => {
  it("hands back the rows the route listed", async () => {
    const row = {
      id: ID,
      x: 1,
      y: 2,
      w: 3,
      h: 4,
      hiddenAt: "2026-08-20T10:00:00.000Z",
      takedownReason: "reported",
      purgedAt: null,
    };
    stubFetchOnce(jsonResponse(200, { takedowns: [row] }));

    await expect(fetchTakedowns()).resolves.toEqual({ ok: true, takedowns: [row] });
  });

  it("reads a refusal out of `error`, which is the key admin routes use", async () => {
    stubFetchOnce(jsonResponse(401, { error: "Not authorised." }));

    await expect(fetchTakedowns()).resolves.toEqual({
      ok: false,
      status: 401,
      message: "Not authorised.",
    });
  });

  it("does not read `message`, so a public-route body cannot masquerade as an admin one", async () => {
    stubFetchOnce(jsonResponse(400, { message: "read from the wrong key" }));

    const result = await fetchTakedowns();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toBe("read from the wrong key");
  });

  it("turns a network failure into status 0 rather than a rejected promise", async () => {
    stubFetchThrowing();

    const result = await fetchTakedowns();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(0);
  });
});

describe("actOnBlock", () => {
  it("posts an unhide with no reason and no confirmation attached to it", async () => {
    const stub = stubFetchOnce(jsonResponse(200, { block: { id: ID } }));
    await actOnBlock(ID, { action: "unhide" });

    const [url, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/admin/blocks/${ID}`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ action: "unhide" });
  });

  it("sends the confirmation exactly as it was typed, wrong ones included", async () => {
    // The point of the assertion: nothing in this module rebuilds the
    // confirmation from the id on the way past. A client that repaired it
    // would be the thing doing the confirming, and the route would then be
    // checking its own work rather than the operator's.
    const mistyped = "purge the one above this";
    const stub = stubFetchOnce(jsonResponse(400, { error: "…" }));

    await actOnBlock(ID, { action: "purge", reason: "court order", confirm: mistyped });

    const [, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      action: "purge",
      reason: "court order",
      confirm: mistyped,
    });
  });

  it("keeps the route's own refusal, which is what the operator has to act on", async () => {
    const refusal = "Nothing changed. That id names no sale.";
    stubFetchOnce(jsonResponse(404, { error: refusal }));

    await expect(actOnBlock(ID, { action: "unhide" })).resolves.toEqual({
      ok: false,
      status: 404,
      message: refusal,
    });
  });
});

describe("signOutAdmin", () => {
  it("asks the server to revoke the session rather than only dropping the cookie", async () => {
    const stub = stubFetchOnce(jsonResponse(200, { ok: true }));
    await expect(signOutAdmin()).resolves.toEqual({ ok: true });

    const [url, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/session");
    expect(init.method).toBe("DELETE");
  });
});

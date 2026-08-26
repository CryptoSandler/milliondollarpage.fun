import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUYER_PUBKEY_HEADER,
  confirmOrder,
  createHold,
  fetchOrder,
  releaseHold,
  submitContent,
} from "../purchase-client";

/**
 * `purchase-client.ts` does exactly one thing: turn a `fetch` response into
 * `{ ok: true; order } | { ok: false; status; message; rejections?; retryAt? }`.
 * Nothing here touches the DOM or a real network — `globalThis.fetch` is
 * replaced with a stub for the duration of each test and restored after,
 * so no other suite in this file list ever sees the stub.
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

describe("createHold", () => {
  it("turns a 201 into ok:true, filling in an order shape from the reservation", async () => {
    stubFetchOnce(
      jsonResponse(201, {
        id: "11111111-1111-1111-1111-111111111111",
        rect: { x: 0, y: 0, w: 10, h: 10 },
        pixels: 100,
        pricePerPixelBaseUnits: 1_000_000,
        totalBaseUnits: 100_000_000,
        paymentBaseUnits: 100_000_042,
        expiresAt: "2026-08-25T12:30:00.000Z",
      }),
    );

    const result = await createHold({ x: 0, y: 0, w: 10, h: 10 }, "buyer-pubkey-1");

    expect(result).toEqual({
      ok: true,
      order: {
        id: "11111111-1111-1111-1111-111111111111",
        rect: { x: 0, y: 0, w: 10, h: 10 },
        status: "reserved",
        pricePerPixelBaseUnits: 1_000_000,
        totalBaseUnits: 100_000_000,
        paymentBaseUnits: 100_000_042,
        expiresAt: "2026-08-25T12:30:00.000Z",
        hasContent: false,
        caption: null,
        link: null,
        imageFit: null,
        isAnimated: false,
      },
    });
  });

  it("posts the rectangle and buyer pubkey as JSON", async () => {
    const stub = stubFetchOnce(jsonResponse(400, { message: "That is not a rectangle this board can sell." }));
    await createHold({ x: 1, y: 2, w: 10, h: 10 }, "buyer-pubkey-1");

    expect(stub).toHaveBeenCalledTimes(1);
    const [url, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/reserve");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      rect: { x: 1, y: 2, w: 10, h: 10 },
      buyerPubkey: "buyer-pubkey-1",
    });
  });

  it("turns a 409 into ok:false, keeping the server's message and status", async () => {
    stubFetchOnce(jsonResponse(409, { message: "Those pixels were just taken." }));

    const result = await createHold({ x: 0, y: 0, w: 10, h: 10 }, "buyer-pubkey-1");

    expect(result).toEqual({ ok: false, status: 409, message: "Those pixels were just taken." });
  });

  it("preserves retryAt from a 429", async () => {
    stubFetchOnce(
      jsonResponse(429, {
        message: "Too many holds from this connection. Try again shortly.",
        retryAt: "2026-08-25T12:05:00.000Z",
      }),
    );

    const result = await createHold({ x: 0, y: 0, w: 10, h: 10 }, "buyer-pubkey-1");

    expect(result).toEqual({
      ok: false,
      status: 429,
      message: "Too many holds from this connection. Try again shortly.",
      retryAt: "2026-08-25T12:05:00.000Z",
    });
  });

  it("becomes ok:false, not a rejected promise, when the network throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("network down")) as unknown as typeof fetch;

    const result = await createHold({ x: 0, y: 0, w: 10, h: 10 }, "buyer-pubkey-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.message).toBe("string");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});

describe("fetchOrder", () => {
  it("passes a 200 body straight through as the order", async () => {
    const order = {
      id: "11111111-1111-1111-1111-111111111111",
      rect: { x: 0, y: 0, w: 10, h: 10 },
      status: "reserved",
      pricePerPixelBaseUnits: 1_000_000,
      totalBaseUnits: 100_000_000,
      paymentBaseUnits: 100_000_042,
      expiresAt: "2026-08-25T12:30:00.000Z",
      hasContent: false,
      caption: null,
      link: null,
      imageFit: null,
      isAnimated: false,
    };
    stubFetchOnce(jsonResponse(200, order));

    const result = await fetchOrder("11111111-1111-1111-1111-111111111111");

    expect(result).toEqual({ ok: true, order });
  });

  it("turns a 404 into ok:false with the server's message", async () => {
    stubFetchOnce(jsonResponse(404, { message: "That order does not exist." }));

    const result = await fetchOrder("does-not-exist");

    expect(result).toEqual({ ok: false, status: 404, message: "That order does not exist." });
  });

  it("sends no wallet at all when none is offered, so polling stays anonymous", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(404, { message: "no" }));
    await fetchOrder("11111111-1111-1111-1111-111111111111");
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    expect(init?.headers).toBeUndefined();
  });

  /**
   * A hold publishes no caption and no link to anyone but its buyer, so the
   * buyer has to be able to say who they are — in a header, never in the URL,
   * because the pubkey is the only credential this site has and a query
   * string ends up in access logs.
   */
  it("offers the buyer's wallet in a header, not in the path", async () => {
    const fetchMock = stubFetchOnce(jsonResponse(404, { message: "no" }));
    await fetchOrder("11111111-1111-1111-1111-111111111111", "MyWallet1111");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/orders/11111111-1111-1111-1111-111111111111");
    expect(init.headers).toEqual({ [BUYER_PUBKEY_HEADER]: "MyWallet1111" });
  });
});

describe("submitContent", () => {
  it("carries the whole rejections array through a 422", async () => {
    stubFetchOnce(
      jsonResponse(422, {
        message: "That content could not be accepted.",
        rejections: [
          { field: "link", reason: "That is not a valid link." },
          { field: "caption", reason: "The caption cannot be empty." },
        ],
      }),
    );

    const result = await submitContent("11111111-1111-1111-1111-111111111111", new FormData());

    expect(result).toEqual({
      ok: false,
      status: 422,
      message: "That content could not be accepted.",
      rejections: [
        { field: "link", reason: "That is not a valid link." },
        { field: "caption", reason: "The caption cannot be empty." },
      ],
    });
  });

  it("posts the given form data to the order's content endpoint", async () => {
    const stub = stubFetchOnce(jsonResponse(403, { message: "That order does not belong to you." }));
    const form = new FormData();
    form.set("caption", "hi");

    await submitContent("order-1", form);

    expect(stub).toHaveBeenCalledTimes(1);
    const [url, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/orders/order-1/content");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(form);
  });
});

describe("confirmOrder", () => {
  it("turns a 200 into ok:true with the paid order", async () => {
    const order = {
      id: "order-1",
      rect: { x: 0, y: 0, w: 10, h: 10 },
      status: "paid",
      pricePerPixelBaseUnits: 1_000_000,
      totalBaseUnits: 100_000_000,
      paymentBaseUnits: 100_000_042,
      expiresAt: null,
      hasContent: true,
      caption: "hi",
      link: "https://example.com/",
      imageFit: "contain",
      isAnimated: false,
    };
    stubFetchOnce(jsonResponse(200, order));

    const result = await confirmOrder("order-1", "buyer-pubkey-1");

    expect(result).toEqual({ ok: true, order });
  });

  it("turns a 410 into ok:false with the server's message", async () => {
    stubFetchOnce(jsonResponse(410, { message: "That hold has expired." }));

    const result = await confirmOrder("order-1", "buyer-pubkey-1");

    expect(result).toEqual({ ok: false, status: 410, message: "That hold has expired." });
  });

  it("becomes ok:false when the response body is not JSON", async () => {
    stubFetchOnce(new Response("not json", { status: 500 }));

    const result = await confirmOrder("order-1", "buyer-pubkey-1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);
  });
});

describe("createHold, on a 409 carrying your own blocking holds", () => {
  it("keeps yourOrderIds so the caller can offer to release them", async () => {
    stubFetchOnce(
      jsonResponse(409, {
        message: "Part of this rectangle is a hold you started yourself and never finished.",
        availableAt: "2026-08-25T12:30:00.000Z",
        yourOrderIds: ["22222222-2222-2222-2222-222222222222"],
      }),
    );

    const result = await createHold({ x: 0, y: 0, w: 10, h: 10 }, "buyer-pubkey-1");

    expect(result.ok).toBe(false);
    expect((result as { yourOrderIds?: string[] }).yourOrderIds).toEqual([
      "22222222-2222-2222-2222-222222222222",
    ]);
  });

  it("leaves yourOrderIds absent when none of the blockers are yours", async () => {
    stubFetchOnce(jsonResponse(409, { message: "Someone is holding it.", availableAt: null, yourOrderIds: [] }));
    const result = await createHold({ x: 0, y: 0, w: 10, h: 10 }, "buyer-pubkey-1");
    expect((result as { yourOrderIds?: string[] }).yourOrderIds).toEqual([]);
  });
});

describe("releaseHold", () => {
  it("turns a 204 with no body into ok:true", async () => {
    const stub = stubFetchOnce(new Response(null, { status: 204 }));
    const result = await releaseHold("33333333-3333-3333-3333-333333333333", "buyer-pubkey-1");
    expect(result).toEqual({ ok: true });

    const [url, init] = stub.mock.calls[0];
    expect(url).toBe("/api/orders/33333333-3333-3333-3333-333333333333");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ buyerPubkey: "buyer-pubkey-1" });
  });

  it("keeps the server's message on a 403", async () => {
    stubFetchOnce(jsonResponse(403, { message: "That order does not belong to you." }));
    const result = await releaseHold("33333333-3333-3333-3333-333333333333", "someone-else");
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "That order does not belong to you.",
    });
  });

  it("becomes ok:false, not a rejected promise, when the network throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    const result = await releaseHold("33333333-3333-3333-3333-333333333333", "buyer-pubkey-1");
    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(0);
  });
});

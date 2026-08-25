import type { ContentRejection } from "./content";
import type { Rect } from "./geometry";
import type { Order } from "./orders";

/**
 * The browser side of the four order endpoints.
 *
 * Every export here does one thing: turn a `fetch` outcome into
 * `{ ok: true; order } | { ok: false; status; message; rejections?; retryAt? }`
 * and never let a rejected promise escape. `problem()` on the server (see
 * `src/lib/http.ts`) already guarantees `message` is safe to render as-is, so
 * nothing here re-derives or rewrites it.
 *
 * `Order` and `Rect` are imported with `import type` only: both are erased at
 * compile time, so this module never pulls `../db` (which `orders.ts`
 * imports) into a client bundle. That is deliberate — this file is consumed
 * by "use client" components, and `../db` opens a real `pg` connection at
 * module scope.
 */

export type ClientOrder = Order;

export type ClientFailure = {
  ok: false;
  status: number;
  message: string;
  rejections?: ContentRejection[];
  retryAt?: string;
};

export type ClientResult = { ok: true; order: ClientOrder } | ClientFailure;

const NETWORK_FAILURE_MESSAGE = "Could not reach the server. Check your connection and try again.";

// The shape POST /api/reserve actually returns (see reserveRect in
// reserve.ts): a reservation, not a full Order. It carries everything an
// Order does except status, ownership-independent fields, and content —
// none of which exist yet the instant a hold is created. reservationToOrder
// below fills those in with the values a brand-new hold always has, so every
// exported function here settles on the one ClientOrder shape rather than
// making every caller branch on which endpoint it came from.
type Reservation = {
  id: string;
  rect: Rect;
  pixels: number;
  pricePerPixelBaseUnits: number;
  totalBaseUnits: number;
  paymentBaseUnits: number;
  expiresAt: string;
};

function reservationToOrder(reservation: Reservation, buyerPubkey: string): ClientOrder {
  return {
    id: reservation.id,
    rect: reservation.rect,
    status: "reserved",
    buyerPubkey,
    pricePerPixelBaseUnits: reservation.pricePerPixelBaseUnits,
    totalBaseUnits: reservation.totalBaseUnits,
    paymentBaseUnits: reservation.paymentBaseUnits,
    expiresAt: reservation.expiresAt,
    hasContent: false,
    caption: null,
    link: null,
    imageFit: null,
    isAnimated: false,
  };
}

/**
 * Runs one request and maps its outcome. `toOrder` lets `createHold` turn a
 * reservation into an order shape; every other caller leaves it as the
 * identity, since their endpoints already return a full order.
 */
async function send(
  perform: () => Promise<Response>,
  toOrder: (body: unknown) => ClientOrder = (body) => body as ClientOrder,
): Promise<ClientResult> {
  let response: Response;
  try {
    response = await perform();
  } catch {
    return { ok: false, status: 0, message: NETWORK_FAILURE_MESSAGE };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok) {
    return { ok: true, order: toOrder(body) };
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const message = typeof record.message === "string" ? record.message : "Something went wrong. Please try again.";
  const failure: ClientFailure = { ok: false, status: response.status, message };
  if (Array.isArray(record.rejections)) failure.rejections = record.rejections as ContentRejection[];
  if (typeof record.retryAt === "string") failure.retryAt = record.retryAt;
  return failure;
}

/** Holds a rectangle for thirty minutes. 201 on success, 400/409/429 otherwise. */
export function createHold(rect: Rect, buyerPubkey: string): Promise<ClientResult> {
  return send(
    () =>
      fetch("/api/reserve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rect, buyerPubkey }),
      }),
    (body) => reservationToOrder(body as Reservation, buyerPubkey),
  );
}

/** An order's current state, for polling a hold or a confirmation screen. */
export function fetchOrder(orderId: string): Promise<ClientResult> {
  return send(() => fetch(`/api/orders/${orderId}`));
}

/**
 * Attaches an image, link and caption to a held order. `form` is built by the
 * caller (it must include `buyerPubkey`, `image`, `link`, `caption` and
 * `imageFit`) so this module stays request/response mapping and does not
 * also own form assembly.
 */
export function submitContent(orderId: string, form: FormData): Promise<ClientResult> {
  return send(() => fetch(`/api/orders/${orderId}/content`, { method: "POST", body: form }));
}

/** Confirms payment via the batch-3 payment stub. */
export function confirmOrder(orderId: string, buyerPubkey: string): Promise<ClientResult> {
  return send(() =>
    fetch(`/api/orders/${orderId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ buyerPubkey }),
    }),
  );
}

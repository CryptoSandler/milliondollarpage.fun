import { clientIp, hashIp } from "./callers/client-ip";

/**
 * Response helpers.
 *
 * This is the trimmed version of pixelwar's http.ts: caller identity, IP
 * hashing and the painter cookie arrive with rate limiting in a later batch.
 * Only the things this batch actually uses live here.
 */

export const NO_STORE = { "cache-control": "no-store" };

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

/**
 * Who is calling, in one place.
 *
 * Fails closed on the address: without a trustworthy one there is no rate
 * limit, and a shared bucket for every anonymous caller is either an unlimited
 * allowance or a self-inflicted outage. The operational reason goes to the
 * server log, never to the caller.
 */
export type Caller = { ok: true; ipHash: string } | { ok: false; message: string };

export function identify(request: Request): Caller {
  const identity = clientIp(request);
  if (!identity.ok) {
    console.error(`identify: ${identity.reason}`);
    return { ok: false, message: "This request could not be verified. Please try again." };
  }
  return { ok: true, ipHash: hashIp(identity.ip) };
}

/** An error response with a message the client can render as-is. */
export function problem(
  status: number,
  message: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return json({ message, ...extra }, { status, headers: { ...NO_STORE, ...headers } });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for the standard 8-4-4-4-12 hex UUID shape, case-insensitive.
 *
 * Every `[id]` route checks this before touching the database: `blocks.id`
 * is a `uuid` column, and handing Postgres a string that isn't one raises
 * 22P02, which would otherwise surface as an unauthenticated 500 on a
 * trivially reachable route. An id that cannot name an order does not name
 * an order, so the answer is the same 404 an absent-but-well-formed id gets
 * — a caller must not be able to tell "malformed" from "not found".
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

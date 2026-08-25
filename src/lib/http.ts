/**
 * Response helpers.
 *
 * This is the trimmed version of pixelwar's http.ts: caller identity, IP
 * hashing and the painter cookie arrive with rate limiting in a later batch.
 * Only the two things this batch actually uses live here.
 */

export const NO_STORE = { "cache-control": "no-store" };

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

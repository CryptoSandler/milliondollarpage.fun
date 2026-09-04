import { requireAdmin } from "../../../../lib/admin-guard";
import { block, listBlocked, unblock } from "../../../../lib/board/blocklist";
import { NO_STORE, json } from "../../../../lib/http";

/**
 * The images this wall refuses, and the only way a person edits that list.
 *
 * WHO CALLS THIS: the `/admin` page and an operator with `curl` and the token.
 *
 * WHY IT HAS TO EXIST AT ALL. A blocklist only `purge` can write to is a
 * consequence, not a rule — it can refuse a picture after somebody has already
 * bought a rectangle for it and after a person has already had to look at it.
 * This is the door that lets the same decision be made once, in advance, and it
 * is what makes the table a list rather than a log.
 *
 * `requireAdmin` first and always: an unauthenticated caller gets the single
 * refusal and learns nothing else — not the hashes, not how many there are, not
 * whether a particular one is on it. A blocklist that answers questions to
 * anybody is a blocklist that can be enumerated by trying.
 *
 * `NO_STORE` for the same reason it is on the takedowns route: a list of
 * moderated content sitting in a shared cache is the moderation surface
 * publishing itself.
 */

/** Lower-case hex, exactly the shape the column's own CHECK allows. */
const SHA256 = /^[0-9a-f]{64}$/;

/* The same four lines `/api/admin/blocks/[id]` keeps for itself. Copied rather
   than shared because two identical helpers in two routes is cheaper than a
   module that exists to hold one, and `lib/http.ts` deliberately carries only
   what more than one caller needs. */
function badRequest(message: string): Response {
  return json({ error: message }, { status: 400, headers: NO_STORE });
}

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin(request, "GET /api/admin/blocked");
  if (!admin.ok) return admin.response;

  return json({ blocked: await listBlocked() }, { headers: NO_STORE });
}

/**
 * Add a hash, or take one off.
 *
 * One route and an `action` rather than a POST and a DELETE, because that is
 * the shape `/api/admin/blocks/[id]` already uses for hide, unhide and purge —
 * one admin surface with one grammar is easier to operate under pressure than
 * two that are each slightly different.
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin(request, "POST /api/admin/blocked");
  if (!admin.ok) return admin.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("That request body is not JSON.");
  }

  const { action, sha256, reason } = (body ?? {}) as Record<string, unknown>;

  if (action !== "block" && action !== "unblock") {
    return badRequest("action must be block or unblock.");
  }

  const hash = typeof sha256 === "string" ? sha256.trim().toLowerCase() : "";
  if (!SHA256.test(hash)) {
    return badRequest("sha256 must be 64 lower-case hex characters.");
  }

  if (action === "unblock") {
    const removed = await unblock(hash);
    // 404 rather than a silent 200: an operator who mistyped one character
    // should learn that nothing was removed, not be told it worked.
    return removed
      ? json({ unblocked: hash }, { headers: NO_STORE })
      : json({ error: "That hash is not on the list." }, { status: 404, headers: NO_STORE });
  }

  // Required for the same reason a takedown's is: the row is the only record of
  // why, and an empty string six months later is indistinguishable from a
  // decision nobody can account for.
  const words = typeof reason === "string" ? reason.trim() : "";
  if (words === "") {
    return badRequest("A reason is required, and it is what the row will record.");
  }

  await block({ sha256: hash, reason: words, source: "admin" });
  return json({ blocked: hash }, { headers: NO_STORE });
}

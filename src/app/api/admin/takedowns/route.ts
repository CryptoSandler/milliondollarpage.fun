import { requireAdmin } from "../../../../lib/admin-guard";
import { listHidden } from "../../../../lib/board/takedown";
import { NO_STORE, json } from "../../../../lib/http";

/**
 * What is currently taken down.
 *
 * WHO CALLS THIS: the `/admin` page, which is Task 4 of this batch, and an
 * operator with `curl` and the token. It is the third of the three things
 * `SECURITY.md` § Takedown says the console does — "a token-gated admin
 * surface that performs exactly these two statements and lists what is
 * currently hidden".
 *
 * `requireAdmin` first and always: an unauthenticated caller gets the single
 * refusal (`src/lib/admin-guard.ts`) and learns nothing else, not even whether
 * anything is hidden.
 *
 * Not cached, like everything the guard stands in front of. `NO_STORE` here is
 * about the operator's browser and any proxy in between, not about
 * correctness — a list of moderated blocks sitting in a shared cache is the
 * takedown surface publishing itself.
 *
 * The `Date`s go out as ISO strings because `JSON.stringify` does that, which
 * is the same thing `toPublicOrder`'s `expiresAt` has always relied on. No
 * mapper here re-states the shape `listHidden` already returns.
 */
export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin(request, "GET /api/admin/takedowns");
  if (!admin.ok) return admin.response;

  return json({ takedowns: await listHidden() }, { headers: NO_STORE });
}

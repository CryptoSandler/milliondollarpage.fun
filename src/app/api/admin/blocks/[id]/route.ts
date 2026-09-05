import { requireAdmin } from "../../../../../lib/admin-guard";
import { purgeConfirmation } from "../../../../../lib/board/admin-client";
import { hide, purge, unhide } from "../../../../../lib/board/takedown";
import { approve } from "../../../../../lib/board/review";
import { NO_STORE, isUuid, json } from "../../../../../lib/http";

/**
 * The two takedown levels, as an operator's three buttons.
 *
 * WHO CALLS THIS: the `/admin` page, which is Task 4 of this batch, and an
 * operator with `curl` and the token. It performs exactly the statements
 * `SECURITY.md` § Takedown describes and nothing else — `hide` and `unhide`
 * are the flag it writes out in full, `purge` is `block_purge_content`. There
 * is deliberately no fourth action: "a route that could hide something this
 * section does not describe would be a route contradicting its own
 * specification."
 *
 * ONE ROUTE, THREE ACTIONS, rather than three routes. What varies between them
 * is one word and one guard; what they share is the admin check, the uuid
 * check, the body parsing and the answer shape. Three files would be three
 * copies of the shared half, and the shared half is the part that must not
 * drift.
 *
 * THE ORDER OF THE CHECKS IS LOAD-BEARING. `requireAdmin` runs before the id
 * is so much as looked at, so a stranger gets the guard's single refusal for a
 * malformed id, an id that names nothing and an id that names a real block
 * alike. Checking the id first would turn this route into an oracle that
 * confirms which block ids exist, to callers who have not authenticated.
 */

/*
  FOUR NOW, AND THE FOURTH IS NOT A TAKEDOWN. `approve` lets a purchase onto
  the wall; the other three take one off it. The file's header says there is
  "deliberately no fourth action" and the sentence after it says why — a route
  that could hide something `SECURITY.md` does not describe. This one hides
  nothing: it is the review queue `DECISIONS.md` settled on 2026-09-04, and the
  thing it changes is `approved_at`, which no takedown reads.
*/
const ACTIONS = ["hide", "unhide", "purge", "approve"] as const;
type Action = (typeof ACTIONS)[number];

/**
 * The one answer for every action that changed no row.
 *
 * It names the possibilities rather than picking one, because the takedown
 * module returns the row it changed or null and cannot say which case produced
 * the null (see `hide` there). Naming all of them is honest; naming one would
 * be a guess an operator would act on.
 *
 * ponytail: if an operator ever needs the difference, the upgrade is one extra
 * SELECT on the null path in `takedown.ts`, and this constant becomes three
 * messages. It is not that today because the three fixes are the same fix —
 * look at the block.
 */
const NOTHING_HAPPENED =
  "Nothing changed. That id names no sale, or the block is not in a state this " +
  "action can move it out of — a purge is not reversible, and a hold has nothing " +
  "to take down.";

function badRequest(message: string): Response {
  return json({ error: message }, { status: 400, headers: NO_STORE });
}

/**
 * What a purge demands in the body, and why it is enforced here rather than in
 * a dialog.
 *
 * A browser confirm() is one `curl` away from not existing. This is the same
 * confirmation, enforced where it cannot be skipped: the operator has to type
 * the id of the block whose bytes they are about to destroy, which is the one
 * mistake worth making impossible — purging the block above the one they meant.
 *
 * Compared exactly, with no trimming and no case folding, against the id as it
 * appears in the URL. A confirmation that quietly accepts something other than
 * what it asked for is a confirmation that has started guessing at intent.
 *
 * `purgeConfirmation` itself moved to `src/lib/board/admin-client.ts` when the
 * `/admin` page arrived (Task 4), because the page has to OFFER the string this
 * route DEMANDS, and two literals in two files agree only until somebody edits
 * one. That module is the one describing these endpoints that pulls in neither
 * `pg` nor a node built-in, so both halves of the wire can import it — the same
 * arrangement `BUYER_PUBKEY_HEADER` already has in `purchase-client.ts`. The
 * check below is unchanged; only where the string is written down moved.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const admin = await requireAdmin(request, "POST /api/admin/blocks/[id]");
  if (!admin.ok) return admin.response;

  const { id } = await params;
  // `blocks.id` is a uuid column, and handing Postgres a string that is not one
  // raises 22P02 — a 500 on a route that should have answered 404. Every `[id]`
  // route in this repository walks this ladder for that reason.
  if (!isUuid(id)) return json({ error: NOTHING_HAPPENED }, { status: 404, headers: NO_STORE });

  /*
    JSON OR A FORM, because there are two callers and they are different kinds
    of thing. The takedown console is a client component and sends JSON; the
    review queue on the same page is server-rendered markup with one button per
    row, and a `<form>` posting straight here is the laziest thing that works —
    no state, no fetch, no optimistic list to reconcile, and the page reload IS
    the confirmation.

    THIS IS NOT A CSRF SURFACE. The admin cookie is `SameSite=Strict` (see
    `/api/admin/session`), so a form on somebody else's page carries no session
    at all and lands on `requireAdmin`'s single refusal above.
  */
  const contentType = request.headers.get("content-type") ?? "";
  let body: unknown;
  try {
    body = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return badRequest("That request body is neither JSON nor a form.");
  }

  const { action, reason, confirm } = (body ?? {}) as Record<string, unknown>;

  if (typeof action !== "string" || !(ACTIONS as readonly string[]).includes(action)) {
    return badRequest(`action must be one of ${ACTIONS.join(", ")}.`);
  }

  // A reason is required for both statements that take something down, because
  // `takedown_reason` is the only record of why, and "" six months later is
  // indistinguishable from a takedown nobody can account for. `unhide` needs
  // none: it clears the column.
  const words = typeof reason === "string" ? reason.trim() : "";
  // `approve` joins `unhide` here: a note is welcome and is stored, but
  // requiring one for the ordinary outcome would make the ordinary outcome the
  // slow one, and a queue that is slow to clear is a queue that is not cleared.
  if (action !== "unhide" && action !== "approve" && words === "") {
    return badRequest("A reason is required, and it is what the row will record.");
  }

  if (action === "purge" && confirm !== purgeConfirmation(id)) {
    // Refused BEFORE anything is destroyed, and this early return is the whole
    // guarantee: nothing below it runs, so a wrong confirmation leaves the row
    // with every byte it had.
    return badRequest(
      `A purge destroys the image, the caption and the link, and cannot be undone. ` +
        `To confirm, send confirm: "${purgeConfirmation(id)}".`,
    );
  }

  const block = await perform(action as Action, id, words);
  if (!block) return json({ error: NOTHING_HAPPENED }, { status: 404, headers: NO_STORE });

  /*
    A FORM GETS A REDIRECT AND A FETCH GETS JSON. 303 rather than 302 so the
    browser turns the POST into a GET — without it a reload re-submits the
    approval, which is harmless here (approving twice changes nothing) and is
    still a browser warning nobody should have to read.
  */
  if (!contentType.includes("application/json")) {
    return new Response(null, {
      status: 303,
      headers: { location: "/admin", "cache-control": "no-store" },
    });
  }

  return json({ block }, { headers: NO_STORE });
}

async function perform(action: Action, id: string, reason: string) {
  if (action === "hide") return hide(id, reason);
  if (action === "unhide") return unhide(id);
  if (action === "approve") return approve(id, reason);
  return purge(id, reason);
}

import { requireAdmin } from "../../../../../lib/admin-guard";
import { hide, purge, unhide } from "../../../../../lib/board/takedown";
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

const ACTIONS = ["hide", "unhide", "purge"] as const;
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
 * What a purge demands in the body, and why it is here rather than in a dialog.
 *
 * A browser confirm() is one `curl` away from not existing. This is the same
 * confirmation, enforced where it cannot be skipped: the operator has to type
 * the id of the block whose bytes they are about to destroy, which is the one
 * mistake worth making impossible — purging the block above the one they meant.
 *
 * Compared exactly, with no trimming and no case folding, against the id as it
 * appears in the URL. A confirmation that quietly accepts something other than
 * what it asked for is a confirmation that has started guessing at intent.
 */
function purgeConfirmation(id: string): string {
  return `PURGE ${id}`;
}

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("That request body is not JSON.");
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
  if (action !== "unhide" && words === "") {
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

  return json({ block }, { headers: NO_STORE });
}

async function perform(action: Action, id: string, reason: string) {
  if (action === "hide") return hide(id, reason);
  if (action === "unhide") return unhide(id);
  return purge(id, reason);
}

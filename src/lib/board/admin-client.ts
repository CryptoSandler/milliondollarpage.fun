import type { TakedownState } from "./takedown";

/**
 * The browser side of the admin endpoints.
 *
 * WHO CALLS THIS: `src/components/TakedownConsole.tsx`, which is the whole of
 * the `/admin` page's interactivity, and — for `purgeConfirmation` alone —
 * `src/app/api/admin/blocks/[id]/route.ts`, which compares against it.
 *
 * It is `purchase-client.ts` for the other half of the product and it keeps
 * that module's one job: turn a `fetch` outcome into
 * `{ ok: true; ... } | { ok: false; status; message }` and never let a
 * rejected promise escape. THE ONE DIFFERENCE IS THE KEY IT READS. Public
 * routes answer `{ message }` (`problem()` in `src/lib/http.ts`); admin routes
 * answer `{ error }` — the guard's single refusal, the route's `badRequest`,
 * and the sign-in route's 503 all use it. Reading the wrong one here would
 * turn every admin failure into the generic fallback below, which is exactly
 * the sentence an operator cannot act on.
 *
 * `TakedownState` is imported with `import type` only, and that is
 * load-bearing rather than tidy: `takedown.ts` imports `../db`, which opens a
 * real `pg` pool at module scope, and this file is pulled into a client
 * bundle. The type is erased at compile time so the import disappears with it.
 */

/**
 * A takedown as it arrives over the wire.
 *
 * `TakedownState` with its two `Date`s as strings, because that is what
 * `JSON.stringify` made of them on the way out (see the note in
 * `src/app/api/admin/takedowns/route.ts`). Derived from the server's type
 * rather than restated, so a column added there cannot be forgotten here.
 */
export type ClientTakedown = Omit<TakedownState, "hiddenAt" | "purgedAt"> & {
  hiddenAt: string | null;
  purgedAt: string | null;
};

export type AdminFailure = { ok: false; status: number; message: string };

/** Status 0 is "the request never got an answer", the same code `purchase-client` uses for it. */
const NETWORK_FAILURE_MESSAGE = "Could not reach the server. Check your connection and try again.";
const UNKNOWN_FAILURE_MESSAGE = "Something went wrong. Please try again.";

/**
 * What a purge demands in the body, defined ONCE for both sides of the wire.
 *
 * It lives in this file for the same reason `BUYER_PUBKEY_HEADER` lives in
 * `purchase-client.ts`: this is the module describing these endpoints that
 * pulls in neither `pg` nor a node built-in, so the route that enforces the
 * confirmation and the field that offers it share one spelling instead of two
 * literals that agree until somebody edits one. A drift would fail closed —
 * the server would refuse every purge — but it would fail closed looking
 * exactly like a broken console.
 *
 * The server compares this exactly, with no trimming and no case folding. The
 * field on the page is the operator's speed bump against purging the block
 * above the one they meant; the comparison in the route is the control.
 */
export function purgeConfirmation(id: string): string {
  return `PURGE ${id}`;
}

/** What an admin route said when it refused. `{ error }`, never `{ message }`. */
async function failure(response: Response): Promise<AdminFailure> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const message = typeof record.error === "string" ? record.error : UNKNOWN_FAILURE_MESSAGE;
  return { ok: false, status: response.status, message };
}

/** Everything currently taken down, newest first — whatever `listHidden` returned. */
export async function fetchTakedowns(): Promise<
  { ok: true; takedowns: ClientTakedown[] } | AdminFailure
> {
  let response: Response;
  try {
    response = await fetch("/api/admin/takedowns", { headers: { accept: "application/json" } });
  } catch {
    return { ok: false, status: 0, message: NETWORK_FAILURE_MESSAGE };
  }
  if (!response.ok) return failure(response);

  const body = (await response.json()) as { takedowns?: ClientTakedown[] };
  return { ok: true, takedowns: body.takedowns ?? [] };
}

/**
 * One block, one action.
 *
 * `confirm` is passed through EXACTLY as the operator typed it. Nothing here
 * rebuilds it from the id: a client that repairs the confirmation on its way
 * past is a client that has quietly become the thing doing the confirming,
 * and the route would then be checking its own work rather than the
 * operator's.
 */
export async function actOnBlock(
  id: string,
  action: { action: "unhide" } | { action: "purge"; reason: string; confirm: string },
): Promise<{ ok: true; block: ClientTakedown } | AdminFailure> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/blocks/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    });
  } catch {
    return { ok: false, status: 0, message: NETWORK_FAILURE_MESSAGE };
  }
  if (!response.ok) return failure(response);

  const body = (await response.json()) as { block: ClientTakedown };
  return { ok: true, block: body.block };
}

/**
 * Signs out. The revocation is the server's — this only asks for it.
 *
 * Returns nothing to render on success because there is nothing left to
 * render: the caller reloads, and the page comes back as the sign-in form.
 */
export async function signOutAdmin(): Promise<{ ok: true } | AdminFailure> {
  let response: Response;
  try {
    response = await fetch("/api/admin/session", { method: "DELETE" });
  } catch {
    return { ok: false, status: 0, message: NETWORK_FAILURE_MESSAGE };
  }
  if (!response.ok) return failure(response);
  return { ok: true };
}

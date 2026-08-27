"use client";

import { useState } from "react";
import {
  actOnBlock,
  fetchTakedowns,
  purgeConfirmation,
  signOutAdmin,
  type AdminFailure,
  type ClientTakedown,
} from "../lib/board/admin-client";
import { singleFlight } from "../lib/board/single-flight";
import TakedownList, { type Pending, type PurgeDraft } from "./TakedownList";

/**
 * The interactive half of `/admin`.
 *
 * WHO CALLS THIS: `src/app/admin/page.tsx`, once the session has resolved. The
 * page server-renders the first list — it calls `listHidden` directly, the
 * same way `src/app/page.tsx` server-renders the board — so this component
 * opens with the rows already on screen and refetches through
 * `GET /api/admin/takedowns` from then on. That is one source of truth for the
 * list rather than two, and it also picks up a change another operator made
 * while this page was open.
 *
 * IT OWNS STATE AND NOTHING ELSE. Every pixel is `TakedownList`, which is a
 * pure function of props; the split is what lets the tests render the
 * console's states as real HTML in a suite with no DOM. See that file's header.
 *
 * WHAT IT DELIBERATELY DOES NOT DO IS HIDE A BLOCK. The route behind it can —
 * `hide` is one of its three actions — but this page lists what is already
 * down, and an id typed into a box is not a moderation decision anybody makes
 * from a list they cannot search. `SECURITY.md` § Takedown calls both levels
 * "operator statements run by hand", and that is still how a block comes down.
 *
 * ponytail: the whole console is one request at a time. One flag is the
 * difference between an answer that plainly belongs to the button that was
 * pressed and an answer the operator has to attribute for themselves.
 */

/** Said when the session behind the cookie has stopped resolving mid-visit. */
const SESSION_GONE =
  "That session is not valid any more. Sign in again to carry on — nothing you just pressed took effect.";

/** What one attempt leaves behind: a sentence to announce, a refusal to show, or both. */
type Outcome = { said?: string; failed?: string };

export default function TakedownConsole({
  label,
  initial,
}: {
  label: string;
  initial: ClientTakedown[];
}) {
  const [rows, setRows] = useState(initial);
  const [pending, setPending] = useState<Pending>(null);
  const [purge, setPurge] = useState<PurgeDraft | null>(null);
  const [done, setDone] = useState("");
  const [failed, setFailed] = useState("");

  // One wrapper per mount, built once by the lazy initialiser, exactly as
  // PurchaseDialog does it. This is an identity guarantee rather than a
  // performance hint: the `disabled` flag on every button is React state and
  // takes a render to appear, so two clicks inside one frame both see the old
  // value and only this stops the second one reaching the network.
  const [call] = useState(() => ({
    act: singleFlight(actOnBlock),
    list: singleFlight(fetchTakedowns),
    signOut: singleFlight(signOutAdmin),
  }));

  /**
   * Runs one attempt with everything switched off, then says what happened.
   *
   * Both regions are cleared first and set once, so what is on screen after an
   * attempt is that attempt's answer and never half of the last one's.
   */
  async function perform(next: Exclude<Pending, null>, work: () => Promise<Outcome>) {
    if (pending !== null) return;
    setPending(next);
    setDone("");
    setFailed("");
    try {
      const outcome = await work();
      setDone(outcome.said ?? "");
      setFailed(outcome.failed ?? "");
    } finally {
      setPending(null);
    }
  }

  /**
   * Pulls the list again, and hands back the refusal if it could not.
   *
   * Called after anything that changed a row rather than patching the answer
   * into place: what came back is one row, an unhide takes a row OUT of a list
   * the server orders, and one round trip on a page an operator opens a
   * handful of times a day is not worth a second way of building the list.
   */
  async function refresh(): Promise<AdminFailure | null> {
    const list = await call.list();
    if (!list.ok) return list;
    setRows(list.takedowns);
    return null;
  }

  function unhide(id: string) {
    void perform({ action: "unhide", id }, async () => {
      const result = await call.act(id, { action: "unhide" });
      if (!result.ok) return { failed: refusal(result) };
      setPurge(null);
      // A refresh that failed AFTER the action landed is said out loud beside
      // it rather than instead of it. Both sentences are true: the block
      // moved, and the list on screen is the one from before it did.
      const stale = await refresh();
      return {
        said: "Unhidden. That block is publishing its picture, link and caption again.",
        failed: stale ? refusal(stale) : "",
      };
    });
  }

  function submitPurge(id: string) {
    const draft = purge;
    // The submit button is disabled unless these hold; they are checked again
    // here because a disabled attribute is a rendered fact and this is the
    // code path. NEITHER IS THE CONTROL THAT MATTERS: the route compares the
    // same string server-side and destroys nothing before it has.
    if (!draft || draft.id !== id) return;
    if (draft.reason.trim() === "" || draft.confirm !== purgeConfirmation(id)) return;

    void perform({ action: "purge", id }, async () => {
      const result = await call.act(id, {
        action: "purge",
        reason: draft.reason,
        // Verbatim. What the operator typed is what the server compares, and a
        // client that repaired it on the way past would have quietly become
        // the thing doing the confirming.
        confirm: draft.confirm,
      });
      if (!result.ok) return { failed: refusal(result) };
      setPurge(null);
      const stale = await refresh();
      return {
        said: "Purged. The image, the caption and the link are gone from that block.",
        failed: stale ? refusal(stale) : "",
      };
    });
  }

  function reload() {
    void perform({ action: "reload", id: null }, async () => {
      const stale = await refresh();
      return stale ? { failed: refusal(stale) } : { said: "Refreshed." };
    });
  }

  function signOut() {
    void perform({ action: "signout", id: null }, async () => {
      const result = await call.signOut();
      if (!result.ok) return { failed: refusal(result) };
      // The row is revoked server-side and the cookie is cleared, so the page
      // has to come back from the server as the sign-in form. A full reload
      // rather than a router refresh: there is nothing of this console left
      // worth keeping alive.
      window.location.reload();
      return { said: "Signed out." };
    });
  }

  return (
    <TakedownList
      label={label}
      rows={rows}
      pending={pending}
      purge={purge}
      done={done}
      failed={failed}
      onReload={reload}
      onSignOut={signOut}
      onUnhide={unhide}
      onPurgeDraft={setPurge}
      onPurge={submitPurge}
    />
  );
}

/**
 * The sentence a refusal gets shown as.
 *
 * Everything the admin routes send is safe to render as-is — the guard's
 * single refusal, the route's 400s, the "nothing changed" 404. The one that
 * needs more is 401: "Not authorised." is accurate and tells an operator who
 * WAS authorised a moment ago nothing about what to do, and DESIGN.md's voice
 * section asks an error to name the cause and the way out.
 */
function refusal(failure: AdminFailure): string {
  return failure.status === 401 ? SESSION_GONE : failure.message;
}

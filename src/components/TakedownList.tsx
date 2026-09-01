import { useId, useRef } from "react";
import { purgeConfirmation, type ClientTakedown } from "../lib/board/admin-client";

/**
 * Everything the takedown console draws, as a pure function of its props.
 *
 * WHO CALLS THIS: `src/components/TakedownConsole.tsx`, and nothing else. The
 * console owns the rows, the request in flight and what was announced; this
 * file owns none of it and holds no state of its own.
 *
 * THAT SPLIT IS WHY THE TESTS CAN READ THE RENDER. This project's suite runs
 * in Vitest's `node` environment with no DOM and no testing library — see
 * `vitest.config.mts` — so the only way to assert on real markup is to render
 * it with `react-dom/server`, and the only way to do that at an arbitrary
 * moment of the console's life is for that moment to be a set of props. A
 * disabled button, an empty live region and a purged row's missing Unhide are
 * then facts about the HTML rather than about a mock.
 *
 * IT DECIDES ONE THING, and it has to: whether the confirmation typed into the
 * purge field matches. That is the operator's speed bump — the guard that
 * matters is in `src/app/api/admin/blocks/[id]/route.ts`, which compares the
 * same string server-side and destroys nothing before it has. Both sides read
 * `purgeConfirmation` from one module so they cannot drift apart.
 */

/** The request in flight, if there is one. `id` is null for the two that name no block. */
export type Pending = {
  action: "unhide" | "purge" | "reload" | "signout";
  id: string | null;
} | null;

/** The purge being composed, if one is open. At most one at a time: an operator purges one block. */
export type PurgeDraft = { id: string; reason: string; confirm: string };

export default function TakedownList({
  label,
  rows,
  pending,
  purge,
  done,
  failed,
  onReload,
  onSignOut,
  onUnhide,
  onPurgeDraft,
  onPurge,
}: {
  /** Which operator this session belongs to, from the session row. */
  label: string;
  rows: ClientTakedown[];
  pending: Pending;
  purge: PurgeDraft | null;
  /** Announced politely: the outcome of something that worked. Empty when there is nothing to say. */
  done: string;
  /** Announced assertively: a refusal, which makes what the operator just believed wrong. */
  failed: string;
  onReload: () => void;
  onSignOut: () => void;
  onUnhide: (id: string) => void;
  /** Opens (a draft), edits (a draft) or closes (null) the purge form. */
  onPurgeDraft: (draft: PurgeDraft | null) => void;
  onPurge: (id: string) => void;
}) {
  // One request at a time. Every control goes off while one is open, not just
  // the control that started it: an unhide and a purge landing on the same
  // list would leave the operator guessing which answer belonged to which
  // button. `singleFlight` in the console is the half that holds when two
  // clicks arrive inside one frame, before this flag has rendered.
  const busy = pending !== null;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline-strong pb-4">
        <p className="text-[14px] text-body">Signed in as {label}.</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-quiet px-3 py-1.5 text-[14px]"
            disabled={busy}
            onClick={onReload}
          >
            {pending?.action === "reload" ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="btn-quiet px-3 py-1.5 text-[14px]"
            disabled={busy}
            onClick={onSignOut}
          >
            {pending?.action === "signout" ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>

      {/*
        Two regions, both always in the DOM, because an aria-live region that
        arrives already carrying its text is a region assistive technology may
        never announce. They are filled and emptied instead of mounted and
        unmounted, and each is visible exactly when it has something in it.

        POLITE for what worked: it confirms the button the operator pressed.
        ASSERTIVE for what did not: a refusal makes the belief they are acting
        on wrong, and DESIGN.md gives that case the one voice allowed to
        interrupt.
      */}
      <p
        role="status"
        className={
          done
            ? "mt-4 rounded-xl border border-hairline-strong bg-card-lift px-4 py-3 text-[15px] leading-relaxed text-ink-soft"
            : "sr-only"
        }
      >
        {done}
      </p>
      <p
        role="alert"
        className={
          failed
            ? "mt-4 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-[15px] leading-relaxed text-ink-soft"
            : "sr-only"
        }
      >
        {failed}
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-[16px] leading-relaxed text-body">
          Nothing is taken down. Every block on the board is publishing its picture, its link and
          its caption.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              pending={pending}
              busy={busy}
              purge={purge?.id === row.id ? purge : null}
              onUnhide={onUnhide}
              onPurgeDraft={onPurgeDraft}
              onPurge={onPurge}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({
  row,
  pending,
  busy,
  purge,
  onUnhide,
  onPurgeDraft,
  onPurge,
}: {
  row: ClientTakedown;
  pending: Pending;
  busy: boolean;
  purge: PurgeDraft | null;
  onUnhide: (id: string) => void;
  onPurgeDraft: (draft: PurgeDraft | null) => void;
  onPurge: (id: string) => void;
}) {
  const formId = useId();
  const reasonId = useId();
  const confirmId = useId();
  const confirmHintId = useId();
  // Where focus goes when the form closes — see the comment on the disclosure.
  const disclosureRef = useRef<HTMLButtonElement>(null);

  // The bytes are gone, so there is nothing to put back and nothing left to
  // destroy. The row stays listed — what was destroyed, and when, is exactly
  // what an operator gets asked about afterwards — and it carries no controls.
  const purged = row.purgedAt !== null;
  const phrase = purgeConfirmation(row.id);
  const mine = pending?.id === row.id;

  return (
    <li className="rounded-md border border-hairline-strong bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="tabular font-display text-[17px] font-semibold text-ink">
          {row.w} × {row.h} at ({row.x}, {row.y})
        </h2>
        <span
          className={`label-caps rounded-full px-2.5 py-1 ${
            purged ? "bg-danger-soft text-ink-soft" : "bg-canvas-deep"
          }`}
        >
          {purged ? "Purged" : "Hidden"}
        </span>
      </div>

      <p className="tabular mt-1 break-all text-[14px] text-body">{row.id}</p>

      <p className="mt-2 text-[14px] leading-relaxed text-body">
        Taken down <When at={row.hiddenAt} />
        {purged && (
          <>
            {" · content purged "}
            <When at={row.purgedAt} />
          </>
        )}
      </p>

      <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">
        Reason: {row.takedownReason ?? "not recorded"}
      </p>

      {/*
        THE TWO ROW CONTROLS STAY MOUNTED WHILE THE FORM IS OPEN, and that is a
        focus decision rather than a layout one. Unmounting the button that was
        just pressed drops the keyboard on `document.body`, and the operator has
        to tab back from the top of the page to reach what they opened. Kept
        mounted, "Purge…" is a disclosure the keyboard can always get back to —
        which is also where the Cancel below hands focus, since Cancel IS the
        control that unmounts.
      */}
      {!purged && (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-quiet px-3 py-1.5 text-[14px]"
            disabled={busy}
            onClick={() => onUnhide(row.id)}
          >
            {mine && pending?.action === "unhide" ? "Unhiding…" : "Unhide"}
          </button>
          <button
            type="button"
            ref={disclosureRef}
            className="btn-quiet px-3 py-1.5 text-[14px]"
            disabled={busy}
            aria-expanded={purge !== null}
            // Only while there is something to point at: `aria-controls` naming
            // an id that is not in the document is a reference to nothing.
            aria-controls={purge ? formId : undefined}
            // A toggle, never a reset: pressing it a second time closes the
            // form rather than handing back an empty draft over what has
            // already been typed into it.
            onClick={() => onPurgeDraft(purge ? null : { id: row.id, reason: "", confirm: "" })}
          >
            Purge…
          </button>
        </div>
      )}

      {!purged && purge && (
        <form
          id={formId}
          className="mt-3 rounded-md border border-hairline-strong bg-card-lift p-4"
          onSubmit={(event) => {
            event.preventDefault();
            onPurge(row.id);
          }}
        >
          {/*
            Said once, here, where the operator is standing over the button.
            Nowhere else on the page repeats it: a warning stacked three deep is
            a warning nobody reads by the third time.

            The danger tint is on THIS SENTENCE and not on the box around the
            form, which is DESIGN.md's settled rule for `--danger-line`: it
            "encloses error prose, not a control". Putting the fields on
            `--danger-soft` instead would have parked every control border at
            3.02:1 against it — over WCAG 1.4.11's 3:1 by two hundredths, which
            is not a margin. On `--card-lift` the same border measures 3.89:1
            and the focus ring 4.64:1, both of them numbers DESIGN.md has
            already published.
          */}
          <p className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[15px] leading-relaxed text-ink-soft">
            Purging destroys the image, the caption and the link. It cannot be undone.
          </p>

          <label className="label-caps mt-4 block" htmlFor={reasonId}>
            Reason, recorded on the row
          </label>
          <input
            id={reasonId}
            className="field-input mt-1"
            value={purge.reason}
            required
            disabled={busy}
            // The form opened because a button was pressed, so the keyboard
            // goes where the operator now has to type. Without it the form
            // appears below a focus that has not moved, and a screen reader is
            // told nothing arrived at all.
            autoFocus
            onChange={(event) => onPurgeDraft({ ...purge, reason: event.target.value })}
          />

          <label className="label-caps mt-4 block" htmlFor={confirmId}>
            Confirmation
          </label>
          <p id={confirmHintId} className="mt-1 text-[14px] leading-relaxed text-ink-soft">
            Type <strong className="break-all font-bold">{phrase}</strong> to say which block this
            is. The server checks it against the one in the address before anything is destroyed.
          </p>
          <input
            id={confirmId}
            className="field-input mt-1"
            value={purge.confirm}
            placeholder={phrase}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            aria-describedby={confirmHintId}
            onChange={(event) => onPurgeDraft({ ...purge, confirm: event.target.value })}
          />

          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className="btn-quiet px-4 py-2 text-[15px]"
              disabled={busy}
              onClick={() => {
                onPurgeDraft(null);
                // This button is about to be unmounted, so it hands the
                // keyboard back to the disclosure that opened the form —
                // still mounted, and where the operator was.
                disclosureRef.current?.focus();
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-5 py-2.5 text-[15px]"
              disabled={busy || purge.reason.trim() === "" || purge.confirm !== phrase}
            >
              {mine && pending?.action === "purge" ? "Purging…" : "Purge"}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

/**
 * A timestamp a person can read, with the machine-readable one beside it.
 *
 * `hiddenAt` is nullable on the type because `unhide` hands back the row it
 * just cleared; a row in THIS list always has one, and the fallback is here so
 * a surprise cannot render "Invalid Date".
 */
function When({ at }: { at: string | null }) {
  if (!at) return <>at an unrecorded time</>;
  return (
    <time className="tabular" dateTime={at}>
      {new Date(at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}

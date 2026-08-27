import type { Metadata } from "next";
import Link from "next/link";
import { adminConfigured, adminSessionLabel } from "../../lib/admin";
import type { ClientTakedown } from "../../lib/board/admin-client";
import { listHidden } from "../../lib/board/takedown";
import TakedownConsole from "../../components/TakedownConsole";

/**
 * The takedown console: sign in, see what is currently hidden, put a block
 * back, or destroy its content.
 *
 * WHO CALLS THIS: nobody in the codebase. It is a page, and its callers are an
 * operator with the token and the three routes it drives — `POST` and `DELETE
 * /api/admin/session`, `GET /api/admin/takedowns`, and `POST
 * /api/admin/blocks/[id]`. `SECURITY.md` § Takedown is what it performs: "a
 * token-gated admin surface that performs exactly these two statements and
 * lists what is currently hidden".
 *
 * THREE STATES, DECIDED ON THE SERVER, and the order matters:
 *
 *  1. **Not configured.** `ADMIN_TOKEN` is unset, so there is no admin surface
 *     on this deployment at all and the form below could not work if it were
 *     shown. This is the ONE place in the product allowed to say so out loud —
 *     `POST /api/admin/session` answers 503 and explains itself for exactly
 *     the same reason, and its own comment says why: "an operator standing in
 *     front of the sign-in form needs to know why it does not work". The routes
 *     behind the form have no such duty and `requireAdmin` gives them none.
 *
 *     It is said HERE rather than left to the 503, because the form is a plain
 *     HTML form that navigates. A browser handed that 503 would render its
 *     JSON body, and a page of JSON is not an answer to an operator.
 *
 *  2. **No session.** The sign-in form, and any refusal the last attempt was
 *     redirected back with.
 *
 *  3. **Signed in.** The first list is rendered here, from `listHidden`
 *     directly — the same shape `src/app/page.tsx` uses to server-render the
 *     board — and `TakedownConsole` takes over from there.
 *
 * `force-dynamic` because all three of those are per-request facts: a cookie,
 * an environment variable and a table. Nothing on this page may ever be served
 * from a cache to the next person who asks for it.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Takedowns · milliondollarpage.fun",
  // Not a page for a search engine to hold a copy of. The guard is what keeps
  // it shut; this only keeps it out of an index that would advertise it.
  robots: { index: false, follow: false },
};

export default async function AdminPage(props: PageProps<"/admin">) {
  const configured = adminConfigured();
  const label = configured ? await adminSessionLabel() : null;
  const { error } = await props.searchParams;

  return (
    <main className="prose-page">
      <div className="mx-auto max-w-[52rem] px-5 pb-24 pt-6">
        <nav className="flex items-center justify-between gap-4 border-b border-hairline-strong pb-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-[17px] font-bold text-ink"
          >
            <span aria-hidden className="size-2.5 rounded-full bg-primary ring-3 ring-primary-soft" />
            milliondollarpage.fun
          </Link>
          <Link href="/" className="btn-quiet px-3 py-1.5 text-[13px]">
            Back to the board
          </Link>
        </nav>

        <h1 className="mt-8 font-display text-[34px] font-bold leading-tight tracking-tight">
          Takedowns
        </h1>

        {!configured ? (
          <NotConfigured />
        ) : label === null ? (
          <SignIn error={first(error)} />
        ) : (
          <>
            <p className="mt-3 text-[16px] leading-relaxed text-body">
              A takedown is about what is displayed. The buyer still owns the pixels, is not
              refunded, and nobody else can buy them. Unhiding a block puts back the same picture,
              byte for byte, because the bytes were never touched.
            </p>
            <TakedownConsole label={label} initial={(await listHidden()).map(overTheWire)} />
          </>
        )}
      </div>
    </main>
  );
}

/**
 * `listHidden` hands back `Date`s and the browser half of this page reads
 * strings, because that is what `GET /api/admin/takedowns` produces once
 * `JSON.stringify` has been over the same rows. Converting here rather than
 * widening `ClientTakedown` keeps the console with ONE shape to render,
 * whether the rows were server-rendered or fetched.
 */
function overTheWire(row: Awaited<ReturnType<typeof listHidden>>[number]): ClientTakedown {
  return {
    ...row,
    hiddenAt: row.hiddenAt?.toISOString() ?? null,
    purgedAt: row.purgedAt?.toISOString() ?? null,
  };
}

/** A repeated `?error=` is still one refusal. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function NotConfigured() {
  return (
    <div className="mt-6 rounded-md border border-hairline-strong bg-card p-5">
      <p className="text-[16px] leading-relaxed text-ink-soft">
        Admin access is not configured on this deployment. <strong>ADMIN_TOKEN</strong> is unset, so
        there is no admin surface here to sign in to and nothing this page could show you.
      </p>
      <p className="mt-3 text-[16px] leading-relaxed text-body">
        Set it in the environment and deploy again. Clearing it is also how the surface is taken
        down in a hurry: sessions already signed in stop resolving with it.
      </p>
    </div>
  );
}

/**
 * A plain HTML form that navigates, on purpose.
 *
 * `POST /api/admin/session` reads a form body and answers 303, and its own
 * comment says why: "a login that needs client-side JavaScript to work is a
 * login that does not work when the JavaScript fails". So there is no
 * in-flight disabling on this button — there is no request for this page to be
 * holding — and a double submit costs a second session row and nothing else.
 */
function SignIn({ error }: { error?: string }) {
  return (
    <form
      method="post"
      action="/api/admin/session"
      className="mt-6 max-w-[26rem] rounded-md border border-hairline-strong bg-card p-5"
    >
      <p className="text-[16px] leading-relaxed text-body">
        Sign in to see what is currently taken down.
      </p>

      {error && (
        // The page has just loaded carrying this, so it is on screen before any
        // reader reaches it. `alert` is still right: it is the answer to the
        // button that was pressed, and it says the belief behind it was wrong.
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[15px] leading-relaxed text-ink-soft"
        >
          {error === "locked"
            ? "Too many failed attempts from this address, so the form is locked for now."
            : "That token was not recognised."}
        </p>
      )}

      <label className="label-caps mt-4 block" htmlFor="admin-token">
        Token
      </label>
      <input
        id="admin-token"
        className="field-input mt-1"
        type="password"
        name="token"
        required
        autoComplete="current-password"
        autoFocus
      />

      <button type="submit" className="btn-primary mt-4 w-full px-5 py-2.5 text-[15px]">
        Sign in
      </button>
    </form>
  );
}

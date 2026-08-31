/**
 * Environment readers.
 *
 * Each one throws rather than defaulting. A default for any of these is a
 * production deploy that looks healthy while doing the wrong thing.
 */

export function required(name: string, why: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. ${why}`);
  return value;
}

export function rateLimitSalt(): string {
  return required(
    "RATE_LIMIT_SALT",
    "An unsalted SHA-256 of an IPv4 address is reversible by brute force, so the " +
      "stored hashes would be visitor IP addresses in all but name.",
  );
}

export function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function allowUntrustedClientIp(): boolean {
  return process.env.ALLOW_UNTRUSTED_CLIENT_IP?.trim() === "true";
}

/**
 * Which platform header, if any, this deployment trusts as the caller's real
 * address.
 *
 * Unset by default: no platform header is trusted until we are told which
 * edge we are running behind, because a header is only unforgeable when that
 * platform's edge is the one writing it. `client-ip.ts` still validates the
 * value against the headers it actually knows how to use — this function only
 * reads the environment.
 */
export function trustedPlatformHeader(): string | null {
  return process.env.TRUSTED_PLATFORM_HEADER?.trim() || null;
}

/**
 * Whether this process is a DEPLOYED instance rather than somebody's laptop.
 *
 * WHY NOT `NODE_ENV === "production"`, which is what the two asserts below used
 * to ask. Next's own launcher does not normalise `NODE_ENV`: `NODE_ENV=staging
 * next start` boots perfectly well, and under that value every guard keyed on
 * the string "production" is silent. A guard that a typo can switch off is not
 * a guard. The 2026-08-28 audit found exactly this and it is why this function
 * exists.
 *
 * FAIL-CLOSED, AND THAT IS THE WHOLE DESIGN. It does not ask "is this
 * production" — it asks "have I been shown proof this is a developer's
 * machine", and treats anything else as deployed. An unfamiliar `NODE_ENV`
 * counts as deployed, because the failure it guards is free rectangles and the
 * cost of being wrong the other way is a developer setting one variable.
 *
 * `VERCEL_ENV` is checked first and on its own: it is set on preview
 * deployments too, and a preview with stub payments enabled is a public URL
 * where anybody can mark any order paid.
 */
export function isDeployed(): boolean {
  if (process.env.VERCEL_ENV?.trim()) return true;
  const node = process.env.NODE_ENV;
  return node !== "development" && node !== "test";
}

/**
 * Refuses to start a deployed instance whose Solana configuration disagrees
 * with itself or points anywhere but mainnet.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: require the configuration to exist. There
 * is no payment code in this repository yet — no `@solana/*`, no RPC client, no
 * `PAYMENT_WALLET` — so demanding `SOLANA_CLUSTER` at boot would refuse to
 * start the very deploy that has no payments in it. It guards a CONTRADICTION,
 * not an absence.
 *
 * WHEN THE PAYMENT BATCH LANDS this becomes a presence check as well, and that
 * batch owes it: a verifier that reads the cluster from a request, or trusts an
 * RPC endpoint nobody pinned, is how a devnet payment settles a mainnet order.
 * `DECISIONS.md` carries that as specification item 3.
 */
export function assertPaymentClusterNotMisconfigured(): void {
  if (!isDeployed()) return;

  const cluster = process.env.SOLANA_CLUSTER?.trim();
  const rpc = process.env.SOLANA_RPC_URL?.trim();

  if (cluster && cluster !== "mainnet-beta") {
    throw new Error(
      `SOLANA_CLUSTER is "${cluster}" on a deployed instance. Only "mainnet-beta" ` +
        "settles real money; a test cluster here would credit orders for payments " +
        "that cost nothing to make.",
    );
  }

  if (rpc && /\b(devnet|testnet)\b/i.test(rpc)) {
    throw new Error(
      "SOLANA_RPC_URL points at a test cluster on a deployed instance. A payment " +
        "proven there is free to fabricate, so it must never settle an order here.",
    );
  }
}

/**
 * Refuses to start in production with stub payments enabled.
 *
 * `ALLOW_STUB_PAYMENTS=true` makes `markPaid` accept a synthetic signature
 * with no on-chain check at all. If that were ever set in production, anyone
 * could mark any order paid without sending any money — every rectangle on
 * the board would be free for the asking. It exists only so this batch can
 * be built and tested before batch 3 ships the real Solana/USDC verifier;
 * this check is what keeps it from ever reaching a real deploy.
 */
export function assertStubPaymentsNotInProduction(): void {
  if (isDeployed() && process.env.ALLOW_STUB_PAYMENTS?.trim()) {
    throw new Error(
      "ALLOW_STUB_PAYMENTS is set in production. This would let anyone mark any order " +
        "paid without sending money. Remove it before this can start.",
    );
  }
}

/**
 * Refuses to start in production with `ALLOW_UNTRUSTED_CLIENT_IP` enabled.
 *
 * That flag exists so `next dev` — which sits behind no proxy — has a
 * client address to rate-limit against at all. Set in production it does the
 * opposite of what a rate limit is for: every caller collapses into the
 * single identity `clientIp` invents for it, so every visitor on the
 * internet shares one bucket. With a 3-hold ceiling per caller, the fourth
 * visitor anywhere would find every rectangle already "held" by that shared
 * identity — a trivially self-inflicted outage, not merely a weaker limit.
 */
export function assertUntrustedClientIpNotInProduction(): void {
  if (isDeployed() && process.env.ALLOW_UNTRUSTED_CLIENT_IP?.trim()) {
    throw new Error(
      "ALLOW_UNTRUSTED_CLIENT_IP is set in production. This would collapse every " +
        "caller into a single shared rate-limit identity, and the board's 3-hold " +
        "ceiling would make the site unusable for everyone after the first few " +
        "visitors. Remove it before this can start.",
    );
  }
}

/**
 * Refuses to serve a deployed instance whose database is behind this build.
 *
 * WHAT IT PREVENTS, from a real incident: the first production deploy of this
 * project answered 500 on every route because the database was four migrations
 * behind. The logs said `column "hidden_at" does not exist`, which reads like a
 * bug in a query rather than a database nobody had migrated. This turns that
 * into one sentence naming both versions, at boot, once.
 *
 * ASYNC, AND THEREFORE NOT ONE OF THE SYNCHRONOUS ASSERTS: it asks the
 * database. `register()` awaits it before the instance serves anything.
 *
 * IT DOES NOT MIGRATE. Applying migrations from a booting web server is how two
 * instances race each other through the same DDL; migrating stays a deliberate
 * command somebody runs.
 *
 * It only fires when deployed. A developer mid-migration gets the ordinary
 * error, because on a laptop the fix is `npm run db:up` and the noise is not
 * worth it.
 */
export async function assertSchemaIsCurrent(): Promise<void> {
  if (!isDeployed()) return;

  const { EXPECTED_MIGRATION } = await import("./schema-version");
  const { query } = await import("./db");

  const rows = await query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
  );
  const applied = rows[0]?.version ?? "(none)";

  // BEHIND is the fault. AHEAD is not, and the first version of this check got
  // that wrong: it compared for equality, so migrating production before the
  // new build finished deploying took the site down until it did. That ordering
  // is not a mistake to avoid — it is the correct one for a migration that adds
  // things, and it is what every rolling deploy looks like for a minute.
  //
  // Migration names are zero-padded and ordered, so a string comparison is the
  // ordering. `(none)` sorts before every real name, which is the right answer
  // for a database with no migrations at all.
  if (applied < EXPECTED_MIGRATION) {
    throw new Error(
      `The database is at migration ${applied} but this build expects ` +
        `${EXPECTED_MIGRATION}. Run "npm run db:migrate" against it before serving: ` +
        "every route that touches a column added since then would answer 500.",
    );
  }
}

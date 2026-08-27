-- The admin surface gets sessions and a lockout, so the operator's token stops
-- behaving like a master secret.
--
-- 006 built both takedown levels and then said, in as many words, that "both
-- levels are operator statements run by hand. There is no moderation console in
-- this repository, and a route for one nobody has asked for would be a route
-- with no caller." The owner has now asked for one. That is the only thing that
-- changed: the semantics of a takedown are 006's and are not touched here, and
-- this migration adds no moderation state at all. It adds the two tables that
-- let a console authenticate the person driving it.
--
-- Adapted from pixelwar's 005_admin.sql, which carries the answers to three
-- findings about an admin token that behaved like a master secret: it sat in
-- the cookie in clear, it could be guessed without limit or trace, and it
-- leaked its length through an early-returning comparison. Two of those three
-- are schema, and they are the two tables below. The third lives in
-- `src/lib/admin.ts`, because a constant-time comparison is not a thing a table
-- can hold.
--
-- Read by `src/lib/admin.ts` and nothing else. Its callers arrive in Task 3 of
-- this batch: `POST /api/admin/session` signs in, `DELETE` on the same route
-- signs out, and the takedown routes authenticate through `requireAdmin`.
--
-- WHAT IS DELIBERATELY NOT HERE, twice over:
--
--  * No audit log. The source project's `admin_audit_log` is not copied,
--    because an append-only trail with nothing that reads it is a table that
--    grows forever to answer a question nobody is asking. It arrives with the
--    surface that displays it, or not at all.
--  * No revoke-anybody's-session surface. A session row stores a LABEL and
--    never the secret, so rotating `ADMIN_TOKEN` to a new value does not touch
--    a live session — nothing about the row mentions the old secret. The two
--    real answers to a leaked cookie are CLEARING `ADMIN_TOKEN`, which does
--    kill every live session because `resolveAdminSession` gates on it, at the
--    cost of taking the whole surface down; or psql. Named here rather than
--    implied, so nobody reads "revocable" as more than it is.

-- Sessions, so the cookie carries a revocable identifier instead of the secret
-- itself. Signing out, or a leaked cookie, is then a row change rather than a
-- redeploy with a new environment variable.
--
-- `id` is TEXT and not uuid: it is 32 random bytes hex-encoded, which is not a
-- UUID and must not be stored as one — a uuid column would force a shape on a
-- value whose only job is to be unguessable, and 128 bits with six of them
-- spent on a version is fewer than 256 with none.
CREATE TABLE admin_sessions (
  id          TEXT PRIMARY KEY,
  token_label TEXT        NOT NULL,
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);

-- `resolveAdminSession` looks a session up by primary key and then filters on
-- these two, so this index is for the sweep that reaps dead rows rather than
-- for the hot path.
CREATE INDEX admin_sessions_live ON admin_sessions (expires_at, revoked_at);

-- Every attempt to authenticate, successful or not. Failures drive the
-- lockout; successes are kept because they END a failure streak, and because
-- "when did this token last work" is the first question asked when something
-- looks wrong.
--
-- ip_hash, never an address: the same salted-SHA-256 rule the rest of this
-- project follows (see `hashIp` in src/lib/callers/client-ip.ts). It is NOT
-- NULL because a caller whose address cannot be trusted is refused before an
-- attempt is recorded, rather than sharing one anonymous bucket with every
-- other such caller — a shared bucket here would let anybody spend the
-- operator's five guesses and lock them out of their own admin surface.
CREATE TABLE admin_login_attempts (
  id           TEXT PRIMARY KEY,
  ip_hash      TEXT        NOT NULL,
  token_label  TEXT,
  succeeded    BOOLEAN     NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL
);

-- Matches `checkAdminLoginGate`'s WHERE (ip_hash = $1 AND attempted_at > $2)
-- and its ORDER BY attempted_at DESC, in that column order: equality first,
-- then the range the scan walks backwards.
CREATE INDEX admin_login_attempts_ip
  ON admin_login_attempts (ip_hash, attempted_at DESC);

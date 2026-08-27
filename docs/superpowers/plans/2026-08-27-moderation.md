# Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Give the operator a token-gated admin surface for the two takedown
levels the database already defines, plus the list of what is hidden.

**Architecture:** The decisions are already made and already enforced.
`migrations/006_takedown.sql` defines a normal takedown as `hidden_at` on a row
that stays `paid`/`minted`, and a legal purge as `block_purge_content(id,
reason)` with `blocks_purged_keeps_nothing` saying what "erased" means. The
wall's fingerprint (`wallFingerprint`, `src/lib/board/composite.ts:122`) already
filters through `publishesTextSql`, which includes `hidden_at IS NULL` — so
hiding a block changes the fingerprint and the composite rebuilds itself. This
batch therefore adds NO new moderation semantics and NO cache invalidation. It
adds authentication, three routes, and a page.

**Spec:** `SECURITY.md` § Takedown — the binding authority for every verdict
in this batch.

## Global Constraints

- Everything in this repository is written in English, documentation included.
- The words "non-transferable" must not appear anywhere. Transfer is an open
  decision: not built, not promised, not forbidden.
- Copy never promises a moderation deadline, a review time, or an appeal
  outcome. A takedown page that promises "reviewed within 24 hours" is a
  written promise the owner has not made.
- Ownership never lapses. No moderation path may change `status`,
  `buyer_pubkey`, `x`, `y`, `w` or `h`, and no path may put a moderated
  rectangle back on sale.
- Migrations already applied are never edited. The next number is 009.
- A branch carrying a migration gets its own Neon test database, child of
  `production`, deleted when the work merges.
- Commits are authored by CryptoSandler with no trailers. The orchestrator
  checks each subagent's range on delivery.
- Guards read the render; they never reconstruct the expected value.

## File Structure

- `migrations/009_admin.sql` — `admin_sessions`, `admin_login_attempts`.
- `src/lib/admin.ts` — adapted from `~/proyectos/pixelwar/src/lib/admin.ts`.
- `src/lib/admin-guard.ts` — adapted from pixelwar's, the single refusal.
- `src/lib/board/takedown.ts` — hide, unhide, purge, list. The only module that
  writes moderation state.
- `src/app/api/admin/session/route.ts` — sign in and out.
- `src/app/api/admin/takedowns/route.ts` — the list.
- `src/app/api/admin/blocks/[id]/route.ts` — the three actions.
- `src/app/admin/page.tsx` — the operator's surface.

## Task 1: Admin authentication

Adapt, do not rewrite. pixelwar's `admin.ts` carries answers to three findings
(digest comparison so length does not leak, counted lockout, fail-closed on an
unset `ADMIN_TOKEN`) and `admin-guard.ts` carries a fourth (one refusal for
every failure mode, floored at 250ms so latency does not reveal whether the
deployment has an admin surface at all). Adapting means keeping those four
properties and their comments, and changing only what this repo names
differently: `clientIp`/`hashIp` live in `src/lib/callers/`, the cookie is
`mdp_admin`, and there are no `/admin/orphans` callers to name.

## Task 2: The takedown module

`hide`, `unhide`, `purge`, `listHidden`. `purge` calls the SQL function; it
does not re-implement the column list, because the CHECK constraint and the
function are the definition. Every function returns what actually changed so a
route cannot report success on a row it did not touch.

## Task 3: The routes

Three actions on one route, guarded by `requireAdmin`. The purge requires a
typed confirmation IN THE REQUEST BODY — `confirm` must equal `PURGE <id>` —
so the confirmation is enforced by the server and not by a dialog a curl call
skips.

## Task 4: The page

The list of hidden blocks, unhide beside each, and the purge behind a typed
confirmation field. Keyboard reachable, focus visible, live region on the
result, `prefers-reduced-motion` respected. Contrast measured from rendered
pixels, never from the stylesheet.

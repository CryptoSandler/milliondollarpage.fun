@AGENTS.md

# milliondollarpage.fun

A Million Dollar Homepage on Solana. See [docs/superpowers/specs/](docs/superpowers/specs/)
for the design, [docs/references.md](docs/references.md) for the reference
reading behind it, and [SECURITY.md](SECURITY.md) for the one private key this
project holds and why.

Everything in this repository is written in English, documentation included.

# Talking to the user

Every message you send to the user starts with the line `[milliondollarpage.fun]` on its
own, before anything else, so the user can tell which project is talking when
several Claude Code sessions run in parallel.

## Default posture: lazy senior

A skill only fires when the model judges it relevant, and this applies to every change, so
the short version lives here rather than in `~/.claude/skills/ponytail/`.

Before writing code, climb until a rung holds, and stop at the first one that does:

1. Does this need to exist at all? Speculative need: skip it, and say so in one line.
2. Does this repo already have it? Reusing what lives a few files over beats re-implementing it.
3. Does the standard library do it?
4. Does a native platform feature cover it? A DB constraint over app code, CSS over JS.
5. Does an already-installed dependency solve it? Never add one for what a few lines cover.
6. Can it be one line?

If no rung holds, write the minimum that works.

The level here is **lite**: build what was asked, and name the lazier alternative in one
line so the choice stays with the user. Nothing gets silently downscoped into something
smaller than what was requested.

Every deliberate shortcut carries a comment naming its ceiling and its upgrade path, so the
next reader knows it was a decision and not an oversight:

    // ponytail: linear scan, index it if the list outgrows a few hundred entries

Four things are never simplified away, at any level: input validation at trust boundaries,
security, error handling that prevents data loss, and accessibility basics. Laziness governs
how much code gets written. It never governs what that code is allowed to skip.

This repo has a worked example of rung 4 already: no two blocks may overlap, and that is a
Postgres exclusion constraint rather than a check in application code. See `DESIGN.md` for
how the interface should look, and `.claude/commands/cierre.md` for what closing a batch
requires.

# Every module names its callers

A new module's header comment says who calls it. Not what it does — the code says that —
but which file reaches for it and why that file could not do the job itself. A module
whose header cannot name a caller is a module nobody asked for, and the honest fix is to
delete it rather than to write a paragraph explaining it.

# Operating rules learned the hard way

Each of these is here because ignoring it cost someone real work, in this repo
or a sibling.

**Kill by PID, never by name.** `pkill -f vitest` killed a test run belonging to
a different project on this machine. Process names are shared across every repo
a person has open; a PID is not. Find the process, read its PID, kill that.

**A branch that carries migrations gets its own test database.** Create a Neon
branch off `production`, point `TEST_DATABASE_URL` at it for the life of the
branch, and delete it when the work merges. A migration under review must not
be applied to a database another branch's suite is also using: the schema the
other branch expects is gone, and its failures will look like its own bugs.

**The suite's advisory lock runs on a direct connection, never `-pooler`.**
PgBouncer in transaction pooling does not reliably keep a session-level lock on
the backend later statements land on, so a run-scoped lock taken through the
pooler is a lock that silently is not held. `vitest.globalSetup.ts` strips
`-pooler` from the host for exactly this reason; leave it stripped.

# Process rules, each of which corrected a real decision before it was built

**Adversarial review before building any model change or large product
decision.** One round, no code, that explicitly asks for three things: the
strongest case AGAINST the proposal; the collision with the real code — what
survives, what gets thrown away, and what the repository knows that the
discussion does not; and an honest recommendation, with standing permission to
say the idea is wrong. Nothing gets built until that round closes. Every time
this has run here it changed the thing being built, which is the point.

**Every verdict cites the written rule.** A gate, a critique or a design
judgement is made against the governing document open in front of you —
`DESIGN.md`, `SECURITY.md`, the spec — never against a memory of what it says.
If a verdict cannot quote the line it rests on, read the document first. A
review that recites the rule from memory is a review that will confidently
enforce a rule that was edited last week.

**Decisions with a door.** When the owner is not convinced of a one-way
decision — a written promise, a prohibition in copy, a guarantee — do not
decide it for them. Find the neutral wording that neither promises nor
forbids, build the mechanism that stays compatible with both futures, and
record the policy as the owner's open decision with both outcomes written out.
What is irreversible gets written once, and only when they ask for it in as
many words.

**Check a subagent's commit authorship the moment it hands back, not at the
close.** A sibling repository shipped commits under a personal email, and every
one of them came from a subagent: the subagent's process did not pick up the
`includeIf` that governs the orchestrator's own commits, so identical work in
the same tree was attributed two different ways. Run
`git log <range> --format='%an <%ae>'` over each subagent's range as it reports,
while the fix is still one `--amend` away. The pre-push author gate stays as the
last net, but a gate that fires at the close is a gate that fires after twenty
commits need rewriting.

**Commit identity lives in this repo's `.git/config`.** `user.name` and
`user.email` are set locally, and were on the first day. The global `includeIf`
is a net, not the source: a child process may fail to resolve its condition,
while a repo-local value is read by every process that touches the repository.
That is why the audit of every ref here returns one identity and no
exceptions — it is configuration, not luck, and it does not survive being
"cleaned up" into the global file.

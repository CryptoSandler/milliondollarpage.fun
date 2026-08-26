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

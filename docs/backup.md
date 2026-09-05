# The backup, and the rehearsal that makes it a backup

A copy nobody has restored from is a copy nobody knows is a backup. This file is
the procedure, and the record of when it was last run.

## What runs

`.github/workflows/backup.yml`, daily at 04:12 UTC. It reads with
`mdp_backup_reader` — a Neon role with `SELECT` and nothing else, verified by
attempting an `INSERT` and being refused — and pushes into a private repository
this repository does not name, because this repository is public.

The layout is content-addressed, which is what makes a daily copy cheap:

```
manifest.json          every block, its row hash and its image hash
blocks/<id>.json       one row, without the image bytes
images/<sha256>.bin    the image bytes, content-addressed
```

A day on which nothing was bought is a day with **no changes at all**, because
an unchanged picture is the same path with the same contents. The workflow
commits nothing on those days rather than writing an empty commit into a history
somebody may one day have to read.

## Retention

Daily commits are kept for ninety days. On the first of each month everything
older than that window is collapsed into one root commit — every daily commit
INSIDE the window survives as its own restore point, which is what ninety-day
retention has to mean to be worth anything.

## The rehearsal, monthly

**Nothing about this is automatic on purpose.** A restore that only a script has
ever done is a restore nobody has read the output of.

1. Clone the backup into a scratch directory.
2. Create a Neon branch off `production` — call it `restore-rehearsal-<date>` —
   and run every migration against it.
3. Load `blocks/*.json` and `images/*.bin` into it. There is deliberately no
   script for this step yet: see the ceiling below.
4. Point a local server at that branch and open the board. The wall should draw,
   `/buyers` should list, and one `/b/<id>` should show its picture.
5. Delete the Neon branch.
6. Write the date and what was found at the bottom of this file.

> **ponytail: there is no restore script, only this procedure.** Writing one
> before a restore has been done by hand would be writing it against a guess at
> what goes wrong. The first rehearsal is what tells us; the script comes after,
> and its first test is the transcript below.

## What a purge means for the copies

`scripts/backup-expunge.mts` removes a purged block's row and its image from
**every commit**, not from the tip, and refuses to delete an image a block that
was not purged still points at.
`src/lib/__tests__/backup-expunge.test.ts` builds a three-commit repository with
the bytes in all three and requires that no object anywhere still holds them.

**The rule that put this file in this order:** the backup was not switched on
until that script existed. `SECURITY.md` says what a purge covers, and it says
it in the present tense.

## Rehearsals

| Date | Restored from | What was found |
|---|---|---|
| — | — | **Never run.** The first daily copy has not been taken: the workflow's first scheduled run is the night after it merges. |

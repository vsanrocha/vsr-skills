---
name: wrap-up
description: End-of-session ritual. Audits changes, runs quality checks, captures learnings, writes a session summary, and reminds about committing. Takes under 2 minutes.
---

Run the end-of-session wrap-up ritual. Go through each step below in order.

## Step 1 — Audit

Run these two commands and show the output:

```bash
git status
git diff --stat
```

Note how many files changed and whether there are uncommitted changes.

## Step 2 — Quality

Run the project's quality checks. Try each in order and report the result:

1. **Type check** — run the project's typecheck command (e.g. `npx tsc --noEmit`, `bun tsc --noEmit`)
2. **Lint** — run the project's lint command (e.g. `npx eslint . --quiet`, `bun run lint`)
3. **Tests** — run the project's test suite (e.g. `bun test`, `npm test`, `npx vitest run`)

If no quality commands are configured, say so explicitly. Do not claim the check passed.

## Step 3 — Learning Capture

Ask the user:

> Any corrections or patterns worth capturing from this session? If yes, write them as `[LEARN]` blocks:
>
> ```
> [LEARN]
> Category: <Architecture|Testing|Quality|Git|Performance|Navigation|Editing|Context>
> Rule: <the pattern to follow>
> Mistake: <what went wrong>
> Correction: <how it was fixed>
> ```
>
> The learn-capture hook will automatically route them to the right store.

Wait for the user's response before continuing. If they have nothing to capture, proceed.

## Step 4 — Session Summary

Write a single paragraph summarizing what was accomplished this session. Include:
- What was built or fixed
- Key decisions made
- Any blockers encountered

Output it directly here for the user to review.

## Step 5 — Next Session Context

Ask the user:

> What should be done next? I'll save it to `progress.txt` so the next session can pick up cleanly.

Once the user answers, append to `progress.txt` in the project root (create if missing):

```
## Session <YYYY-MM-DD>

**Accomplished:** <one-line summary>

**Next:** <what the user said>
```

## Step 6 — Commit Reminder

If `git status` from Step 1 showed uncommitted changes:

> You have uncommitted changes. Consider committing before closing the session:
>
> ```bash
> git add <relevant files>
> git commit -m "feat(scope): description"
> ```
>
> Use `/conventional-commits` if you want help writing the commit message.

If everything is already committed, confirm:

> All changes are committed. Session is clean.

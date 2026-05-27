---
description: Create a worktree for an approved OpenSpec proposal and start implementation
---

The change `$ARGUMENTS` has an approved proposal committed to `main`.
Create an isolated git worktree on the correct branch and begin implementation there.

**Steps:**

1. Confirm the user is in the main worktree and on the `main` branch. If not, stop and tell them.

2. Ask the user: "Is this change a **feature** or a **bugfix**?" Wait for the answer before proceeding.
   - Answer "feature" → prefix is `feature`
   - Answer "bugfix" → prefix is `bugfix`
   - Any other answer → clarify and ask again; do not proceed until confirmed

3. Run `./scripts/opsx-apply-worktree.sh $ARGUMENTS <prefix>` from the repo root (substituting the chosen prefix).
   The script will:
   - Verify the proposal exists at `openspec/changes/$ARGUMENTS/`
   - Verify `main` is clean and up to date
   - Create the branch from `main` with `git branch <prefix>/$ARGUMENTS main` (no checkout)
   - Attach a sibling worktree at `../<repo>-$ARGUMENTS` to that branch
   - Copy untracked essentials (`.env`, `.env.local`)

4. If the script exits non-zero, surface the error verbatim to the user and stop.
   Do not attempt to fix preflight failures automatically — they usually mean
   the user needs to commit the proposal, pull main, or clean up a stale branch.

5. On success, report:
   - The worktree path
   - The branch name (e.g., `feature/$ARGUMENTS` or `bugfix/$ARGUMENTS`)
   - That the user should `cd` into the worktree and run `/opsx:apply $ARGUMENTS`

6. Do **not** `cd` or run `/opsx:apply` yourself — the user will handle that
   from the new worktree's VS Code window / terminal, where services,
   virtualenv, and editor state are set up independently.

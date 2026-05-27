---
description: Archive an OpenSpec change on main and clean up its worktree
---

Finalize the change `$ARGUMENTS` by archiving it and tearing down its worktree.

**Preconditions the user must have handled already:**

- The PR for `feature/$ARGUMENTS` or `bugfix/$ARGUMENTS` has been merged to `main`.
- The user has `cd`-ed back to the main worktree and pulled `main`.

If you are not sure whether those are true, ask before proceeding.

**Steps:**

1. Confirm the current directory is the main worktree and on the `main` branch.

2. Run `/opsx:archive $ARGUMENTS`. This moves the change folder to
   `openspec/changes/archive/YYYY-MM-DD-$ARGUMENTS/` and merges delta specs
   into the source-of-truth specification.

3. Review the archive diff with the user. On approval, commit with a
   conventional-commits message (e.g. `chore: archive $ARGUMENTS and sync
   <capability> spec`) and push to `main`. Do NOT use `archive:` as the
   commit type — release-please parses every commit on main and only
   recognises the conventional types listed in CLAUDE.md.

4. Run `./scripts/opsx-archive-worktree.sh $ARGUMENTS` to:
   - Remove the `../<repo>-$ARGUMENTS` worktree
   - Delete the local `feature/$ARGUMENTS` or `bugfix/$ARGUMENTS` branch
     (the script auto-detects which prefix exists)
   - Delete the corresponding remote branch if it still exists

5. If the script reports the worktree has local changes, stop and ask the user
   before re-running with `FORCE=1`. Unmerged local changes at this stage
   usually mean something didn't make it into the PR.

---
description: Abandon an in-progress change and tear down its worktree
---

The change `$ARGUMENTS` is being abandoned (rejected direction, superseded,
or no longer needed). Tear down the worktree and branch.

**Steps:**

1. Confirm with the user what exactly they want to abandon:
   - Just the worktree + branch (implementation attempt), keeping the proposal on `main`?
   - The whole change, proposal included?

2. Run `./scripts/opsx-abandon-worktree.sh $ARGUMENTS` to remove the worktree
   and delete the `feature/$ARGUMENTS` or `bugfix/$ARGUMENTS` branch (the
   script auto-detects which prefix exists). The script prompts for
   confirmation before destructive actions.

3. If the user also wants to drop the proposal from `main`, do that separately:
   - `rm -rf openspec/changes/$ARGUMENTS` (if the proposal was never committed)
   - or `git revert <proposal-commit>` (if it was committed and pushed)
   - or `git rm -r openspec/changes/$ARGUMENTS && git commit` (if committed but not yet pushed)

   Pick the right option based on the git state — ask the user which
   applies if it's not obvious.

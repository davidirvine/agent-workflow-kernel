# Workflow Notes

> These are the **sharp edges** of the workflow tooling — descriptive gotchas,
> not prescriptive rules. `CLAUDE.md` says what you MUST do; this file says what
> bites you when you do it. Stack-agnostic by design: it ships with the kernel
> and travels to every synth, so record here any gotcha about the OpenSpec /
> roborev / worktree tooling itself (not stack-specific build facts — those go
> in `STACK.md`). Imported by `CLAUDE.md` via `@./WORKFLOW-NOTES.md`.

## roborev queueing is daemon-based, not git-hook driven

The committed `post-commit` / `post-rewrite` hooks are empty stubs (shebang only) —
zero roborev logic. roborev queues reviews via its **daemon watching the main
working dir's HEAD**, not via a hook. Consequence: **commits made on a branch
inside a worktree are NOT auto-queued for review.** The gates work because
`roborev review --branch` / `roborev refine` query the daemon explicitly.

Also: `core.hooksPath` lives in shared git config, so setting it applies to the
main repo and all worktrees at once.

**How to apply:** never put roborev wiring in hook files; rely on the daemon +
explicit `roborev review`. Don't assume a post-commit fires a review — it doesn't.

## `opsx-archive-worktree.sh` teardown almost always needs `FORCE=1`

The teardown's dirty-check counts untracked/ignored build output, so any worktree
that has ever been built reports "Worktree has local changes" and the remove is
refused — even though the leftovers are only regenerable artifacts (`node_modules/`,
`test-results/`, gitignored build outputs), not unmerged source.

**Before forcing,** confirm no real work is lost: all branch commits are in `main`
after the squash-merge, and a filesystem diff of the leftover dir vs branch HEAD
shows only build artifacts. Then re-run with `FORCE=1`.

**Gotcha:** if the first (non-forced) run already removed the worktree's
`.git/worktrees/<name>` metadata, the `FORCE=1` re-run fails with
`fatal: '<path>' is not a working tree`. Finish manually:
`rm -rf <wt>` → `git worktree prune` → `git branch -D <prefix>/<change>` →
delete the remote branch if it survived the PR merge.

## "All reviews passed" is not the gate — re-check fixes against design.md

When `roborev refine` makes a code change to "address findings," the fix can
contradict an explicit decision in the change's `design.md` or a behavioral
guarantee in `specs/*/spec.md`. A clean review afterward does NOT mean the change
is correct.

**How to apply:** after refine reports "ready," diff the commits it produced
against the change's `design.md` (Decisions, Risks/Mitigations) and `specs/**/*.md`
(Scenarios). Watch for any decision phrased "this is the desired behavior" or any
scenario prescribing a specific user-facing sequence — those are intentional, not
bugs to fix. If a refine fix contradicts the design/spec: revert it (conventional-
commit message), add an in-code `// Why:` comment at the site to forestall
re-review, and add a defensive test exercising the exact missed scenario.

# Workflow Notes

> These are the **sharp edges** of the workflow tooling — descriptive gotchas,
> not prescriptive rules. `CLAUDE.md` says what you MUST do; this file says what
> bites you when you do it. Stack-agnostic by design: it ships with the kernel
> and travels to every synth, so record here any gotcha about the OpenSpec /
> roborev / worktree tooling itself (not stack-specific build facts — those go
> in `STACK.md`). Imported by `CLAUDE.md` via `@./WORKFLOW-NOTES.md`.

## roborev queueing is hook-driven, and roborev re-arms the tracked hook

roborev enqueues a review **only** when an armed `post-commit` hook runs
`roborev` `post-commit`. The daemon does **not** poll repos' HEADs — empirically
verified: with the committed no-op stub active, a commit enqueues nothing (no
`~/.roborev/post-commit.log` entry, no job); with the hook armed, the same commit
enqueues. (Full evidence: the change `make-explicit-gates-only-the-enforced-review-posture`
audit.) Repo "registration" in `roborev repo list` is a lazy side effect of that
first enqueue, so `roborev repo delete` is one-time history cleanup only — it does
not keep a repo unwatched, because there is nothing watching.

The catch: roborev **follows `core.hooksPath`**, so `roborev install-hook`/`init`
— **and `roborev review`/`refine`, which re-install the hooks as a side effect** —
rewrite the **tracked** `.githooks/post-commit` (prepending or `--force`-replacing
the no-op stub with an auto-review hook) and create `.githooks/post-rewrite`. That
both re-introduces per-commit auto-review **and** lands roborev's own formatting in
the tracked tree, which `shfmt -i 2` reflows into a diff that fails `scripts/checks.sh`
— blocking every `git push`. (The earlier belief that the stub redirected roborev to
an inert `.git/hooks/` was false.) So running a review gate itself arms the hook;
the kernel does not prevent this, it **tolerates and heals** it (below).

The kernel keeps the explicit-gates-only posture enforced against this:

- `scripts/checks.sh` lints `.githooks` by an **explicit allowlist** of
  kernel-authored hooks (`pre-commit`, `pre-push`), excluding the roborev-managed
  `post-commit`/`post-rewrite`, so a re-arm can never break the push gate.
- `scripts/install-hooks.sh` restores the no-op `post-commit` stub on every
  setup/`npm install` if roborev armed it — **post-commit only**; `post-rewrite`'s
  `remap` is left intact, since it is wanted at the explicit gates and never
  auto-reviews.
- There is **no roborev config off-switch** for the hook's enqueue (`post_commit_review`
  is a review-type string with no disabling value; `auto_filter_*` are TUI display
  filters). The residual window: after roborev arms the hook (a `roborev review`/`refine`
  gate, or an out-of-band `roborev init`), a commit made before the next setup
  re-neutralizes can enqueue once. The push gate stays safe regardless.

Also: `core.hooksPath` lives in shared git config, so setting it applies to the
main repo and all worktrees at once — a worktree commit fires the same active hook
as main.

**How to apply:** run the review gates freely (`roborev review`/`refine`/`tui`/
`/roborev-design-review-branch`) — but know they arm the hook as a side effect, so
after a gate (or roborev's "hook is outdated, run roborev init" nudge), re-run
`setup.sh`/`npm install` to re-neutralize the stub before relying on the no-auto-review
posture. The push gate is safe regardless. Never hand-add roborev wiring to the
committed hook files.

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

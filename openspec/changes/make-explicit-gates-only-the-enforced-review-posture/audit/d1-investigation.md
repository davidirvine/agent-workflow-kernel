# D1 Investigation — roborev enqueue & re-arm mechanism

> Audit evidence for the `make-explicit-gates-only-the-enforced-review-posture`
> change. Run on 2026-06-12 against roborev v0.52.0, daemon running.
> All experiments used throwaway empty commits on a deleted
> `scratch/roborev-investigation` branch; all state was restored afterward and
> the six probe review jobs (906–911) were closed.

## Classification: **(a) hook-driven** — confirmed, (b) daemon-poll ruled out

The daemon does **not** poll registered repos' HEADs. A review is enqueued
**only** when the `post-commit` hook invokes `roborev post-commit`.

### Evidence

1. **No-op stub active → no enqueue.** With the kernel's no-op `.githooks/post-commit`
   stub confirmed active (and `roborev uninstall-hook` run, `post-rewrite` absent,
   no `.git/hooks/post-commit`), an empty commit on a scratch branch produced **no**
   new `~/.roborev/post-commit.log` entry and **no** job (`roborev list` →
   "No jobs found"). A no-op `exit 0` cannot enqueue, so the daemon observed nothing.

2. **Armed hook → enqueue.** After `roborev install-hook --force`, an empty commit
   wrote a `post-commit.log` entry (`enqueued ref=HEAD branch=scratch/...`) and
   created job 906 (status running), and the repo review count rose 69 → 70.

3. **`post-commit.log` is the hook's own log.** Every historical enqueue (incl. job
   905 for the proposal commit `d6a5d7f` at 10:19:45, and the "skip / rebase in
   progress" guard entries) corresponds to a `roborev post-commit` invocation. The
   hook stubs seen now have mtimes *after* that commit — i.e. the user cleaned them
   post-hoc; the hook was armed when `d6a5d7f` was reviewed.

**Consequence:** durably keeping the `post-commit` hook a no-op (so
`roborev post-commit` never runs) is sufficient to enforce the posture. There is
no daemon watch to opt out of.

## Re-arm mechanism — both modes corrupt the tracked tree

`core.hooksPath` resolves (shared git config, absolute) to the **main** checkout's
`.githooks`, so roborev's writes land in the tracked `.githooks/` tree.

- **`roborev install-hook` (no `--force`)** — **prepends** a `_roborev_hook()` block
  (calling `roborev post-commit`) *before* the existing stub content and creates
  `.githooks/post-rewrite`. The prepended function runs and enqueues before the
  stub's `exit 0` is reached, so even the no-force path **both enqueues and corrupts**
  the file. The stub does **not** protect against the prepend.
- **`roborev install-hook --force` / `roborev init`** — fully **replaces**
  `.githooks/post-commit` with roborev's v4 auto-review hook and creates
  `.githooks/post-rewrite` (remap).

Both leave `.githooks/post-commit` carrying roborev's own formatting (`#!/bin/sh`,
4-space indent), which `scripts/checks.sh`'s `shfmt -i 2` reflows into a diff →
the push gate fails. This is the push-blocker symptom.

Re-arm is only ever triggered by an explicit `roborev init` / `install-hook`
invocation — **never** automatically by the daemon (consistent with (a)). The
workflow's own gates (`roborev review` / `refine` / `tui`) do **not** install hooks.

## No config opt-out for post-commit enqueue (1.4)

- **`post_commit_review` is a string (review *type*), not an on/off switch.** It is
  absent from `roborev config list` (a per-repo `.roborev.toml` key, not global).
  A bool value is rejected (`incompatible types: ... type bool; destination has type
  string`). Every string value tested — `"off"`, `"none"`, `"false"`, `"disabled"`,
  `""` — **still enqueued**. There is no value that disables the review. This
  confirms the design's rejected alternative ("rely on `post_commit_review=off`")
  for a more fundamental reason: no off-switch exists.
- **`auto_filter_repo` / `auto_filter_branch` are TUI display filters,** not daemon
  watch controls. They sit in the TUI-settings cluster of `roborev config list`
  (alongside `mouse_enabled`, `tab_width`, `hidden_columns`, `column_borders`).
  Since enqueue is hook-driven (no watch), there is nothing for them to gate.
- **`exclude_patterns` is empty** and concerns review diff paths, not repo watch.
- **`hooks=[]`** — empty; no per-repo hook config knob is exposed.

**Conclusion:** the only lever that suppresses post-commit auto-review is hook
content. No supported daemon/config "do not watch this repo" switch exists.

## `repo delete` is one-time cleanup only (does not hold)

Registration is a lazy side effect of `roborev post-commit`: the repo review count
rose 69 → 70 the instant an armed-hook commit enqueued (no prior `repo add`). So
`roborev repo delete` removes the registration **and its review history**, but the
next armed-hook commit re-registers. Deleting therefore does not prevent future
auto-review on its own — only neutralizing the hook does. `repo delete` is useful
solely as a one-time history cleanup.

## Implications for D2 / D3 (mechanism selected)

- **D2 posture:** enforced by keeping `.githooks/post-commit` a no-op. No config
  lever exists, and re-arm is only manual `roborev init`/`install-hook` (not used by
  the gates), so the committed stub holds in normal flow. Add a durable,
  roborev-guarded neutralization step (restore the no-op `post-commit` if roborev
  armed it) to `install-hooks.sh`/`setup.sh`, targeting **`post-commit` only** —
  leave `post-rewrite`'s `remap` intact. One-time `roborev repo delete` for history
  cleanup.
- **D3 hook collision:** **Option B** is viable and chosen — replace `checks.sh`'s
  `.githooks/*` glob with an explicit allowlist of kernel-authored hooks
  (`pre-commit`, `pre-push`), excluding the roborev-managed `post-commit` /
  `post-rewrite`. This makes the push gate indifferent to roborev's formatting on
  those files, i.e. **fully durable** against re-arm. The (b)-with-no-opt-out halt
  branch does **not** trigger.

### Durability boundary (honest statement)

The **push gate** is fully durable (Option B is indifferent to hook content). The
**posture** (no enqueue) is durable in normal flow because nothing in the workflow
re-arms the hook and the kernel re-asserts the no-op stub on `setup`/`npm install`.
The one residual window is an *out-of-band* `roborev init` followed by a commit
before the next `setup` run — there is no config lever to close that window, since
enqueue is hook-driven and roborev exposes no off-switch. This is surfaced in the
docs rather than papered over.

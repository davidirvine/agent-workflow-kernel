## Context

The kernel asserts an explicit-gates-only review posture in `CLAUDE.md`, the `.roborev.toml` comment, and the committed `.githooks/post-commit` no-op stub. Reality contradicts it: `roborev repo list` shows this repo registered with the daemon, and `roborev status` shows 900+ completed reviews including recent `main` commits. Separately, roborev's `install-hook` keeps prepending a tab-indented auto-review block into the **tracked** `.githooks/post-commit` and creating `.githooks/post-rewrite`; `scripts/checks.sh` lints `git ls-files '.githooks/*'` with `shfmt -i 2`, so the re-armed hook fails the format gate and blocks every `git push`. The user has manually stashed the file twice.

These are two symptoms of one collision: roborev wants to own the commit hook and the daemon wants to watch the repo, while the kernel wants `.githooks/` to be a committed, shfmt-clean, no-op-only tree. Every file involved is kernel-tier and travels into every generated app via `new-app.sh`/`sync-kernel.sh`, so the bug reproduces downstream.

**Confirmed roborev facts (read-only):**

- `roborev repo` exposes only `list/show/rename/delete/merge` — there is **no** `add` and **no** daemon auto-watch config knob (`hooks=[]`, `auto_filter_repo=false`, `auto_filter_branch=false`). Registration appears automatic, so a one-time `roborev repo delete` is suspected not to hold — the repo likely re-registers on the next observed commit.
- `roborev uninstall-hook` exists and removes roborev's hooks; `install-hook`/`init` (re)install them into whatever `core.hooksPath` resolves to.
- `.roborev.toml` deliberately **omits** `post_commit_review` (relying on roborev's default, which the comment calls "intentionally left off"); `auto_close_passing_reviews=true` is the only behavioral setting present. The investigation (D1) should confirm the default's actual behavior rather than assume "absent" means "explicitly disabled."
- The two roborev-managed hooks are **not** the same kind of thing: `.githooks/post-commit` runs `roborev post-commit` (the auto-enqueue — the actual posture violation), while `.githooks/post-rewrite` runs `roborev remap --quiet` (repositions *existing* reviews after a rebase/amend — useful **at the explicit gates**, not an auto-review path). Lint-excluding both is correct (both carry roborev's own formatting), but **neutralizing content** must target `post-commit` only; touching `post-rewrite`'s `remap` could break legitimate review remapping for `roborev review`/`refine`.
- The committed stub's "inert because `core.hooksPath` redirects to `.git/hooks/`" claim (the D2 decision in the synth-d archive) is **empirically false** — roborev follows `core.hooksPath`, so pointing it at `.githooks` aims roborev's writes **into** the tracked tree.

**The two halves are orthogonal:** the **posture** (no auto-review) is enforced by keeping the repo out of the daemon's auto-review path; the **push-blocker** is purely about preventing roborev's re-armed hook from failing the lint gate. Neither hook-collision fix below kills auto-review by itself, and neither posture fix unblocks the push by itself. The design must do both.

## Goals / Non-Goals

**Goals:**

- Make explicit-gates-only **true and enforced**: no automatic review is enqueued by any commit on any branch, via either the hook or the daemon.
- Stop roborev re-arming the tracked hooks from breaking `git push`, durably (survives roborev re-running `install-hook`/`init`).
- Replace the empirically-false D2 mechanism (in the stub comment and the `dev-gates` spec) with one that holds.
- Reconcile `CLAUDE.md`, `.roborev.toml`, `WORKFLOW-NOTES.md`, and the stub so they describe the enforced behavior with no contradiction.
- Ensure the fix propagates correctly through `new-app.sh` and `sync-kernel.sh` so generated apps are neither auto-registered nor push-blocked.

**Non-Goals:**

- Changing the defined review gates themselves (proposal design review, end-of-implementation `roborev refine`, ad-hoc `roborev review`). Those stay.
- Disabling roborev globally or for other repos on the machine (`agent-workflow` is also registered and is out of scope).
- Re-litigating whether auto-review is desirable — the human has decided it is not.

## Decisions

### D1: Run the enqueue/re-arm investigation first; it gates D2 and D3 (REQUIRED first task)

Before changing anything, determine empirically **how** a `main` commit becomes an enqueued review and **what** re-arms the hook. This needs a state-mutating experiment, so it is implementation-phase work, not done in the proposal.

Procedure (on a scratch commit, restoring state after):

1. `roborev uninstall-hook` and confirm `.githooks/post-commit` is back to the committed stub and `.githooks/post-rewrite` is gone.
2. `roborev repo delete` this repo from the daemon.
3. Make a throwaway commit on a scratch branch; observe whether a review enqueues (`roborev status`/`roborev list`).
4. Observe whether the repo re-appears in `roborev repo list` and whether the hook re-arms — and if so, after which action (a plain commit, a `roborev review`/`tui`/`status` invocation, a daemon event).

Outcomes:

- **(a) Hook-driven** — the `post-commit` block running `roborev post-commit` is what registers + enqueues: durably removing/neutralizing the hook achieves the posture, and `repo delete` is one-time cleanup.
- **(b) Daemon-poll** — the daemon discovers/watches registered repos independent of the hook: a structural way to keep this repo (and every generated app) out of the watch set is required, because `repo delete` won't hold.

Record the findings in the change's audit trail; D2 and D3's final mechanism is chosen from the result.

### D2: Enforce the posture by closing whichever path the investigation identifies

Outcome-level requirement (already in the `dev-gates` delta): no auto-review enqueued by any commit, durable across roborev re-arming. Mechanism depends on D1:

- If **(a)**: neutralize the auto-review hook durably (see D3) — that is the posture fix; add a one-time `repo delete`.
- If **(b)**: find and use the daemon-level lever that keeps a repo unwatched. Candidates to evaluate in the investigation: a `.roborev.toml` / daemon-config opt-out, the `auto_filter_repo`/`auto_filter_branch` knobs, or (last resort) a documented operational step. Whatever is chosen MUST be expressible in a form that `new-app.sh` can seed into every generated app so downstream apps are not auto-registered. **If (b) holds and no supported opt-out exists, halt and present findings to the human before proceeding — do not improvise a workaround**, since shipping an unsupported hack into every generated app is exactly the failure this change exists to end.

**Alternative considered:** rely on `post_commit_review=off` alone. Rejected — it is already off, yet 900+ reviews exist, so it does not govern the path actually enqueuing reviews.

### D3: Resolve the hook collision — recommend excluding roborev-managed hooks from the lint scope (Option B), pending D1

Two candidates:

- **Option A — move hooks out of the tracked tree.** Stop pointing `core.hooksPath` at `.githooks`; have `install-hooks.sh` copy/symlink the committed hooks into `.git/hooks/`. roborev's writes then land in untracked `.git/hooks/`, invisible to `checks.sh`.
  - Rejected as primary. Copy reintroduces hook staleness (the very reason the current design chose `hooksPath`). Symlink is worse: `roborev install-hook --force` may write **through** the symlink back into the tracked file (re-corrupting the tree) or replace it unpredictably. And it still leaves an armed auto-review hook in `.git/hooks/` (only hidden from the gate, not neutralized).
- **Option B — keep `core.hooksPath=.githooks`; exclude `.githooks/post-commit` and `.githooks/post-rewrite` from `checks.sh`'s lint scope**, and durably neutralize the auto-review hook content (`post-commit` only — see below).
  - Recommended. The kernel authors exactly one line of `.githooks/post-commit` (the no-op `exit 0`); when roborev arms it, the file is roborev-managed, not kernel-authored — so linting it as kernel source is the category error. Combined with the D2 posture fix, `post-commit` is also no longer an enqueue path, so skipping it is safe.
  - **Glob mechanism:** POSIX shell has no glob negation, so do not try to subtract paths from `'.githooks/*'`. Replace the `.githooks/*` glob with an **explicit allowlist of kernel-authored hooks** (currently `.githooks/pre-commit` and `.githooks/pre-push`), with an inline comment naming the excluded roborev-managed paths (`post-commit`, `post-rewrite`) and why. Trade-off: a future kernel-authored hook must be added to the allowlist or it goes unlinted — call this out in the comment so it is not a silent gap.
  - **`post-rewrite` is excluded from linting but NOT neutralized.** Its `remap` is wanted at the explicit gates; only `post-commit`'s auto-enqueue is neutralized. Keep the two actions separate.

Decision: **Option B**, with the precise neutralization step (uninstall-hook on setup, and/or a guard that re-asserts the stub) finalized after D1 tells us what re-arms the hook. If D1 shows Option B cannot be made durable (e.g. roborev re-arms aggressively and the armed hook still enqueues despite `post_commit_review=off`), fall back to Option A with symlink-safety verified.

### D4: Replace the false D2 design decision and the stub's comment

The stub stays as the version-controlled posture marker, but its comment is rewritten to state the *true* mechanism (roborev follows `core.hooksPath`; the posture is enforced by the daemon-registration/lint-scope fix, not by a `.git/hooks/`-redirect that does not exist). The corresponding `dev-gates` "posture survives a roborev re-init" scenario is replaced (done in the spec delta) with scenarios that hold empirically.

### D5: Reconcile the posture documentation

Update `CLAUDE.md` (Code-review section), the `.roborev.toml` comment, `WORKFLOW-NOTES.md` (the "daemon watches HEAD" note), and the stub so all four agree on the enforced posture: reviews run only at the explicit gates, the daemon does **not** auto-review `main`, and the mechanism that guarantees it is the one D2/D3 land on. `WORKFLOW-NOTES.md` should keep its accurate description of daemon-vs-hook queueing but note that auto-registration is suppressed for this repo and generated apps.

### D6: Propagate through generation and sync

**Gate (must be answered before group 5 begins):** decide whether generated apps ship roborev *enabled at the gates* at all, or whether the kernel leaves roborev wiring entirely to the consumer. The answer is load-bearing for D6's shape — if generated apps carry no roborev wiring, D6 collapses to "don't propagate roborev artifacts / don't auto-register"; if they do, D6 must ensure the posture fix propagates intact. This is a human decision; surface it before implementing group 5 rather than assuming a default.

Whatever D2/D3 produce — a `checks.sh` glob change, an `install-hooks.sh` change, a `.roborev.toml` opt-out, a stub-comment rewrite — must travel via `new-app.sh` and `sync-kernel.sh` so a freshly generated app inherits the enforced posture and a clean push gate. Add coverage (e.g. an assertion in the generate-assert / smoke-app path or a manual verification step) that a generated app is not auto-registered and its push gate is not broken by a roborev hook re-arm.

## Risks / Trade-offs

- **D1 outcome (b) with no daemon opt-out knob** → the posture may require an operational step roborev does not natively support cleanly. Mitigation: the investigation explicitly enumerates `auto_filter_repo`/`auto_filter_branch` and config options before falling back to a documented manual step; surface the limitation honestly rather than claiming a guarantee the tooling can't keep (the exact failure this change exists to fix).
- **Excluding hook files from `checks.sh` (Option B) reduces lint coverage** → a genuinely kernel-authored future hook could go unlinted. Mitigation: scope the exclusion as narrowly as possible (only the roborev-managed `post-commit`/`post-rewrite` paths), keep all other `.githooks/*` in scope, and document why.
- **roborev re-arms the hook between the neutralization and the next push** → push could still break if neutralization isn't durable. Mitigation: D1 identifies the re-arm trigger so neutralization targets it; Option B makes the lint gate indifferent to the hook content regardless of re-arming.
- **Generated apps on machines without roborev** → the fix must be a no-op there. Mitigation: every step (uninstall-hook, repo delete, config opt-out) must be guarded to skip cleanly when roborev/daemon is absent, mirroring `install-hooks.sh`'s existing no-git-work-tree guard.

## Migration Plan

1. Run D1 investigation; record findings in the change audit.
2. Apply the posture fix (D2) and hook-collision fix (D3) to the kernel.
3. Rewrite the stub comment (D4) and reconcile docs (D5).
4. Wire propagation + coverage through `new-app.sh`/`sync-kernel.sh` (D6).
5. Verify: a fresh commit on `main` enqueues no review; `roborev install-hook` followed by `git status` shows no tracked-hook modification that breaks the push gate; a generated app is not auto-registered.

Rollback: revert the change commits; the prior (broken-but-known) state returns. No data migration is involved.

## Open Questions

- **(Gated by D1)** Is the `main`-commit enqueue hook-driven or daemon-poll-driven, and what re-arms the hook? Determines D2/D3's final mechanism.
- Does roborev offer any supported "do not watch this repo" switch (config, `.roborev.toml`, or `auto_filter_*`)? If not, what is the least-bad durable mechanism for keeping generated apps unwatched?
- **(Decision gate before group 5)** Should generated apps ship roborev *enabled at the gates* at all, or should the kernel leave roborev wiring entirely to the consumer? Promoted from "may be deferred" to a required human decision before D6 implementation, because D6's shape depends on the answer.

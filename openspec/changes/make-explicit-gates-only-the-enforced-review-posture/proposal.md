## Why

The kernel claims an "explicit-gates-only" review posture in three places — `CLAUDE.md`, the `.roborev.toml` comment, and the committed `.githooks/post-commit` no-op stub — but the claim is false: `roborev repo list` shows this repo registered with the daemon and `roborev status` shows 900+ completed reviews, including recent `main` commits. The daemon auto-reviews every `main` commit. At the same time, roborev's `install-hook` keeps re-arming the hook by prepending a tab-indented auto-review block into the **tracked** `.githooks/post-commit` (and creating `.githooks/post-rewrite`), which fails `scripts/checks.sh` (`shfmt`) and blocks every `git push`. Both symptoms share one root cause — the kernel and roborev fight over the same hook directory — and both ride the kernel into every generated app via `new-app.sh`/`sync-kernel.sh`.

## What Changes

- **Make the explicit-gates-only posture actually enforced, not merely asserted.** The intended posture (confirmed by the human) is that `main` commits are genuinely **not** auto-reviewed — reviews run only at the defined gates (proposal design review, end-of-implementation `roborev refine`, ad-hoc `roborev review`). Stop the daemon auto-reviewing this repo and prevent generated apps from auto-registering with the daemon. The exact mechanism is gated on an investigation (see below).
- **Stop roborev re-arming the tracked git hooks and unblock `git push`.** Resolve the `core.hooksPath` collision so roborev's `install-hook` writes no longer land in the tracked `.githooks/` tree and break the format gate, and ensure `roborev uninstall-hook` (or equivalent) leaves the posture durable rather than recurring.
- **Fix the empirically-false D2 design decision.** The `.githooks/post-commit` stub's comment — and the `dev-gates` "posture survives a roborev re-init" scenario — claim roborev writes to `.git/hooks/` and is "inert" because `core.hooksPath` redirects away. roborev *follows* `core.hooksPath`, so pointing it at `.githooks` aims roborev's writes **into** the tracked tree. Replace this mechanism with one that is empirically true.
- **Reconcile the docs/posture artifacts** (`CLAUDE.md`, `.roborev.toml` comment, `WORKFLOW-NOTES.md`, the stub) so they describe the posture that is actually enforced, with no internal contradiction.
- **Gating investigation (first implementation task, requires a state-mutating experiment):** determine how the daemon observes commits to enqueue — hook-driven (`roborev post-commit` registers + enqueues) vs. daemon-poll of registered repos' HEADs. The result decides whether durably removing the hook is sufficient or whether a structural way to keep the kernel and every generated app out of the daemon's watch set is required. `roborev repo` exposes only `delete` (no `add`, no auto-watch config knob), so a one-time `repo delete` is suspected not to hold.
- **Propagate the fix to generated apps.** Whatever resolves the posture and the hook collision must travel correctly through `new-app.sh` and `sync-kernel.sh`, so a freshly generated synth is not silently auto-registered or push-blocked.

## Capabilities

### New Capabilities

<!-- None. The posture requirement already exists in dev-gates; this change makes it true rather than introducing a new capability. -->

### Modified Capabilities

- `dev-gates`: The **"Commits are not auto-reviewed"** requirement is rewritten so the enforced mechanism matches reality — the auto-review path the posture must close is the daemon's repo registration/watch, not (only) the committed hook stub; its "posture survives a roborev re-init" scenario (which encodes the false `.git/hooks/`-is-inert claim) is replaced with scenarios that hold empirically. The **"Hooks activate on install"** and **"Pushes are gated by checks identical to CI"** requirements are adjusted as needed so roborev's `install-hook` writes can no longer corrupt the tracked hooks or break the push gate (e.g. hooks installed outside the tracked tree, and/or roborev-managed hook paths excluded from `scripts/checks.sh`). Final wording of these two depends on the design decision between the candidate fixes.

## Impact

- **Code/files:** `.githooks/post-commit` (the stub + its false comment), `.githooks/post-rewrite` (roborev-created, untracked), `scripts/checks.sh` (hook-file linting scope), `scripts/install-hooks.sh` (`core.hooksPath` strategy), `.roborev.toml` (posture comment), `CLAUDE.md` and `WORKFLOW-NOTES.md` (posture/auto-review documentation).
- **Generation/sync:** `scripts/new-app.sh` and `scripts/sync-kernel.sh` — the fix is kernel-tier and must propagate to every generated app without re-introducing auto-registration or push-blocking.
- **Tooling/runtime:** roborev daemon registration state for this repo (and, by extension, the registration behavior every generated app inherits); roborev's `install-hook`/`uninstall-hook` and `repo delete` behavior.
- **Design record:** the D2 decision is corrected/replaced; the `dev-gates` spec's auto-review and hook requirements change.

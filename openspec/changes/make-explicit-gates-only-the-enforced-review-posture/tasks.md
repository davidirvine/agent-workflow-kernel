## 1. Investigation (gates all later groups — D1)

- [x] 1.1 On a scratch branch, run `roborev uninstall-hook` and `roborev repo delete` for this repo; confirm `.githooks/post-commit` returns to the committed stub and `.githooks/post-rewrite` is gone. Record the before/after state.
- [x] 1.2 Make a throwaway scratch commit and observe (`roborev status`/`roborev list`) whether a review enqueues; record the result.
- [x] 1.3 Determine whether the repo re-registers (`roborev repo list`) and whether the hook re-arms, and after which action (plain commit vs. a `roborev review`/`tui`/`status` invocation vs. a daemon event). Classify as **(a) hook-driven** or **(b) daemon-poll**.
- [x] 1.4 Enumerate whether roborev offers a supported "do not watch this repo" lever (`.roborev.toml` key, `auto_filter_repo`/`auto_filter_branch`, daemon config). Record findings as the change's audit evidence and restore repo/hook state.

## 2. Enforce the explicit-gates posture (D2)

- [ ] 2.1 Based on §1, apply the posture mechanism: if (a), neutralize the auto-review hook durably; if (b), apply the daemon-level opt-out / keep-unwatched lever. De-register this repo as a one-time cleanup. **If (b) holds and §1 found no supported daemon opt-out, halt and present findings to the human before proceeding — do not improvise a workaround.**
- [x] 2.2 Verify a commit on `main` (or a scratch branch) enqueues no automatic review, and that the result survives a subsequent `roborev install-hook`/`init`.

## 3. Resolve the hook collision so pushes stop failing (D3)

- [x] 3.1 Implement the chosen fix (recommended Option B): replace `checks.sh`'s `.githooks/*` glob with an **explicit allowlist of kernel-authored hooks** (currently `.githooks/pre-commit` and `.githooks/pre-push`) — POSIX has no glob negation — with an inline comment naming the excluded roborev-managed paths (`post-commit`, `post-rewrite`) and warning that a future kernel-authored hook must be added to the allowlist. Or, if §1 forces it, the Option A symlink-safe relocation. Run `shfmt -w` + `shellcheck` on `checks.sh`.
- [x] 3.2 Add the durable neutralization step identified in §1 (e.g. `uninstall-hook` invoked from `setup.sh`/`install-hooks.sh`, guarded to no-op when roborev/daemon is absent). **Neutralize `post-commit`'s auto-enqueue only — do NOT alter `post-rewrite`'s `remap`, which is wanted at the explicit gates.** Run `shfmt -w` + `shellcheck` on any changed script.
- [x] 3.3 Verify `git push` is not blocked after roborev re-arms its hook: arm the hook, run `git status`, confirm the tracked-hook modification no longer fails the push gate, and `scripts/checks.sh` passes.
- [x] 3.4 Verify `roborev remap` still functions after the changes: create a review, amend/rebase the commit, and confirm the review still tracks the new commit (guards against accidentally breaking `post-rewrite`).

## 4. Replace the false D2 mechanism and reconcile docs (D4, D5)

- [x] 4.1 Rewrite the `.githooks/post-commit` stub comment to state the true mechanism (roborev follows `core.hooksPath`; posture enforced via the §2/§3 mechanism, not a non-existent `.git/hooks/` redirect). Run `shfmt -w` + `shellcheck`.
- [x] 4.2 Update the `.roborev.toml` posture comment, `CLAUDE.md` (Code-review section), and `WORKFLOW-NOTES.md` so all four artifacts agree on the enforced posture with no contradiction. Run `prettier --write` on changed `*.md`/`*.toml`.

## 5. Propagate to generated apps (D6)

- [ ] 5.0 **Decision gate:** get an explicit human decision on whether generated apps ship roborev enabled at the gates, or leave roborev wiring to the consumer. Do not start 5.1 until answered — D6's shape depends on it.
- [ ] 5.1 Confirm the §2/§3/§4 changes travel correctly through `scripts/new-app.sh` and `scripts/sync-kernel.sh` (manifest/identity handling, app-owned-file rules), adjusting them if any changed file's generation/sync behavior is wrong.
- [ ] 5.2 Add coverage proving a freshly generated app is not auto-registered and its push gate is not broken by a roborev hook re-arm (an assertion in `generate-assert.sh`/`smoke-app.sh` where feasible, otherwise a documented manual verification step).

## 6. Completion gate

- [ ] 6.1 Run `scripts/checks.sh` (and the STACK.md completion-gate commands touched by this change: `shellcheck scripts/*.sh`, `generate-assert.sh`, `smoke-app.sh` as applicable) and confirm all pass.
- [ ] 6.2 Run `/opsx:verify` for this change and confirm the implementation matches proposal/design/specs/tasks.

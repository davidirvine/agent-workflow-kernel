## 1. Build-only setup scope

- [x] 1.1 Add the `--check --ci` build-only scope to `scripts/setup.sh`: refactor the argument parser from single-arg to multi-arg — replace the single `case "${1:-}"` (and its `$# > 1` guard at line 34) with a `while [ "$#" -gt 0 ]; do case "$1" in … esac; shift; done` loop that iterates over all positional args, so `--check --ci` and `--ci --check` are equivalent (order-independent) and an unknown flag still errors. `--ci` is valid only alongside `--check`; `--ci` without `--check`, or any other rejected combination, stays a usage error (exit 2). In `--check` mode under `--ci`, verify only `node` (pinned to `.nvmrc`) and `npm`; skip the `shfmt`/`shellcheck`/`jq`/`gh`/`openspec`/`roborev` checks and the STACK.md shfmt-pin cross-check. Update the script's header comment to document the new scope. The full `--check` and default mode stay unchanged.
- [x] 1.2 Run `shfmt -i 2 -w scripts/setup.sh` then `shellcheck -x scripts/setup.sh`; resolve all findings. Manually verify the three repo-setup scenarios: `--check --ci` exits 0 with only node+npm present, exits non-zero when node is absent/mismatched, and `--ci` without `--check` exits 2.

## 2. Pipeline script

- [ ] 2.1 Add `scripts/smoke-app.sh`: a committed bash script (`set -euo pipefail`) that generates an app with `new-app.sh` into a `mktemp -d` workspace outside the kernel checkout, runs the generated app's `setup.sh --check --ci`, then runs `npm install` + `npm run build` inside it. Reuse generate-assert.sh's tempdir discipline (tear down on success, leave in place with a printed pointer on failure) and its headless git-identity exports (D3).
- [ ] 2.2 Assert the build produced an artifact (the generated app's `dist/` exists and is non-empty) before declaring success, and print a clear ✓/✗ summary (D5).
- [ ] 2.3 Run `shfmt -i 2 -w scripts/smoke-app.sh` then `shellcheck -x scripts/smoke-app.sh`; resolve all findings. Confirm `scripts/checks.sh` stays green — it discovers scripts via `git ls-files '*.sh'`, so the new files are picked up automatically.
- [ ] 2.4 Add `scripts/smoke-app.sh` to `kernel.excludeFromGenerate` in `kernel-manifest.json` (mirroring `generate-assert.sh`) so it does not travel to generated apps; run `npx prettier --write kernel-manifest.json`, then `scripts/check-manifest.sh` and `scripts/generate-assert.sh` to confirm both stay green after the manifest change.

## 3. CI wiring

- [ ] 3.1 Rewrite the `smoke-app` job body in `.github/workflows/ci.yml`: replace the `echo "smoke-app: pending until slice 5"` step with `actions/checkout@v4`, then `actions/setup-node` (`node-version-file: .nvmrc`, no `cache: npm` — the generated lockfile is stale, D6), then a single step that runs `scripts/smoke-app.sh`. Also replace the "Pending stub (D4)" comment block above the job (lines ~128–131) with a description of its live behavior. Add no new job; touch only the `smoke-app` job (D1, D6).

## 4. Documentation

- [ ] 4.1 Update `STACK.md`: change the smoke-app gate description from "remains a pending no-op stub. Slice 5 turns it on." to its live behavior (`new-app.sh → setup.sh --check --ci → build`), in both the Completion-gate test commands and Feature-level verification sections; document the local-run command (`scripts/smoke-app.sh`) and the new `setup.sh --check --ci` scope.
- [ ] 4.2 Run `npx prettier --write STACK.md` and confirm `scripts/checks.sh` is green.

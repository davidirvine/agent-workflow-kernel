## 1. Shared manifest lib (`scripts/lib/manifest.sh`)

- [x] 1.1 Create `scripts/lib/manifest.sh` containing the canonical `expand_entry()` function (verbatim from `new-app.sh`/`generate-assert.sh`/`check-manifest.sh`) plus thin helpers for the common `jq` queries (`manifest_kernel_paths`, `manifest_kernel_excludes`, `manifest_kernel_specs`, `manifest_preset_paths <preset>`, `manifest_preset_specs <preset>`, `manifest_preset_instrument_stubs <preset>`, `manifest_preset_app_templates <preset>`, `manifest_app_state_files`, `manifest_kernel_version <kernel-repo>`). `shfmt -w` + `shellcheck`-clean.
- [x] 1.2 Refactor `scripts/new-app.sh` to source the lib and remove its inlined `expand_entry()` + duplicated `jq` patterns. No behavior change; existing `generate-assert.sh` passes unchanged.
- [x] 1.3 Refactor `scripts/generate-assert.sh` to source the lib and remove its inlined copies. No behavior change.
- [x] 1.4 Refactor `scripts/check-manifest.sh` to source the lib and remove its inlined copies. Verify `scripts/check-manifest.sh` passes locally.

## 2. Manifest extension and validator

- [x] 2.1 Update `kernel-manifest.json`: (a) add `kernel.appStateFiles` with the entries `[".kernel-version", ".kernel-sync-hashes.json"]`; (b) add `scripts/sync-kernel.sh` to `kernel.excludeFromGenerate` (per design D3a — sync is kernel-only, invoked from the kernel checkout). **Do NOT add `scripts/lib/**` to `kernel.paths`** — the existing `scripts/**` glob already covers it; a redundant entry would confuse `check-manifest.sh`.
- [x] 2.2 Update `scripts/check-manifest.sh` to validate the new `appStateFiles` field: each entry is a non-empty literal path; no entry collides with `kernel.paths` (expanded), any preset's `paths` (expanded), `instrumentStubs` targets, or `appTemplates` targets.
- [x] 2.3 Extend `scripts/check-identity-leak.sh`'s `preset_scan_globs` to include `templates/**/*.{yml,yaml,sh,md,toml,json}` per preset (per design D3b — closes the gap where an `appTemplates` source could contain an un-substituted sentinel that sync would copy verbatim). Verify the existing kernel-CI gates still pass; the existing `templates/app-ci.yml` should not contain any sentinels and should pass clean.

## 3. Sync `preset-portability` and the two new specs to `openspec/specs/` (early-sync per slice-2 D9)

- [x] 3.1 Sync the `preset-portability` delta from this change into `openspec/specs/preset-portability/spec.md` (merge the three new requirements while preserving the existing canonical Purpose + Requirements). `check-manifest.sh` continues to pass.
- [x] 3.2 Sync the new `kernel-sync` delta into `openspec/specs/kernel-sync/spec.md` (canonical format: frontmatter + Purpose + Requirements; reference `openspec/specs/dev-gates/spec.md` as the format exemplar).
- [x] 3.3 Sync the new `repo-setup` delta into `openspec/specs/repo-setup/spec.md` (same canonical pattern).
- [x] 3.4 Add `openspec/specs/kernel-sync/spec.md` and `openspec/specs/repo-setup/spec.md` to `kernel.specs` in `kernel-manifest.json` (otherwise the existing "every kernel-tier spec under `openspec/specs/` appears in the manifest" rule in `check-manifest.sh` would fail — this is the same gap we fixed at slice-3 archive; do it during impl).

## 4. `scripts/sync-kernel.sh`

- [x] 4.1 Implement the CLI: required `--kernel-repo <path>`; optional `--app-repo <path>` (default `.`); optional `--dry-run`; optional `--accept-kernel`; optional `--adopt-existing` (per design D2a). Validate that `--kernel-repo` points at a directory containing `kernel-manifest.json` and `.release-please-manifest.json`; validate that `--app-repo` exists and is a directory. **Early preamble:** assert `command -v node` succeeds (required by `semver_cmp`) and `command -v jq` succeeds; fail fast with the install hint from `setup.sh --check`'s table if either is missing — sync may plausibly be run before the user has done `setup.sh --check`.
- [x] 4.2 Read the kernel's current version (`jq -r '."."' "$KERNEL_REPO/.release-please-manifest.json"`). **First check `.kernel-sync-hashes.json` presence (per design D2a):** if absent and `--adopt-existing` was NOT passed, exit non-zero with the bootstrap instruction; if absent and `--adopt-existing` WAS passed, compute SHA-256 of every present kernel-/stack-tier file, write `.kernel-sync-hashes.json` and `.kernel-version`, exit 0 without touching anything else. If `.kernel-sync-hashes.json` IS present, read the app's `.kernel-version` (treat absent as "0.0.0"); compare; if app's version ≥ kernel's, print `up to date at <version>` and exit 0.
- [x] 4.3 Compute the **copy plan** using `lib/manifest.sh`: kernel-tier paths (expanded) minus the expanded `excludeFromGenerate` set; preset-tier paths (flattened by stripping `presets/<preset>/`); kernel-tier + preset-tier specs (verbatim paths); preset's `appTemplates` (target ← source); explicitly EXCLUDE the preset's `instrumentStubs` (per design D3). Apply the documented overlap set (preset wins) — share the literal array with `new-app.sh` by reading it from a small helper in `lib/manifest.sh` to avoid drift.
- [x] 4.4 For each entry in the copy plan, compute the consuming-app file's current SHA-256 (if it exists) and compare to the recorded hash in `.kernel-sync-hashes.json` (if present). Categorize into: (a) new file (absent in app), (b) clean (hash matches), (c) conflict (hash differs). Collect every conflict path.
- [x] 4.5 If `--dry-run`: emit a summary report (upgrade path, count by category, every conflict path), exit 0. If not dry-run and conflicts exist and `--accept-kernel` was NOT passed: report every conflict path with the action hint, exit non-zero, write nothing.
- [x] 4.6 Write phase: copy each new + clean file from the kernel repo (or — for `appTemplates` — from the preset's template source) to the consuming app's target path, creating parent directories as needed; if `--accept-kernel`, also overwrite conflicting files with the kernel's version (emit a per-file warning). Skip every `instrumentStubs` target path entirely.
- [x] 4.7 Post-write: rewrite `.kernel-sync-hashes.json` with the post-sync SHA-256 of every synced file plus `"syncedAt": "<kernel-version>"`; write `.kernel-version` to the kernel's current version. Both files are written via `node -e` JSON / plain `printf` (mirroring `new-app.sh`'s patterns).
- [x] 4.8 Report kernel-deleted paths (paths present in the app's `.kernel-sync-hashes.json` but not in the current manifest) as informational "no longer tracked by kernel; left in place"; do NOT delete them.
- [x] 4.9 `shfmt -w` + `shellcheck`-clean. `bash` shebang per the kernel's script convention.

## 5. Amend `scripts/new-app.sh` to write the sync-state files

- [x] 5.1 After the copy/template/stub phase but before `git init`, compute SHA-256 for every kernel-tier and stack-tier file just emitted (the same set sync-kernel would track) and write `.kernel-sync-hashes.json` with `"syncedAt": "<kernel-version>"` and the hash map. Write `.kernel-version` containing the kernel version. Both files are included in the initial git commit (already-staged via `git add -A`).
- [x] 5.2a Update `generate-assert.sh` to assert `.kernel-version` exists at the emitted tree's root and equals the kernel's current version, and `.kernel-sync-hashes.json` exists with `"syncedAt"` matching plus an entry for every kernel-tier + stack-tier path emitted (the freshly-generated state-files check).
- [x] 5.2b Extend `generate-assert.sh` with the **positive round-trip:** `sync-kernel.sh --kernel-repo <kernel-repo> --app-repo <emitted-app> --dry-run` reports "up to date" (the round-trip sanity check from design D9).
- [x] 5.2c Extend `generate-assert.sh` with the **negative case:** copy the kernel repo to a sibling tempdir (the copy must contain `kernel-manifest.json`, `.release-please-manifest.json`, every `kernel.paths` source file, and the full preset directory — sync reads all of them; **register this second tempdir in the existing EXIT trap so it is cleaned up alongside the primary tempdir on success and failure**), bump that copy's `.release-please-manifest.json` version, modify one synced file in the emitted app (e.g. append a comment to `STACK.md`), run `sync-kernel.sh --kernel-repo <bumped-kernel> --app-repo <emitted-app>` without `--accept-kernel`, assert non-zero exit with the modified path in the conflict list output.
- [x] 5.2d Extend `generate-assert.sh` with the **`--accept-kernel` positive case:** re-run the same sync with `--accept-kernel`, assert zero exit, assert the modified file's content now matches the bumped-kernel's version, and assert `.kernel-sync-hashes.json` records the new hash + `"syncedAt"` advanced to the bumped kernel version.

## 6. `scripts/setup.sh`

- [x] 6.1 CLI: `--check` (verify mode) vs no flag (default mode). Layout detection: **mirror `scripts/check-identity-leak.sh`'s pattern exactly** (`find presets -mindepth 1 -maxdepth 1 -type d | sort` populates a PRESETS array; empty → app layout) so the kernel maintains a single layout-detection idiom rather than two near-duplicates.
- [x] 6.2 Default mode: `npm ci` at root; in kernel layout, also `npm ci` inside each `presets/*/` containing its own `package.json`; for any relevant `package.json` that declares a `prebuild` script, run `npm run prebuild` (this triggers the FAUST compilation via `@grame/faustwasm` per STACK.md — **no PATH check on `faust`**, no separate system FAUST install required); invoke `scripts/install-hooks.sh`. Each step is idempotent or fast-skips on no-op.
- [x] 6.3 `--check` mode: iterate the prereq table — `node` against `.nvmrc`; `npm` (any); `shfmt` against the pinned `v3.8.0` (read from a constant in the script, with a small consistency test that the value matches what `STACK.md` documents); `shellcheck` (any); `jq` (any); `gh` (any); `openspec` (any); `roborev` (any). **`faust` is deliberately absent from the table** — STACK.md is explicit it ships via `@grame/faustwasm` npm dep, not as a system tool. For each, check presence and (where pinned) version; on miss, print `MISSING: <tool> — <install hint>` and increment a failure counter; exit non-zero if the counter is > 0. Print a single success line if all pass.
- [x] 6.4 `shfmt -w` + `shellcheck`-clean. `bash` shebang. Confirm `setup.sh` (default and `--check`) runs cleanly in the kernel checkout and in `generate-assert`'s emitted app.

## 7. CI workflow updates

- [x] 7.1 Extend the `generate-assert` job in `.github/workflows/ci.yml`: after the emitted-app phase, run the three sync round-trip steps from tasks 5.2b/c/d (positive dry-run, negative conflict, `--accept-kernel` resolution). **Do NOT add a `setup-check` job** — per design D7, `setup.sh --check` is for humans + downstream consumers; the kernel's own CI continues to provision prereqs explicitly with the existing install steps.

## 8. STACK.md update

- [x] 8.1 Add `jq` to the prerequisite list. Document `sync-kernel.sh` usage (CLI flags, the typical `--dry-run` then real sync convention, clobber-protection semantics, `--accept-kernel` warning). Document `setup.sh` (default vs `--check`, the prereq table). Confirm the `shfmt v3.8.0` pin is mirrored in `setup.sh --check`'s prereq table.

## 9. Verification (slice completion gate)

- [x] 9.1 Run `scripts/setup.sh --check` locally; iterate until all prereqs pass with the install hints working as described.
- [x] 9.2 Run `scripts/generate-assert.sh` locally; verify the sync round-trip dry-run reports "up to date" and the negative case behaves as expected.
- [x] 9.3 Run `scripts/check-manifest.sh` and `scripts/check-identity-leak.sh` locally; both pass.
- [ ] 9.4 Push the branch; confirm CI: all four jobs (`lint-format`, `preset-leak-check`, `preset-build`, `generate-assert` — now extended with the sync round-trip steps) are green; `smoke-app` stub is still present and green.

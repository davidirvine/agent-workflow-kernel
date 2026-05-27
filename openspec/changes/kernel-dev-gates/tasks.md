## 1. Runnable formatter and hook activation

- [ ] 1.1 Add `package.json` (name, `private: true`, `version: 0.1.0`, `type: module`) with `prettier` and `prettier-plugin-toml` as devDependencies and a `postinstall` script that runs `scripts/install-hooks.sh`; verify `.gitignore` covers `node_modules/` (and keeps `package-lock.json` tracked); run `npm install` to generate `package-lock.json` and commit it.
- [ ] 1.2 Trim `.prettierrc`: remove `prettier-plugin-svelte` and the `*.svelte` override (kernel root has no Svelte). Then verify `npx prettier --check` runs against the committed `.prettierrc` with no `--no-config` workaround; reformat any drift so the repo is prettier-clean.
- [ ] 1.3 Confirm `npm install` sets `core.hooksPath=.githooks` via the `postinstall` → `install-hooks.sh` path, and that re-running is idempotent.

## 2. Shared checks script

- [ ] 2.1 Add `scripts/checks.sh`: discover files with `git ls-files` (tracked only, so `node_modules/` is never inspected); run `shellcheck` + `shfmt --diff` over `*.sh` plus the extensionless `.githooks/*`, and `prettier --check` over `*.md`/`*.json`/`*.toml`; non-zero exit on any failure; make it `shfmt -w` / `shellcheck`-clean itself.

## 3. Git hooks (`.githooks/`)

- [ ] 3.1 Add `.githooks/pre-commit`: operate on the **list of staged files** (`git diff --cached --name-only --diff-filter=d`), checking each file's working-tree version — run `shfmt`/`shellcheck` on staged `*.sh` and `prettier --check` on staged `*.md`/`*.json`/`*.toml`; guard for missing tools with an actionable message; block the commit on failure. (Scope is intentionally narrower than `checks.sh`: extensionless `.githooks/*` and partial-stage mismatches are caught by `pre-push`/CI — see design D3.)
- [ ] 3.2 Add `.githooks/pre-push`: invoke `scripts/checks.sh` over the whole repo (CI parity); block the push on failure.
- [ ] 3.3 Add `.githooks/post-commit`: a no-op stub with a comment stating commits are intentionally not auto-reviewed (explicit-gate posture).
- [ ] 3.4 Update `scripts/install-hooks.sh` to `chmod +x .githooks/*` when it wires `core.hooksPath`, so the executable bit does not rely on git preserving it.

## 4. CI workflow

- [ ] 4.1 Add a GitHub Actions workflow that, on push and pull request, checks out, sets up Node from `.nvmrc` (verify it exists — currently pins Node 22), installs `shfmt` at the pinned version `v3.8.0` (record the version where it is discoverable, e.g. a comment in the workflow / `checks.sh`), runs `npm ci`, and runs `scripts/checks.sh` as the lint/format job.
- [ ] 4.2 Add a `smoke-app` job to the same workflow whose single step echoes `smoke-app: pending until slice 5` and exits 0 (green pending stub).

## 5. Release automation

- [ ] 5.1 Add `release-please-config.json` with release type `node`, root package, managing `CHANGELOG.md`.
- [ ] 5.2 Add `.release-please-manifest.json` seeded to `0.1.0` (matching `package.json`'s version).

## 6. roborev reconciliation

- [ ] 6.1 In `.roborev.toml`, remove (or comment as inert) the `post_commit_review = "commit"` line so it no longer implies per-commit auto-review.

## 7. Verification (slice completion gate)

- [ ] 7.1 Run `scripts/checks.sh` clean repo-wide; verify `pre-commit` blocks a deliberately mis-formatted staged file and `pre-push` blocks a repo-wide violation, then revert the test edits. (The hooks are self-testing by use — they run on every commit/push; this is a one-time confirmation, not a standing test suite.)
- [ ] 7.2 Push the branch and confirm CI: the lint/format job passes and the `smoke-app` stub job is present and green.

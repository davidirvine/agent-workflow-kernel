## Why

This repo self-hosts the spec-driven workflow but has no working completion gate yet: there are no git hooks or CI, no release config, and STACK.md's documented `npx prettier --write` cannot even run (no `package.json`, and `.prettierrc` requires plugins that are not installed). Until the kernel has a real gate, every later roadmap slice's "tests pass" step is hollow — so the kernel cannot honestly enforce the discipline it exists to export. This slice is the dependency-free foundation (ROADMAP slice 1) that gives slices 2–5 something real to gate against.

## What Changes

- Add a minimal `package.json` pinning `prettier` and `prettier-plugin-toml` as devDependencies, with a thin `postinstall` that runs `scripts/install-hooks.sh`. This makes the STACK.md-documented formatter command actually runnable (closes the bootstrap gap) and auto-activates the repo's hooks on `npm install`. **Trim `.prettierrc`:** remove the inherited `prettier-plugin-svelte` plugin and its `*.svelte` override — the kernel root has no `.svelte` files (the Svelte tooling belongs to the preset's own config, added in slice 2). Ensure `.gitignore` covers `node_modules/` while keeping `package-lock.json` tracked.
- Add `.githooks/` activated via `core.hooksPath`:
  - `pre-commit` — runs `shfmt`/`shellcheck` on staged `*.sh` and `prettier --check` on staged `*.md`/`*.json`/`*.toml`; blocks the commit on failure.
  - `pre-push` — runs the same checks repo-wide (CI parity), so a push fails locally for anything CI would reject.
  - `post-commit` — a deliberate **no-op stub** that is the version-controlled statement that commits are NOT auto-reviewed. It encodes the explicit-gate review posture in the repo instead of relying on ambient roborev global state (a fresh `roborev init` would otherwise silently re-arm per-commit review).
- Reconcile `.roborev.toml`: remove (or comment as inert) the now-misleading `post_commit_review = "commit"` line, since auto-review-per-commit is intentionally off.
- Add a minimal lint/format **CI workflow** (`.github/workflows/`) that runs `shellcheck`/`shfmt --diff` and `prettier --check` on push and PR, plus a **smoke-app job present as a skip/no-op stub** so later slices can flip it on incrementally (ROADMAP gate-decomposition).
- Add **release-please** configuration (`release-please-config.json` + `.release-please-manifest.json`) so this repo's own version bumps and changelog derive from Conventional Commit PR titles, matching the release discipline in CLAUDE.md.

## Capabilities

### New Capabilities

- `dev-gates`: the committed local + CI gates that enforce formatting/lint discipline — git hooks (`pre-commit`, `pre-push`, the `post-commit` no-op stub), a runnable repo-local formatter, and a CI workflow whose lint/format checks mirror the hooks and whose smoke-app job exists as a stub.
- `release-automation`: release-please configuration that derives this repo's version bumps and changelog from Conventional Commit history, with the PR title as the load-bearing release-parse input.

### Modified Capabilities

<!-- None — openspec/specs/ is empty; this slice introduces the first capabilities. -->

## Impact

- **New files:** `package.json`, `package-lock.json` (committed, for `npm ci`), `scripts/checks.sh`, `.githooks/{pre-commit,pre-push,post-commit}`, `.github/workflows/<ci>.yml`, `release-please-config.json`, `.release-please-manifest.json`.
- **Modified files:** `.roborev.toml` (drop/comment the inert `post_commit_review`); `.prettierrc` (drop the Svelte plugin + override); `.gitignore` (ensure `node_modules/` ignored).
- **Dependencies:** introduces Node devDependencies (`prettier` + the two plugins); no runtime deps. `shellcheck`/`shfmt` remain externally-provided prereqs (verified, not installed).
- **Systems:** adds GitHub Actions CI on push/PR; activates `core.hooksPath=.githooks` for local development.
- **Tier:** these are kernel-tier specs; the `tier:` frontmatter and sync manifest are introduced in ROADMAP slice 2, which will retroactively tag them — slice 1 does not add tier frontmatter.

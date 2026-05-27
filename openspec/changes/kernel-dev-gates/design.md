## Context

This repo bootstraps the workflow kernel but has no enforcement layer yet: no git hooks, no CI, no release config, and the STACK.md-documented `npx prettier --write` cannot run because there is no `package.json` and `.prettierrc` declares `prettier-plugin-svelte` + `prettier-plugin-toml`, which are not installed (today the formatter only runs via a `--no-config` workaround). `scripts/install-hooks.sh` already exists and points `core.hooksPath` at `.githooks`, but `.githooks/` does not exist. Per the ROADMAP gate-decomposition, this slice (1) must establish the gate the kernel uses on itself **and** the harness shape (a stub smoke-app CI job) that slices 2–5 extend. The earlier auto-review git hooks installed by `roborev init` were removed on 2026-05-27; reviews are explicit-gate only, and this slice makes that posture version-controlled rather than ambient.

## Goals / Non-Goals

**Goals:**

- Make the repo's own formatter runnable: a `package.json` with `prettier` + `prettier-plugin-toml` as devDeps, so `npx prettier --write` works with the (trimmed) `.prettierrc` — no `--no-config` workaround.
- Enforce lint/format on commit (`pre-commit`) and CI-parity on push (`pre-push`) via committed `.githooks/`, activated by `core.hooksPath`.
- Encode the explicit-gate review posture in a committed `post-commit` no-op stub, independent of ambient roborev state.
- Add a minimal CI workflow whose lint/format checks mirror the hooks, plus a smoke-app job present as a skip/no-op stub.
- Establish release-please so the repo's version + changelog derive from Conventional Commit history.

**Non-Goals:**

- No `new-app.sh` / `sync-kernel.sh` / `setup.sh` (slices 3–4) and no preset (slice 2). The smoke-app job is a stub here, not a working pipeline.
- No `tier:` spec frontmatter or sync manifest (slice 2 introduces and back-tags those).
- No FAUST in CI (slice 2 owns that — slice 1 runs no build).
- No npm publishing; release-please manages version/changelog/release PRs only.

## Decisions

### D0 — Trim `.prettierrc` to what the kernel root actually uses

The inherited `.prettierrc` declares `prettier-plugin-svelte` + `prettier-plugin-toml` and a `*.svelte` override, but the kernel root contains **no `.svelte` files** — only Bash, Markdown, JSON, and TOML. So this slice removes `prettier-plugin-svelte` and the `*.svelte` override, and `package.json` carries only `prettier` + `prettier-plugin-toml`. **Why:** carrying the Svelte plugin pulls in the Svelte compiler toolchain for a plugin that never fires and falsely signals "this repo uses Svelte." **Tiering:** Svelte formatting belongs to the preset (Tier 2), which gets its own `package.json`/`.prettierrc` in slice 2; if the root `checks.sh` later needs to format the preset's `.svelte`, slice 2 owns that adjustment. **Alternative considered:** keep the plugin "for slice 2" — rejected as premature coupling; slice 1 should format only what exists.

### D1 — Native `core.hooksPath`, not husky

Hooks live in committed `.githooks/` and are activated by `git config core.hooksPath .githooks` (already implemented in `scripts/install-hooks.sh`, run from `postinstall`). **Why not husky** (which synth-d uses): husky adds a runtime dependency and a `.husky/` indirection; native `core.hooksPath` is the modern built-in mechanism, needs no extra package, and keeps the hooks as plain reviewable shell. **Consequence (documented in CLAUDE.md):** `core.hooksPath` is a single repo-level setting shared across worktrees — acceptable here because all three hooks behave correctly in any worktree (the `post-commit` stub is a no-op everywhere; `pre-commit`/`pre-push` are checkout-independent).

### D2 — `post-commit` is a deliberate no-op stub

When `core.hooksPath=.githooks` is set, git resolves **all** hooks from `.githooks/` and ignores `.git/hooks/`. The committed `.githooks/post-commit` therefore both (a) documents in-repo that commits are intentionally not auto-reviewed and (b) makes that posture the version-controlled default. A future `roborev init` writing to `.git/hooks/` is inert while `core.hooksPath` points at `.githooks`; if it instead targeted the hooks path it would show as a visible diff against the committed stub. **Alternative considered:** ship no `post-commit` at all — rejected, because the absence of a hook is not self-documenting and invites a future re-arm to pass unnoticed. The stub is the executable statement of the explicit-gate decision.

### D3 — One checks script, invoked by both `pre-push` and CI (parity is literal)

The repo-wide lint/format checks live in a single `scripts/checks.sh`. **File discovery uses `git ls-files`** (tracked files only) so vendored trees like `node_modules/` are never inspected, and the shell set explicitly includes the extensionless hook scripts: `shellcheck` + `shfmt --diff` over `git ls-files '*.sh' .githooks/*`; `prettier --check` over `git ls-files '*.md' '*.json' '*.toml'`. `pre-push` runs `scripts/checks.sh`; CI runs the **same** script. "Pre-push CI parity" is then literal identity, not two hand-synced copies that drift. `pre-commit` runs the faster subset over the **list of staged files** (`git diff --cached --name-only --diff-filter=d`), checking each file's working-tree version — the pragmatic approach most pre-commit hooks take. It deliberately does **not** extract the staged blob (`git show :0:<file>`): the rare partial-stage mismatch (a file staged clean, then edited dirty) is caught by the full-repo `pre-push`/CI gate, so the extra machinery buys little. Two `pre-commit` scope narrowings are intentional, both resting on that same pre-push safety net: (1) it filters staged `*.sh` but not the extensionless `.githooks/*` scripts that `checks.sh` covers, so a hook edited to a shellcheck error is caught at push rather than commit; (2) it reads the working-tree version per above. **Alternative considered:** duplicate the command list in the workflow YAML and in the hook — rejected (guaranteed drift, the exact hazard "parity" is meant to prevent).

### D4 — Smoke-app CI job exists now as an explicit, green no-op

The CI workflow defines a `smoke-app` job from day one whose body is a single step that echoes `smoke-app: pending until slice 5` and exits 0. It is green (not failing, not skipped-invisible) so the job slot is present in every CI run and slices 3–5 fill in stages by editing this one job. **Why a visible green stub over omitting the job:** the ROADMAP gate-decomposition requires the harness shape to exist early so "tests pass" means something incrementally; a present-but-stubbed job makes the pending work legible in the CI UI. **Alternative considered:** `if: false` / skipped job — rejected, a skipped job is easy to forget and reads as "disabled" rather than "pending".

### D5 — release-please `node` release type, root package, seeded manifest

release-please is configured with release type `node` (the repo now has a `package.json`), managing `CHANGELOG.md` and the `package.json` version from Conventional Commit history; `.release-please-manifest.json` seeds the starting version at `0.1.0` (the bootstrap baseline). The release-parse input is the **PR title** (squash-merge), consistent with CLAUDE.md. **Why `node` over `simple`:** a `package.json` exists and is the natural version home, and `node` gives changelog + release-PR automation with no extra config. **Forward note (not decided here):** slice 4's `sync-kernel.sh` needs a "kernel-version stamp"; that stamp will most likely be this same release-please-managed version, but unifying them is a slice-4 decision and out of scope now.

### D6 — External tool prerequisites: provisioned in CI, verified (not installed) locally

`shellcheck` is preinstalled on GitHub `ubuntu-latest` runners; `shfmt` is not, so CI adds an explicit `shfmt` install step at a **pinned version — `v3.8.0`** (different `shfmt` versions can format differently, which would cause local/CI divergence; pinning a named version keeps it deterministic, and task 4.1 records it in a discoverable place). `prettier` + plugin come from `npm ci` (devDeps), which requires the committed `package-lock.json`. Locally these are human prerequisites — slice 4's `setup.sh --check` will verify them (including matching the pinned `shfmt` version); slice 1 documents them and the hooks emit an actionable message if a tool is missing rather than failing opaquely. CI reads the Node version from the existing `.nvmrc`, which pins **Node 22** — the committed CI baseline; changing `.nvmrc` changes CI.

## Risks / Trade-offs

- **Hooks fire before `npm install`, so `prettier` is absent and `pre-commit` fails confusingly** → `postinstall` runs `install-hooks.sh` so hooks activate exactly when deps land; additionally each hook checks for its tools and prints "run `npm install`" / "install shfmt" guidance and a non-zero exit rather than a stack trace.
- **CI/hook drift** → eliminated by D3's single `scripts/checks.sh` invoked by both; a divergence would require editing the shared script, which both consumers pick up.
- **`shfmt` unavailable in CI** → explicit install step in the workflow; pinned version to keep formatting deterministic.
- **release-please first run mis-seeds the version or opens a surprising release PR** → `.release-please-manifest.json` is seeded explicitly to `0.1.0`; the first release PR is reviewed by the human like any other before merge.
- **`core.hooksPath` shared across worktrees** (CLAUDE.md-noted) → acceptable per D1; all three hooks are worktree-safe.
- **Scope creep toward slices 2–5** → the smoke-app job is a hard stub (D4) and no preset/build/script work is in this slice; reviewers should reject any build or generator logic here.
- **`node_modules/` staged or linted** → `.gitignore` must cover `node_modules/` (added/verified in task 1.1) before the first `git add`; `checks.sh` discovers files via `git ls-files`, so even an accidental working-tree `node_modules/` is never inspected.
- **Hook executable bit not preserved across clones/platforms** → `install-hooks.sh` `chmod +x`es the hooks when it wires `core.hooksPath`, so the bit does not depend on git preserving it.
- **Hooks are POSIX shell; Windows-native (non-WSL) contributors** → accepted limitation for this repo; the hooks target POSIX shells (macOS/Linux/WSL). Noted, not mitigated.
- **The slice's gate is the hooks themselves; no dedicated test suite** → accepted: the hooks are self-testing by use (they run on every commit/push), which is appropriate for slice 1; task 7.1 is a one-time manual confirmation of that behavior.
- **`pre-commit` fires on merge/rebase commits** → intentional: a merge or rebase that introduces files committed before the hooks existed (or by a contributor who bypassed them) is blocked until formatted, enforcing the gate retroactively. Noted so it does not surprise a developer mid-rebase.
- **Local/CI `shfmt` version divergence window** → until slice 4's `setup.sh --check` verifies the local `shfmt` matches the pinned `v3.8.0`, a developer running a different local version could see "passes locally, fails in CI" — the exact divergence the pin guards against in CI. Accepted as a known slice-1 gap, closed by slice 4.

## Migration Plan

Additive only; rollback is reverting the branch. Sequence (one commit per task, per CLAUDE.md): add `package.json` + trim `.prettierrc` + ensure `.gitignore` covers `node_modules/` + commit `package-lock.json`, wiring `postinstall` to `install-hooks.sh` → add `scripts/checks.sh` → add `.githooks/{pre-commit,pre-push,post-commit}` → add the CI workflow (lint/format + smoke-app stub) → add release-please config + seeded manifest → reconcile `.roborev.toml`. After this slice, `npx prettier --write` works without `--no-config`.

## Open Questions

- The `0.1.0` version seed is the **working assumption carried into tasks 1.1/5.2** (bootstrap baseline), pending human confirmation; the only open variant is `0.0.0`.
- Whether slice 4's kernel-version stamp reuses this release-please version (likely) — deferred to slice 4 by design.

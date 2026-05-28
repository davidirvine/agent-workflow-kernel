# Project-Specific Stack Rules

> These are the stack-specific rules for **agent-workflow-kernel** — the reusable workflow kernel itself. Unlike a generated app, this repo's "stack" is Bash scripts plus the OpenSpec/roborev tooling and Markdown specs; Node is used only by the smoke-app gate. This file is imported into `CLAUDE.md` via `@./STACK.md`. An app generated from this kernel replaces this file with its own stack rules.

## What this repo is

The canonical home of the stack-agnostic workflow kernel (the OpenSpec spec-driven workflow, the roborev review gates, the worktree lifecycle scripts, the conventional-commits/release discipline) plus reusable **presets**. It is **not** a generated app. Its deliverables — built via spec-driven changes — are:

- `new-app.sh` — generator that emits a fresh app from the kernel + a chosen preset
- `sync-kernel.sh` — re-pulls kernel files into an existing app (clobber-protected, version-stamped)
- `setup.sh` — idempotent per-checkout setup with a `--check` mode
- `presets/svelte-faust-synth/` — the instrument-agnostic chassis extracted from synth-d
- the smoke-app CI, the kernel's own `.githooks`, and `release-please` config

The full Phase-2 design lives in synth-d's archived change: `openspec/changes/archive/2026-05-26-refactor-synth-d-chassis/design.md` (the "Phase 2" section). synth-d becomes the first consumer of this kernel.

## Linting and Formatting

After EVERY file edit, run the appropriate tool BEFORE moving to the next task. Do not proceed if it fails.

| File type | Command                                    |
| --------- | ------------------------------------------ |
| `*.md`    | `npx prettier --write <file>`              |
| `*.json`  | `npx prettier --write <file>`              |
| `*.toml`  | `npx prettier --write <file>`              |
| `*.sh`    | `shfmt -w <file>` then `shellcheck <file>` |

## Local dev prerequisites

The kernel root and the preset together require these tools to be on `$PATH`
locally; CI provisions them in the same versions:

- `bash` ≥ 4 (for newer scripts; macOS bash 3.2 is also supported by the
  scripts here).
- `shellcheck` and `shfmt v3.8.0` — used by the pre-commit hook and the
  shared `scripts/checks.sh`.
- `jq` — used by `scripts/check-manifest.sh`.
- Node + npm via `.nvmrc` — used by the root prettier gate and by every
  preset's own build. **FAUST is NOT a separate prerequisite:** per design
  D10, FAUST ships as the `@grame/faustwasm` npm dep, installed via
  `npm ci` inside the preset.

## Kernel dependency posture (D7)

The kernel root does NOT install preset dependencies. Each preset is
self-contained — its own `package.json`, `package-lock.json`, and
`node_modules/` — and CI runs `npm ci` _inside the preset directory_, so
preset deps land in the preset's `node_modules`, never at the kernel root.
The kernel root's `package.json` stays minimal: prettier + plugins for
formatting the kernel's own files. If a future preset needs a system-level
prereq the kernel does not already provide (e.g. a Rust toolchain), that
provisioning goes in the preset's own job as a conditional step — never
hoisted to the kernel root.

## Completion-gate test commands

The implementation-completion gate in `CLAUDE.md` requires all applicable
tests to pass. Slice 2 established the following gates, which compose with
slice 1's `lint-format`:

- `shellcheck scripts/*.sh` (and any new top-level scripts) — clean.
- `preset-build` (CI): `npm ci && npm run build` inside
  `presets/svelte-faust-synth/`, plus the preset's own prettier check, the
  traveling chassis-purity test, and the power-off-silence vitest. Run
  locally via `cd presets/svelte-faust-synth && npm ci && npm run build`.
- `preset-leak-check` (CI): `scripts/check-manifest.sh` and
  `scripts/check-identity-leak.sh`. Both runnable locally with the same
  command.
- The one-time extraction audit (`scripts/run-extraction-audit.sh`) ran
  during this slice's implementation; its evidence is preserved in
  `openspec/changes/import-chassis-preset/audit/`. Future slices do not
  re-run it; the traveling chassis-purity test is the standing guard.
- The `smoke-app` gate — `new-app.sh` → `setup.sh --check` → build, in CI —
  remains a pending no-op stub. Slice 5 turns it on.

## Feature-level verification

These compose with the human-approval gate in `CLAUDE.md`'s Pull Requests
section:

- `shellcheck`/`shfmt` clean on all scripts.
- `preset-build` green locally and in CI.
- `preset-leak-check` green locally and in CI (both scripts exit 0).
- pre-push hooks run the same checks as the kernel CI's `lint-format` job.

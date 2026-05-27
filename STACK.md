# Project-Specific Stack Rules

> These are the stack-specific rules for **agent-workflow-kernel** — the reusable workflow kernel itself. Unlike a synth, this repo's "stack" is Bash scripts plus the OpenSpec/roborev tooling and Markdown specs; Node is used only by the smoke-synth gate. This file is imported into `CLAUDE.md` via `@./STACK.md`. A synth generated from this kernel replaces this file with its own stack rules.

## What this repo is

The canonical home of the stack-agnostic workflow kernel (the OpenSpec spec-driven workflow, the roborev review gates, the worktree lifecycle scripts, the conventional-commits/release discipline) plus reusable synth **presets**. It is **not** a synth. Its deliverables — built via spec-driven changes — are:

- `new-synth.sh` — generator that emits a fresh synth from the kernel + a chosen preset
- `sync-kernel.sh` — re-pulls kernel files into an existing synth (clobber-protected, version-stamped)
- `setup.sh` — idempotent per-checkout setup with a `--check` mode
- `presets/svelte-faust-synth/` — the instrument-agnostic chassis extracted from synth-d
- the smoke-synth CI, the kernel's own `.githooks`, and `release-please` config

The full Phase-2 design lives in synth-d's archived change: `openspec/changes/archive/2026-05-26-refactor-synth-d-chassis/design.md` (the "Phase 2" section). synth-d becomes the first consumer of this kernel.

## Linting and Formatting

After EVERY file edit, run the appropriate tool BEFORE moving to the next task. Do not proceed if it fails.

| File type    | Command                                  |
| ------------ | ---------------------------------------- |
| `*.md`       | `npx prettier --write <file>`            |
| `*.json`     | `npx prettier --write <file>`            |
| `*.toml`     | `npx prettier --write <file>`            |
| `*.sh`       | `shfmt -w <file>` then `shellcheck <file>` |

## Completion-gate test commands

The implementation-completion gate in `CLAUDE.md` requires all applicable tests to pass. The kernel's gate is the **smoke-synth** check — proof that the generator produces a working synth:

- `shellcheck scripts/*.sh` (and any new top-level scripts) — clean
- the smoke-synth gate: `new-synth.sh` → `setup.sh --check` → build, in CI

> **Bootstrap note:** these gates do not exist yet. They are established by the first spec-driven change(s) in this repo. Until then, the only gate is `shellcheck` on the scripts that exist and a clean `prettier` pass.

## Feature-level verification

These compose with the human-approval gate in `CLAUDE.md`'s Pull Requests section:

- `shellcheck`/`shfmt` clean on all scripts
- the smoke-synth gate passes (once built)
- pre-push hooks run the same checks as the kernel CI (once the hooks/CI are built by the first change)

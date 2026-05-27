# agent-workflow-kernel

The reusable, stack-agnostic **workflow kernel** extracted from the synth-d project — the canonical home of the OpenSpec spec-driven workflow, the roborev review gates, the worktree lifecycle, and the conventional-commits / release discipline — plus reusable synth **presets** (the instrument-agnostic chassis).

This repo lets new synths be generated with the established workflow and chassis already in place, and lets kernel improvements propagate to existing synths.

## Status: bootstrap

This repo currently contains only the tooling needed to **self-host the OpenSpec spec-driven workflow** (so its own development follows the same discipline it provides). The actual deliverables are built via spec-driven changes:

- `new-synth.sh` — generator: emit a fresh synth from the kernel + a chosen `--preset`
- `sync-kernel.sh` — re-pull kernel files into an existing synth (clobber-protected, kernel-version-stamped)
- `setup.sh` — idempotent per-checkout setup with a `--check` mode CI reuses
- `presets/svelte-faust-synth/` — the chassis (Shell, `param-schema.js`, tokenized components + `theme.css`) extracted from synth-d
- smoke-synth CI, the kernel's `.githooks`, and `release-please` config

## Design

This repo is **Phase 2** of a two-phase effort. The full design is captured in synth-d's archived Phase-1 change:
`synth-d → openspec/changes/archive/2026-05-26-refactor-synth-d-chassis/design.md` (the "Phase 2" section). synth-d becomes the **first consumer** of this kernel.

## Workflow

Development follows `CLAUDE.md` (the kernel workflow) + `STACK.md` (this repo's stack: Bash + OpenSpec tooling). Spec-driven, worktree-isolated, roborev-gated — the same rules this kernel exports.

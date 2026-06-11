## Why

Generated apps already carry release-please _config_ (`release-please-config.json` + `.release-please-manifest.json` travel via `kernel.paths`) but no GitHub Actions workflow that _runs_ release-please. The result is config-without-a-runner: a freshly generated app's Conventional Commit history never produces a release PR, a version bump, or a `CHANGELOG.md` entry, even though all the CLAUDE.md commit/PR-title discipline is built to feed exactly that automation. Shipping the missing runner as a preset template closes the gap so every generated app gets working release automation out of the box.

## What Changes

- Add a new app-tier workflow template `presets/svelte-faust-synth/templates/release-please.yml` that runs `googleapis/release-please-action@v4` on push to `main`, driving release-PR/changelog/tag automation off the release-please config that already travels into the app.
- Wire it into the preset's `appTemplates` in `kernel-manifest.json` as a second entry: `.github/workflows/release-please.yml` → `templates/release-please.yml` (alongside the existing `ci.yml` → `app-ci.yml`).
- No generator, sync, or gate script changes: `new-app.sh`, `sync-kernel.sh`, `generate-assert.sh`, and `check-manifest.sh` are already data-driven over `appTemplates`, so the new entry is written at generation, re-applied on sync (with clobber protection), and asserted by the existing gates automatically.
- Scope is **generated apps only**. The kernel's own `.github/workflows/` is `excludeFromGenerate` and the kernel's own release automation is explicitly out of scope for this change.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `preset-portability`: a preset's required app-tier template set grows — in addition to the existing app-tier CI workflow template, a preset SHALL ship a release-automation workflow template declared in `appTemplates`, so a generated app receives a working release-please runner (not just release-please config).

## Impact

- New file: `presets/svelte-faust-synth/templates/release-please.yml`.
- Edited file: `kernel-manifest.json` (one added `appTemplates` entry under `presets/svelte-faust-synth`).
- Behavior: every app generated from `svelte-faust-synth` gains `.github/workflows/release-please.yml`; existing consuming apps gain it on their next `sync-kernel.sh` (appTemplates are re-applied on sync, subject to clobber protection).
- No script changes; the existing `generate-assert` and `preset-leak-check`/`check-manifest` gates cover the new entry. Depends on GitHub's `GITHUB_TOKEN` and `googleapis/release-please-action@v4` (a third-party action) at run time in the generated app's CI.

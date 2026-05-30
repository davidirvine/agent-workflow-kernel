## Why

Slice 2 landed the chassis preset with a self-contained buildable reference app, slice 1 the dev gates — but the kernel still cannot **emit** a fresh app. Without that, the smoke-app gate (slice 5) is a stub forever, slice 4 has nothing to sync into, and consumers cannot start from this kernel. This slice (ROADMAP slice 3) ships `scripts/new-app.sh`: feed it a kernel + a preset + an app name, get a clean working app directory with the chassis in place, the reference instrument blanked, donor identity gone, version reset to `0.1.0`, an empty `openspec/changes/`, and `git init` run. Plus the committed `generate-assert` script that proves the emitted tree is correct.

## What Changes

- Add **`scripts/new-app.sh`** — the generator. CLI: `--name <app-name>` (required, kebab-case), `--output <path>` (required), `--preset <name>` (optional, defaults to `svelte-faust-synth`), `--title <title>` (optional, defaults to title-cased name), `--repo-url <url>` (optional, defaults to placeholder). Reads `kernel-manifest.json` as the source of truth for what travels; preset+chassis stack files emit to the new app's root (flattened — the new app is _not_ a `presets/<name>/` substructure); kernel-tier files come from the kernel root; the two **instrument-tier stubs** (`src/param-schema.js`, `src/components/InstrumentPanels.svelte`) are written from committed stub files that ship with the preset.
- Add **stub instrument files** under `presets/svelte-faust-synth/stubs/` — minimal valid blanks (`param-schema.js` with an empty `PARAM_SCHEMA` and the universal-engine exports the chassis needs; `InstrumentPanels.svelte` a placeholder component) that `new-app.sh` writes into the generated app at the instrument paths. The preset's own reference oscillator stays untouched — these stubs are extra files for generation, not replacements for the reference instrument.
- **Extend `kernel-manifest.json`** in three ways: (a) per-preset `"instrumentStubs"` (target path → committed stub path) for the files the generator must blank; (b) per-preset `"appTemplates"` (target path → committed template path) for files that cannot travel verbatim because the kernel's version references kernel-only paths (today: `.github/workflows/ci.yml` — the kernel's CI runs kernel-only jobs); (c) top-level `"kernel.excludeFromGenerate"` listing paths in `kernel.paths` that exist for the kernel's own use but must not travel (today: the kernel CI workflow + kernel-only scripts like `new-app.sh`, `generate-assert.sh`, `check-manifest.sh`, `run-extraction-audit.sh`). Add `openspec/config.yaml` to `kernel.paths` (it was missing). All three new fields are validated by `scripts/check-manifest.sh`.
- **Substitute donor identity in the emitted app:**
  - The `'__APP_NAMESPACE__'` string literal in `Shell.svelte` → `<app-name>` (the app's localStorage namespace).
  - The Vite-injected `__APP_TITLE__` / `__APP_REPO_URL__` defaults in the generated `vite.config.js` → the values from `--title` / `--repo-url`.
  - `package.json`'s `name` → `<app-name>`, `version` → `0.1.0`, `description` → a generic-but-meaningful one (not the preset's reference-instrument description).
  - `.release-please-manifest.json` → `{".": "0.1.0"}`.
- **Reset OpenSpec state for a fresh app:** copy `openspec/config.yaml` verbatim, copy kernel-tier + stack-tier specs from the manifest, emit an empty `openspec/changes/` (with `.gitkeep`); `openspec/changes/archive/` does NOT travel (it is the donor's history).
- **Final step `git init`** + a single initial commit `chore: scaffold <app-name> from agent-workflow-kernel + <preset>` so the new app starts as a clean repo.
- Add **`scripts/generate-assert.sh`** — the slice's gate (per ROADMAP, a committed script not workflow YAML, because the kernel will ship this test to consumers). Runs `new-app.sh` into a tempdir, then asserts: every expected file is present at the expected path; `package.json` name + version + description are correctly reset; `Shell.svelte`'s `__APP_NAMESPACE__` is substituted to the app name; no `synth-d`/donor identity literal survives anywhere; `openspec/changes/` contains only `.gitkeep`; `openspec/changes/archive/` is absent; the new app's _own_ `scripts/check-identity-leak.sh` passes against the generated tree.
- **CI gains a `generate-assert` job** that runs `scripts/generate-assert.sh`. The `smoke-app` stub from slice 1 stays — slice 5 still owns the full pipeline.

## Capabilities

### New Capabilities

- `app-generation`: the contract `new-app.sh` honors — given a kernel + preset + app name, the emitted tree is a self-contained, buildable, identity-clean fresh app with the chassis in place, the instrument blanked, version reset, an empty `openspec/changes/`, and `git init` run.

### Modified Capabilities

- `preset-portability`: add a requirement that each preset declares its **instrument-tier stub mapping** in `kernel-manifest.json` (target path → committed stub path) so the generator can blank the right files stack-agnostically. This makes the chassis-vs-instrument boundary machine-readable for the generator, not just for the `chassis-purity.test.js` `INSTRUMENT_FILES` set.

## Impact

- **New script files:** `scripts/new-app.sh`, `scripts/generate-assert.sh`.
- **Modified files:** `kernel-manifest.json` (extend stack-preset entry with `instrumentStubs` + `appTemplates`; add top-level `excludeFromGenerate`; add `openspec/config.yaml` to `kernel.paths`), `scripts/check-identity-leak.sh` (refactor to auto-detect kernel-vs-generated-app layout — slice-2 file refactor required by slice-3 generate-assert), `scripts/check-manifest.sh` (validate the new manifest fields), `.github/workflows/ci.yml` (add `generate-assert` job), `openspec/specs/preset-portability/spec.md` (add the new requirements; the delta lives in this change and syncs to main per slice-2 D9 during implementation), `STACK.md` (add `generate-assert` to the completion gate; document `new-app.sh` usage).
- **New stub/template files:** `presets/svelte-faust-synth/stubs/{param-schema.js,InstrumentPanels.svelte,stubs.test.js}`, `presets/svelte-faust-synth/templates/app-ci.yml`.
- **No changes to** `presets/svelte-faust-synth/src/**` (the reference instrument is untouched; the generator's blanking is driven by stub files in `stubs/`, not by modifying the preset).
- **Out of scope here:** `sync-kernel.sh` and `setup.sh` (slice 4), wiring the smoke-app job to a full pipeline (slice 5), supporting additional presets (only `svelte-faust-synth` exists).

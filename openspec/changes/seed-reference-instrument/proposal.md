## Why

Today `new-app.sh` overwrites the instrument-tier files of every generated app with **blank stubs** (a silent `synth.dsp`, an empty `param-schema.js`, a placeholder panel), so a fresh app makes no sound and shows no controls until the developer writes an instrument from scratch. The preset already ships a small, playable **reference instrument** — a key-triggered A/R sine synth — as a worked example, but it never reaches a generated app. We want a fresh app to start from that working example instead of a blank canvas, giving developers an audible, editable instrument on first build and removing a redundant second copy of the instrument files (the blank stubs) that has to be kept in lock-step with the reference.

## What Changes

- Repoint the svelte-faust-synth preset's `instrumentStubs` sources in `kernel-manifest.json` from the blank `stubs/*` files to the **live reference instrument files** (source path equals target path): `faust/synth.dsp`, `src/param-schema.js`, and `src/components/InstrumentPanels.svelte`. The `instrumentStubs` mechanism is retained unchanged — only its sources move — so the instrument is still written **once at generation** and is **never re-applied on sync** (it remains app-owned content after generation).
- Delete the now-redundant blank stub files and their drift-guard test: `presets/svelte-faust-synth/stubs/synth.dsp`, `stubs/param-schema.js`, `stubs/InstrumentPanels.svelte`, and `stubs/stubs.test.js`. With one copy (the reference) seeding generation, the blank copies and the test that guarded them against drift no longer have a purpose.
- Drop the now-dead `stubs/**/*.test.js` entry (and its explanatory comment) from the preset's Vitest `include` glob in `vite.config.js`.
- Strengthen `scripts/generate-assert.sh` to assert the emitted instrument is the **reference** (non-blank) — structurally: the emitted `src/param-schema.js` has a non-empty `PARAM_SCHEMA` with at least one knob — so the new "seeded, not blanked" behavior is gated in CI rather than only documented.
- Own (not merely incidentally fix) a latent incoherence: `src/state/synth.test.js` travels into generated apps via `paths` and asserts the reference defaults (`attack`/`release`), which the old blank seed would fail. The completion gate explicitly verifies this traveling test now passes against the seeded reference (see tasks).
- Update the kernel docs that describe the old behavior: `STACK.md` ("the instrument starts as a silent stub DSP…"), the header comments in the reference `faust/synth.dsp` / `src/param-schema.js` / `src/components/InstrumentPanels.svelte` (which currently say `new-app.sh` blanks them), and any matching `new-app.sh` help/usage text.
- Update the affected spec requirements (see Capabilities) so the contract reads "seeded with the reference instrument," not "blanked from stubs."

This is **not BREAKING** for existing consuming apps: `instrumentStubs` is never re-applied on sync, so a downstream app that has already replaced its instrument is untouched. The change only affects what a **newly generated** app starts with.

## Capabilities

### New Capabilities

<!-- none — this change modifies existing generation/preset behavior, it introduces no new capability -->

### Modified Capabilities

- `app-generation`: The generated app is **seeded with the preset's reference instrument** at the `instrumentStubs` target paths, rather than blanked from silent/empty stubs. The structural assertion that each `instrumentStubs` target exists with its source's content is unchanged in form; the source is now the reference instrument.
- `preset-portability`: The preset's `instrumentStubs` mapping points its instrument-tier targets at the **reference instrument files themselves** (source path equals target path) rather than at separate blank stub files; the requirement that the reference instrument be small/complete updates from "`new-app.sh` can blank it" to "`new-app.sh` seeds a generated app with it." The manifest-validation rules (every source exists, no target also in `paths`) and the sync rule (`instrumentStubs` never re-applied) are unchanged.

## Impact

- **Manifest**: `kernel-manifest.json` — three `instrumentStubs` source values for `presets/svelte-faust-synth`.
- **Deleted files**: `presets/svelte-faust-synth/stubs/synth.dsp`, `stubs/param-schema.js`, `stubs/InstrumentPanels.svelte`, `stubs/stubs.test.js` (the `stubs/` directory becomes empty and is removed).
- **Preset config**: `presets/svelte-faust-synth/vite.config.js` — Vitest `include` glob.
- **Scripts**: `scripts/generate-assert.sh` — added reference-seed assertion. No change to `new-app.sh`, `sync-kernel.sh`, `check-manifest.sh`, or `scripts/lib/manifest.sh` (the `instrumentStubs` mechanism and its validation are untouched; `source == target` already satisfies every existing rule).
- **Specs**: `openspec/specs/app-generation/spec.md`, `openspec/specs/preset-portability/spec.md`.
- **Docs**: `STACK.md`; header comments in the reference `faust/synth.dsp`, `src/param-schema.js`, `src/components/InstrumentPanels.svelte`.
- **Gates touched**: `generate-assert` (strengthened), `preset-build` (Vitest no longer collects the deleted `stubs/` test), `check-manifest` (sources still resolve). No behavior change to the `smoke-app` or `preset-leak-check` gates.
- **Downstream consumers**: none on sync (instrument is never re-synced); only newly generated apps change.

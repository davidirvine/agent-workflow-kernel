## Context

The kernel ships a reusable chassis plus a per-preset **instrument**. The svelte-faust-synth preset carries a small, playable **reference instrument** — a key-triggered A/R sine synth (`faust/synth.dsp`, `src/param-schema.js`, `src/components/InstrumentPanels.svelte`) — as a worked example.

Instrument-tier files travel into a generated app through one manifest category: `instrumentStubs` (target path → source file). That category is special in two ways that matter here:

1. `new-app.sh` writes `instrumentStubs` sources **once, at generation** (after copying preset `paths`, so a stub target may not also be a `paths` entry — `check-manifest.sh` Check 4 enforces this, which is exactly why the reference files are absent from `paths`).
2. `sync-kernel.sh` **never re-applies** `instrumentStubs` (the instrument is app-owned after generation; `scripts/lib/manifest.sh` keeps these out of the copy plan, so they are also absent from `.kernel-sync-hashes.json`).

Today the three `instrumentStubs` sources point at separate **blank** files under `presets/svelte-faust-synth/stubs/` (silent DSP, empty schema, placeholder panel), guarded by `stubs/stubs.test.js` (a drift guard asserting the blank schema's export surface matches the reference). So a generated app starts silent and control-less, and the instrument exists in the preset in **two** copies — the reference and the blank stub — that must be kept in step.

We want a generated app to start from the reference instrument instead of a blank, and to stop maintaining the second (blank) copy. The user explicitly chose "seed from the reference" over duplicating the A/R sine into the stub files or adding a `--instrument` flag.

## Goals / Non-Goals

**Goals:**

- A freshly generated app starts with the reference A/R sine instrument: audible on first build, with its controls rendered.
- One copy of the instrument in the preset (the reference). No separate blank stub to keep in sync.
- The "written once at generation, never re-synced, app-owned thereafter" semantics are preserved exactly — existing consuming apps are unaffected on sync.
- The new behavior is gated in CI, not just documented.

**Non-Goals:**

- Renaming the `instrumentStubs` manifest field (see Decisions — kept as-is deliberately).
- Adding a generation-time choice between a blank and a seeded instrument (the rejected `--instrument` flag).
- Changing the reference instrument itself, the chassis, or the sync/clobber machinery.
- Letting the instrument files travel via plain `paths` (rejected — that would make every kernel sync attempt to clobber a consumer's instrument).

## Decisions

### D1: Seed by repointing `instrumentStubs` sources at the reference files (source path == target path)

`new-app.sh` copies `"$PRESET_KEY/$source"` to `"$OUTPUT_ABS/$target"`. Setting each source equal to its target makes the generator copy the live reference file into the app:

```jsonc
"instrumentStubs": {
  "src/param-schema.js": "src/param-schema.js",
  "src/components/InstrumentPanels.svelte": "src/components/InstrumentPanels.svelte",
  "faust/synth.dsp": "faust/synth.dsp"
}
```

`check-manifest.sh` Check 4 requires only that each source exists and that no target appears in the preset's `paths`. Both hold: the reference files exist, and they remain out of `paths` (they travel solely via `instrumentStubs`). So **no script changes** are needed to `new-app.sh`, `sync-kernel.sh`, `check-manifest.sh`, or `lib/manifest.sh`.

**Alternative considered — duplicate the A/R sine into `stubs/*`:** keeps two identical instrument copies and a drift test forever, with no benefit. Rejected.

**Alternative considered — move the instrument into preset `paths`:** would let `sync-kernel.sh` re-apply (and thus clobber-protect / fight) a consumer's customized instrument on every sync — a regression of the app-owned guarantee. Rejected. This is the decisive reason `instrumentStubs` (not `paths`) is the right home.

### D2: Delete the blank stubs and their drift guard

With the source == the reference, the blank `stubs/synth.dsp`, `stubs/param-schema.js`, and `stubs/InstrumentPanels.svelte` are unreferenced, and `stubs/stubs.test.js` guarded a drift between two copies that no longer exist. All four are deleted and the empty `stubs/` directory is removed. The Vitest `include` glob `'stubs/**/*.test.js'` in `vite.config.js` becomes dead and is removed with its comment. (The unrelated `src/lib/stubs/{fs,url}.js` Node-builtin shims are a different "stubs" and are untouched.)

### D3: Keep the manifest field name `instrumentStubs`; fix only the prose

The field is now a slight misnomer (it ships a reference instrument, not a stub). Renaming it (e.g. to `instrumentSeed`) would touch `kernel-manifest.json`, `lib/manifest.sh`, `check-manifest.sh`, `new-app.sh`, `generate-assert.sh`, `sync-kernel.sh`, and several specs — pure mechanical churn for a cosmetic gain, and a larger review surface. The key is a stable identifier for the mechanism "instrument-tier files written once at generation, never re-synced," and that meaning is unchanged. We keep the name and correct the **meaning** in specs and docs instead. (Flagged for the human at design review; cheap to revisit later as its own `refactor` change if desired.)

### D4: Gate the new behavior in `generate-assert.sh`

`generate-assert.sh` already asserts each `instrumentStubs` target exists and runs the emitted app's `check-identity-leak.sh`; it does not assert the instrument's *content*. Add a positive assertion that the emitted instrument is the **reference, not a blank**. Make it **structural** rather than name-keyed — assert the emitted `src/param-schema.js` has a non-empty `PARAM_SCHEMA` with at least one `knob` descriptor, and `faust/synth.dsp` is non-trivial — so the gate enforces "seed, don't blank" without breaking if the reference instrument is later swapped for a different one (e.g. a filter synth with `cutoff`/`resonance`). This mirrors the updated app-generation spec scenario. The A/R sine uses only generic identifiers, so `check-identity-leak.sh` stays clean (it forbids donor literals like `synth-d`, not instrument params).

## Risks / Trade-offs

- **[Losing the `stubs.test.js` drift guard]** → It guarded blank-vs-reference export-surface drift. With a single copy (the reference) seeding generation, that drift is structurally impossible. The reference instrument's correctness is already fully exercised by the preset's own `preset-build` gate (its tests, the power-off-silence vitest, chassis-purity). Net coverage is preserved; the deleted test only protected a now-nonexistent second copy.

- **[Generated apps no longer start from a deliberately minimal blank canvas]** → Intended: the user wants a working example as the starting point. The reference is small and explicitly designed to be read end-to-end and edited; the header comments (updated by this change) tell the developer where to change it.

- **[Fixes a latent incoherence, but only on newly generated apps]** → `src/state/synth.test.js` travels via `paths` and asserts `PARAM_DEFAULTS.attack === 0.01` / `release === 0.3`. With the old blank schema seeding generation, that traveling test would fail against its own app (nothing runs the generated app's Vitest in `generate-assert`/`smoke-app`, so it was silently broken). Seeding the reference schema makes the traveling test match the traveling instrument. This is an improvement, not a regression — but it is realized only for apps generated after this change; pre-existing generated apps are unchanged (and were never re-synced for the instrument anyway).

- **[Field-name misnomer persists]** (per D3) → Accepted for now; prose carries the accurate meaning, and a rename remains a cheap future `refactor`.

- **[The traveling `synth.test.js` stays reference-instrument-specific]** → `src/state/synth.test.js` ships to generated apps via `paths` and hard-codes the reference params (`attack`, `release`, `waveform`). This change makes those assertions *pass* (the seed now matches), but the test remains coupled to the specific reference instrument: a downstream developer who swaps in their own instrument must update it. Making that test structural, or moving it into the `instrumentStubs` (app-owned, never-synced) set so it travels as editable scaffolding, is a reasonable follow-up but is **out of scope** here — this change only seeds the reference, it does not redesign which tests travel.

## Migration Plan

No runtime migration. Existing consuming apps are untouched (instrument is never re-synced). The change takes effect for apps generated after it merges. Rollback is a straight revert of the manifest edit, the restored stub files, and the spec/doc edits.

## Open Questions

- None blocking. The only deferred decision is the cosmetic field rename (D3), intentionally out of scope.

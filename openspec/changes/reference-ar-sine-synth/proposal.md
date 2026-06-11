## Why

The `svelte-faust-synth` preset's **reference instrument** is currently a continuous drone: `gate` only switches the pitch source and the amplitude is a constant `waveOut * 0.25`, so it hums on power-on and never demonstrates a note being played. That undersells the chassis — the keyboard, the on-screen pitch wheel, MIDI pitch-bend, and the oscilloscope are all wired, yet the worked example never shows `gate` actually starting and stopping a note. Making the reference a small, genuinely playable voice turns the preset into a convincing "this is what a real instrument feels like" demo while staying minimal.

## What Changes

- **BREAKING** (reference instrument behavior): the reference instrument changes from an always-on drone to a **key-triggered A/R sine synth**. Power-on is now silent until a key is played; the old audible-on-power-on drone is removed.
- `faust/synth.dsp`: drop the `pitch = select2(int(gate), frequency, freq)` drone/key switch — pitch is now just `freq`. Replace the constant `waveOut * 0.25` with an attack/release amplitude envelope gated by `gate` (`en.ar(attack, release, gate)`: rises to peak while held, releases on key-up — not a decay-to-zero pluck).
- `src/param-schema.js`: **remove** the `frequency` knob; **add** two store-backed knobs `attack` and `release`. Keep the `waveform` switch (default `0` = sine, so the instrument ships a sine out of the box) and the `modWheel` controller.
- `src/components/InstrumentPanels.svelte`: replace the single `frequency` knob with `attack` and `release` knobs; keep the waveform selector row and the chassis-owned scope.
- Update the tests that name `frequency` (`src/state/synth.test.js`, `src/patches/storage.test.js`, `src/power-off-silence.test.js`, and `src/components/PatchControl.test.js`, which uses `frequency` only as a representative store param in its save/load/dirty-marker cases) to the new params, and add coverage for the envelope behavior.
- **Out of scope:** `stubs/synth.dsp` and `stubs/param-schema.js` are untouched — the generated-app stub stays deliberately silent. No chassis files change. The pitch wheel and scope already work and need no changes.

## Capabilities

### New Capabilities

<!-- None. The reference instrument's musical behavior is not a new capability: a stack-tier "reference-instrument-voice" spec would sync into consuming apps that have blanked the reference instrument, describing something they deleted. The right home is the existing kernel-tier preset-portability requirement that already governs the reference instrument as a worked-example contract. -->

### Modified Capabilities

- `preset-portability`: strengthen "The reference instrument exercises the chassis seam minimally" so the worked example must be **playable** — `gate` SHALL drive an audible amplitude envelope (the instrument is silent until a key is played and demonstrates the full `freq`/`gate` note lifecycle), not merely switch a parameter as the drone did. This keeps the contract preset-agnostic; the specific A/R-sine implementation lives in `design.md`/`tasks.md`.

## Impact

- Affected files (all instrument-tier / preset worked-example, no chassis or generator changes):
  - `presets/svelte-faust-synth/faust/synth.dsp`
  - `presets/svelte-faust-synth/src/param-schema.js`
  - `presets/svelte-faust-synth/src/components/InstrumentPanels.svelte`
  - `presets/svelte-faust-synth/src/state/synth.test.js`
  - `presets/svelte-faust-synth/src/patches/storage.test.js`
  - `presets/svelte-faust-synth/src/power-off-silence.test.js`
  - `presets/svelte-faust-synth/src/components/PatchControl.test.js` (re-point only — uses `frequency` purely as a representative store param in its save/load/dirty-marker cases; the assertions are param-name-agnostic)
  - `presets/svelte-faust-synth/src/chassis-purity.test.js` (verify-first — its `frequency` usage is an instrument-literal leak check, not a fixture; the only change is swapping the hard-coded sample literal in the blocklist-derivation assertion to a current param name)
- Gates: `preset-build` (prettier + chassis-purity + power-off-silence vitest) must stay green; the FAUST DSP recompiles via `@grame/faustwasm`.
- No dependency, API, or kernel-contract changes. The five universal engine params (`freq`, `gate`, `modWheel`, `outputPeak`, `mixerPeak`) are preserved.

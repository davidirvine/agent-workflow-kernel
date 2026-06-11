## 1. Schema: drop frequency, add attack/release

- [x] 1.1 In `presets/svelte-faust-synth/src/param-schema.js`, remove the `frequency` descriptor and add `attack` `{ min: 0.001, max: 1, default: 0.01, bipolar: false, kind: 'knob', ccScalable: true }` and `release` `{ min: 0.01, max: 2, default: 0.3, bipolar: false, kind: 'knob', ccScalable: true }`; keep the `waveform` switch (default `0`) and the `modWheel` controller. Update the module/JSDoc comments to describe the A/R sine voice instead of the drone. Confirm the derived collections (`PARAM_DEFAULTS`, `KNOB_PARAMS`, etc.) recompute correctly (no manual edits to them). Run prettier; commit `feat(preset): replace frequency knob with attack/release envelope params`.

## 2. DSP: gate-driven A/R envelope over a sine

- [x] 2.1 In `presets/svelte-faust-synth/faust/synth.dsp`, declare `attack` and `release` hsliders (labels matching the schema keys, ranges per design D4); remove the `frequency` hslider and the `pitch = select2(int(gate), frequency, freq)` line so `pitch = freq`. Replace the constant `vcaOut = waveOut * 0.25` with `env = en.ar(attack, release, gate)` and `vcaOut = waveOut * env * 0.5`. Keep the `waveform`/`WAVEFORMS`-ordered `ba.selectn` over `os.osc/os.triangle/os.square/os.sawtooth`, the five universal params, `outputPeak` as a real readback, and `modWheel` declared + attached. Update the header comments. No formatter applies to `.dsp` files (STACK.md's table covers only `*.md`/`*.json`/`*.toml`/`*.sh`), so skip formatting; verify the DSP compiles via the preset `prebuild`. Commit `feat(preset): gate an attack/release envelope instead of droning`.

## 3. Panels: attack/release knobs

- [x] 3.1 In `presets/svelte-faust-synth/src/components/InstrumentPanels.svelte`, replace the single `frequency` `Knob` (and its `freqMidiState`/`midiStateFor('frequency')` wiring) with two `Knob`s for `attack` and `release` bound to `synthParams`, each wired through `midiStateFor(...)`, `onParamChange`, and `onKnobContextMenu` the same way; keep the waveform selector row and the chassis-owned `scope` snippet. Update the panel's comment about which knobs it renders. Run prettier; commit `feat(preset): render attack/release knobs in the reference panel`.

## 4. Tests: re-point off frequency, cover the envelope

- [ ] 4.1 Update the instrument-owned tests that name `frequency` to the new params: `src/state/synth.test.js` and `src/patches/storage.test.js` — assert defaults/persistence for `attack`/`release` (and `waveform`) instead of `frequency`. Run the affected vitest files green. Commit `test(preset): update synth/store tests for attack/release params`.
- [ ] 4.2 Update `src/power-off-silence.test.js` (the only instrument-tier power/silence test; confirm no other instrument-tier test asserts the old drone behavior) so it asserts power-on silence and that `gate` drives audible amplitude (silent at `gate` low, non-silent at `gate` high) rather than an audible-on-power-on drone. Run those vitest files green. Commit `test(preset): assert key-triggered envelope, silent until played`.
- [ ] 4.3 Verify `src/chassis-purity.test.js`: confirm its `frequency` usage is an instrument-literal leak assertion (chassis names no instrument param), not a fixture asserting `frequency` exists; if it hard-codes `frequency` as the sample literal, swap it for a current param name without changing the test's intent. If no code change is needed, record that in the commit body. Commit `test(preset): keep chassis-purity literal current after param rename` (or `chore` if verify-only with no change).

## 5. Gates

- [ ] 5.1 Run the preset gates green: `cd presets/svelte-faust-synth && npm run build` (recompiles the DSP), the preset prettier check, the traveling `chassis-purity` test, and the `power-off-silence` vitest. From the kernel root run `scripts/check-manifest.sh` and `scripts/check-identity-leak.sh` and `shellcheck`/`shfmt` if any script changed (none expected). Fix any failure at its source and amend the relevant task's commit (do not introduce a frequency literal back into the chassis).

## Context

The `svelte-faust-synth` preset ships a reference instrument (`faust/synth.dsp` + `src/param-schema.js` + `src/components/InstrumentPanels.svelte`) as a worked example of the chassis seam. Today it is a continuous **drone**: `pitch = select2(int(gate), frequency, freq)` switches the pitch source on key-down, but amplitude is the constant `waveOut * 0.25`, so it hums on power-on and `gate` never starts or stops a note.

Everything else needed for a playable voice is already wired and unchanged by this work:

- **Keyboard → note contract:** the keyboard raises `gate` and sets `freq` (`engine.noteOn/noteOff`).
- **Pitch wheel / MIDI bend → pitch:** both the on-screen wheel and MIDI pitch-bend already compute `setParam('freq', bentFreq(currentNoteFreq, semitones))` in JS ([Shell.svelte:255](../../../presets/svelte-faust-synth/src/components/Shell.svelte#L255), [midi.js:152](../../../presets/svelte-faust-synth/src/audio/midi.js#L152)). No DSP routing is needed for pitch-wheel offset.
- **Oscilloscope:** `Scope.svelte` taps the live audio via an `AnalyserNode` (`getByteTimeDomainData`), not the `outputPeak` meter, so it already draws the real waveform.

The chassis carries **no** reference-instrument parameter literal (the `chassis-purity` test enforces this), so every change here is confined to instrument-tier files in the preset.

## Goals / Non-Goals

**Goals:**

- Make the reference instrument a small, genuinely playable **key-triggered A/R sine synth**: silent on power-on, a held key sounds a note through an attack/release amplitude envelope, release fades it out.
- Keep the worked example minimal and readable, still exercising both store-backed descriptor kinds (`knob` via `attack`/`release`, `switch` via `waveform`) plus the controller (`modWheel`) and the power lifecycle.
- Preserve the five universal engine params (`freq`, `gate`, `modWheel`, `outputPeak`, `mixerPeak`) and keep `outputPeak` a real readback.

**Non-Goals:**

- Touching the generated-app **stub** (`stubs/synth.dsp`, `stubs/param-schema.js`) — it stays deliberately silent.
- Any chassis, generator (`new-app.sh`), or sync changes.
- A decay-to-zero **pluck** envelope, velocity sensitivity, polyphony, or routing `modWheel` to a destination — all out of scope.
- Changing the pitch-wheel/bend path or the scope (already working).

## Decisions

### D1: Attack/Release (A/R), not Attack/Decay (A/D)

Use `env = en.ar(attack, release, gate)` — amplitude rises to peak over `attack` while the key is held, holds at peak, then falls over `release` on key-up. **Alternative considered:** `en.adsr(attack, decay, 0, rel, gate)` (a decay-to-zero pluck) — rejected because the human explicitly chose A/R: holding a key should sustain the note, not have it die under the finger. The two store-backed knobs are therefore `attack` and `release`.

### D2: Drop the `frequency` knob; pitch is just `freq`

Remove the `frequency` descriptor and the `pitch = select2(int(gate), frequency, freq)` switch. Pitch becomes `freq` directly — keys set it, the pitch wheel/bend already offset it. **Rationale:** with amplitude gated by the envelope, a resting-pitch knob is essentially never audible (nothing sounds when `gate` is low), so it stops being a meaningful control. **Alternative considered:** keep `frequency` as the gate-low tail pitch — rejected as a contrived, near-inaudible control; the human chose to drop it. The store-backed-`knob` seam is now demonstrated by `attack`/`release` instead.

### D3: Keep the `waveform` switch, default sine

Retain the `waveform` `switch` (and the `WAVEFORMS` list / `ba.selectn` over `os.osc`/`os.triangle`/`os.square`/`os.sawtooth`), default index `0` = sine. **Rationale:** the instrument ships a sine out of the box (the human's ask) while still demonstrating the `switch` descriptor kind that `preset-portability` requires the worked example to exercise. **Alternative considered:** hard-code a bare sine and drop the selector — rejected because it would leave the worked example with no `switch` param, violating the seam-coverage requirement.

### D4: Envelope param ranges and output gain

`attack`: `{ min: 0.001, max: 1, default: 0.01 }` s; `release`: `{ min: 0.01, max: 2, default: 0.3 }` s — both `kind: 'knob'`, `ccScalable: true`, `bipolar: false`. Output gain stays modest so a sine peak lands well under clipping: `vcaOut = waveOut * env * 0.5` (envelope peak 1.0 × 0.5). **Rationale:** these are gentle, musical defaults for a "hello world" voice; `ccScalable` keeps both knobs MIDI-learnable like the old `frequency` knob. The `outputPeak` vbargraph range already accommodates a peak near 0.5.

### D5: Test updates scoped to instrument-owned files

`frequency` is named in `param-schema.js`, `InstrumentPanels.svelte`, and the tests `src/state/synth.test.js`, `src/patches/storage.test.js`, `src/power-off-silence.test.js`, and `src/components/PatchControl.test.js` (a chassis-component test that uses `frequency` only as a representative store param in its save/load/dirty-marker cases). Re-point those to `attack`/`release` (and `waveform` where a switch is needed) and add coverage that `gate` drives the envelope (silent at `gate` low, audible at `gate` high). `src/chassis-purity.test.js` is **verify-only**: confirm its `frequency` usage is an instrument-literal leak assertion (proving the chassis does *not* name it), not a fixture that must change; if it hard-codes `frequency` as the sample literal, swap it for a current param name.

### D6: Power-on silence is intended

The reference no longer hums on power-on; it is silent until a key is played. This is the corrected behavior per the strengthened `preset-portability` requirement and was explicitly accepted by the human. Any test asserting an audible-on-power-on drone must be updated to assert power-on silence instead.

## Risks / Trade-offs

- **A `power-on`/`engine` test asserts the old drone is audible** → Most likely in `power-off-silence.test.js` or `engine.test.js`. Mitigation: D5/D6 — re-point those assertions to "silent until `gate`," which is also a stronger, more correct check.
- **`chassis-purity` hard-codes `frequency` as its sample instrument literal** → the rename would break it. Mitigation: D5 treats the file as verify-first; swap the literal to a live param name only if needed, keeping the test's intent (chassis names no instrument param) intact.
- **`en.ar` gate retrigger / fast repeated notes click** → at very short attack the onset can click; acceptable for a minimal worked example and bounded by the `attack` min of 1 ms. No de-click stage added (out of scope).
- **`outputPeak` range mismatch** → the vbargraph is `[0, 2]`; with peak ≈ 0.5 it stays comfortably in range, so the scope/LED light correctly. No change needed.
- **WAVEFORMS / selector index drift** → the `waveform` nentry must keep indexing `os.osc, os.triangle, os.square, os.sawtooth` in `WAVEFORMS` order; unchanged here but re-verified since the surrounding DSP is edited.

## Migration Plan

Not applicable — this is a preset worked-example change, not a deployed service. Rollback is reverting the change's commits on the implementation branch. No data, persisted-patch, or contract migration: the persisted-patch shape changes (knobs `attack`/`release` instead of `frequency`), but the preset has no shipped users; consuming apps blank the reference instrument on generation and are unaffected.

## Open Questions

- None. The A/R-vs-A/D choice, dropping `frequency`, keeping `waveform`, and accepting power-on silence were all decided with the human before proposing.

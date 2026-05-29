// Instrument DSP — STUB.
//
// new-app.sh writes this file into a freshly generated app at faust/synth.dsp,
// replacing the preset's reference oscillator. It exposes exactly the universal
// engine contract the chassis depends on and emits silence, so the generated
// app's `prebuild` (npm run faust:build) and `npm run build` succeed before you
// have written any real DSP.
//
// >>> THIS IS WHERE YOU MAKE SOUND <<<
// Replace `silence` below with your synthesis, driven by parameters whose
// nentry/hslider labels match the keys in src/param-schema.js (the chassis
// routes setParam calls by those label strings). Keep the five universal
// contract names (freq, gate, modWheel, outputPeak, mixerPeak) intact.

import("stdfaust.lib");

// ─── Universal engine params (the chassis writes these via setParam) ────────

// `freq` and `gate` are the universal note contract — the keyboard sends pitch
// via setParam('freq', …) and held-key state via gate.
freq = hslider("freq [unit:Hz]", 220, 20, 20000, 0.01);
gate = button("gate");
// `modWheel` is the universal controller seam — the chassis scales a CC into it.
modWheel = hslider("modWheel", 0, 0, 1, 0.001);

// ─── Universal meter outputs (the chassis reads these) ──────────────────────
// Constant 0 in the stub — a real instrument feeds its signal level here so the
// chassis scope / level-LED light up.
outputPeak = 0.0 : vbargraph("outputPeak [unit:linear]", 0, 2);
mixerPeak = 0.0 : vbargraph("mixerPeak [unit:linear]", 0, 4);

// ─── Process: stereo silence ────────────────────────────────────────────────
// `attach(a, b)` returns `a` but forces `b` to be evaluated, keeping the
// engine-contract params and meters in the UI/meta tree (FAUST otherwise prunes
// expressions nothing consumes) so the chassis can always setParam/read them.
// The mono silence is duplicated to L/R.
silence = 0.0;
process = silence
  : attach(_, freq)
  : attach(_, gate)
  : attach(_, modWheel)
  : attach(_, outputPeak)
  : attach(_, mixerPeak)
  <: _, _;

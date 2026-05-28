// The reference instrument's FAUST DSP — a minimal droning oscillator with a
// waveform selector and a frequency knob. Kept deliberately tiny so the chassis
// seam is visible without being drowned in instrument detail. new-app.sh
// (slice 3) blanks this when emitting a fresh app; the preset keeps it as a
// worked example.
//
// Param naming MUST match src/param-schema.js — the chassis routes setParam
// calls by the schema's keys. WAVEFORMS order is also load-bearing: the
// integer the schema's `waveform` switch holds is the index into the four
// oscillators below.

import("stdfaust.lib");

// ─── Universal engine params (the chassis writes these) ─────────────────────

// `freq` and `gate` are the universal note contract — the keyboard sends
// pitch via setParam('freq', …) and the held-key state via gate.
freq = hslider("freq [unit:Hz]", 220, 20, 20000, 0.01);
gate = button("gate");
// `modWheel` is the universal controller seam. Declared so the chassis can
// scale a CC into it; deliberately not routed in this reference (a "hello
// world" instrument has no use for it yet — adopters wire it up).
modWheel = hslider("modWheel", 0, 0, 1, 0.001);

// ─── Instrument schema params (the schema/store writes these) ───────────────

// Matches the `frequency` knob descriptor in src/param-schema.js (bounds and
// default identical — the schema is the source of truth).
frequency = hslider("frequency [unit:Hz]", 220, 20, 2000, 0.01);
// Index into the WAVEFORMS list in src/param-schema.js: 0=sine, 1=triangle,
// 2=square, 3=saw. Range [0,3] integer; the schema's default is 0.
// NOTE: `waveform` is a FAUST primitive (constant-table generator) — using it
// as a local identifier collides with the keyword. Rename the FAUST identifier
// to `wfShape` while keeping the nentry label "waveform" — the chassis routes
// setParam by the label string, so the schema key stays `waveform`.
wfShape = nentry("waveform", 0, 0, 3, 1);

// ─── Pitch: held keys override; otherwise the knob's resting pitch ─────────

// select2(c, s1, s2): c=0 → s1, c=1 → s2. gate=0 (no key held) → knob;
// gate=1 (key held) → keyboard's freq.
pitch = select2(int(gate), frequency, freq);

// ─── Oscillator: pick by waveform index ─────────────────────────────────────
// Order MUST match src/param-schema.js WAVEFORMS.

waveOut = ba.selectn(4, int(wfShape), os.osc(pitch), os.triangle(pitch), os.square(pitch), os.sawtooth(pitch));

// ─── Drone: continuous amplitude, no envelope ───────────────────────────────
// 0.25 gain so a sine peak hits roughly -12 dBFS — audible but not painful
// for the "hello world" power-on tone. The chassis power button is what
// silences the instrument (chassis-architecture power-lifecycle).

vcaOut = waveOut * 0.25;

// ─── Meters ────────────────────────────────────────────────────────────────
// outputPeak is a real readback so the chassis scope / level-LED light up.
// mixerPeak is exposed as a constant 0 per design D11: the universal engine
// contract is uniformly five params; this instrument has no Mixer panel so
// the value is always zero, but the param is declared so the chassis's
// getMixerPeak() always finds something to read.

outputPeak = abs(vcaOut) : vbargraph("outputPeak [unit:linear]", 0, 2);
mixerPeak = 0.0 : vbargraph("mixerPeak [unit:linear]", 0, 4);

// ─── Process: stereo mono out ───────────────────────────────────────────────
// attach keeps the meters alive in the graph (FAUST would otherwise prune
// outputs nothing consumes). Mono signal duplicated to L/R.

// `attach(a, b)` returns `a` but forces `b` to be evaluated, which keeps the
// param visible in the UI tree (FAUST otherwise prunes unused expressions).
// modWheel is attached here even though the reference doesn't route it — the
// universal engine contract requires the chassis to be able to setParam it,
// and that requires it to appear in dsp-meta.json.
process = vcaOut : attach(_, outputPeak) : attach(_, mixerPeak) : attach(_, modWheel) <: _, _;

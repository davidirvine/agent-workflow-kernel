// The reference instrument's FAUST DSP — a minimal key-triggered A/R sine synth
// with a waveform selector and attack/release envelope knobs. Kept deliberately
// tiny so the chassis seam is visible without being drowned in instrument
// detail. new-app.sh seeds this verbatim into a fresh app as its starting
// instrument; thereafter it is app-owned content and is never re-synced.
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

// Match the `attack`/`release` knob descriptors in src/param-schema.js (bounds
// and defaults identical — the schema is the source of truth). These drive the
// gated A/R amplitude envelope below.
attack = hslider("attack [unit:s]", 0.01, 0.001, 1, 0.001);
release = hslider("release [unit:s]", 0.3, 0.01, 2, 0.001);
// Index into the WAVEFORMS list in src/param-schema.js: 0=sine, 1=triangle,
// 2=square, 3=saw. Range [0,3] integer; the schema's default is 0.
// NOTE: `waveform` is a FAUST primitive (constant-table generator) — using it
// as a local identifier collides with the keyword. Rename the FAUST identifier
// to `wfShape` while keeping the nentry label "waveform" — the chassis routes
// setParam by the label string, so the schema key stays `waveform`.
wfShape = nentry("waveform", 0, 0, 3, 1);

// ─── Pitch: driven entirely by the keyboard ────────────────────────────────

// Pitch is just `freq` — the keyboard sets it on key-down and the pitch wheel /
// MIDI bend already offset it in JS. With amplitude gated by the envelope below
// there is no audible gate-low tail, so there is no resting-pitch knob.
pitch = freq;

// ─── Oscillator: pick by waveform index ─────────────────────────────────────
// Order MUST match src/param-schema.js WAVEFORMS.

waveOut = ba.selectn(4, int(wfShape), os.osc(pitch), os.triangle(pitch), os.square(pitch), os.sawtooth(pitch));

// ─── Envelope: gate-driven attack/release ───────────────────────────────────
// en.ar(attack, release, gate): amplitude rises to peak over `attack` while the
// key is held (gate=1), holds at peak, then falls over `release` on key-up
// (gate=0) — an A/R envelope, not a decay-to-zero pluck (design D1). The
// instrument is silent until a key is played; the chassis power button also
// silences it (chassis-architecture power-lifecycle). The 0.5 gain keeps a sine
// peak (envelope peak 1.0 × 0.5) well under clipping.

env = en.ar(attack, release, gate);
vcaOut = waveOut * env * 0.5;

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

// The parameter schema for the reference instrument: a minimal key-triggered
// A/R sine synth with a waveform selector and attack/release envelope knobs.
// This module is the single source of truth for what the instrument exposes and
// the explicit seam between the generic chassis and this specific instrument
// (chassis-architecture spec). It is instrument-owned (Tier 3) but the ONE
// sanctioned cross-tier import: the chassis reads its schema-derived
// collections from here.
//
// The schema is deliberately tiny — three store-backed params (attack, release,
// waveform) plus the modWheel controller — so the chassis seam is visible
// without being drowned in instrument detail. new-app.sh seeds this verbatim
// into a fresh app as its starting instrument; thereafter it is app-owned
// content and is never re-synced.

/**
 * A single parameter descriptor — see the chassis-architecture spec for the
 * full contract. Knobs and switches are store-backed; controllers (modWheel)
 * are CC-scalable but not patchable.
 *
 * @typedef {object} ParamDescriptor
 * @property {number} [min] lower bound; required for any ccScalable descriptor.
 * @property {number} [max] upper bound; same rule as `min`.
 * @property {number} [default] factory default; absent for controllers.
 * @property {boolean} bipolar centred? (affects power-off rest value).
 * @property {'knob' | 'switch' | 'controller'} kind UI/role classification.
 * @property {boolean} ccScalable whether a MIDI CC can be scaled into this range.
 */

/**
 * Available waveform indices for the `waveform` switch. The order is the
 * contract: the FAUST DSP's waveform-selector indexing MUST match this list.
 * @type {readonly string[]}
 */
export const WAVEFORMS = Object.freeze(['sine', 'triangle', 'square', 'saw'])

/**
 * The parameter schema for the reference instrument.
 *
 * - `attack`: amplitude-envelope attack time in seconds (0.001–1 s, default
 *   0.01). The held key (`gate`) drives `en.ar(attack, release, gate)`, so a
 *   note rises to peak over `attack` while held — the chassis sends `freq`/
 *   `gate` as the universal note contract.
 * - `release`: amplitude-envelope release time in seconds (0.01–2 s, default
 *   0.3). The note fades over `release` on key-up.
 * - `waveform`: discrete oscillator-shape selector, four entries above.
 * - `modWheel`: the controller seam — CC-scalable but not store-backed.
 *
 * @type {Record<string, ParamDescriptor>}
 */
export const PARAM_SCHEMA = Object.freeze({
  // --- Continuous (knob) parameters --------------------------------------
  // A/R amplitude envelope gated by the universal `gate`: silent until a key
  // is held, rises over `attack`, falls over `release` on key-up.
  attack: { min: 0.001, max: 1, default: 0.01, bipolar: false, kind: 'knob', ccScalable: true },
  release: { min: 0.01, max: 2, default: 0.3, bipolar: false, kind: 'knob', ccScalable: true },

  // --- Discrete (switch) parameters --------------------------------------
  // Index into WAVEFORMS above. Default 0 = 'sine' (gentle "hello world" tone).
  waveform: { default: 0, bipolar: false, kind: 'switch', ccScalable: false },

  // --- Controllers (not store-backed) ------------------------------------
  // modWheel is a controller: CC-scalable, but NOT store-backed — it has no
  // factory default and must be absent from PARAM_DEFAULTS/PARAM_NAMES/AUDIO_PARAMS.
  modWheel: { min: 0, max: 1, bipolar: false, kind: 'controller', ccScalable: true },
})

// --- Derived collections ---------------------------------------------------
//
// Computed once from PARAM_SCHEMA. The chassis imports these collections; it
// MUST NOT duplicate any literal here (the chassis-purity test enforces it).

const SCHEMA_ENTRIES = Object.entries(PARAM_SCHEMA)

const STORE_ENTRIES = SCHEMA_ENTRIES.filter(([, d]) => d.kind === 'knob' || d.kind === 'switch')

/** @type {Record<string, number>} */
export const PARAM_DEFAULTS = Object.freeze(
  Object.fromEntries(STORE_ENTRIES.map(([name, d]) => [name, d.default]))
)

/** @type {string[]} */
export const PARAM_NAMES = Object.freeze(Object.keys(PARAM_DEFAULTS))

/** @type {ReadonlySet<string>} */
export const AUDIO_PARAMS = Object.freeze(new Set(PARAM_NAMES))

/** @type {Record<string, {min: number, max: number}>} */
export const KNOB_PARAMS = Object.freeze(
  Object.fromEntries(
    SCHEMA_ENTRIES.filter(([, d]) => d.ccScalable).map(([name, d]) => [
      name,
      { min: d.min, max: d.max },
    ])
  )
)

/** @type {ReadonlySet<string>} */
export const BIPOLAR_PARAMS = Object.freeze(
  new Set(SCHEMA_ENTRIES.filter(([, d]) => d.bipolar).map(([name]) => name))
)

/**
 * Rest value when the instrument is powered off: midpoint for bipolar params,
 * otherwise the min for ccScalable params. For non-ccScalable params (e.g.
 * `kind: 'switch'` entries that the UI does not animate to rest on power-off,
 * but which the chassis may still query through `midiStateFor`), returns the
 * factory default — the param's rest state is "whatever it was set to last,"
 * which the default approximates. A defensive guard rather than a guarantee
 * the caller restricts to ccScalable params.
 *
 * @param {string} p
 * @returns {number}
 */
export function powerOffValue(p) {
  const k = KNOB_PARAMS[p]
  if (!k) return PARAM_DEFAULTS[p] ?? 0
  return BIPOLAR_PARAMS.has(p) ? (k.min + k.max) / 2 : k.min
}

/**
 * Instrument-specific persisted-CC rename history (old persisted name → current
 * schema name). The reference instrument has no rename history yet, so this is
 * empty; the chassis MidiCcMap still receives it by injection per
 * chassis-architecture so the contract shape is uniform across presets.
 *
 * @type {Record<string, string>}
 */
export const PARAM_RENAMES = Object.freeze({})

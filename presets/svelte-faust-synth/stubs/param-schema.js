// Instrument parameter schema — STUB.
//
// new-app.sh writes this file into a freshly generated app at
// `src/param-schema.js`, replacing the preset's reference-oscillator schema
// with a blank one. This is the single source of truth for what your
// instrument exposes and the one sanctioned seam between the generic chassis
// and your instrument (chassis-architecture spec).
//
// >>> THIS IS WHERE YOU BUILD YOUR INSTRUMENT <<<
// Add parameter descriptors to PARAM_SCHEMA below. The derived collections
// recompute automatically from it; the chassis imports them and never names a
// parameter literally (the chassis-purity test enforces that). With the empty
// schema the app boots, the chassis renders, and the instrument is silent —
// fill in PARAM_SCHEMA (and the matching FAUST DSP at faust/synth.dsp) to make
// it play.

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
 * Available waveform indices for a `waveform` switch, if your instrument has
 * one. Empty in the stub — declare your own list (the order is the contract:
 * a FAUST waveform selector's indexing MUST match this list).
 * @type {readonly string[]}
 */
export const WAVEFORMS = Object.freeze([])

/**
 * The parameter schema for your instrument. Empty in the stub — add
 * descriptors keyed by parameter name. The derived collections below recompute
 * from whatever you put here.
 *
 * @type {Record<string, ParamDescriptor>}
 */
export const PARAM_SCHEMA = Object.freeze({})

// --- Derived collections ---------------------------------------------------
//
// Computed once from PARAM_SCHEMA. The chassis imports these collections; it
// MUST NOT duplicate any literal here (the chassis-purity test enforces it).
// They derive empty from the stub's empty schema and grow as you add params.

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
 * otherwise the min for ccScalable params; for anything else the factory
 * default (0 when absent). Identical logic to the reference instrument — it
 * works unchanged against the empty schema.
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
 * schema name). Empty for a fresh app; the chassis MidiCcMap still receives it
 * by injection per chassis-architecture so the contract shape is uniform.
 *
 * @type {Record<string, string>}
 */
export const PARAM_RENAMES = Object.freeze({})

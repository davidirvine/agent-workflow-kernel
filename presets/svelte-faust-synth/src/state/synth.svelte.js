// Central synth-parameter store: the single source of truth for the synth's
// sound. Every continuous (knob) parameter and every discrete (switch) parameter
// lives here. User interaction, MIDI CC input, patch loads, and power-on all
// write to this store, and the store is the sole driver of `setParam` to the DSP
// (see writeParam in the DSP-subscriber section).
//
// The mod-wheel is intentionally NOT a store parameter: it is performance/
// controller state, excluded from patches, and owned directly by App.svelte.
// Likewise the keyboard register and MIDI CC assignments are not stored here.

import { setParam } from '../audio/engine.js'
import { PARAM_DEFAULTS, PARAM_NAMES, AUDIO_PARAMS } from '../param-schema.js'

// Parameter membership is now derived from the single instrument-owned schema
// (src/param-schema.js), the sanctioned cross-tier contract import (design.md
// D1). The store re-exports the three collections it consumes so existing
// importers keep their current `./state/synth.svelte.js` path unchanged.
export { PARAM_DEFAULTS, PARAM_NAMES, AUDIO_PARAMS }

/**
 * The live synth parameter state — the single source of truth for the sound.
 * Seeded from factory defaults; mutated only through writeParam/applyParams.
 * @type {Record<string, number>}
 */
export const synthParams = $state({ ...PARAM_DEFAULTS })

/**
 * The active patch: the patch applied on power-on and the baseline for dirty
 * tracking. `name` is null when the active patch is the (unsaved) factory
 * defaults or freshly-edited state; `params` is the snapshot to (re)apply on the
 * next power-on. Loading a patch updates this; power-on reads `params` from it.
 * @type {{ name: string | null, params: Record<string, number> }}
 */
export const activePatch = $state({ name: null, params: { ...PARAM_DEFAULTS } })

/**
 * Set the active patch (e.g. on load). Stores a copy of params so later store
 * mutations don't retroactively change the dirty-tracking baseline.
 * @param {string | null} name
 * @param {Record<string, number>} params
 */
export function setActivePatch(name, params) {
  activePatch.name = name
  activePatch.params = { ...params }
}

// --- DSP subscriber -------------------------------------------------------
//
// writeParam is the single, central setter wrapper that applies a store change
// to both the store state and the DSP. It is the ONLY path that calls
// engine.setParam, so there is exactly one place where the store drives audio.
// Guards (in order):
//   1. Non-audio / unknown keys (e.g. `modWheel`, register) are skipped entirely
//      — they are not store parameters and must never reach the DSP via the store.
//   2. Non-finite values are skipped — they would corrupt the DSP and the store.
//   3. Redundant writes (value unchanged) do not re-fire setParam, preventing the
//      duplicate/feedback fires that a MIDI ⇄ store ⇄ knob loop could otherwise
//      cause. `force` overrides this for power-on/load, where the freshly created
//      DSP node holds no state and every parameter must be (re)sent.

/**
 * Write a single parameter to the store and forward it to the DSP.
 *
 * Contract: forwarding goes through engine.setParam, which is a safe no-op when
 * the AudioWorklet node has not been created (i.e. while powered off). Callers
 * (interactions, MIDI, patch loads) may therefore write at any time; DSP calls
 * made before power-on simply do nothing, and the values are (re)sent when the
 * active patch is applied on power-on.
 * @param {string} name parameter name
 * @param {number} value new value
 * @param {boolean} [force] when true, call setParam even if the value is unchanged
 */
export function writeParam(name, value, force = false) {
  if (!AUDIO_PARAMS.has(name)) return
  if (!Number.isFinite(value)) return
  const changed = synthParams[name] !== value
  if (changed) synthParams[name] = value
  if (changed || force) setParam(name, value)
}

/**
 * Apply a full or partial set of parameter values to the store at once. Used to
 * apply the active patch on power-on and to load a patch. Unknown keys in the
 * input are ignored by writeParam.
 * @param {Record<string, number>} params
 * @param {boolean} [force] forwarded to writeParam (defaults true: power-on/load
 *   must (re)send every parameter to the freshly created DSP node)
 */
export function applyParams(params, force = true) {
  for (const name of PARAM_NAMES) {
    if (name in params) writeParam(name, params[name], force)
  }
}

/**
 * Apply the factory defaults to the store (the bootstrap "active patch").
 * @param {boolean} [force]
 */
export function resetToDefaults(force = true) {
  applyParams(PARAM_DEFAULTS, force)
}

/**
 * Seed the store state to factory defaults WITHOUT touching the DSP. Used at
 * App initialisation (the worklet isn't created yet, so there is nothing to
 * drive) and to give a clean baseline in tests, where the store is a singleton.
 */
export function resetParams() {
  for (const name of PARAM_NAMES) synthParams[name] = PARAM_DEFAULTS[name]
}

/**
 * Snapshot the in-scope parameter values as a plain object, suitable for
 * serializing into a patch. Only PARAM_NAMES are included.
 * @returns {Record<string, number>}
 */
export function serializeParams() {
  /** @type {Record<string, number>} */
  const out = {}
  for (const name of PARAM_NAMES) out[name] = synthParams[name]
  return out
}

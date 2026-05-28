// Persistence for the per-wheel spring physics. A single localStorage key holds
// both wheels' { mass, spring, damping }. On load every field is validated as a
// finite number within its range and falls back to its own default, so a
// partial or corrupt entry never breaks the wheels (the validate-and-default
// resilience pattern from midiCcMap, in the `synth-d:` namespace from storage.js).

import { PHYSICS_RANGES, DEFAULT_PHYSICS } from './wheelPhysics.js'

/** localStorage key (in the established `synth-d:` namespace). */
export const STORAGE_KEY = 'synth-d:wheel-physics'

/** The wheels persisted under this key. */
const WHEELS = /** @type {const} */ (['mod', 'pitch'])

/** Default physics for both wheels (a fresh object per call — never shared). */
export function defaultWheelPhysics() {
  return {
    mod: { ...DEFAULT_PHYSICS },
    pitch: { ...DEFAULT_PHYSICS },
  }
}

/** @param {string} key @returns {string | null} */
function safeGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** @param {string} key @param {string} value @returns {boolean} success */
function safeSet(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * Validate one physics field against its range, falling back to the default
 * when missing or out of range. NaN/Infinity fail `Number.isFinite`.
 * @param {unknown} v
 * @param {{ min: number, max: number, default: number }} range
 * @returns {number}
 */
function validateField(v, range) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < range.min || v > range.max) {
    return range.default
  }
  return v
}

/**
 * Validate a single wheel's params, falling back per-field to defaults.
 * @param {unknown} raw
 * @returns {{ mass: number, spring: number, damping: number }}
 */
function validateWheel(raw) {
  const w = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}
  return {
    mass: validateField(w.mass, PHYSICS_RANGES.mass),
    spring: validateField(w.spring, PHYSICS_RANGES.spring),
    damping: validateField(w.damping, PHYSICS_RANGES.damping),
  }
}

/**
 * Load both wheels' physics. Absent, partial, or corrupt data resolves to
 * per-field defaults so the wheels always function.
 * @returns {{ mod: { mass: number, spring: number, damping: number }, pitch: { mass: number, spring: number, damping: number } }}
 */
export function loadWheelPhysics() {
  const raw = safeGet(STORAGE_KEY)
  /** @type {Record<string, unknown>} */
  let parsed = {}
  if (raw) {
    try {
      const obj = JSON.parse(raw)
      if (obj && typeof obj === 'object') parsed = obj
    } catch {
      // Corrupt JSON reads as absent → all defaults below.
    }
  }
  return {
    mod: validateWheel(parsed.mod),
    pitch: validateWheel(parsed.pitch),
  }
}

/**
 * Persist both wheels' physics. Each field is validated/clamped through the
 * same path as load, so only in-range numbers are written. Storage failure is
 * non-fatal.
 * @param {{ mod?: unknown, pitch?: unknown }} [physics]
 * @returns {boolean} success
 */
export function saveWheelPhysics(physics = {}) {
  /** @type {Record<string, { mass: number, spring: number, damping: number }>} */
  const clean = {}
  for (const wheel of WHEELS) {
    clean[wheel] = validateWheel(physics?.[wheel])
  }
  return safeSet(STORAGE_KEY, JSON.stringify(clean))
}

/**
 * Reset both wheels to default physics and persist them.
 * @returns {{ mod: { mass: number, spring: number, damping: number }, pitch: { mass: number, spring: number, damping: number } }}
 */
export function resetWheelPhysics() {
  const defaults = defaultWheelPhysics()
  saveWheelPhysics(defaults)
  return defaults
}

// Persistence for the per-wheel spring physics. A single localStorage key holds
// both wheels' { mass, spring, damping }. On load every field is validated as a
// finite number within its range and falls back to its own default, so a
// partial or corrupt entry never breaks the wheels (the validate-and-default
// resilience pattern from midiCcMap).
//
// **Namespace via constructor injection (D4, fallback clause):** the
// localStorage namespace prefix is passed to `createWheelPhysicsStore(namespace)`
// at instantiation time, mirroring patches/storage.js. This module carries NO
// donor-identity literal. The chassis Shell is the sole instantiation site.

import { PHYSICS_RANGES, DEFAULT_PHYSICS } from './wheelPhysics.js'

/** The wheels persisted under the constructed key. */
const WHEELS = /** @type {const} */ (['mod', 'pitch'])

/** Default physics for both wheels (a fresh object per call — never shared). */
export function defaultWheelPhysics() {
  return {
    mod: { ...DEFAULT_PHYSICS },
    pitch: { ...DEFAULT_PHYSICS },
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
 * Construct a wheel-physics store bound to the given localStorage namespace.
 * The Shell supplies the namespace value at construction time. The returned
 * object exposes loadWheelPhysics, saveWheelPhysics, and resetWheelPhysics;
 * the namespace lives only on this closure, not in any persisted data or
 * module-level constant.
 *
 * @param {string} namespace - The localStorage namespace prefix
 *   (e.g. `myapp:`); by convention ends with `:`.
 */
export function createWheelPhysicsStore(namespace) {
  const STORAGE_KEY = namespace + 'wheel-physics'

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
   * Load both wheels' physics. Absent, partial, or corrupt data resolves to
   * per-field defaults so the wheels always function.
   * @returns {{ mod: { mass: number, spring: number, damping: number }, pitch: { mass: number, spring: number, damping: number } }}
   */
  function loadWheelPhysics() {
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
   * same path as load, so only in-range numbers are written. Storage failure
   * is non-fatal.
   * @param {{ mod?: unknown, pitch?: unknown }} [physics]
   * @returns {boolean} success
   */
  function saveWheelPhysics(physics = {}) {
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
  function resetWheelPhysics() {
    const defaults = defaultWheelPhysics()
    saveWheelPhysics(defaults)
    return defaults
  }

  return {
    loadWheelPhysics,
    saveWheelPhysics,
    resetWheelPhysics,
    // Exposed for testability — assertions against the exact key an instance
    // writes. NOT for runtime use.
    _storageKey: STORAGE_KEY,
  }
}

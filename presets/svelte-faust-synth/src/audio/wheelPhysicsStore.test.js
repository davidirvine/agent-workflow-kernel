import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  loadWheelPhysics,
  saveWheelPhysics,
  resetWheelPhysics,
  defaultWheelPhysics,
  STORAGE_KEY,
} from './wheelPhysicsStore.js'
import { DEFAULT_PHYSICS } from './wheelPhysics.js'

beforeEach(() => {
  localStorage.clear()
})

describe('wheelPhysicsStore — defaults', () => {
  it('defaultWheelPhysics returns both wheels at the documented defaults', () => {
    expect(defaultWheelPhysics()).toEqual({
      mod: { ...DEFAULT_PHYSICS },
      pitch: { ...DEFAULT_PHYSICS },
    })
  })

  it('returns a fresh object each call (no shared mutable state)', () => {
    const a = defaultWheelPhysics()
    const b = defaultWheelPhysics()
    expect(a).not.toBe(b)
    expect(a.mod).not.toBe(b.mod)
  })
})

describe('wheelPhysicsStore — round trip', () => {
  it('saves and loads custom physics for both wheels', () => {
    const physics = {
      mod: { mass: 2, spring: 30, damping: 0.5 },
      pitch: { mass: 0.5, spring: 10, damping: 0.8 },
    }
    expect(saveWheelPhysics(physics)).toBe(true)
    expect(loadWheelPhysics()).toEqual(physics)
  })

  it('persists under the synth-d:wheel-physics key', () => {
    saveWheelPhysics(defaultWheelPhysics())
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })
})

describe('wheelPhysicsStore — fallback on missing/partial/corrupt data', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadWheelPhysics()).toEqual(defaultWheelPhysics())
  })

  it('fills in per-field defaults when a field is missing', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mod: { mass: 3 } }))
    const loaded = loadWheelPhysics()
    expect(loaded.mod.mass).toBe(3)
    expect(loaded.mod.spring).toBe(DEFAULT_PHYSICS.spring)
    expect(loaded.mod.damping).toBe(DEFAULT_PHYSICS.damping)
    expect(loaded.pitch).toEqual(DEFAULT_PHYSICS)
  })

  it('falls back when a field is out of range', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mod: { mass: 999, spring: 0, damping: 5 }, pitch: {} })
    )
    const loaded = loadWheelPhysics()
    expect(loaded.mod.mass).toBe(DEFAULT_PHYSICS.mass)
    expect(loaded.mod.spring).toBe(DEFAULT_PHYSICS.spring)
    expect(loaded.mod.damping).toBe(DEFAULT_PHYSICS.damping)
  })

  it('falls back when a field is non-finite (NaN serializes to null)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mod: { mass: null } }))
    expect(loadWheelPhysics().mod.mass).toBe(DEFAULT_PHYSICS.mass)
  })

  it('does not throw on corrupt JSON, returning defaults', () => {
    localStorage.setItem(STORAGE_KEY, '{ not valid json')
    expect(() => loadWheelPhysics()).not.toThrow()
    expect(loadWheelPhysics()).toEqual(defaultWheelPhysics())
  })

  it('accepts boundary values exactly at min and max', () => {
    saveWheelPhysics({
      mod: { mass: 0.05, spring: 1, damping: 0.05 },
      pitch: { mass: 5, spring: 70, damping: 1 },
    })
    const loaded = loadWheelPhysics()
    expect(loaded.mod).toEqual({ mass: 0.05, spring: 1, damping: 0.05 })
    expect(loaded.pitch).toEqual({ mass: 5, spring: 70, damping: 1 })
  })
})

describe('wheelPhysicsStore — save return value', () => {
  it('returns true when the write succeeds', () => {
    expect(saveWheelPhysics(defaultWheelPhysics())).toBe(true)
  })

  it('only writes in-range values (a non-object wheel becomes all defaults)', () => {
    // @ts-expect-error deliberately malformed input
    saveWheelPhysics({ mod: 42, pitch: null })
    const loaded = loadWheelPhysics()
    expect(loaded.mod).toEqual(DEFAULT_PHYSICS)
    expect(loaded.pitch).toEqual(DEFAULT_PHYSICS)
  })

  it('clamps out-of-range numbers to defaults before writing, incl. non-finite', () => {
    saveWheelPhysics({
      mod: { mass: Infinity, spring: 0.5, damping: 0.3 },
      pitch: { mass: 1, spring: 20, damping: 2 },
    })
    const loaded = loadWheelPhysics()
    // mass Infinity → default; spring 0.5 (< min 1) → default; damping 0.3 ok.
    expect(loaded.mod).toEqual({
      mass: DEFAULT_PHYSICS.mass,
      spring: DEFAULT_PHYSICS.spring,
      damping: 0.3,
    })
    // pitch damping 2 (> max 1) → default; rest ok.
    expect(loaded.pitch).toEqual({ mass: 1, spring: 20, damping: DEFAULT_PHYSICS.damping })
  })
})

describe('wheelPhysicsStore — per-field range boundaries', () => {
  it('rejects a value just below min and just above max for each field', () => {
    saveWheelPhysics({
      mod: { mass: 0.05 - 0.0001, spring: 1 - 0.0001, damping: 0.05 - 0.0001 },
      pitch: { mass: 5 + 0.0001, spring: 70 + 0.0001, damping: 1 + 0.0001 },
    })
    expect(loadWheelPhysics().mod).toEqual(DEFAULT_PHYSICS)
    expect(loadWheelPhysics().pitch).toEqual(DEFAULT_PHYSICS)
  })

  it('rejects a non-number field (string) in favour of the default', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mod: { mass: '3' } }))
    expect(loadWheelPhysics().mod.mass).toBe(DEFAULT_PHYSICS.mass)
  })

  it('treats a non-object top-level payload as absent', () => {
    localStorage.setItem(STORAGE_KEY, '42')
    expect(loadWheelPhysics()).toEqual(defaultWheelPhysics())
  })

  it('treats a stored JSON null as absent without throwing', () => {
    // `typeof null === 'object'` but null is falsy — the guard must reject it
    // rather than dereference `null.mod`.
    localStorage.setItem(STORAGE_KEY, 'null')
    expect(() => loadWheelPhysics()).not.toThrow()
    expect(loadWheelPhysics()).toEqual(defaultWheelPhysics())
  })
})

describe('wheelPhysicsStore — key and defensive inputs', () => {
  it('uses the synth-d:wheel-physics storage key', () => {
    expect(STORAGE_KEY).toBe('synth-d:wheel-physics')
  })

  it('saving with no argument falls back to defaults without throwing', () => {
    expect(() => saveWheelPhysics()).not.toThrow()
    expect(loadWheelPhysics()).toEqual(defaultWheelPhysics())
  })

  it('saving an explicit null falls back to defaults without throwing', () => {
    // @ts-expect-error deliberately malformed input
    expect(() => saveWheelPhysics(null)).not.toThrow()
    expect(loadWheelPhysics()).toEqual(defaultWheelPhysics())
  })
})

describe('wheelPhysicsStore — localStorage unavailable', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loadWheelPhysics returns defaults when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    expect(loadWheelPhysics()).toEqual(defaultWheelPhysics())
  })

  it('saveWheelPhysics returns false when setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(saveWheelPhysics(defaultWheelPhysics())).toBe(false)
  })
})

describe('wheelPhysicsStore — reset', () => {
  it('overwrites stored physics with defaults and returns them', () => {
    saveWheelPhysics({
      mod: { mass: 2, spring: 30, damping: 0.5 },
      pitch: { mass: 2, spring: 30, damping: 0.5 },
    })
    const result = resetWheelPhysics()
    expect(result).toEqual(defaultWheelPhysics())
    expect(loadWheelPhysics()).toEqual(defaultWheelPhysics())
  })
})

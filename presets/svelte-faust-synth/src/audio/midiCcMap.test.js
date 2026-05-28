import { describe, it, expect, beforeEach } from 'vitest'
import { MidiCcMap } from './midiCcMap.js'

// Minimal localStorage mock
function makeStorage() {
  const store = /** @type {Record<string, string>} */ ({})
  return {
    getItem: (/** @type {string} */ k) => store[k] ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => {
      store[k] = String(v)
    },
    removeItem: (/** @type {string} */ k) => {
      delete store[k]
    },
    get length() {
      return Object.keys(store).length
    },
    key: (/** @type {number} */ i) => Object.keys(store)[i] ?? null,
    _store: store,
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeStorage(),
    configurable: true,
    writable: true,
  })
})

describe('MidiCcMap — assign and resolve', () => {
  it('resolve returns null for unregistered CC', () => {
    const map = new MidiCcMap()
    expect(map.resolve(74)).toBeNull()
  })

  it('resolve returns mapping after assign', () => {
    const map = new MidiCcMap()
    map.assign(74, 'cutoff', 20, 20000)
    expect(map.resolve(74)).toEqual({ param: 'cutoff', min: 20, max: 20000 })
  })

  it('getAssignedCc returns null for unmapped param', () => {
    const map = new MidiCcMap()
    expect(map.getAssignedCc('cutoff')).toBeNull()
  })

  it('getAssignedCc returns CC number after assign', () => {
    const map = new MidiCcMap()
    map.assign(74, 'cutoff', 20, 20000)
    expect(map.getAssignedCc('cutoff')).toBe(74)
  })
})

describe('MidiCcMap — overwrite', () => {
  it('reassigning same param removes old CC mapping', () => {
    const map = new MidiCcMap()
    map.assign(74, 'cutoff', 20, 20000)
    map.assign(71, 'cutoff', 20, 20000)
    expect(map.resolve(74)).toBeNull()
    expect(map.resolve(71)).toEqual({ param: 'cutoff', min: 20, max: 20000 })
    expect(map.getAssignedCc('cutoff')).toBe(71)
  })
})

describe('MidiCcMap — scale', () => {
  it('scales CC 0 to min', () => {
    const map = new MidiCcMap()
    map.assign(74, 'cutoff', 20, 20000)
    expect(map.scale(74, 0)).toBeCloseTo(20, 5)
  })

  it('scales CC 127 to max', () => {
    const map = new MidiCcMap()
    map.assign(74, 'cutoff', 20, 20000)
    expect(map.scale(74, 127)).toBeCloseTo(20000, 5)
  })

  it('returns null for unmapped CC', () => {
    const map = new MidiCcMap()
    expect(map.scale(74, 64)).toBeNull()
  })
})

describe('MidiCcMap — localStorage persistence', () => {
  it('persists mapping to localStorage on assign', () => {
    const map = new MidiCcMap()
    map.assign(74, 'cutoff', 20, 20000)
    const raw = localStorage.getItem('midiCc:74')
    expect(JSON.parse(/** @type {string} */ (raw))).toEqual({
      param: 'cutoff',
      min: 20,
      max: 20000,
    })
  })

  it('loads mappings from localStorage on construction', () => {
    localStorage.setItem('midiCc:74', JSON.stringify({ param: 'cutoff', min: 20, max: 20000 }))
    const map = new MidiCcMap()
    expect(map.resolve(74)).toEqual({ param: 'cutoff', min: 20, max: 20000 })
    expect(map.getAssignedCc('cutoff')).toBe(74)
  })

  it('removes old CC key from localStorage on overwrite', () => {
    const map = new MidiCcMap()
    map.assign(74, 'cutoff', 20, 20000)
    map.assign(71, 'cutoff', 20, 20000)
    expect(localStorage.getItem('midiCc:74')).toBeNull()
    expect(localStorage.getItem('midiCc:71')).not.toBeNull()
  })
})

describe('MidiCcMap — reverbMix → reverbSend load-time translation', () => {
  // The rename table is now injected by the caller (the instrument owns it via
  // param-schema.js, design.md D4); these tests pass it explicitly.
  const RENAMES = { reverbMix: 'reverbSend' }

  it('stored reverbMix entry resolves as reverbSend in memory', () => {
    localStorage.setItem('midiCc:42', JSON.stringify({ param: 'reverbMix', min: 0, max: 1 }))
    const map = new MidiCcMap(RENAMES)
    expect(map.resolve(42)).toEqual({ param: 'reverbSend', min: 0, max: 1 })
    expect(map.getAssignedCc('reverbSend')).toBe(42)
    expect(map.getAssignedCc('reverbMix')).toBeNull()
  })

  it('translation does not rewrite the localStorage entry', () => {
    localStorage.setItem('midiCc:42', JSON.stringify({ param: 'reverbMix', min: 0, max: 1 }))
    new MidiCcMap(RENAMES)
    const raw = localStorage.getItem('midiCc:42')
    expect(JSON.parse(/** @type {string} */ (raw))).toEqual({
      param: 'reverbMix',
      min: 0,
      max: 1,
    })
  })

  it('stored reverbSend entry loads unchanged', () => {
    localStorage.setItem('midiCc:42', JSON.stringify({ param: 'reverbSend', min: 0, max: 1 }))
    const map = new MidiCcMap(RENAMES)
    expect(map.resolve(42)).toEqual({ param: 'reverbSend', min: 0, max: 1 })
    expect(map.getAssignedCc('reverbSend')).toBe(42)
  })

  it('canonical reverbSend entry wins over stale reverbMix on the same param', () => {
    // User assigned reverbMix to CC 42 before the rename, then assigned
    // reverbSend to CC 71 after the rename. Both keys persist in storage.
    localStorage.setItem('midiCc:42', JSON.stringify({ param: 'reverbMix', min: 0, max: 1 }))
    localStorage.setItem('midiCc:71', JSON.stringify({ param: 'reverbSend', min: 0, max: 1 }))
    const map = new MidiCcMap(RENAMES)
    expect(map.getAssignedCc('reverbSend')).toBe(71)
    expect(map.resolve(71)).toEqual({ param: 'reverbSend', min: 0, max: 1 })
    // The stale reverbMix entry must not shadow the canonical one in #byCC.
    expect(map.resolve(42)).toBeNull()
  })
})

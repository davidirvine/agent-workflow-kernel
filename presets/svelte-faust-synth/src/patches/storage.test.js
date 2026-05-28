import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  listPatches,
  savePatch,
  loadPatch,
  deletePatch,
  renamePatch,
  validateName,
  PATCH_VERSION,
  MAX_NAME_LENGTH,
} from './storage.js'
import { PARAM_DEFAULTS } from '../state/synth.svelte.js'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('storage — name validation', () => {
  it('trims surrounding whitespace', () => {
    expect(validateName('  LEAD  ')).toBe('LEAD')
  })

  it('upper-cases the name (patch names are always all caps)', () => {
    expect(validateName('lead')).toBe('LEAD')
    expect(validateName('  MixEd cAse  ')).toBe('MIXED CASE')
  })

  it('rejects empty and whitespace-only names', () => {
    expect(validateName('')).toBeNull()
    expect(validateName('   ')).toBeNull()
    expect(validateName(undefined)).toBeNull()
    expect(validateName(null)).toBeNull()
  })

  it('caps the name length', () => {
    const long = 'x'.repeat(MAX_NAME_LENGTH + 20)
    expect(validateName(long)).toHaveLength(MAX_NAME_LENGTH)
  })

  it('savePatch rejects an invalid name without creating a patch', () => {
    expect(savePatch('   ', PARAM_DEFAULTS)).toEqual({ ok: false, error: 'invalid-name' })
    expect(listPatches()).toEqual([])
  })
})

describe('storage — round-trip', () => {
  it('save → list → load → delete', () => {
    const params = { ...PARAM_DEFAULTS, cutoff: 8000, osc1Wave: 3 }
    const res = savePatch('LEAD', params)
    expect(res).toEqual({ ok: true, name: 'LEAD' })

    expect(listPatches()).toEqual(['LEAD'])

    const loaded = loadPatch('LEAD')
    expect(loaded?.name).toBe('LEAD')
    expect(loaded?.version).toBe(PATCH_VERSION)
    expect(loaded?.params.cutoff).toBe(8000)
    expect(loaded?.params.osc1Wave).toBe(3)

    expect(deletePatch('LEAD')).toBe(true)
    expect(listPatches()).toEqual([])
    expect(loadPatch('LEAD')).toBeNull()
  })

  it('save trims the name before using it as the slot key', () => {
    savePatch('  PAD  ', PARAM_DEFAULTS)
    expect(listPatches()).toEqual(['PAD'])
    expect(loadPatch('PAD')).not.toBeNull()
    // The trimmed name resolves the same slot.
    expect(loadPatch('  PAD  ')).not.toBeNull()
  })

  it('keeps the index consistent across multiple saves and a delete', () => {
    savePatch('A', PARAM_DEFAULTS)
    savePatch('B', PARAM_DEFAULTS)
    savePatch('C', PARAM_DEFAULTS)
    expect(listPatches()).toEqual(['A', 'B', 'C'])

    deletePatch('B')
    expect(listPatches()).toEqual(['A', 'C'])
    expect(loadPatch('B')).toBeNull()
    expect(loadPatch('A')).not.toBeNull()
    expect(loadPatch('C')).not.toBeNull()
  })

  it('overwriting an existing name does not duplicate the index entry', () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, cutoff: 1000 })
    savePatch('LEAD', { ...PARAM_DEFAULTS, cutoff: 2000 })
    expect(listPatches()).toEqual(['LEAD'])
    expect(loadPatch('LEAD')?.params.cutoff).toBe(2000)
  })
})

describe('storage — excluded params', () => {
  it('does not serialize params outside the in-scope set (e.g. modWheel)', () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, modWheel: 0.9, register: 21, notAParam: 5 })
    const loaded = loadPatch('LEAD')
    expect(loaded?.params).not.toHaveProperty('modWheel')
    expect(loaded?.params).not.toHaveProperty('register')
    expect(loaded?.params).not.toHaveProperty('notAParam')
    expect(loaded?.params).toHaveProperty('cutoff')
  })

  it('skips non-finite param values', () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, cutoff: NaN })
    const loaded = loadPatch('LEAD')
    expect(loaded?.params).not.toHaveProperty('cutoff')
  })
})

describe('storage — corrupt / missing slots', () => {
  it('a corrupt slot reads as absent', () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    localStorage.setItem('synth-d:patch:LEAD', '{ not valid json')
    expect(loadPatch('LEAD')).toBeNull()
  })

  it('a missing slot reads as absent even if named in a corrupt index', () => {
    localStorage.setItem('synth-d:patches', 'not json either')
    // Corrupt index → treated as empty.
    expect(listPatches()).toEqual([])
    expect(loadPatch('GHOST')).toBeNull()
  })
})

describe('storage — legacy name migration', () => {
  // Simulate patches saved before names were normalized to upper-case.
  function seedLegacy(/** @type {string} */ name, /** @type {object} */ params) {
    const index = JSON.parse(localStorage.getItem('synth-d:patches') ?? '[]')
    index.push(name)
    localStorage.setItem('synth-d:patches', JSON.stringify(index))
    localStorage.setItem('synth-d:patch:' + name, JSON.stringify({ name, version: 1, params }))
  }

  it('listPatches migrates legacy lower-case names to upper-case', () => {
    seedLegacy('my-sound', { cutoff: 1234 })
    expect(listPatches()).toEqual(['MY-SOUND'])
    // The slot moved to the upper-cased key with an updated envelope name.
    expect(localStorage.getItem('synth-d:patch:my-sound')).toBeNull()
    expect(loadPatch('MY-SOUND')?.params.cutoff).toBe(1234)
    const env = JSON.parse(/** @type {string} */ (localStorage.getItem('synth-d:patch:MY-SOUND')))
    expect(env.name).toBe('MY-SOUND')
  })

  it('a legacy patch becomes deletable after listing (the reported bug)', () => {
    seedLegacy('first', PARAM_DEFAULTS)
    expect(listPatches()).toEqual(['FIRST'])
    expect(deletePatch('FIRST')).toBe(true)
    expect(listPatches()).toEqual([])
  })

  it('migration is idempotent and order-preserving for mixed legacy/canonical', () => {
    savePatch('ALPHA', PARAM_DEFAULTS) // already upper-case
    seedLegacy('beta', PARAM_DEFAULTS)
    expect(listPatches()).toEqual(['ALPHA', 'BETA'])
    expect(listPatches()).toEqual(['ALPHA', 'BETA'])
  })

  it('de-duplicates when a legacy name and its upper-case twin both exist', () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, cutoff: 2000 })
    seedLegacy('lead', { cutoff: 1000 })
    // Canonical 'LEAD' already claimed; the legacy 'lead' slot is dropped.
    expect(listPatches()).toEqual(['LEAD'])
    expect(loadPatch('LEAD')?.params.cutoff).toBe(2000)
    expect(localStorage.getItem('synth-d:patch:lead')).toBeNull()
  })
})

describe('storage — renamePatch', () => {
  it('renames to a new name: listed and loadable under the new name only', () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, cutoff: 8000 })
    savePatch('PAD', PARAM_DEFAULTS)
    const res = renamePatch('LEAD', 'LEAD2')
    expect(res).toEqual({ ok: true, name: 'LEAD2' })
    // Order preserved: 'LEAD' position now holds 'LEAD2'.
    expect(listPatches()).toEqual(['LEAD2', 'PAD'])
    expect(loadPatch('LEAD')).toBeNull()
    expect(loadPatch('LEAD2')?.params.cutoff).toBe(8000)
  })

  it('updates the stored envelope name', () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    renamePatch('LEAD', 'LEAD2')
    const env = JSON.parse(/** @type {string} */ (localStorage.getItem('synth-d:patch:LEAD2')))
    expect(env.name).toBe('LEAD2')
  })

  it('trims the new name', () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    expect(renamePatch('LEAD', '  LEAD2  ')).toEqual({ ok: true, name: 'LEAD2' })
    expect(listPatches()).toEqual(['LEAD2'])
  })

  it('a no-op rename (same name) succeeds and changes nothing', () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    expect(renamePatch('LEAD', 'LEAD')).toEqual({ ok: true, name: 'LEAD' })
    expect(listPatches()).toEqual(['LEAD'])
    expect(loadPatch('LEAD')).not.toBeNull()
  })

  it('rejects an invalid new name', () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    expect(renamePatch('LEAD', '   ')).toEqual({ ok: false, error: 'invalid-name' })
    expect(listPatches()).toEqual(['LEAD'])
  })

  it('returns not-found when the source patch is missing', () => {
    expect(renamePatch('GHOST', 'whatever')).toEqual({ ok: false, error: 'not-found' })
  })

  it('renaming onto a different existing name overwrites it (no duplicate index entry)', () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, cutoff: 8000 })
    savePatch('PAD', { ...PARAM_DEFAULTS, cutoff: 1000 })
    const res = renamePatch('LEAD', 'PAD')
    expect(res).toEqual({ ok: true, name: 'PAD' })
    expect(listPatches()).toEqual(['PAD'])
    // 'PAD' now holds LEAD's params.
    expect(loadPatch('PAD')?.params.cutoff).toBe(8000)
    expect(loadPatch('LEAD')).toBeNull()
  })

  it('leaves everything intact when the index write fails', () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const realSet = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'synth-d:patches') throw new DOMException('quota', 'QuotaExceededError')
      return realSet.call(this, key, value)
    })
    expect(renamePatch('LEAD', 'LEAD2')).toEqual({ ok: false, error: 'storage-unavailable' })
    vi.restoreAllMocks()
    expect(localStorage.getItem('synth-d:patch:LEAD2')).toBeNull()
    expect(listPatches()).toEqual(['LEAD'])
    expect(loadPatch('LEAD')).not.toBeNull()
  })

  it('does not destroy the overwritten target when the slot write fails', () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, cutoff: 8000 })
    savePatch('PAD', { ...PARAM_DEFAULTS, cutoff: 1000 })
    const realSet = Storage.prototype.setItem
    // Allow the index write but fail the destination slot write.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'synth-d:patch:PAD') throw new DOMException('quota', 'QuotaExceededError')
      return realSet.call(this, key, value)
    })
    expect(renamePatch('LEAD', 'PAD')).toEqual({ ok: false, error: 'storage-unavailable' })
    vi.restoreAllMocks()
    // Index restored and both patches intact with their original data.
    expect(listPatches()).toEqual(['LEAD', 'PAD'])
    expect(loadPatch('LEAD')?.params.cutoff).toBe(8000)
    expect(loadPatch('PAD')?.params.cutoff).toBe(1000)
  })
})

describe('storage — invalid names on load/delete', () => {
  it('loadPatch returns null for an invalid name', () => {
    expect(loadPatch('   ')).toBeNull()
    expect(loadPatch('')).toBeNull()
  })

  it('deletePatch returns false for an invalid name and true for a valid one', () => {
    expect(deletePatch('   ')).toBe(false)
    savePatch('LEAD', PARAM_DEFAULTS)
    expect(deletePatch('LEAD')).toBe(true)
  })
})

describe('storage — malformed slot envelopes read as absent', () => {
  it.each([
    ['a bare number', '123'],
    ['a JSON array', '[]'],
    ['null', 'null'],
    ['an object without params', '{"name":"x","version":1}'],
    ['an object whose params is null', '{"params":null}'],
    ['an object whose params is a string', '{"params":"nope"}'],
  ])('returns null when the slot is %s', (_desc, raw) => {
    localStorage.setItem('synth-d:patch:LEAD', raw)
    expect(loadPatch('LEAD')).toBeNull()
  })
})

describe('storage — index integrity', () => {
  it('listPatches drops non-string index entries', () => {
    localStorage.setItem('synth-d:patches', JSON.stringify(['A', 5, null, 'B', { x: 1 }]))
    expect(listPatches()).toEqual(['A', 'B'])
  })
})

describe('storage — exact serialized slot contents', () => {
  it('the stored slot contains only the provided in-scope finite params', () => {
    // Pass a PARTIAL params object with one extra key and one non-finite value.
    savePatch('LEAD', { cutoff: 500, masterVol: NaN, modWheel: 0.9 })
    const env = JSON.parse(/** @type {string} */ (localStorage.getItem('synth-d:patch:LEAD')))
    expect(env.params).toEqual({ cutoff: 500 })
    expect(env.name).toBe('LEAD')
    expect(env.version).toBe(PATCH_VERSION)
  })
})

describe('storage — load returns exactly the stored in-scope params', () => {
  it('does not PAD the result with absent param names', () => {
    localStorage.setItem(
      'synth-d:patch:PARTIAL',
      JSON.stringify({ name: 'PARTIAL', version: 1, params: { cutoff: 100, osc1Wave: 2 } })
    )
    const loaded = loadPatch('PARTIAL')
    expect(loaded?.params).toEqual({ cutoff: 100, osc1Wave: 2 })
  })

  it('drops non-finite values present in a stored slot', () => {
    localStorage.setItem(
      'synth-d:patch:WEIRD',
      JSON.stringify({ name: 'WEIRD', version: 1, params: { cutoff: 100, resonance: null } })
    )
    expect(loadPatch('WEIRD')?.params).toEqual({ cutoff: 100 })
  })
})

describe('storage — envelope version', () => {
  it('preserves a numeric version and falls back to PATCH_VERSION otherwise', () => {
    localStorage.setItem(
      'synth-d:patch:NUMBERED',
      JSON.stringify({ name: 'NUMBERED', version: 7, params: { cutoff: 100 } })
    )
    expect(loadPatch('NUMBERED')?.version).toBe(7)

    localStorage.setItem(
      'synth-d:patch:STRINGY',
      JSON.stringify({ name: 'STRINGY', version: 'v2', params: { cutoff: 100 } })
    )
    expect(loadPatch('STRINGY')?.version).toBe(PATCH_VERSION)
  })
})

describe('storage — failures are non-fatal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('savePatch reports storage-unavailable instead of throwing when setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => savePatch('LEAD', PARAM_DEFAULTS)).not.toThrow()
    expect(savePatch('LEAD', PARAM_DEFAULTS)).toEqual({ ok: false, error: 'storage-unavailable' })
  })

  it('rolls back the slot when the index write fails (no orphaned slot)', () => {
    const realSet = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'synth-d:patches') throw new DOMException('quota', 'QuotaExceededError')
      return realSet.call(this, key, value)
    })
    const res = savePatch('LEAD', PARAM_DEFAULTS)
    expect(res).toEqual({ ok: false, error: 'storage-unavailable' })
    vi.restoreAllMocks()
    // The slot must not linger unreferenced by the index.
    expect(localStorage.getItem('synth-d:patch:LEAD')).toBeNull()
    expect(listPatches()).toEqual([])
  })

  it('listPatches returns [] instead of throwing when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    expect(() => listPatches()).not.toThrow()
    expect(listPatches()).toEqual([])
  })

  it('loadPatch returns null instead of throwing when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    expect(() => loadPatch('LEAD')).not.toThrow()
    expect(loadPatch('LEAD')).toBeNull()
  })

  it('deletePatch returns false and keeps the patch when the index write fails', () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const realSet = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'synth-d:patches') throw new DOMException('quota', 'QuotaExceededError')
      return realSet.call(this, key, value)
    })
    expect(deletePatch('LEAD')).toBe(false)
    vi.restoreAllMocks()
    // The patch must remain fully intact (no phantom index/orphaned slot).
    expect(listPatches()).toEqual(['LEAD'])
    expect(loadPatch('LEAD')).not.toBeNull()
  })

  it('deletePatch does not throw when removeItem throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    expect(() => deletePatch('LEAD')).not.toThrow()
  })
})

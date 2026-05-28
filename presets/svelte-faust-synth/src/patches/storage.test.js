import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPatchStorage, validateName, PATCH_VERSION, MAX_NAME_LENGTH } from './storage.js'
import { PARAM_DEFAULTS } from '../state/synth.svelte.js'

// The chassis carries no donor-identity literal in storage.js (D4): the
// namespace is constructor-injected. These tests use `test:` as their explicit
// namespace, exercising the same code paths a downstream app's
// `<app-namespace>:` would. Every key assertion is computed from the namespace
// constants so the test prose is single-sourced from `storage._indexKey` and
// `storage._slotPrefix`.
const TEST_NAMESPACE = 'test:'

/** @type {ReturnType<typeof createPatchStorage>} */
let storage
let listPatches
let savePatch
let loadPatch
let deletePatch
let renamePatch
/** @type {string} */
let INDEX_KEY
/** @type {string} */
let SLOT_PREFIX

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  storage = createPatchStorage(TEST_NAMESPACE)
  listPatches = storage.listPatches
  savePatch = storage.savePatch
  loadPatch = storage.loadPatch
  deletePatch = storage.deletePatch
  renamePatch = storage.renamePatch
  INDEX_KEY = storage._indexKey
  SLOT_PREFIX = storage._slotPrefix
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

describe('storage — namespace is constructor-injected', () => {
  it('exposes the index/slot keys computed from the constructed namespace', () => {
    expect(INDEX_KEY).toBe(TEST_NAMESPACE + 'patches')
    expect(SLOT_PREFIX).toBe(TEST_NAMESPACE + 'patch:')
  })

  it('writes the index under <namespace>patches', () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    expect(localStorage.getItem(INDEX_KEY)).toBe(JSON.stringify(['LEAD']))
  })

  it('writes slots under <namespace>patch:<name>', () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    expect(localStorage.getItem(SLOT_PREFIX + 'LEAD')).not.toBeNull()
  })

  it('two stores with different namespaces do not see each other', () => {
    const otherStorage = createPatchStorage('other:')
    savePatch('LEAD', PARAM_DEFAULTS)
    expect(otherStorage.listPatches()).toEqual([])
    expect(otherStorage.loadPatch('LEAD')).toBeNull()
  })
})

describe('storage — round-trip', () => {
  it('save → list → load → delete', () => {
    const params = { ...PARAM_DEFAULTS, frequency: 1500, waveform: 2 }
    const res = savePatch('LEAD', params)
    expect(res).toEqual({ ok: true, name: 'LEAD' })

    expect(listPatches()).toEqual(['LEAD'])

    const loaded = loadPatch('LEAD')
    expect(loaded?.name).toBe('LEAD')
    expect(loaded?.version).toBe(PATCH_VERSION)
    expect(loaded?.params.frequency).toBe(1500)
    expect(loaded?.params.waveform).toBe(2)

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
    savePatch('LEAD', { ...PARAM_DEFAULTS, frequency: 500 })
    savePatch('LEAD', { ...PARAM_DEFAULTS, frequency: 1000 })
    expect(listPatches()).toEqual(['LEAD'])
    expect(loadPatch('LEAD')?.params.frequency).toBe(1000)
  })
})

describe('storage — excluded params', () => {
  it('does not serialize params outside the in-scope set (e.g. modWheel)', () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, modWheel: 0.9, register: 21, notAParam: 5 })
    const loaded = loadPatch('LEAD')
    expect(loaded?.params).not.toHaveProperty('modWheel')
    expect(loaded?.params).not.toHaveProperty('register')
    expect(loaded?.params).not.toHaveProperty('notAParam')
    expect(loaded?.params).toHaveProperty('frequency')
  })

  it('skips non-finite param values', () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, frequency: NaN })
    const loaded = loadPatch('LEAD')
    expect(loaded?.params).not.toHaveProperty('frequency')
  })
})

describe('storage — corrupt / missing slots', () => {
  it('a corrupt slot reads as absent', () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    localStorage.setItem(SLOT_PREFIX + 'LEAD', '{ not valid json')
    expect(loadPatch('LEAD')).toBeNull()
  })

  it('a missing slot reads as absent even if named in a corrupt index', () => {
    localStorage.setItem(INDEX_KEY, 'not json either')
    // Corrupt index → treated as empty.
    expect(listPatches()).toEqual([])
    expect(loadPatch('GHOST')).toBeNull()
  })
})

describe('storage — legacy name migration', () => {
  // Simulate patches saved before names were normalized to upper-case.
  function seedLegacy(/** @type {string} */ name, /** @type {object} */ params) {
    const index = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]')
    index.push(name)
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
    localStorage.setItem(SLOT_PREFIX + name, JSON.stringify({ name, version: 1, params }))
  }

  it('listPatches migrates legacy lower-case names to upper-case', () => {
    seedLegacy('my-sound', { frequency: 1234 })
    expect(listPatches()).toEqual(['MY-SOUND'])
    // The slot moved to the upper-cased key with an updated envelope name.
    expect(localStorage.getItem(SLOT_PREFIX + 'my-sound')).toBeNull()
    expect(loadPatch('MY-SOUND')?.params.frequency).toBe(1234)
    const env = JSON.parse(/** @type {string} */ (localStorage.getItem(SLOT_PREFIX + 'MY-SOUND')))
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
    savePatch('LEAD', { ...PARAM_DEFAULTS, frequency: 1000 })
    seedLegacy('lead', { frequency: 500 })
    // Canonical 'LEAD' already claimed; the legacy 'lead' slot is dropped.
    expect(listPatches()).toEqual(['LEAD'])
    expect(loadPatch('LEAD')?.params.frequency).toBe(1000)
    expect(localStorage.getItem(SLOT_PREFIX + 'lead')).toBeNull()
  })
})

describe('storage — renamePatch', () => {
  it('renames to a new name: listed and loadable under the new name only', () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, frequency: 1500 })
    savePatch('PAD', PARAM_DEFAULTS)
    const res = renamePatch('LEAD', 'LEAD2')
    expect(res).toEqual({ ok: true, name: 'LEAD2' })
    // Order preserved: 'LEAD' position now holds 'LEAD2'.
    expect(listPatches()).toEqual(['LEAD2', 'PAD'])
    expect(loadPatch('LEAD')).toBeNull()
    expect(loadPatch('LEAD2')?.params.frequency).toBe(1500)
  })

  it('updates the stored envelope name', () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    renamePatch('LEAD', 'LEAD2')
    const env = JSON.parse(/** @type {string} */ (localStorage.getItem(SLOT_PREFIX + 'LEAD2')))
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
    savePatch('LEAD', { ...PARAM_DEFAULTS, frequency: 1500 })
    savePatch('PAD', { ...PARAM_DEFAULTS, frequency: 500 })
    const res = renamePatch('LEAD', 'PAD')
    expect(res).toEqual({ ok: true, name: 'PAD' })
    expect(listPatches()).toEqual(['PAD'])
    // 'PAD' now holds LEAD's params.
    expect(loadPatch('PAD')?.params.frequency).toBe(1500)
    expect(loadPatch('LEAD')).toBeNull()
  })

  it('leaves everything intact when the index write fails', () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const realSet = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === INDEX_KEY) throw new DOMException('quota', 'QuotaExceededError')
      return realSet.call(this, key, value)
    })
    expect(renamePatch('LEAD', 'LEAD2')).toEqual({ ok: false, error: 'storage-unavailable' })
    vi.restoreAllMocks()
    expect(localStorage.getItem(SLOT_PREFIX + 'LEAD2')).toBeNull()
    expect(listPatches()).toEqual(['LEAD'])
    expect(loadPatch('LEAD')).not.toBeNull()
  })

  it('does not destroy the overwritten target when the slot write fails', () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, frequency: 1500 })
    savePatch('PAD', { ...PARAM_DEFAULTS, frequency: 500 })
    const realSet = Storage.prototype.setItem
    // Allow the index write but fail the destination slot write.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === SLOT_PREFIX + 'PAD') throw new DOMException('quota', 'QuotaExceededError')
      return realSet.call(this, key, value)
    })
    expect(renamePatch('LEAD', 'PAD')).toEqual({ ok: false, error: 'storage-unavailable' })
    vi.restoreAllMocks()
    // Index restored and both patches intact with their original data.
    expect(listPatches()).toEqual(['LEAD', 'PAD'])
    expect(loadPatch('LEAD')?.params.frequency).toBe(1500)
    expect(loadPatch('PAD')?.params.frequency).toBe(500)
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
    localStorage.setItem(SLOT_PREFIX + 'LEAD', raw)
    expect(loadPatch('LEAD')).toBeNull()
  })
})

describe('storage — index integrity', () => {
  it('listPatches drops non-string index entries', () => {
    localStorage.setItem(INDEX_KEY, JSON.stringify(['A', 5, null, 'B', { x: 1 }]))
    expect(listPatches()).toEqual(['A', 'B'])
  })
})

describe('storage — exact serialized slot contents', () => {
  it('the stored slot contains only the provided in-scope finite params', () => {
    // Pass a PARTIAL params object with one extra key and one non-finite value.
    savePatch('LEAD', { frequency: 500, waveform: NaN, modWheel: 0.9 })
    const env = JSON.parse(/** @type {string} */ (localStorage.getItem(SLOT_PREFIX + 'LEAD')))
    expect(env.params).toEqual({ frequency: 500 })
    expect(env.name).toBe('LEAD')
    expect(env.version).toBe(PATCH_VERSION)
  })
})

describe('storage — load returns exactly the stored in-scope params', () => {
  it('does not PAD the result with absent param names', () => {
    localStorage.setItem(
      SLOT_PREFIX + 'PARTIAL',
      JSON.stringify({ name: 'PARTIAL', version: 1, params: { frequency: 100, waveform: 2 } })
    )
    const loaded = loadPatch('PARTIAL')
    expect(loaded?.params).toEqual({ frequency: 100, waveform: 2 })
  })

  it('drops non-finite values present in a stored slot', () => {
    localStorage.setItem(
      SLOT_PREFIX + 'WEIRD',
      JSON.stringify({ name: 'WEIRD', version: 1, params: { frequency: 100, waveform: null } })
    )
    expect(loadPatch('WEIRD')?.params).toEqual({ frequency: 100 })
  })
})

describe('storage — envelope version', () => {
  it('preserves a numeric version and falls back to PATCH_VERSION otherwise', () => {
    localStorage.setItem(
      SLOT_PREFIX + 'NUMBERED',
      JSON.stringify({ name: 'NUMBERED', version: 7, params: { frequency: 100 } })
    )
    expect(loadPatch('NUMBERED')?.version).toBe(7)

    localStorage.setItem(
      SLOT_PREFIX + 'STRINGY',
      JSON.stringify({ name: 'STRINGY', version: 'v2', params: { frequency: 100 } })
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
      if (key === INDEX_KEY) throw new DOMException('quota', 'QuotaExceededError')
      return realSet.call(this, key, value)
    })
    const res = savePatch('LEAD', PARAM_DEFAULTS)
    expect(res).toEqual({ ok: false, error: 'storage-unavailable' })
    vi.restoreAllMocks()
    // The slot must not linger unreferenced by the index.
    expect(localStorage.getItem(SLOT_PREFIX + 'LEAD')).toBeNull()
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
      if (key === INDEX_KEY) throw new DOMException('quota', 'QuotaExceededError')
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

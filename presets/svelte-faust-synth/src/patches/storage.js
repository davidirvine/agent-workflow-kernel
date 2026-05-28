// Patch persistence: named-slot localStorage CRUD for synth patches.
//
// Layout (all under the `synth-d:` namespace):
//   - `synth-d:patches`        → JSON array of patch names (the index/authority
//                                for what exists; a stray slot key cannot create
//                                a phantom entry).
//   - `synth-d:patch:<name>`   → JSON envelope `{ name, version, params }`.
//
// Every localStorage access is wrapped so an unavailable store (private mode),
// a quota error, or corrupt JSON is handled as a non-fatal failure — a missing
// or corrupt slot reads as absent, and a failed write reports an error rather
// than throwing into the audio/UI.

import { PARAM_NAMES } from '../state/synth.svelte.js'

const NS = 'synth-d:'
const INDEX_KEY = NS + 'patches'
const SLOT_PREFIX = NS + 'patch:'

/** Patch envelope schema version (bump when the persisted shape changes). */
export const PATCH_VERSION = 1

/** Maximum patch-name length (longer names are capped). */
export const MAX_NAME_LENGTH = 24

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

/** @param {string} key */
function safeRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* localStorage unavailable — nothing to remove */
  }
}

/**
 * Validate and normalize a patch name: trim surrounding whitespace, reject
 * empty/whitespace-only, upper-case it (patch names are always all caps), and
 * cap the length. Returns the cleaned name, or null if invalid. A name that
 * collides with an existing patch is NOT an error here — the caller routes that
 * through an overwrite confirmation. Upper-casing also means names that differ
 * only by case resolve to the same patch.
 * @param {unknown} name
 * @returns {string | null}
 */
export function validateName(name) {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (trimmed.length === 0) return null
  return trimmed.toUpperCase().slice(0, MAX_NAME_LENGTH)
}

/** @returns {string[]} */
function readIndex() {
  const raw = safeGet(INDEX_KEY)
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((n) => typeof n === 'string') : []
  } catch {
    return []
  }
}

/** @param {string[]} names */
function writeIndex(names) {
  return safeSet(INDEX_KEY, JSON.stringify(names))
}

/**
 * Migrate any legacy patch whose name is not already upper-case to its
 * upper-cased name (patch names are now always all caps). Rewrites the slot
 * under the upper-cased key (updating the envelope name) and the index entry,
 * de-duplicating if an upper-cased twin already exists. Idempotent: when every
 * name is already upper-case it does nothing. Runs as part of listPatches so the
 * UI (which lists before any load/delete/rename) always operates on canonical
 * upper-case names.
 */
function migrateLegacyNames() {
  const index = readIndex()
  /** @type {string[]} */
  const nextIndex = []
  const seen = new Set()
  let changed = false

  for (const name of index) {
    const upper = name.toUpperCase()
    if (upper === name) {
      if (!seen.has(upper)) {
        nextIndex.push(name)
        seen.add(upper)
      }
      continue
    }
    // Legacy lower/mixed-case entry → move its slot to the upper-cased key.
    changed = true
    const raw = safeGet(SLOT_PREFIX + name)
    if (raw !== null && !seen.has(upper)) {
      let payload = raw
      try {
        const env = JSON.parse(raw)
        if (env && typeof env === 'object') {
          env.name = upper
          payload = JSON.stringify(env)
        }
      } catch {
        /* corrupt slot — carry the raw payload across as-is */
      }
      safeSet(SLOT_PREFIX + upper, payload)
      nextIndex.push(upper)
      seen.add(upper)
    }
    safeRemove(SLOT_PREFIX + name)
  }

  if (changed) writeIndex(nextIndex)
}

/**
 * List the names of all saved patches (the index is the authority). Legacy
 * non-upper-case names are migrated to upper-case first.
 * @returns {string[]}
 */
export function listPatches() {
  migrateLegacyNames()
  return readIndex()
}

/**
 * Save the current params as a named patch. Only in-scope params (PARAM_NAMES)
 * are serialized; anything else in `params` (e.g. modWheel) is excluded. A name
 * collision overwrites the existing slot. Storage failures are non-fatal.
 * @param {string} name
 * @param {Record<string, number>} params
 * @returns {{ ok: true, name: string } | { ok: false, error: 'invalid-name' | 'storage-unavailable' }}
 */
export function savePatch(name, params) {
  const clean = validateName(name)
  if (clean === null) return { ok: false, error: 'invalid-name' }

  /** @type {Record<string, number>} */
  const filtered = {}
  for (const p of PARAM_NAMES) {
    if (p in params && Number.isFinite(params[p])) filtered[p] = params[p]
  }

  const envelope = { name: clean, version: PATCH_VERSION, params: filtered }
  if (!safeSet(SLOT_PREFIX + clean, JSON.stringify(envelope))) {
    return { ok: false, error: 'storage-unavailable' }
  }

  const index = readIndex()
  if (!index.includes(clean)) {
    index.push(clean)
    if (!writeIndex(index)) {
      // The slot was written but the index update failed (e.g. quota). Roll back
      // the orphaned slot so it can't linger unreferenced by listPatches().
      safeRemove(SLOT_PREFIX + clean)
      return { ok: false, error: 'storage-unavailable' }
    }
  }
  return { ok: true, name: clean }
}

/**
 * Load a saved patch. Returns the envelope with params filtered to in-scope
 * names, or null if the name is invalid or the slot is missing/corrupt.
 * @param {string} name
 * @returns {{ name: string, version: number, params: Record<string, number> } | null}
 */
export function loadPatch(name) {
  const clean = validateName(name)
  if (clean === null) return null

  const raw = safeGet(SLOT_PREFIX + clean)
  if (!raw) return null

  try {
    const env = JSON.parse(raw)
    if (!env || typeof env !== 'object' || typeof env.params !== 'object' || env.params === null) {
      return null
    }
    /** @type {Record<string, number>} */
    const params = {}
    for (const p of PARAM_NAMES) {
      if (p in env.params && Number.isFinite(env.params[p])) params[p] = env.params[p]
    }
    return {
      name: clean,
      version: typeof env.version === 'number' ? env.version : PATCH_VERSION,
      params,
    }
  } catch {
    // Corrupt JSON in the slot reads as absent.
    return null
  }
}

/**
 * Delete a saved patch: remove its slot and drop it from the index.
 * @param {string} name
 * @returns {boolean} true unless the name was invalid
 */
export function deletePatch(name) {
  const clean = validateName(name)
  if (clean === null) return false

  // Update the index first; only remove the slot if that succeeds. A failed
  // index write then leaves the patch fully intact rather than producing a
  // phantom entry that lists but cannot load (symmetric with savePatch).
  const index = readIndex()
  const next = index.filter((n) => n !== clean)
  if (next.length !== index.length && !writeIndex(next)) return false
  safeRemove(SLOT_PREFIX + clean)
  return true
}

/**
 * Rename a saved patch in place, keeping its stored params. The new name is
 * validated like a save name. The index entry is replaced at its original
 * position. If the new name matches a different existing patch, that patch is
 * overwritten (the caller is responsible for confirming the clash). Storage
 * failures are non-fatal and roll back the new slot.
 * @param {string} oldName
 * @param {string} newName
 * @returns {{ ok: true, name: string } | { ok: false, error: 'invalid-name' | 'not-found' | 'storage-unavailable' }}
 */
export function renamePatch(oldName, newName) {
  const from = validateName(oldName)
  const to = validateName(newName)
  if (from === null || to === null) return { ok: false, error: 'invalid-name' }
  if (from === to) return { ok: true, name: to }

  const patch = loadPatch(from)
  if (!patch) return { ok: false, error: 'not-found' }

  // Replace `from` with `to` at its position; drop any pre-existing `to` entry
  // (overwrite) so the index has no duplicate. Preserve order otherwise.
  const index = readIndex()
  /** @type {string[]} */
  const next = []
  for (const n of index) {
    if (n === from) next.push(to)
    else if (n === to) continue
    else next.push(n)
  }
  if (!next.includes(to)) next.push(to)

  // Write the index FIRST: if it fails, nothing has changed and no slot data is
  // touched. (Ordering mirrors deletePatch and avoids destroying an overwritten
  // target's data on a later rollback.)
  if (!writeIndex(next)) return { ok: false, error: 'storage-unavailable' }

  // Then write the renamed slot. setItem is all-or-nothing per key, so a failure
  // here leaves the (possibly pre-existing) target slot untouched — restore the
  // original index and bail without having destroyed any patch's data.
  const envelope = { name: to, version: PATCH_VERSION, params: patch.params }
  if (!safeSet(SLOT_PREFIX + to, JSON.stringify(envelope))) {
    writeIndex(index)
    return { ok: false, error: 'storage-unavailable' }
  }

  // Finally drop the old slot (best effort — a failure here orphans it but
  // destroys nothing).
  safeRemove(SLOT_PREFIX + from)
  return { ok: true, name: to }
}

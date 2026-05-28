import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setParam } from '../audio/engine.js'
import {
  synthParams,
  activePatch,
  PARAM_DEFAULTS,
  PARAM_NAMES,
  AUDIO_PARAMS,
  writeParam,
  applyParams,
  resetToDefaults,
  resetParams,
  serializeParams,
  setActivePatch,
} from './synth.svelte.js'

vi.mock('../audio/engine.js', () => ({
  setParam: vi.fn(),
}))

const setParamMock = /** @type {import('vitest').Mock} */ (setParam)

// synthParams is a module-level singleton; reset it to defaults before each test
// so cases don't leak state into one another.
beforeEach(() => {
  Object.assign(synthParams, PARAM_DEFAULTS)
  vi.clearAllMocks()
})

describe('synth store — schema', () => {
  it('seeds every parameter from factory defaults', () => {
    for (const name of PARAM_NAMES) {
      expect(synthParams[name]).toBe(PARAM_DEFAULTS[name])
    }
  })

  it('includes every continuous and discrete parameter', () => {
    // Spot-check representative continuous and discrete params are present.
    expect(PARAM_NAMES).toContain('cutoff')
    expect(PARAM_NAMES).toContain('masterVol')
    expect(PARAM_NAMES).toContain('osc1Wave')
    expect(PARAM_NAMES).toContain('keyTrack')
    expect(PARAM_NAMES).toContain('noiseType')
    expect(PARAM_NAMES).toContain('drLock')
    expect(PARAM_NAMES).toContain('modToFilter')
    expect(PARAM_NAMES).toContain('glideOn')
    expect(PARAM_NAMES).toContain('reverbOn')
  })

  it('excludes the mod-wheel (controller state, not part of a patch)', () => {
    expect(PARAM_NAMES).not.toContain('modWheel')
    expect(AUDIO_PARAMS.has('modWheel')).toBe(false)
  })

  it('drLock defaults on (1)', () => {
    expect(PARAM_DEFAULTS.drLock).toBe(1)
  })
})

describe('synth store — writeParam DSP forwarding', () => {
  it('forwards a finite audio-param change to setParam exactly once', () => {
    writeParam('cutoff', 1234)
    expect(synthParams.cutoff).toBe(1234)
    expect(setParamMock).toHaveBeenCalledTimes(1)
    expect(setParamMock).toHaveBeenCalledWith('cutoff', 1234)
  })

  it('does not re-fire setParam on an equal-value write', () => {
    writeParam('cutoff', 1234)
    setParamMock.mockClear()
    writeParam('cutoff', 1234)
    expect(setParamMock).not.toHaveBeenCalled()
  })

  it('skips a non-audio / unknown key (modWheel) — no store change, no setParam', () => {
    writeParam('modWheel', 0.9)
    expect(synthParams.modWheel).toBeUndefined()
    expect(setParamMock).not.toHaveBeenCalled()
  })

  it('skips a non-finite value — no store change, no setParam', () => {
    writeParam('cutoff', NaN)
    expect(synthParams.cutoff).toBe(PARAM_DEFAULTS.cutoff)
    expect(setParamMock).not.toHaveBeenCalled()

    writeParam('cutoff', Infinity)
    expect(setParamMock).not.toHaveBeenCalled()
  })

  it('force re-fires setParam even when the value is unchanged', () => {
    writeParam('cutoff', PARAM_DEFAULTS.cutoff, true)
    expect(setParamMock).toHaveBeenCalledWith('cutoff', PARAM_DEFAULTS.cutoff)
  })

  it('forwards discrete (switch) params too', () => {
    writeParam('osc1Wave', 3)
    expect(synthParams.osc1Wave).toBe(3)
    expect(setParamMock).toHaveBeenCalledWith('osc1Wave', 3)
  })
})

describe('synth store — applyParams', () => {
  it('applies every provided param and forwards each to the DSP by default', () => {
    applyParams({ cutoff: 500, osc1Wave: 2 })
    expect(synthParams.cutoff).toBe(500)
    expect(synthParams.osc1Wave).toBe(2)
    expect(setParamMock).toHaveBeenCalledWith('cutoff', 500)
    expect(setParamMock).toHaveBeenCalledWith('osc1Wave', 2)
  })

  it('forces setParam for unchanged values (power-on must (re)send everything)', () => {
    // cutoff already at its default; applyParams with force should still send it.
    applyParams({ cutoff: PARAM_DEFAULTS.cutoff })
    expect(setParamMock).toHaveBeenCalledWith('cutoff', PARAM_DEFAULTS.cutoff)
  })

  it('ignores keys that are not store params', () => {
    applyParams({ modWheel: 0.1, notAParam: 5, cutoff: 800 })
    expect(synthParams.cutoff).toBe(800)
    expect(synthParams.modWheel).toBeUndefined()
    const names = setParamMock.mock.calls.map((c) => c[0])
    expect(names).not.toContain('modWheel')
    expect(names).not.toContain('notAParam')
  })
})

describe('synth store — resetToDefaults / serializeParams', () => {
  it('resetToDefaults restores and re-sends every default', () => {
    writeParam('cutoff', 999)
    setParamMock.mockClear()
    resetToDefaults()
    expect(synthParams.cutoff).toBe(PARAM_DEFAULTS.cutoff)
    // Every parameter is force-sent on reset.
    expect(setParamMock).toHaveBeenCalledTimes(PARAM_NAMES.length)
  })

  it('serializeParams snapshots exactly the in-scope params', () => {
    writeParam('cutoff', 321)
    const snap = serializeParams()
    expect(Object.keys(snap).sort()).toEqual([...PARAM_NAMES].sort())
    expect(snap.cutoff).toBe(321)
    expect(snap).not.toHaveProperty('modWheel')
  })

  it('resetParams restores synthParams to defaults without touching the DSP', () => {
    synthParams.cutoff = 12345
    synthParams.osc1Wave = 5
    resetParams()
    expect(synthParams.cutoff).toBe(PARAM_DEFAULTS.cutoff)
    expect(synthParams.osc1Wave).toBe(PARAM_DEFAULTS.osc1Wave)
    expect(setParamMock).not.toHaveBeenCalled()
  })
})

describe('synth store — active patch', () => {
  it('defaults to factory params with a null name (before any load)', () => {
    // Placed before any setActivePatch call so it observes the initial state.
    expect(activePatch.name).toBeNull()
    expect(activePatch.params.cutoff).toBe(PARAM_DEFAULTS.cutoff)
    expect(activePatch.params.osc1Wave).toBe(PARAM_DEFAULTS.osc1Wave)
  })

  it('setActivePatch records the name and a copy of the params', () => {
    const params = { ...PARAM_DEFAULTS, cutoff: 4321 }
    setActivePatch('lead', params)
    expect(activePatch.name).toBe('lead')
    expect(activePatch.params.cutoff).toBe(4321)

    // The stored params are a copy: mutating the source must not change them.
    params.cutoff = 9999
    expect(activePatch.params.cutoff).toBe(4321)
  })

  it('setActivePatch can clear the name back to null', () => {
    setActivePatch('lead', PARAM_DEFAULTS)
    setActivePatch(null, PARAM_DEFAULTS)
    expect(activePatch.name).toBeNull()
  })
})

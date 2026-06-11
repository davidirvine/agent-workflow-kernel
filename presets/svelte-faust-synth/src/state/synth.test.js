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

  it('includes the reference instrument knobs and switch', () => {
    // The reference instrument's schema has two knobs (attack, release) and one
    // switch (waveform). All must be store-backed.
    expect(PARAM_NAMES).toContain('attack')
    expect(PARAM_NAMES).toContain('release')
    expect(PARAM_NAMES).toContain('waveform')
  })

  it('excludes the mod-wheel (controller state, not part of a patch)', () => {
    expect(PARAM_NAMES).not.toContain('modWheel')
    expect(AUDIO_PARAMS.has('modWheel')).toBe(false)
  })

  it('factory defaults match the schema declaration', () => {
    expect(PARAM_DEFAULTS.attack).toBe(0.01)
    expect(PARAM_DEFAULTS.release).toBe(0.3)
    expect(PARAM_DEFAULTS.waveform).toBe(0)
  })
})

describe('synth store — writeParam DSP forwarding', () => {
  it('forwards a finite audio-param change to setParam exactly once', () => {
    writeParam('attack', 0.5)
    expect(synthParams.attack).toBe(0.5)
    expect(setParamMock).toHaveBeenCalledTimes(1)
    expect(setParamMock).toHaveBeenCalledWith('attack', 0.5)
  })

  it('does not re-fire setParam on an equal-value write', () => {
    writeParam('attack', 0.5)
    setParamMock.mockClear()
    writeParam('attack', 0.5)
    expect(setParamMock).not.toHaveBeenCalled()
  })

  it('skips a non-audio / unknown key (modWheel) — no store change, no setParam', () => {
    writeParam('modWheel', 0.9)
    expect(synthParams.modWheel).toBeUndefined()
    expect(setParamMock).not.toHaveBeenCalled()
  })

  it('skips a non-finite value — no store change, no setParam', () => {
    writeParam('attack', NaN)
    expect(synthParams.attack).toBe(PARAM_DEFAULTS.attack)
    expect(setParamMock).not.toHaveBeenCalled()

    writeParam('attack', Infinity)
    expect(setParamMock).not.toHaveBeenCalled()
  })

  it('force re-fires setParam even when the value is unchanged', () => {
    writeParam('attack', PARAM_DEFAULTS.attack, true)
    expect(setParamMock).toHaveBeenCalledWith('attack', PARAM_DEFAULTS.attack)
  })

  it('forwards discrete (switch) params too', () => {
    writeParam('waveform', 3)
    expect(synthParams.waveform).toBe(3)
    expect(setParamMock).toHaveBeenCalledWith('waveform', 3)
  })
})

describe('synth store — applyParams', () => {
  it('applies every provided param and forwards each to the DSP by default', () => {
    applyParams({ attack: 0.5, waveform: 2 })
    expect(synthParams.attack).toBe(0.5)
    expect(synthParams.waveform).toBe(2)
    expect(setParamMock).toHaveBeenCalledWith('attack', 0.5)
    expect(setParamMock).toHaveBeenCalledWith('waveform', 2)
  })

  it('forces setParam for unchanged values (power-on must (re)send everything)', () => {
    // attack already at its default; applyParams should still send it.
    applyParams({ attack: PARAM_DEFAULTS.attack })
    expect(setParamMock).toHaveBeenCalledWith('attack', PARAM_DEFAULTS.attack)
  })

  it('ignores keys that are not store params', () => {
    applyParams({ modWheel: 0.1, notAParam: 5, attack: 0.8 })
    expect(synthParams.attack).toBe(0.8)
    expect(synthParams.modWheel).toBeUndefined()
    const names = setParamMock.mock.calls.map((c) => c[0])
    expect(names).not.toContain('modWheel')
    expect(names).not.toContain('notAParam')
  })
})

describe('synth store — resetToDefaults / serializeParams', () => {
  it('resetToDefaults restores and re-sends every default', () => {
    writeParam('attack', 0.9)
    setParamMock.mockClear()
    resetToDefaults()
    expect(synthParams.attack).toBe(PARAM_DEFAULTS.attack)
    // Every parameter is force-sent on reset.
    expect(setParamMock).toHaveBeenCalledTimes(PARAM_NAMES.length)
  })

  it('serializeParams snapshots exactly the in-scope params', () => {
    writeParam('attack', 0.42)
    const snap = serializeParams()
    expect(Object.keys(snap).sort()).toEqual([...PARAM_NAMES].sort())
    expect(snap.attack).toBe(0.42)
    expect(snap).not.toHaveProperty('modWheel')
  })

  it('resetParams restores synthParams to defaults without touching the DSP', () => {
    synthParams.attack = 0.77
    synthParams.waveform = 3
    resetParams()
    expect(synthParams.attack).toBe(PARAM_DEFAULTS.attack)
    expect(synthParams.waveform).toBe(PARAM_DEFAULTS.waveform)
    expect(setParamMock).not.toHaveBeenCalled()
  })
})

describe('synth store — active patch', () => {
  it('defaults to factory params with a null name (before any load)', () => {
    // Placed before any setActivePatch call so it observes the initial state.
    expect(activePatch.name).toBeNull()
    expect(activePatch.params.attack).toBe(PARAM_DEFAULTS.attack)
    expect(activePatch.params.waveform).toBe(PARAM_DEFAULTS.waveform)
  })

  it('setActivePatch records the name and a copy of the params', () => {
    const params = { ...PARAM_DEFAULTS, attack: 0.42 }
    setActivePatch('lead', params)
    expect(activePatch.name).toBe('lead')
    expect(activePatch.params.attack).toBe(0.42)

    // The stored params are a copy: mutating the source must not change them.
    params.attack = 0.99
    expect(activePatch.params.attack).toBe(0.42)
  })

  it('setActivePatch can clear the name back to null', () => {
    setActivePatch('lead', PARAM_DEFAULTS)
    setActivePatch(null, PARAM_DEFAULTS)
    expect(activePatch.name).toBeNull()
  })
})

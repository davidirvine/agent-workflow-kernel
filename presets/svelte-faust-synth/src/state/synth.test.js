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

  it('includes the reference instrument knob and switch', () => {
    // The reference instrument's schema has one knob (frequency) and one
    // switch (waveform). Both must be store-backed.
    expect(PARAM_NAMES).toContain('frequency')
    expect(PARAM_NAMES).toContain('waveform')
  })

  it('excludes the mod-wheel (controller state, not part of a patch)', () => {
    expect(PARAM_NAMES).not.toContain('modWheel')
    expect(AUDIO_PARAMS.has('modWheel')).toBe(false)
  })

  it('factory defaults match the schema declaration', () => {
    expect(PARAM_DEFAULTS.frequency).toBe(220)
    expect(PARAM_DEFAULTS.waveform).toBe(0)
  })
})

describe('synth store — writeParam DSP forwarding', () => {
  it('forwards a finite audio-param change to setParam exactly once', () => {
    writeParam('frequency', 1234)
    expect(synthParams.frequency).toBe(1234)
    expect(setParamMock).toHaveBeenCalledTimes(1)
    expect(setParamMock).toHaveBeenCalledWith('frequency', 1234)
  })

  it('does not re-fire setParam on an equal-value write', () => {
    writeParam('frequency', 1234)
    setParamMock.mockClear()
    writeParam('frequency', 1234)
    expect(setParamMock).not.toHaveBeenCalled()
  })

  it('skips a non-audio / unknown key (modWheel) — no store change, no setParam', () => {
    writeParam('modWheel', 0.9)
    expect(synthParams.modWheel).toBeUndefined()
    expect(setParamMock).not.toHaveBeenCalled()
  })

  it('skips a non-finite value — no store change, no setParam', () => {
    writeParam('frequency', NaN)
    expect(synthParams.frequency).toBe(PARAM_DEFAULTS.frequency)
    expect(setParamMock).not.toHaveBeenCalled()

    writeParam('frequency', Infinity)
    expect(setParamMock).not.toHaveBeenCalled()
  })

  it('force re-fires setParam even when the value is unchanged', () => {
    writeParam('frequency', PARAM_DEFAULTS.frequency, true)
    expect(setParamMock).toHaveBeenCalledWith('frequency', PARAM_DEFAULTS.frequency)
  })

  it('forwards discrete (switch) params too', () => {
    writeParam('waveform', 3)
    expect(synthParams.waveform).toBe(3)
    expect(setParamMock).toHaveBeenCalledWith('waveform', 3)
  })
})

describe('synth store — applyParams', () => {
  it('applies every provided param and forwards each to the DSP by default', () => {
    applyParams({ frequency: 500, waveform: 2 })
    expect(synthParams.frequency).toBe(500)
    expect(synthParams.waveform).toBe(2)
    expect(setParamMock).toHaveBeenCalledWith('frequency', 500)
    expect(setParamMock).toHaveBeenCalledWith('waveform', 2)
  })

  it('forces setParam for unchanged values (power-on must (re)send everything)', () => {
    // frequency already at its default; applyParams should still send it.
    applyParams({ frequency: PARAM_DEFAULTS.frequency })
    expect(setParamMock).toHaveBeenCalledWith('frequency', PARAM_DEFAULTS.frequency)
  })

  it('ignores keys that are not store params', () => {
    applyParams({ modWheel: 0.1, notAParam: 5, frequency: 800 })
    expect(synthParams.frequency).toBe(800)
    expect(synthParams.modWheel).toBeUndefined()
    const names = setParamMock.mock.calls.map((c) => c[0])
    expect(names).not.toContain('modWheel')
    expect(names).not.toContain('notAParam')
  })
})

describe('synth store — resetToDefaults / serializeParams', () => {
  it('resetToDefaults restores and re-sends every default', () => {
    writeParam('frequency', 999)
    setParamMock.mockClear()
    resetToDefaults()
    expect(synthParams.frequency).toBe(PARAM_DEFAULTS.frequency)
    // Every parameter is force-sent on reset.
    expect(setParamMock).toHaveBeenCalledTimes(PARAM_NAMES.length)
  })

  it('serializeParams snapshots exactly the in-scope params', () => {
    writeParam('frequency', 321)
    const snap = serializeParams()
    expect(Object.keys(snap).sort()).toEqual([...PARAM_NAMES].sort())
    expect(snap.frequency).toBe(321)
    expect(snap).not.toHaveProperty('modWheel')
  })

  it('resetParams restores synthParams to defaults without touching the DSP', () => {
    synthParams.frequency = 12345
    synthParams.waveform = 3
    resetParams()
    expect(synthParams.frequency).toBe(PARAM_DEFAULTS.frequency)
    expect(synthParams.waveform).toBe(PARAM_DEFAULTS.waveform)
    expect(setParamMock).not.toHaveBeenCalled()
  })
})

describe('synth store — active patch', () => {
  it('defaults to factory params with a null name (before any load)', () => {
    // Placed before any setActivePatch call so it observes the initial state.
    expect(activePatch.name).toBeNull()
    expect(activePatch.params.frequency).toBe(PARAM_DEFAULTS.frequency)
    expect(activePatch.params.waveform).toBe(PARAM_DEFAULTS.waveform)
  })

  it('setActivePatch records the name and a copy of the params', () => {
    const params = { ...PARAM_DEFAULTS, frequency: 4321 }
    setActivePatch('lead', params)
    expect(activePatch.name).toBe('lead')
    expect(activePatch.params.frequency).toBe(4321)

    // The stored params are a copy: mutating the source must not change them.
    params.frequency = 9999
    expect(activePatch.params.frequency).toBe(4321)
  })

  it('setActivePatch can clear the name back to null', () => {
    setActivePatch('lead', PARAM_DEFAULTS)
    setActivePatch(null, PARAM_DEFAULTS)
    expect(activePatch.name).toBeNull()
  })
})

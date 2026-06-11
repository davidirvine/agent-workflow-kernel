import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/svelte'
import App from './App.svelte'

// The reference instrument is a key-triggered A/R sine synth: amplitude is
// `en.ar(attack, release, gate)`, so it is silent until a key raises `gate` and
// fades out when the key is released (design D1/D6). Two silencing paths matter:
// the universal `gate` (note-off ends the envelope) and the chassis power
// button (teardown). vitest cannot observe Web Audio output directly, so we
// assert the calls into the mocked engine — the gate contract that drives the
// DSP's amplitude envelope, and the powerOff() chokepoint that tears the graph
// down. The envelope's gate→amplitude response itself is the compile-verified
// DSP (faust/synth.dsp); here we prove the chassis raises/lowers `gate` exactly
// when a note starts/ends and that no `gate` is asserted with no key held.

vi.mock('./audio/engine.js', () => ({
  getAnalyser: vi.fn().mockReturnValue(null),
  getMixerPeak: vi.fn().mockReturnValue(0),
  getOutputPeak: vi.fn().mockReturnValue(0),
  powerOn: vi.fn().mockResolvedValue(undefined),
  powerOff: vi.fn().mockResolvedValue(undefined),
  setParam: vi.fn(),
}))

describe('power-off silence (reference instrument)', () => {
  /** @type {ReturnType<typeof import('vitest').vi.fn>} */
  let powerOnMock
  /** @type {ReturnType<typeof import('vitest').vi.fn>} */
  let powerOffMock
  /** @type {ReturnType<typeof import('vitest').vi.fn>} */
  let setParamMock

  beforeEach(async () => {
    const engine = await import('./audio/engine.js')
    powerOnMock = /** @type {any} */ (engine.powerOn)
    powerOffMock = /** @type {any} */ (engine.powerOff)
    setParamMock = /** @type {any} */ (engine.setParam)
    powerOnMock.mockClear()
    powerOffMock.mockClear()
    setParamMock.mockClear()
  })

  it('invokes the engine powerOff chokepoint when power toggles off', async () => {
    const { getByRole } = render(App)
    const powerButton = getByRole('button', { name: /power/i })

    // Power on
    await fireEvent.click(powerButton)
    await waitFor(() => expect(powerOnMock).toHaveBeenCalledTimes(1))
    expect(powerOffMock).not.toHaveBeenCalled()

    // Power off — the chassis MUST hit engine.powerOff(), which disconnects
    // the FAUST AudioWorkletNode from the AudioContext destination and closes
    // the context. This teardown is the hard silencing path: it cuts audio even
    // mid-note, independent of where the A/R envelope happens to be.
    await fireEvent.click(powerButton)
    await waitFor(() => expect(powerOffMock).toHaveBeenCalledTimes(1))
  })

  it('releases the universal gate before tearing down the audio graph', async () => {
    // The chassis power-off sequence is keyboardReleaseAll → engine.powerOff.
    // Even when no key is currently held (so gate is already 0), there is no
    // gate=1 lingering at teardown time. We assert the absence by powering
    // on and off WITHOUT any keyboard interaction and checking that no
    // setParam('gate', 1) leaked into the engine during the toggle.
    const { getByRole } = render(App)
    const powerButton = getByRole('button', { name: /power/i })

    await fireEvent.click(powerButton)
    await waitFor(() => expect(powerOnMock).toHaveBeenCalledTimes(1))
    await fireEvent.click(powerButton)
    await waitFor(() => expect(powerOffMock).toHaveBeenCalledTimes(1))

    const gateOneCalls = setParamMock.mock.calls.filter(
      (/** @type {any[]} */ c) => c[0] === 'gate' && c[1] === 1
    )
    expect(gateOneCalls).toEqual([])
  })

  it('does not call setParam after powerOff completes', async () => {
    // Once the engine is torn down, any further setParam (e.g. from a knob's
    // rest-position animation firing onchange) is guarded by the chassis
    // `!powered` check. This is the regression net for that guard: nothing
    // sneaks into the disconnected node.
    const { getByRole } = render(App)
    const powerButton = getByRole('button', { name: /power/i })

    await fireEvent.click(powerButton)
    await waitFor(() => expect(powerOnMock).toHaveBeenCalledTimes(1))
    await fireEvent.click(powerButton)
    await waitFor(() => expect(powerOffMock).toHaveBeenCalledTimes(1))

    setParamMock.mockClear()
    // Give the animation system a tick to settle in case any post-power-off
    // tweens fire — none should reach the engine.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(setParamMock).not.toHaveBeenCalled()
  })
})

describe('gate drives the note envelope (silent until played)', () => {
  /** @type {ReturnType<typeof import('vitest').vi.fn>} */
  let powerOnMock
  /** @type {ReturnType<typeof import('vitest').vi.fn>} */
  let setParamMock

  beforeEach(async () => {
    const engine = await import('./audio/engine.js')
    powerOnMock = /** @type {any} */ (engine.powerOn)
    setParamMock = /** @type {any} */ (engine.setParam)
    powerOnMock.mockClear()
    setParamMock.mockClear()
  })

  /** Calls into the mocked engine for a given (param, value) pair. */
  function callsFor(/** @type {string} */ param, /** @type {number} */ value) {
    return setParamMock.mock.calls.filter(
      (/** @type {any[]} */ c) => c[0] === param && c[1] === value
    )
  }

  it('asserts no gate while powered on with no key held (silent until played)', async () => {
    const { getByRole } = render(App)
    const powerButton = getByRole('button', { name: /power/i })

    await fireEvent.click(powerButton)
    await waitFor(() => expect(powerOnMock).toHaveBeenCalledTimes(1))

    // Power-on (re)sends the store params (attack/release/waveform) but `gate`
    // is the universal note contract, not a store param — so nothing raises the
    // gate. With gate low, en.ar(attack, release, gate) holds the amplitude at
    // zero: the instrument is silent until a key is played.
    expect(callsFor('gate', 1)).toEqual([])
  })

  it('raises gate on key-down and lowers it on key-up (the note lifecycle)', async () => {
    const { getByRole, container } = render(App)
    const powerButton = getByRole('button', { name: /power/i })

    await fireEvent.click(powerButton)
    await waitFor(() => expect(powerOnMock).toHaveBeenCalledTimes(1))
    setParamMock.mockClear()

    // Press a key: the keyboard sets `freq` and raises `gate` to 1, which opens
    // the A/R envelope (attack ramp → audible note at that pitch). vitest can't
    // observe the amplitude itself, but raising the gate is the chassis-side
    // trigger that makes the DSP's envelope sound the note.
    const key = /** @type {HTMLElement} */ (container.querySelector('[data-midi]'))
    expect(key).not.toBeNull()
    await fireEvent.pointerDown(key)
    expect(callsFor('gate', 1)).toHaveLength(1)
    expect(setParamMock.mock.calls.some((/** @type {any[]} */ c) => c[0] === 'freq')).toBe(true)

    // Release the key: gate falls to 0, which closes the envelope (release ramp
    // → the note fades out). This is the note-off half of the gate contract.
    await fireEvent.pointerUp(key)
    expect(callsFor('gate', 0)).toHaveLength(1)
  })
})

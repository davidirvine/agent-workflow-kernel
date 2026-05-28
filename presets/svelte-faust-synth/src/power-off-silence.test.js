import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/svelte'
import App from './App.svelte'

// The reference instrument is a drone — continuous amplitude with no envelope.
// A gated, envelope-shaped synth is silent by default whenever no key is held, so
// it never exercises the chassis power-off-silence path; this preset's reference
// instrument is the first instrument that does (design D5). This test guards
// the chassis-state/engine-glue layer of that path: when the power button
// toggles off, the chassis MUST invoke the engine's powerOff() chokepoint
// (which disconnects the AudioWorkletNode and closes the AudioContext —
// audio silence is a consequence of that signal flow). vitest cannot observe
// Web Audio output directly, so we assert the calls into the mocked engine.

vi.mock('./audio/engine.js', () => ({
  getAnalyser: vi.fn().mockReturnValue(null),
  getMixerPeak: vi.fn().mockReturnValue(0),
  getOutputPeak: vi.fn().mockReturnValue(0),
  powerOn: vi.fn().mockResolvedValue(undefined),
  powerOff: vi.fn().mockResolvedValue(undefined),
  setParam: vi.fn(),
}))

describe('power-off silence (reference drone)', () => {
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
    // the context. For a drone (no envelope), this is the only thing that
    // silences output — there is no key release to also bring amplitude down.
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

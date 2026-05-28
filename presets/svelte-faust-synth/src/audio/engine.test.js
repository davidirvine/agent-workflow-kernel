import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockNode = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  setParamValue: vi.fn(),
  setOutputParamHandler: vi.fn(),
}

vi.mock('@grame/faustwasm', () => {
  function FaustMonoDspGenerator() {
    this.createNode = vi.fn().mockResolvedValue(mockNode)
  }
  return { FaustMonoDspGenerator }
})

function makeMockCtx() {
  const analyserNode = {
    connect: vi.fn(),
    fftSize: 0,
  }

  return {
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    destination: {},
    createAnalyser: vi.fn().mockReturnValue(analyserNode),
    analyserNode,
  }
}

describe('powerOn / powerOff', () => {
  /** @type {any} */
  let mockCtx

  beforeEach(async () => {
    vi.resetModules()
    mockNode.connect.mockClear()
    mockNode.disconnect.mockClear()
    mockNode.setParamValue.mockClear()
    mockNode.setOutputParamHandler.mockClear()
    mockCtx = makeMockCtx()
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return mockCtx
      })
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }))
    vi.stubGlobal('WebAssembly', { compileStreaming: vi.fn().mockResolvedValue({}) })
  })

  it('getAnalyser returns null before powerOn is called', async () => {
    const { getAnalyser } = await import('./engine.js')
    expect(getAnalyser()).toBeNull()
  })

  it('powerOn creates a new AudioContext on every call', async () => {
    const { powerOn } = await import('./engine.js')
    await powerOn()
    await powerOn()
    expect(AudioContext).toHaveBeenCalledTimes(2)
  })

  it('powerOn always initialises a fresh AudioContext and DSP node', async () => {
    const { powerOn } = await import('./engine.js')
    await powerOn()
    expect(AudioContext).toHaveBeenCalledOnce()
    expect(mockCtx.resume).toHaveBeenCalledOnce()
    expect(mockCtx.createAnalyser).toHaveBeenCalledOnce()
    expect(mockCtx.analyserNode.fftSize).toBe(2048)
  })

  it('powerOff disconnects the node and closes the AudioContext', async () => {
    const { powerOn, powerOff } = await import('./engine.js')
    await powerOn()
    await powerOff()
    expect(mockNode.disconnect).toHaveBeenCalledOnce()
    expect(mockCtx.close).toHaveBeenCalledOnce()
  })

  it('powerOff before powerOn is a no-op', async () => {
    const { powerOff } = await import('./engine.js')
    await expect(powerOff()).resolves.toBeUndefined()
    expect(mockCtx.close).not.toHaveBeenCalled()
  })

  it('powerOff on an already-closed context (crash recovery) resolves and nulls refs', async () => {
    const { powerOn, powerOff, getAnalyser } = await import('./engine.js')
    await powerOn()
    // Simulate a crashed AudioContext: close() resolves immediately even when already closed
    mockCtx.close.mockResolvedValue(undefined)
    await powerOff()
    // Second powerOff should be a no-op (ctx is null after first teardown)
    await expect(powerOff()).resolves.toBeUndefined()
    expect(getAnalyser()).toBeNull()
  })

  it('powerOn after powerOff creates a fresh AudioContext', async () => {
    const { powerOn, powerOff } = await import('./engine.js')
    await powerOn()
    await powerOff()
    await powerOn()
    expect(AudioContext).toHaveBeenCalledTimes(2)
    expect(mockCtx.close).toHaveBeenCalledOnce()
  })

  it('getAnalyser returns the analyser node after powerOn completes', async () => {
    const { powerOn, getAnalyser } = await import('./engine.js')
    await powerOn()
    expect(getAnalyser()).toBe(mockCtx.analyserNode)
  })

  it('getAnalyser returns null after powerOff', async () => {
    const { powerOn, powerOff, getAnalyser } = await import('./engine.js')
    await powerOn()
    await powerOff()
    expect(getAnalyser()).toBeNull()
  })

  it('connects the worklet node through the analyser to destination', async () => {
    const { powerOn } = await import('./engine.js')
    await powerOn()
    expect(mockNode.connect).toHaveBeenCalledWith(mockCtx.analyserNode)
    expect(mockCtx.analyserNode.connect).toHaveBeenCalledWith(mockCtx.destination)
  })
})

describe('setParam', () => {
  /** @type {any} */
  let mockCtx

  beforeEach(async () => {
    vi.resetModules()
    mockNode.setParamValue.mockClear()
    mockCtx = makeMockCtx()
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return mockCtx
      })
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }))
    vi.stubGlobal('WebAssembly', { compileStreaming: vi.fn().mockResolvedValue({}) })
  })

  it.each([NaN, Infinity, -Infinity])('does not forward %s to setParamValue', async (value) => {
    const { powerOn, setParam } = await import('./engine.js')
    await powerOn()
    mockNode.setParamValue.mockClear()
    setParam('cutoff', value)
    expect(mockNode.setParamValue).not.toHaveBeenCalled()
  })

  it('calls node.setParamValue with the correct path and value for a valid finite input', async () => {
    const { powerOn, setParam } = await import('./engine.js')
    await powerOn()
    mockNode.setParamValue.mockClear()
    setParam('cutoff', 440)
    expect(mockNode.setParamValue).toHaveBeenCalledWith('/synth/cutoff', 440)
  })
})

describe('getOutputPeak', () => {
  /** @type {any} */
  let mockCtx

  beforeEach(async () => {
    vi.resetModules()
    mockNode.connect.mockClear()
    mockNode.disconnect.mockClear()
    mockNode.setOutputParamHandler.mockClear()
    mockCtx = makeMockCtx()
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return mockCtx
      })
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) }))
    vi.stubGlobal('WebAssembly', { compileStreaming: vi.fn().mockResolvedValue({}) })
  })

  it('returns 0 before powerOn is called', async () => {
    const { getOutputPeak } = await import('./engine.js')
    expect(getOutputPeak()).toBe(0)
  })

  it('returns the updated value when the output param handler fires with /synth/outputPeak', async () => {
    const { powerOn, getOutputPeak } = await import('./engine.js')
    await powerOn()
    const handler = mockNode.setOutputParamHandler.mock.calls[0][0]
    handler('/synth/outputPeak', 1.42)
    expect(getOutputPeak()).toBe(1.42)
  })

  it('resets to 0 after powerOff is called', async () => {
    const { powerOn, powerOff, getOutputPeak } = await import('./engine.js')
    await powerOn()
    const handler = mockNode.setOutputParamHandler.mock.calls[0][0]
    handler('/synth/outputPeak', 1.42)
    await powerOff()
    expect(getOutputPeak()).toBe(0)
  })

  it('single handler captures both mixerPeak and outputPeak paths', async () => {
    const { powerOn, getMixerPeak, getOutputPeak } = await import('./engine.js')
    await powerOn()
    expect(mockNode.setOutputParamHandler).toHaveBeenCalledOnce()
    const handler = mockNode.setOutputParamHandler.mock.calls[0][0]
    handler('/synth/mixerPeak', 0.8)
    handler('/synth/outputPeak', 1.1)
    expect(getMixerPeak()).toBe(0.8)
    expect(getOutputPeak()).toBe(1.1)
  })
})

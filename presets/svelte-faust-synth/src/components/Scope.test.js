import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/svelte'
import Scope from './Scope.svelte'

describe('Scope', () => {
  /** @type {any} */
  let mockContext

  beforeEach(() => {
    mockContext = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      lineWidth: 0,
    }

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      /** @type {any} */ (mockContext)
    )
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders a canvas element', () => {
    const { container } = render(Scope)
    expect(container.querySelector('canvas')).not.toBeNull()
  })

  it('applies the expected inline canvas styling', () => {
    const { container } = render(Scope)
    const canvas = /** @type {Element} */ (container.querySelector('canvas'))

    expect(canvas.getAttribute('style')).toContain('height: 80px')
    expect(canvas.getAttribute('style')).toContain('background: var(--panel-bg, #1c1c1c)')
  })

  it('does not start an animation frame when powered is false', () => {
    const analyser = /** @type {any} */ ({
      fftSize: 2048,
      getByteTimeDomainData: vi.fn(),
    })

    render(Scope, { props: { analyser, powered: false } })

    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('updates waveform samples when powered and analyser are present', () => {
    const analyser = /** @type {any} */ ({
      fftSize: 2048,
      getByteTimeDomainData: vi.fn((arr) => arr.fill(90)),
    })

    render(Scope, { props: { analyser, powered: true } })

    expect(requestAnimationFrame).toHaveBeenCalled()
    const tick = /** @type {any} */ (requestAnimationFrame).mock.calls[0][0]
    tick()

    expect(analyser.getByteTimeDomainData).toHaveBeenCalledOnce()
    expect(mockContext.stroke).toHaveBeenCalled()
  })

  it('draws a centered flat waveform at silence when powered on', () => {
    const analyser = /** @type {any} */ ({
      fftSize: 2048,
      getByteTimeDomainData: vi.fn((arr) => arr.fill(128)),
    })

    render(Scope, { props: { analyser, powered: true } })

    const tick = /** @type {any} */ (requestAnimationFrame).mock.calls[0][0]
    mockContext.moveTo.mockClear()
    mockContext.lineTo.mockClear()

    tick()

    expect(mockContext.moveTo).toHaveBeenCalledWith(0, 40)
    const yCoordinates = mockContext.lineTo.mock.calls.map((/** @type {any[]} */ call) => call[1])
    expect(yCoordinates.length).toBeGreaterThan(0)
    expect(yCoordinates.every((/** @type {number} */ y) => y === 40)).toBe(true)
  })
})

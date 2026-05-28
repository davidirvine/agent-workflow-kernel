import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import LevelLed from './LevelLed.svelte'

describe('LevelLed', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('setTimeout', vi.fn().mockReturnValue(1))
    vi.stubGlobal('clearTimeout', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('LED element is always present in the DOM', () => {
    const { container } = render(LevelLed, { props: { getPeak: () => 0, powered: false } })
    expect(container.querySelector('.level-led')).not.toBeNull()
  })

  it('LED is dim when powered is false', () => {
    const { container } = render(LevelLed, { props: { getPeak: () => 0.5, powered: false } })
    const led = /** @type {HTMLElement} */ (container.querySelector('.level-led'))
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('#111111')
  })

  it('getPeak is not called when powered is false', () => {
    const getPeak = vi.fn().mockReturnValue(0)
    render(LevelLed, { props: { getPeak, powered: false } })
    expect(getPeak).not.toHaveBeenCalled()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('LED color is green for low peak', () => {
    const getPeak = vi.fn().mockReturnValue(0.25)
    const { container } = render(LevelLed, { props: { getPeak, powered: true } })

    const tick = /** @type {any} */ (requestAnimationFrame).mock.calls[0][0]
    flushSync(() => tick())

    const led = /** @type {HTMLElement} */ (container.querySelector('.level-led'))
    // peak = 0.25: hue = 120 - (0.25/0.5)*60 = 90
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('hsl(90, 100%, 50%)')
  })

  it('LED color is red when peak is above 1.0', () => {
    const getPeak = vi.fn().mockReturnValue(1.5)
    const { container } = render(LevelLed, { props: { getPeak, powered: true } })

    const tick = /** @type {any} */ (requestAnimationFrame).mock.calls[0][0]
    flushSync(() => tick())

    const led = /** @type {HTMLElement} */ (container.querySelector('.level-led'))
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('hsl(0, 100%, 50%)')
  })

  it('clip latch holds LED red after peak drops below 1.0', () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb) => {
        setTimeout(cb, 16)
        return 1
      })
    )

    const getPeak = vi.fn().mockReturnValue(1.5)
    const { container } = render(LevelLed, { props: { getPeak, powered: true } })

    vi.advanceTimersByTime(16)
    flushSync()

    const led = /** @type {HTMLElement} */ (container.querySelector('.level-led'))
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('hsl(0, 100%, 50%)')

    getPeak.mockReturnValue(0.25)
    vi.advanceTimersByTime(500)
    flushSync()
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('hsl(0, 100%, 50%)')

    vi.advanceTimersByTime(1500)
    flushSync()
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('hsl(90, 100%, 50%)')

    vi.useRealTimers()
  })

  it('LED color is yellow at peak 0.65', () => {
    const getPeak = vi.fn().mockReturnValue(0.65)
    const { container } = render(LevelLed, { props: { getPeak, powered: true } })

    const tick = /** @type {any} */ (requestAnimationFrame).mock.calls[0][0]
    flushSync(() => tick())

    const led = /** @type {HTMLElement} */ (container.querySelector('.level-led'))
    // Zone 2: hue = 60 - ((0.65 - 0.5) / 0.35) * 30 = 47
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('hsl(47, 100%, 50%)')
  })

  it('LED color is orange at peak 0.9', () => {
    const getPeak = vi.fn().mockReturnValue(0.9)
    const { container } = render(LevelLed, { props: { getPeak, powered: true } })

    const tick = /** @type {any} */ (requestAnimationFrame).mock.calls[0][0]
    flushSync(() => tick())

    const led = /** @type {HTMLElement} */ (container.querySelector('.level-led'))
    // Zone 3: hue = 30 - ((0.9 - 0.85) / 0.15) * 30 = 20
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('hsl(20, 100%, 50%)')
  })

  it('sustained clipping keeps LED red across consecutive frames', () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb) => {
        setTimeout(cb, 16)
        return 1
      })
    )

    const getPeak = vi.fn().mockReturnValue(1.5)
    const { container } = render(LevelLed, { props: { getPeak, powered: true } })

    vi.advanceTimersByTime(2000)
    flushSync()

    const led = /** @type {HTMLElement} */ (container.querySelector('.level-led'))
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('hsl(0, 100%, 50%)')

    vi.useRealTimers()
  })

  it('rAF starts when powered transitions from false to true', async () => {
    const getPeak = vi.fn().mockReturnValue(0.5)
    const { rerender } = render(LevelLed, { props: { getPeak, powered: false } })

    expect(requestAnimationFrame).not.toHaveBeenCalled()

    await rerender({ getPeak, powered: true })

    expect(requestAnimationFrame).toHaveBeenCalled()
  })

  it('single transient clip latches for 1.5 s then clears', () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb) => {
        setTimeout(cb, 16)
        return 1
      })
    )

    const getPeak = vi.fn().mockReturnValue(1.5)
    const { container } = render(LevelLed, { props: { getPeak, powered: true } })

    vi.advanceTimersByTime(16)
    flushSync()

    const led = /** @type {HTMLElement} */ (container.querySelector('.level-led'))
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('hsl(0, 100%, 50%)')

    getPeak.mockReturnValue(0)
    // 2000 ms is comfortably beyond the 1500 ms latch + any rAF cadence variation
    vi.advanceTimersByTime(2000)
    flushSync()
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('#111111')

    vi.useRealTimers()
  })

  it('LED is dim when powered is true but peak is negative', () => {
    const getPeak = vi.fn().mockReturnValue(-0.1)
    const { container } = render(LevelLed, { props: { getPeak, powered: true } })

    const tick = /** @type {any} */ (requestAnimationFrame).mock.calls[0][0]
    flushSync(() => tick())

    const led = /** @type {HTMLElement} */ (container.querySelector('.level-led'))
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('#111111')
  })

  it('peak exactly 1.0 shows Zone 3 red with no latch — clears on next frame', () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb) => {
        setTimeout(cb, 16)
        return 1
      })
    )

    const getPeak = vi.fn().mockReturnValue(1.0)
    const { container } = render(LevelLed, { props: { getPeak, powered: true } })

    vi.advanceTimersByTime(16)
    flushSync()

    const led = /** @type {HTMLElement} */ (container.querySelector('.level-led'))
    // Zone 3 formula at 1.0: hue = 30 - ((1.0 - 0.85) / 0.15) * 30 = 0 → hsl(0,100%,50%)
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('hsl(0, 100%, 50%)')

    getPeak.mockReturnValue(0.25)
    // Only one rAF tick needed — no 1.5 s latch should be active
    vi.advanceTimersByTime(16)
    flushSync()
    // peak = 0.25: hue = 120 - (0.25/0.5)*60 = 90
    expect(led.style.getPropertyValue('--led-color').trim()).toBe('hsl(90, 100%, 50%)')

    vi.useRealTimers()
  })

  it('onDestroy cancels rAF and clearTimeout', () => {
    const getPeak = vi.fn().mockReturnValue(1.5)
    const { unmount } = render(LevelLed, { props: { getPeak, powered: true } })

    const tick = /** @type {any} */ (requestAnimationFrame).mock.calls[0][0]
    flushSync(() => tick())

    unmount()

    expect(cancelAnimationFrame).toHaveBeenCalled()
    expect(clearTimeout).toHaveBeenCalled()
  })
})

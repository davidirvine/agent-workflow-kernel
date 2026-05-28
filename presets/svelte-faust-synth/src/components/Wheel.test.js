import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Wheel from './Wheel.svelte'

// Deterministic requestAnimationFrame: capture scheduled callbacks so the spring
// loop can be stepped frame-by-frame, and honour cancelAnimationFrame so a
// cancelled spring truly stops emitting.
/** @type {Map<number, FrameRequestCallback>} */
let rafMap
let nextRafId

beforeEach(() => {
  rafMap = new Map()
  nextRafId = 1
  vi.stubGlobal('requestAnimationFrame', (/** @type {FrameRequestCallback} */ cb) => {
    const id = nextRafId++
    rafMap.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (/** @type {number} */ id) => {
    rafMap.delete(id)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Run up to `n` queued animation frames, advancing the timestamp by `dtMs`. */
function flushFrames(n, dtMs = 16) {
  let t = performance.now()
  for (let i = 0; i < n; i++) {
    const entry = rafMap.entries().next().value
    if (!entry) break
    const [id, cb] = entry
    rafMap.delete(id)
    t += dtMs
    cb(t)
  }
}

/** @param {Element} container */
function track(container) {
  return /** @type {Element} */ (container.querySelector('.wheel-track'))
}

describe('Wheel — rendering', () => {
  it('renders the label and a cursor line', () => {
    const { container, getByText } = render(Wheel, { props: { label: 'PITCH' } })
    expect(getByText('PITCH')).toBeTruthy()
    expect(container.querySelector('.wheel-cursor')).not.toBeNull()
  })

  it('positions the cursor by value (externalValue 0.75 → top 14px)', () => {
    const { container } = render(Wheel, { props: { externalValue: 0.75 } })
    const cursor = /** @type {HTMLElement} */ (container.querySelector('.wheel-cursor'))
    // top = (1 − value) × (trackHeight − thickness) = 0.25 × 56 = 14
    expect(cursor.style.top).toBe('14px')
  })

  it('exposes slider semantics with the label-derived aria-label', () => {
    const { container } = render(Wheel, { props: { label: 'MOD', externalValue: 0.5 } })
    const el = track(container)
    expect(el.getAttribute('role')).toBe('slider')
    expect(el.getAttribute('aria-label')).toBe('MOD wheel')
    expect(el.getAttribute('aria-valuemin')).toBe('0')
    expect(el.getAttribute('aria-valuemax')).toBe('1')
    expect(el.getAttribute('aria-valuenow')).toBe('0.5')
  })

  it('formats aria-valuetext via the supplied formatter', () => {
    const { container } = render(Wheel, {
      props: { externalValue: 1, formatValueText: (/** @type {number} */ v) => `${v} fmt` },
    })
    expect(track(container).getAttribute('aria-valuetext')).toBe('1 fmt')
  })
})

describe('Wheel — drag', () => {
  it('dragging up increases the value above center', async () => {
    const onchange = vi.fn()
    const { container } = render(Wheel, { props: { onchange } })
    const el = track(container)
    await fireEvent.pointerDown(el, { clientY: 100, pointerId: 1 })
    await fireEvent.pointerMove(el, { clientY: 84, pointerId: 1 }) // delta = 16/80 = 0.2
    const last = onchange.mock.calls.at(-1)?.[0]
    expect(last.value).toBeCloseTo(0.7, 5)
  })

  it('clamps the value to [0,1] on a large drag', async () => {
    const onchange = vi.fn()
    const { container } = render(Wheel, { props: { onchange } })
    const el = track(container)
    await fireEvent.pointerDown(el, { clientY: 100, pointerId: 1 })
    await fireEvent.pointerMove(el, { clientY: -5000, pointerId: 1 })
    expect(onchange.mock.calls.at(-1)?.[0].value).toBe(1)
  })
})

describe('Wheel — spring-back', () => {
  it('springs back toward 0.5 after release', async () => {
    const onchange = vi.fn()
    const { container } = render(Wheel, { props: { onchange } })
    const el = track(container)
    await fireEvent.pointerDown(el, { clientY: 100, pointerId: 1 })
    await fireEvent.pointerMove(el, { clientY: 84, pointerId: 1 }) // value 0.7
    await fireEvent.pointerUp(el, { pointerId: 1 })

    flushFrames(1000)
    const final = onchange.mock.calls.at(-1)?.[0].value
    expect(final).toBeCloseTo(0.5, 2)
  })

  it('does not leave a frame loop running once settled', async () => {
    const onchange = vi.fn()
    const { container } = render(Wheel, { props: { onchange } })
    const el = track(container)
    await fireEvent.pointerDown(el, { clientY: 100, pointerId: 1 })
    await fireEvent.pointerMove(el, { clientY: 84, pointerId: 1 })
    await fireEvent.pointerUp(el, { pointerId: 1 })

    flushFrames(1000)
    expect(rafMap.size).toBe(0)
  })
})

describe('Wheel — keyboard', () => {
  it('ArrowUp/ArrowDown step the value by 0.05', async () => {
    const onchange = vi.fn()
    const { container } = render(Wheel, { props: { externalValue: 0.5, onchange } })
    const el = track(container)
    await fireEvent.keyDown(el, { key: 'ArrowUp' })
    expect(onchange.mock.calls.at(-1)?.[0].value).toBeCloseTo(0.55, 5)
    await fireEvent.keyDown(el, { key: 'ArrowDown' })
    await fireEvent.keyDown(el, { key: 'ArrowDown' })
    expect(onchange.mock.calls.at(-1)?.[0].value).toBeCloseTo(0.45, 5)
  })

  it('ignores Left/Right arrows', async () => {
    const onchange = vi.fn()
    const { container } = render(Wheel, { props: { externalValue: 0.5, onchange } })
    const el = track(container)
    onchange.mockClear()
    await fireEvent.keyDown(el, { key: 'ArrowLeft' })
    await fireEvent.keyDown(el, { key: 'ArrowRight' })
    expect(onchange).not.toHaveBeenCalled()
  })

  it('springs back toward 0.5 after the arrow key is released', async () => {
    const onchange = vi.fn()
    const { container } = render(Wheel, { props: { externalValue: 0.5, onchange } })
    const el = track(container)
    await fireEvent.keyDown(el, { key: 'ArrowUp' }) // 0.55
    await fireEvent.keyUp(el, { key: 'ArrowUp' })
    flushFrames(1000)
    expect(onchange.mock.calls.at(-1)?.[0].value).toBeCloseTo(0.5, 2)
  })

  it('does not spring while another arrow key is still held', async () => {
    const onchange = vi.fn()
    const { container } = render(Wheel, { props: { externalValue: 0.5, onchange } })
    const el = track(container)
    await fireEvent.keyDown(el, { key: 'ArrowUp' })
    await fireEvent.keyDown(el, { key: 'ArrowDown' })
    await fireEvent.keyUp(el, { key: 'ArrowUp' }) // ArrowDown still held → no spring
    expect(rafMap.size).toBe(0)
    await fireEvent.keyUp(el, { key: 'ArrowDown' }) // all released → spring starts
    expect(rafMap.size).toBe(1)
  })
})

describe('Wheel — external value cancels spring-back (MIDI vs on-screen)', () => {
  it('an arriving external value cancels the spring and snaps the cursor', async () => {
    const onchange = vi.fn()
    const { container, rerender } = render(Wheel, { props: { onchange } })
    const el = track(container)
    await fireEvent.pointerDown(el, { clientY: 100, pointerId: 1 })
    await fireEvent.pointerMove(el, { clientY: 20, pointerId: 1 }) // value 1.0
    await fireEvent.pointerUp(el, { pointerId: 1 })

    flushFrames(2) // a couple of spring frames
    const callsBefore = onchange.mock.calls.length

    // External (e.g. MIDI pitch-bend) snaps the cursor and must cancel the spring.
    await rerender({ externalValue: 0.2, onchange })
    flushFrames(50)

    expect(onchange.mock.calls.length).toBe(callsBefore) // no further spring frames
    const cursor = /** @type {HTMLElement} */ (container.querySelector('.wheel-cursor'))
    expect(cursor.style.top).toBe(`${(1 - 0.2) * 56}px`) // snapped to 0.2
  })

  it('a repeated identical external value still cancels the spring when the nonce bumps', async () => {
    const onchange = vi.fn()
    const { container, rerender } = render(Wheel, {
      props: { externalValue: 0.3, externalNonce: 1, onchange },
    })
    const el = track(container)
    // Drag away from the snapped 0.3 and release to start a spring.
    await fireEvent.pointerDown(el, { clientY: 100, pointerId: 1 })
    await fireEvent.pointerMove(el, { clientY: 20, pointerId: 1 }) // value 1.0
    await fireEvent.pointerUp(el, { pointerId: 1 })
    flushFrames(2)
    const callsBefore = onchange.mock.calls.length

    // Same externalValue (0.3) but a bumped nonce — mirrors a parked hardware
    // controller resending an identical MIDI value. Must still cancel the spring.
    await rerender({ externalValue: 0.3, externalNonce: 2, onchange })
    flushFrames(50)

    expect(onchange.mock.calls.length).toBe(callsBefore)
    const cursor = /** @type {HTMLElement} */ (container.querySelector('.wheel-cursor'))
    expect(cursor.style.top).toBe(`${(1 - 0.3) * 56}px`) // re-snapped to 0.3
  })
})

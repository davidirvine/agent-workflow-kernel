import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import Knob from './Knob.svelte'

// Shared spy for all animPos.set calls — used in animation duration tests below.
// vi.hoisted ensures this is available inside the vi.mock factory (both are hoisted).
const mockSet = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('svelte/motion', () => ({
  tweened: vi.fn((initialValue) => {
    let _val = initialValue ?? 0
    const _subs = new Set()
    return {
      set: (/** @type {any} */ v, /** @type {any} */ opts) => {
        _val = v
        for (const sub of _subs) sub(_val)
        /** @type {any} */
        mockSet(v, opts)
        return Promise.resolve()
      },
      subscribe: (/** @type {(val: any) => void} */ fn) => {
        _subs.add(fn)
        fn(_val)
        return () => _subs.delete(fn)
      },
    }
  }),
}))

describe('Knob — rendering', () => {
  it('renders an SVG', () => {
    const { container } = render(Knob, { props: { label: 'test', min: 0, max: 1, default: 0.5 } })
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('displays the label', () => {
    const { getByText } = render(Knob, {
      props: { label: 'cutoff', min: 20, max: 20000, default: 2000, scale: 'log', unit: 'Hz' },
    })
    expect(getByText('cutoff')).toBeTruthy()
  })
})

describe('Knob — interaction', () => {
  it('double-click resets value to default and fires onchange', async () => {
    const onchange = vi.fn()
    const { container } = render(Knob, {
      props: { label: 'vol', min: 0, max: 1, default: 0.75, onchange },
    })
    const hit = /** @type {Element} */ (container.querySelector('.knob-hit'))
    await fireEvent.dblClick(hit)
    expect(onchange).toHaveBeenCalledWith({ value: 0.75 })
  })

  it('double-click with non-default initial emits default value', async () => {
    const onchange = vi.fn()
    const { container } = render(Knob, {
      props: { label: 'res', min: 0, max: 1, default: 0.3, value: 0.9, onchange },
    })
    const hit = /** @type {Element} */ (container.querySelector('.knob-hit'))
    await fireEvent.dblClick(hit)
    expect(onchange).toHaveBeenCalledWith({ value: 0.3 })
  })

  it('upward pointer drag increases value', async () => {
    const values = /** @type {number[]} */ ([])
    const onchange = (/** @type {{value: number}} */ e) => values.push(e.value)
    const { container } = render(Knob, {
      props: { label: 'freq', min: 20, max: 20000, default: 2000, scale: 'log', onchange },
    })
    const hit = /** @type {Element} */ (container.querySelector('.knob-hit'))
    await fireEvent.pointerDown(hit, { clientY: 100 })
    await fireEvent.pointerMove(hit, { clientY: 50 })
    await fireEvent.pointerUp(hit)
    expect(values.length).toBeGreaterThan(0)
    expect(values[values.length - 1]).toBeGreaterThan(2000)
  })

  it('downward pointer drag decreases value', async () => {
    const values = /** @type {number[]} */ ([])
    const onchange = (/** @type {{value: number}} */ e) => values.push(e.value)
    const { container } = render(Knob, {
      props: { label: 'freq', min: 20, max: 20000, default: 2000, scale: 'log', onchange },
    })
    const hit = /** @type {Element} */ (container.querySelector('.knob-hit'))
    await fireEvent.pointerDown(hit, { clientY: 50 })
    await fireEvent.pointerMove(hit, { clientY: 100 })
    await fireEvent.pointerUp(hit)
    expect(values.length).toBeGreaterThan(0)
    expect(values[values.length - 1]).toBeLessThan(2000)
  })

  it('shift+drag produces finer movement than normal drag', async () => {
    const normalValues = /** @type {number[]} */ ([])
    const fineValues = /** @type {number[]} */ ([])

    const { container: c1 } = render(Knob, {
      props: {
        label: 'test',
        min: 0,
        max: 1,
        default: 0.5,
        onchange: (/** @type {{value: number}} */ e) => normalValues.push(e.value),
      },
    })
    const { container: c2 } = render(Knob, {
      props: {
        label: 'test',
        min: 0,
        max: 1,
        default: 0.5,
        onchange: (/** @type {{value: number}} */ e) => fineValues.push(e.value),
      },
    })

    const normalDelta = 50
    await fireEvent.pointerDown(/** @type {Element} */ (c1.querySelector('.knob-hit')), {
      clientY: 100,
      shiftKey: false,
    })
    await fireEvent.pointerMove(/** @type {Element} */ (c1.querySelector('.knob-hit')), {
      clientY: 100 - normalDelta,
      shiftKey: false,
    })

    await fireEvent.pointerDown(/** @type {Element} */ (c2.querySelector('.knob-hit')), {
      clientY: 100,
      shiftKey: true,
    })
    await fireEvent.pointerMove(/** @type {Element} */ (c2.querySelector('.knob-hit')), {
      clientY: 100 - normalDelta,
      shiftKey: true,
    })

    const normalChange = Math.abs(normalValues[0] - 0.5)
    const fineChange = Math.abs(fineValues[0] - 0.5)
    expect(normalChange).toBeGreaterThan(fineChange)
  })
})

describe('Knob — externalValue (MIDI CC)', () => {
  it('snaps to externalValue and fires onchange', async () => {
    const onchange = vi.fn()
    const { rerender } = render(Knob, {
      props: { label: 'vol', min: 0, max: 1, default: 0.5, onchange },
    })
    await rerender({ externalValue: 0.8 })
    expect(onchange).toHaveBeenCalledWith({ value: 0.8 })
  })

  it('clamps externalValue to [min, max]', async () => {
    const onchange = vi.fn()
    const { rerender } = render(Knob, {
      props: { label: 'vol', min: 0, max: 1, default: 0.5, onchange },
    })
    await rerender({ externalValue: 1.5 })
    expect(onchange).toHaveBeenCalledWith({ value: 1 })
  })
})

describe('Knob — learningMidi', () => {
  it('renders learn ring when learningMidi is true', () => {
    const { container } = render(Knob, {
      props: { label: 'cut', min: 0, max: 1, default: 0.5, learningMidi: true },
    })
    expect(container.querySelector('.learn-ring')).not.toBeNull()
  })

  it('does not render learn ring when learningMidi is false', () => {
    const { container } = render(Knob, {
      props: { label: 'cut', min: 0, max: 1, default: 0.5, learningMidi: false },
    })
    expect(container.querySelector('.learn-ring')).toBeNull()
  })
})

describe('Knob — assignedCc label', () => {
  it('shows CC label when assignedCc is set', () => {
    const { container } = render(Knob, {
      props: { label: 'cut', min: 0, max: 1, default: 0.5, assignedCc: 74 },
    })
    expect(container.querySelector('.cc-label')?.textContent).toBe('CC 74')
  })

  it('does not show CC label when assignedCc is null', () => {
    const { container } = render(Knob, {
      props: { label: 'cut', min: 0, max: 1, default: 0.5, assignedCc: null },
    })
    expect(container.querySelector('.cc-label')).toBeNull()
  })
})

describe('Knob — context menu (MIDI learn trigger)', () => {
  it('calls oncontextmenu and prevents default on right-click', async () => {
    const oncontextmenu = vi.fn()
    const { container } = render(Knob, {
      props: { label: 'cut', min: 0, max: 1, default: 0.5, oncontextmenu },
    })
    const hit = /** @type {Element} */ (container.querySelector('.knob-hit'))
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    hit.dispatchEvent(event)
    expect(oncontextmenu).toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('Knob — showArc prop', () => {
  it('renders no arc element but keeps track when showArc is false', () => {
    const { container } = render(Knob, {
      props: { label: 'mode', min: 0, max: 2, default: 0, showArc: false },
    })
    expect(container.querySelector('.arc')).toBeNull()
    expect(container.querySelector('.track')).not.toBeNull()
  })
})

describe('Knob — animation duration', () => {
  beforeEach(() => {
    mockSet.mockClear()
  })

  it('externalValue change calls animPos.set with { duration: 100 }', async () => {
    const { rerender } = render(Knob, {
      props: { label: 'vol', min: 0, max: 1, default: 0.5 },
    })
    await rerender({ externalValue: 0.8 })
    expect(mockSet).toHaveBeenCalledWith(expect.any(Number), { duration: 100 })
  })

  it('drag calls animPos.set with { duration: 0 }', async () => {
    const { container } = render(Knob, {
      props: { label: 'vol', min: 0, max: 1, default: 0.5 },
    })
    mockSet.mockClear()
    const hit = /** @type {Element} */ (container.querySelector('.knob-hit'))
    await fireEvent.pointerDown(hit, { clientY: 100 })
    await fireEvent.pointerMove(hit, { clientY: 50 })
    await fireEvent.pointerUp(hit)
    expect(mockSet).toHaveBeenCalledWith(expect.any(Number), { duration: 0 })
  })
})

describe('Knob — step / fineStep quantization', () => {
  it('preserves continuous behavior when neither prop is set', async () => {
    const values = /** @type {number[]} */ ([])
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: 0,
        max: 1,
        default: 0.5,
        scale: 'linear',
        onchange: (/** @type {{value: number}} */ e) => values.push(e.value),
      },
    })
    const hit = /** @type {Element} */ (container.querySelector('.knob-hit'))
    await fireEvent.pointerDown(hit, { clientY: 100 })
    await fireEvent.pointerMove(hit, { clientY: 93 })
    await fireEvent.pointerUp(hit)
    expect(values.length).toBeGreaterThan(0)
    // No quantization on a 0..1 linear scale → small Y deltas yield fractional values.
    const last = values[values.length - 1]
    expect(Number.isInteger(last)).toBe(false)
  })

  it('quantizes drag values to multiples of step={5}', async () => {
    const values = /** @type {number[]} */ ([])
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: 0,
        scale: 'linear',
        step: 5,
        onchange: (/** @type {{value: number}} */ e) => values.push(e.value),
      },
    })
    const hit = /** @type {Element} */ (container.querySelector('.knob-hit'))
    await fireEvent.pointerDown(hit, { clientY: 100 })
    await fireEvent.pointerMove(hit, { clientY: 95 })
    await fireEvent.pointerMove(hit, { clientY: 88 })
    await fireEvent.pointerMove(hit, { clientY: 80 })
    await fireEvent.pointerUp(hit)
    expect(values.length).toBeGreaterThan(0)
    for (const v of values) {
      expect(v % 5).toBe(0)
    }
  })

  it('quantizes drag values to multiples of fineStep={1} while Shift is held', async () => {
    const values = /** @type {number[]} */ ([])
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: 0,
        scale: 'linear',
        step: 5,
        fineStep: 1,
        onchange: (/** @type {{value: number}} */ e) => values.push(e.value),
      },
    })
    const hit = /** @type {Element} */ (container.querySelector('.knob-hit'))
    await fireEvent.pointerDown(hit, { clientY: 100, shiftKey: true })
    // With Shift held, sensitivity is 0.001 (10x reduction). One pixel of
    // movement on a ±700 range advances by ~1.4¢ — small steps land on the
    // 1¢ grid and naturally produce non-multiples-of-5.
    for (let y = 99; y >= 90; y--) {
      await fireEvent.pointerMove(hit, { clientY: y, shiftKey: true })
    }
    await fireEvent.pointerUp(hit)
    expect(values.length).toBeGreaterThan(0)
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true)
    }
    // At least one value should NOT be a multiple of 5 (otherwise Shift had no effect).
    const offGrid = values.some((v) => v % 5 !== 0)
    expect(offGrid).toBe(true)
  })

  it('returns to multiples of step={5} when Shift is released mid-drag', async () => {
    const values = /** @type {number[]} */ ([])
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: 0,
        scale: 'linear',
        step: 5,
        fineStep: 1,
        onchange: (/** @type {{value: number}} */ e) => values.push(e.value),
      },
    })
    const hit = /** @type {Element} */ (container.querySelector('.knob-hit'))
    await fireEvent.pointerDown(hit, { clientY: 100, shiftKey: true })
    await fireEvent.pointerMove(hit, { clientY: 50, shiftKey: true })
    const fineCount = values.length
    await fireEvent.pointerMove(hit, { clientY: 30, shiftKey: false })
    await fireEvent.pointerMove(hit, { clientY: 10, shiftKey: false })
    await fireEvent.pointerUp(hit)
    const coarseValues = values.slice(fineCount)
    expect(coarseValues.length).toBeGreaterThan(0)
    for (const v of coarseValues) {
      expect(v % 5).toBe(0)
    }
  })

  it('uses continuous coarse mode when fineStep is set but step is null', async () => {
    const values = /** @type {number[]} */ ([])
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: 0,
        max: 1,
        default: 0.5,
        scale: 'linear',
        fineStep: 0.1,
        onchange: (/** @type {{value: number}} */ e) => values.push(e.value),
      },
    })
    const hit = /** @type {Element} */ (container.querySelector('.knob-hit'))
    // Coarse drag (no Shift) — step is null so values are continuous
    await fireEvent.pointerDown(hit, { clientY: 100 })
    await fireEvent.pointerMove(hit, { clientY: 93 })
    await fireEvent.pointerUp(hit)
    expect(values.length).toBeGreaterThan(0)
    const last = values[values.length - 1]
    expect(Number.isInteger(last * 10)).toBe(false)
  })

  it('clamps quantized values within min/max bounds', async () => {
    const values = /** @type {number[]} */ ([])
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: 0,
        max: 100,
        default: 50,
        scale: 'linear',
        step: 30,
        onchange: (/** @type {{value: number}} */ e) => values.push(e.value),
      },
    })
    const hit = /** @type {Element} */ (container.querySelector('.knob-hit'))
    // Drag far upward to push value toward max
    await fireEvent.pointerDown(hit, { clientY: 100 })
    for (let y = 99; y >= 10; y -= 5) {
      await fireEvent.pointerMove(hit, { clientY: y })
    }
    await fireEvent.pointerUp(hit)
    expect(values.length).toBeGreaterThan(0)
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })
})

describe('Knob — intervalIndicator prop', () => {
  it('does not render the indicator slot when prop is omitted', () => {
    const { container } = render(Knob, {
      props: { label: 'freq', min: -700, max: 700, default: 0 },
    })
    expect(container.querySelector('.interval-indicator')).toBeNull()
  })

  it('does not render the indicator slot when prop is false', () => {
    const { container } = render(Knob, {
      props: { label: 'freq', min: -700, max: 700, default: 0, intervalIndicator: false },
    })
    expect(container.querySelector('.interval-indicator')).toBeNull()
  })

  it('renders the indicator slot blank at value 0 when prop is true', () => {
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: 0,
        intervalIndicator: true,
      },
    })
    const slot = container.querySelector('.interval-indicator')
    expect(slot).not.toBeNull()
    // Blank state uses U+00A0 (NBSP); strip whitespace before asserting empty.
    expect(slot?.textContent?.trim() ?? '').toBe('')
  })

  it('reads m3 at +300 cents', () => {
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: 300,
        intervalIndicator: true,
      },
    })
    expect(container.querySelector('.interval-indicator')?.textContent).toBe('m3')
  })

  it('reads m3 at -300 cents (symmetric)', () => {
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: -300,
        intervalIndicator: true,
      },
    })
    expect(container.querySelector('.interval-indicator')?.textContent).toBe('m3')
  })

  it('reads m3 inside the +15¢ window at +313 cents', () => {
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: 313,
        intervalIndicator: true,
      },
    })
    expect(container.querySelector('.interval-indicator')?.textContent).toBe('m3')
  })

  it('reads M3 at +400 cents', () => {
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: 400,
        intervalIndicator: true,
      },
    })
    expect(container.querySelector('.interval-indicator')?.textContent).toBe('M3')
  })

  it('reads M3 inside the −15¢ window at −387 cents', () => {
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: -387,
        intervalIndicator: true,
      },
    })
    expect(container.querySelector('.interval-indicator')?.textContent).toBe('M3')
  })

  it('reads P5 at +700 cents (travel limit)', () => {
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: 700,
        intervalIndicator: true,
      },
    })
    expect(container.querySelector('.interval-indicator')?.textContent).toBe('P5')
  })

  it('reads P5 at −685 cents (window edge, negative)', () => {
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: -685,
        intervalIndicator: true,
      },
    })
    expect(container.querySelector('.interval-indicator')?.textContent).toBe('P5')
  })

  it('is blank just outside the +M3 window at +416 cents', () => {
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: 416,
        intervalIndicator: true,
      },
    })
    const slot = container.querySelector('.interval-indicator')
    expect(slot).not.toBeNull()
    expect(slot?.textContent?.trim() ?? '').toBe('')
  })

  it('is blank just outside the −P5 window at −684 cents', () => {
    const { container } = render(Knob, {
      props: {
        label: 'freq',
        min: -700,
        max: 700,
        default: -684,
        intervalIndicator: true,
      },
    })
    const slot = container.querySelector('.interval-indicator')
    expect(slot).not.toBeNull()
    expect(slot?.textContent?.trim() ?? '').toBe('')
  })
})

describe('Knob — bipolar prop', () => {
  it('renders a clockwise arc from center when pos > 0.5', () => {
    const { container } = render(Knob, {
      props: { label: 'amt', min: -10000, max: 10000, default: 5000, bipolar: true },
    })
    const arc = /** @type {Element} */ (container.querySelector('.arc'))
    expect(arc).not.toBeNull()
    const d = arc.getAttribute('d')
    // Path starts at center (y=6 exactly at 12 o'clock) then arcs clockwise
    expect(d).toMatch(/^M \S+ 6 A/)
  })

  it('renders a counter-clockwise arc (from indicator to center) when pos < 0.5', () => {
    const { container } = render(Knob, {
      props: { label: 'amt', min: -10000, max: 10000, default: -5000, bipolar: true },
    })
    const arc = /** @type {Element} */ (container.querySelector('.arc'))
    expect(arc).not.toBeNull()
    const d = arc.getAttribute('d')
    // Path ends at center (y=6 exactly at 12 o'clock)
    expect(d).toMatch(/ 6$/)
  })

  it('renders no arc when pos is exactly 0.5 (zero amount)', () => {
    const { container } = render(Knob, {
      props: { label: 'amt', min: -10000, max: 10000, default: 0, bipolar: true },
    })
    expect(container.querySelector('.arc')).toBeNull()
  })

  it('default knob (no new props) still renders an arc from 7 oclock', () => {
    const { container } = render(Knob, {
      props: { label: 'cut', min: 0, max: 1, default: 0.5 },
    })
    const arc = /** @type {Element} */ (container.querySelector('.arc'))
    expect(arc).not.toBeNull()
    const d = arc.getAttribute('d')
    // Arc must start at START_ANGLE 225° → x≈11.27, y≈36.73
    expect(d).toMatch(/^M 11\.2\d+ 36\.7\d+/)
  })
})

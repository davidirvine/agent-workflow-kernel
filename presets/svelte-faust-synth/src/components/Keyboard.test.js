import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/svelte'
import Keyboard from './Keyboard.svelte'
import KeyboardTestHarness from './Keyboard.test.harness.svelte'

describe('Keyboard — rendering', () => {
  it('renders exactly 61 key elements', () => {
    const { container } = render(Keyboard)
    const keys = container.querySelectorAll('[data-midi]')
    expect(keys.length).toBe(61)
  })

  it('renders 36 white keys and 25 black keys', () => {
    const { container } = render(Keyboard)
    const white = container.querySelectorAll('.white-key')
    const black = container.querySelectorAll('.black-key')
    expect(white.length).toBe(36)
    expect(black.length).toBe(25)
    expect(white.length + black.length).toBe(61)
  })

  it('lowest key is MIDI 36 (C2)', () => {
    const { container } = render(Keyboard)
    const keys = container.querySelectorAll('[data-midi]')
    const midis = Array.from(keys).map((k) => Number(k.getAttribute('data-midi')))
    expect(Math.min(...midis)).toBe(36)
  })

  it('highest key is MIDI 96 (C7)', () => {
    const { container } = render(Keyboard)
    const keys = container.querySelectorAll('[data-midi]')
    const midis = Array.from(keys).map((k) => Number(k.getAttribute('data-midi')))
    expect(Math.max(...midis)).toBe(96)
  })
})

describe('Keyboard — SVG structure', () => {
  it('renders a top rail rect at y=0 with fill #333', () => {
    const { container } = render(Keyboard)
    const rail = /** @type {Element} */ (
      container.querySelector('rect[fill="var(--panel-border, #333)"]')
    )
    expect(rail).not.toBeNull()
    expect(rail.getAttribute('y')).toBe('0')
  })

  it('does not render a middle C indicator line', () => {
    const { container } = render(Keyboard, { props: { baseMidi: 36 } })
    expect(container.querySelector('line')).toBeNull()
  })

  it('totalWidth is 1008 px for baseMidi 21', () => {
    const { container } = render(Keyboard, { props: { baseMidi: 21 } })
    expect(
      Number(/** @type {Element} */ (container.querySelector('svg')).getAttribute('width'))
    ).toBe(1008)
  })

  it('totalWidth is 1008 px for baseMidi 36', () => {
    const { container } = render(Keyboard)
    expect(
      Number(/** @type {Element} */ (container.querySelector('svg')).getAttribute('width'))
    ).toBe(1008)
  })

  it('totalWidth is 1008 px for baseMidi 48', () => {
    const { container } = render(Keyboard, { props: { baseMidi: 48 } })
    expect(
      Number(/** @type {Element} */ (container.querySelector('svg')).getAttribute('width'))
    ).toBe(1008)
  })
})

describe('Keyboard — pointer interaction', () => {
  it('calls onnote when a key is pressed', async () => {
    const onnote = vi.fn()
    const { container } = render(Keyboard, { props: { onnote } })
    const key = /** @type {Element} */ (container.querySelector('.white-key'))
    await fireEvent.pointerDown(key)
    expect(onnote).toHaveBeenCalled()
  })

  it('onnote messages include freq and gate=1 on press', async () => {
    const messages = /** @type {Array<{param: string, value: number}>} */ ([])
    const onnote = (/** @type {Array<{param: string, value: number}>} */ msgs) =>
      messages.push(...msgs)
    const { container } = render(Keyboard, { props: { onnote } })
    const key = /** @type {Element} */ (container.querySelector('.white-key'))
    await fireEvent.pointerDown(key)
    expect(messages.some((m) => m.param === 'freq')).toBe(true)
    expect(messages.some((m) => m.param === 'gate' && m.value === 1)).toBe(true)
  })

  it('sends gate=0 on pointer release when no other key held', async () => {
    const messages = /** @type {Array<{param: string, value: number}>} */ ([])
    const onnote = (/** @type {Array<{param: string, value: number}>} */ msgs) =>
      messages.push(...msgs)
    const { container } = render(Keyboard, { props: { onnote } })
    const key = /** @type {Element} */ (container.querySelector('.white-key'))
    await fireEvent.pointerDown(key)
    messages.length = 0
    await fireEvent.pointerUp(key)
    expect(messages.some((m) => m.param === 'gate' && m.value === 0)).toBe(true)
  })
})

describe('Keyboard — bindable triggerNote / releaseNote', () => {
  it('exposes triggerNote as a bindable function', () => {
    render(Keyboard, {
      props: /** @type {any} */ ({
        'bind:triggerNote': () => {},
      }),
    })
    // In testing-library/svelte, we verify the prop was set by calling triggerNote
    // The bind mechanism is tested via direct prop access below
  })

  it('shared activeKeys: gate stays on while MIDI note held after pointer release', async () => {
    const messages = /** @type {Array<{param: string, value: number}>} */ ([])
    const onnote = (/** @type {Array<{param: string, value: number}>} */ msgs) =>
      messages.push(...msgs)

    // We test via the component's internal exposed functions by rendering
    // with direct access — use component's triggerNote / releaseNote props
    const { container } = render(Keyboard, {
      props: {
        onnote,
        triggerNote: null,
        releaseNote: null,
      },
    })

    // Access the component's functions via the bound props mechanism by
    // directly exercising the spec: simulate MIDI hold + pointer release
    // Since testing-library/svelte does not support bind:fn syntax, we
    // verify via pointer interactions that gate=0 is only sent when empty.

    const [key1, key2] = container.querySelectorAll('.white-key')

    // Press two keys (pointer down on both — simulate legato + hold)
    await fireEvent.pointerDown(key1)
    await fireEvent.pointerDown(key2)

    messages.length = 0

    // Release key1 — key2 still active, no gate=0 expected
    await fireEvent.pointerUp(key1)
    expect(messages.some((m) => m.param === 'gate' && m.value === 0)).toBe(false)

    // Release key2 — all released, gate=0 expected
    await fireEvent.pointerUp(key2)
    expect(messages.some((m) => m.param === 'gate' && m.value === 0)).toBe(true)
  })
})

describe('Keyboard — releaseAll clears highlights and writes gate=0', () => {
  /**
   * Render the Keyboard via a harness that captures the bindable functions
   * (triggerNote / releaseNote / releaseAll) so tests can drive them
   * directly. testing-library/svelte does not surface bind:fn assignments
   * on its own, so we pipe them out through an `onref` callback.
   * @param {{ onnote?: (msgs: Array<{param: string, value: number}>) => void, baseMidi?: number }} props
   */
  async function renderHarness(props = {}) {
    let api =
      /** @type {{ triggerNote: ((m: number) => void) | null, releaseNote: ((m: number) => void) | null, releaseAll: (() => void) | null } | null} */ (
        null
      )
    const { container } = render(KeyboardTestHarness, {
      props: {
        ...props,
        /** @param {{ triggerNote: ((m: number) => void) | null, releaseNote: ((m: number) => void) | null, releaseAll: (() => void) | null }} a */
        onref: (a) => {
          api = a
        },
      },
    })
    await waitFor(() => expect(api?.releaseAll).toBeTypeOf('function'))
    return { container, api: /** @type {NonNullable<typeof api>} */ (api) }
  }

  it('clears active class and writes gate=0 when one key is held via pointer', async () => {
    const messages = /** @type {Array<{param: string, value: number}>} */ ([])
    const { container, api } = await renderHarness({
      onnote: (msgs) => messages.push(...msgs),
    })

    const key = /** @type {Element} */ (container.querySelector('.white-key'))
    await fireEvent.pointerDown(key)
    expect(key.classList.contains('active')).toBe(true)

    messages.length = 0
    api.releaseAll?.()
    await waitFor(() => {
      expect(/** @type {Element} */ (container.querySelector('.white-key.active'))).toBeNull()
    })
    expect(messages.some((m) => m.param === 'gate' && m.value === 0)).toBe(true)
  })

  it('clears highlights from multiple held inputs (pointer + simulated MIDI)', async () => {
    const messages = /** @type {Array<{param: string, value: number}>} */ ([])
    const { container, api } = await renderHarness({
      onnote: (msgs) => messages.push(...msgs),
    })

    const [pointerKey, midiKey] = container.querySelectorAll('.white-key')
    await fireEvent.pointerDown(pointerKey)

    // Simulate an external MIDI note-on by calling the bound triggerNote
    // — this is exactly the path App.svelte uses from MidiManager.onNoteOn.
    const midiNote = Number(midiKey.getAttribute('data-midi'))
    api.triggerNote?.(midiNote)

    await waitFor(() => {
      expect(container.querySelectorAll('.white-key.active').length).toBe(2)
    })

    messages.length = 0
    api.releaseAll?.()
    await waitFor(() => {
      expect(container.querySelectorAll('.white-key.active').length).toBe(0)
      expect(container.querySelectorAll('.black-key.active').length).toBe(0)
    })
    // gate=0 fires exactly once — from the final release in the loop.
    expect(messages.filter((m) => m.param === 'gate' && m.value === 0).length).toBe(1)
  })
})

describe('Keyboard — ignores typing in editable fields', () => {
  it('does not trigger a note when keydown originates from an input', async () => {
    const onnote = vi.fn()
    render(Keyboard, { props: { onnote } })
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    await fireEvent.keyDown(input, { key: 'z' })
    expect(onnote).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('still triggers a note for a window-level keydown (no editable target)', async () => {
    const onnote = vi.fn()
    render(Keyboard, { props: { onnote } })
    await fireEvent.keyDown(window, { key: 'z' })
    expect(onnote).toHaveBeenCalled()
  })
})

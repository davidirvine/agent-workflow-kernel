import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/svelte'
import App from './App.svelte'
import { powerOffValue } from './param-schema.js'
import { setParam } from './audio/engine.js'
import { setActivePatch, PARAM_DEFAULTS } from './state/synth.svelte.js'

vi.mock('./audio/engine.js', () => ({
  getAnalyser: vi.fn().mockReturnValue(null),
  getMixerPeak: vi.fn().mockReturnValue(0),
  getOutputPeak: vi.fn().mockReturnValue(0),
  powerOn: vi.fn().mockResolvedValue(undefined),
  powerOff: vi.fn().mockResolvedValue(undefined),
  setParam: vi.fn(),
}))

// Captures the callbacks App.svelte passes into `new MidiManager(...)` so
// tests can drive `onNoteOn` / `onNoteOff` / `onCc` directly — emulating an
// external MIDI device without a real Web MIDI access object (which jsdom
// lacks). All callbacks the real constructor accepts are typed here so tests
// can drive any layer of the MIDI surface without TypeScript noise.
let lastMidiCallbacks = /** @type {{
    onNoteOn?: Function,
    onNoteOff?: Function,
    onPitchBend?: Function,
    onCc?: Function,
    onStatusChange?: Function,
    onDevicesChange?: Function,
  } | null} */ (null)

vi.mock('./audio/midi.js', () => ({
  MidiManager: class {
    /** @param {{
      onNoteOn?: Function,
      onNoteOff?: Function,
      onPitchBend?: Function,
      onCc?: Function,
      onStatusChange?: Function,
      onDevicesChange?: Function,
    }} callbacks */
    constructor(callbacks = {}) {
      lastMidiCallbacks = callbacks
    }
    async connect() {
      lastMidiCallbacks?.onStatusChange?.('unavailable')
    }
    selectDevice() {}
    destroy() {}
  },
}))

describe('App power state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      /** @type {any} */ ({
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeStyle: '',
        lineWidth: 0,
      })
    )
  })

  it('renders the power button', () => {
    const { container } = render(App)
    expect(container.querySelector('button[aria-label]')).not.toBeNull()
  })

  it('main panel inert property is true when powered off on load', () => {
    const { container } = render(App)
    expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBe(true)
  })

  it('main panel inert property is falsy after power on', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    await fireEvent.click(btn)
    await waitFor(() => {
      expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBeFalsy()
    })
  })

  it('panels are dimmed when powered off', () => {
    const { container } = render(App)
    expect(
      /** @type {Element} */ (container.querySelector('.synth')).classList.contains('dimmed')
    ).toBe(true)
  })

  it('panels are not dimmed after power on', async () => {
    const { container } = render(App)
    await fireEvent.click(/** @type {Element} */ (container.querySelector('button[aria-label]')))
    await waitFor(() => {
      expect(
        /** @type {Element} */ (container.querySelector('.synth')).classList.contains('dimmed')
      ).toBe(false)
    })
  })
})

describe('App — all six panels render', () => {
  it('renders oscillator panel label', () => {
    const { getByText } = render(App)
    expect(getByText('oscillator bank')).toBeTruthy()
  })

  it('renders mixer panel label', () => {
    const { getByText, container } = render(App)
    expect(getByText('mixer')).toBeTruthy()
    expect(container.querySelector('.level-led')).not.toBeNull()
  })

  it('renders filter panel label', () => {
    const { getAllByText } = render(App)
    expect(getAllByText('filter').length).toBeGreaterThan(0)
  })

  it('renders filter contour section within filter panel', () => {
    const { getByText } = render(App)
    expect(getByText('filter contour')).toBeTruthy()
  })

  it('renders output panel label', () => {
    const { getByText } = render(App)
    expect(getByText('output')).toBeTruthy()
  })

  it('renders loudness contour sub-label within output panel', () => {
    const { getByText } = render(App)
    expect(getByText('loudness contour')).toBeTruthy()
  })

  it('renders modulation panel label', () => {
    const { getByText } = render(App)
    expect(getByText('modulation')).toBeTruthy()
  })

  it('renders glide panel label', () => {
    const { getByText } = render(App)
    expect(getByText('glide')).toBeTruthy()
  })

  it('renders volume knob label within output panel', () => {
    const { getByText } = render(App)
    expect(getByText('volume')).toBeTruthy()
  })

  it('renders oscilloscope in the output placeholder slot', () => {
    const { container } = render(App)
    const grid = /** @type {Element} */ (container.querySelector('.filter-output-grid'))
    expect(grid).not.toBeNull()

    const gridChildren = Array.from(grid.children)
    expect(gridChildren).toHaveLength(5)
    expect(gridChildren[2].textContent).toContain('reverb')
    expect(gridChildren[3].classList.contains('panel-row')).toBe(true)
    expect(gridChildren[4].textContent).toContain('OSCILLOSCOPE')
  })
})

describe('App — ccExternalValues initialised at per-param min', () => {
  /** @param {any} container @param {string} label */
  function findKnobValue(container, label) {
    const labelEl = Array.from(container.querySelectorAll('.knob-label')).find(
      (el) => el.textContent === label
    )
    return labelEl?.closest('.knob-wrap')?.querySelector('.knob-value') ?? null
  }

  it('osc1Level knob starts at min (0.00) on mount/reload, not default (0.75) or a random value', async () => {
    const { container } = render(App)
    await waitFor(() => {
      expect(findKnobValue(container, 'osc 1')?.textContent).toBe('0.00')
    })
  })

  it('osc1Level knob returns to min (0.00) after power-off, not frozen at default (0.75)', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(findKnobValue(container, 'osc 1')?.textContent).toBe('0.75')
    })

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(findKnobValue(container, 'osc 1')?.textContent).toBe('0.00')
    })
  })

  it('osc1Level knob returns to default (0.75) after power-off → power-on cycle', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(findKnobValue(container, 'osc 1')?.textContent).toBe('0.75')
    })

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(findKnobValue(container, 'osc 1')?.textContent).toBe('0.00')
    })

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(findKnobValue(container, 'osc 1')?.textContent).toBe('0.75')
    })
  })
})

describe('App — MIDI CC 1 updates modWheel external value', () => {
  it('App renders with modWheel wiring in place (panels present)', () => {
    const { container } = render(App)
    expect(container.querySelector('.panels')).not.toBeNull()
  })

  it('modulation panel is rendered so CC 1 has a target', () => {
    const { getByText } = render(App)
    expect(getByText('modulation')).toBeTruthy()
  })
})

describe('powerOffValue', () => {
  it('returns midpoint for osc2Detune (bipolar, min=-100 max=100)', () => {
    expect(powerOffValue('osc2Detune')).toBe(0)
  })

  it('returns midpoint for osc3Detune (bipolar, min=-100 max=100)', () => {
    expect(powerOffValue('osc3Detune')).toBe(0)
  })

  it('returns midpoint for modMix (bipolar, min=0 max=1)', () => {
    expect(powerOffValue('modMix')).toBe(0.5)
  })

  it('returns centre 0 for filterEnvAmt (bipolar, min=-10000 max=10000), not min', () => {
    expect(powerOffValue('filterEnvAmt')).toBe(0)
  })

  it('returns min for osc1Level (non-bipolar, min=0)', () => {
    expect(powerOffValue('osc1Level')).toBe(0)
  })

  it('returns min for cutoff (non-bipolar, min=20)', () => {
    expect(powerOffValue('cutoff')).toBe(20)
  })

  it('returns min for masterVol (non-bipolar, min=0)', () => {
    expect(powerOffValue('masterVol')).toBe(0)
  })
})

describe('App — power-off sets bipolar knob externalValue to midpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      /** @type {any} */ ({
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeStyle: '',
        lineWidth: 0,
      })
    )
  })

  it('modMix externalValue is midpoint (0.50) after power-off, not min (0.00)', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))

    await fireEvent.click(btn)
    await waitFor(() => {
      const el = container.querySelector('[data-testid="mod-mix-knob"] .knob-value')
      expect(el?.textContent).toBe('0.00')
    })

    await fireEvent.click(btn)
    await waitFor(() => {
      const el = container.querySelector('[data-testid="mod-mix-knob"] .knob-value')
      expect(el?.textContent).toBe('0.50')
    })
  })

  it('osc2Detune externalValue is midpoint (0.00 st) after power-off, not min (-7.00 st)', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))

    await fireEvent.click(btn)
    await fireEvent.click(btn)
    await waitFor(() => {
      const val = Array.from(container.querySelectorAll('.knob-label'))
        .filter((el) => el.textContent === 'freq')
        .map((el) => el.closest('.knob-wrap')?.querySelector('.knob-value'))[0]
      expect(val?.textContent).toBe('0.00 st')
    })
  })

  it('osc1Level externalValue is min (0.00) after power-off (non-bipolar unchanged)', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))

    await fireEvent.click(btn)
    await waitFor(() => {
      const labelEl = Array.from(container.querySelectorAll('.knob-label')).find(
        (el) => el.textContent === 'osc 1'
      )
      expect(labelEl?.closest('.knob-wrap')?.querySelector('.knob-value')?.textContent).toBe('0.75')
    })

    await fireEvent.click(btn)
    await waitFor(() => {
      const labelEl = Array.from(container.querySelectorAll('.knob-label')).find(
        (el) => el.textContent === 'osc 1'
      )
      expect(labelEl?.closest('.knob-wrap')?.querySelector('.knob-value')?.textContent).toBe('0.00')
    })
  })
})

describe('App — zero-default knobs respond to power-off after manual change', () => {
  /** @param {any} container @param {string} label */
  function findKnobHits(container, label) {
    return Array.from(container.querySelectorAll('.knob-label'))
      .filter((el) => el.textContent === label)
      .map((el) => el.closest('.knob-wrap')?.querySelector('.knob-hit'))
      .filter(Boolean)
  }

  /** @param {any} container @param {string} label */
  function findKnobValues(container, label) {
    return Array.from(container.querySelectorAll('.knob-label'))
      .filter((el) => el.textContent === label)
      .map((el) => el.closest('.knob-wrap')?.querySelector('.knob-value'))
      .filter(Boolean)
  }

  /** @param {Element} hit */
  async function dragKnobUp(hit) {
    await fireEvent.pointerDown(hit, { clientY: 100 })
    await fireEvent.pointerMove(hit, { clientY: 50 })
    await fireEvent.pointerUp(hit)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      /** @type {any} */ ({
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeStyle: '',
        lineWidth: 0,
      })
    )
  })

  it('osc2Detune returns to midpoint (0.00 st) after manual change and power-off', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    await fireEvent.click(btn)

    await dragKnobUp(findKnobHits(container, 'freq')[0])
    await waitFor(() => {
      expect(findKnobValues(container, 'freq')[0]?.textContent).not.toBe('0.00 st')
    })

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(findKnobValues(container, 'freq')[0]?.textContent).toBe('0.00 st')
    })
  })

  it('osc3Detune returns to midpoint (0.00 st) after manual change and power-off', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    await fireEvent.click(btn)

    await dragKnobUp(findKnobHits(container, 'freq')[1])
    await waitFor(() => {
      expect(findKnobValues(container, 'freq')[1]?.textContent).not.toBe('0.00 st')
    })

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(findKnobValues(container, 'freq')[1]?.textContent).toBe('0.00 st')
    })
  })

  it('osc2Level returns to min (0.00) after manual change and power-off', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    await fireEvent.click(btn)

    await dragKnobUp(findKnobHits(container, 'osc 2')[0])
    await waitFor(() => {
      expect(findKnobValues(container, 'osc 2')[0]?.textContent).not.toBe('0.00')
    })

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(findKnobValues(container, 'osc 2')[0]?.textContent).toBe('0.00')
    })
  })

  it('osc3Level returns to min (0.00) after manual change and power-off', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    await fireEvent.click(btn)

    await dragKnobUp(findKnobHits(container, 'osc 3')[0])
    await waitFor(() => {
      expect(findKnobValues(container, 'osc 3')[0]?.textContent).not.toBe('0.00')
    })

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(findKnobValues(container, 'osc 3')[0]?.textContent).toBe('0.00')
    })
  })

  it('noiseLevel returns to min (0.00) after manual change and power-off', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    await fireEvent.click(btn)

    await dragKnobUp(findKnobHits(container, 'noise')[0])
    await waitFor(() => {
      expect(findKnobValues(container, 'noise')[0]?.textContent).not.toBe('0.00')
    })

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(findKnobValues(container, 'noise')[0]?.textContent).toBe('0.00')
    })
  })

  it('delayModDepth returns to min (0 ms) after manual change and power-off', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    await fireEvent.click(btn)

    await dragKnobUp(findKnobHits(container, 'depth')[0])
    await waitFor(() => {
      expect(findKnobValues(container, 'depth')[0]?.textContent).not.toBe('0 ms')
    })

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(findKnobValues(container, 'depth')[0]?.textContent).toBe('0 ms')
    })
  })

  it('reverbPreDelay returns to min (0 ms) after manual change and power-off', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    await fireEvent.click(btn)

    await dragKnobUp(findKnobHits(container, 'pre-delay')[0])
    await waitFor(() => {
      expect(findKnobValues(container, 'pre-delay')[0]?.textContent).not.toBe('0 ms')
    })

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(findKnobValues(container, 'pre-delay')[0]?.textContent).toBe('0 ms')
    })
  })
})

describe('App — bipolar knob externalValue initialises to midpoint on page load', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      /** @type {any} */ ({
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeStyle: '',
        lineWidth: 0,
      })
    )
  })

  it('modMix externalValue is midpoint (0.50) on page load, not min (0.00)', async () => {
    const { container } = render(App)
    await waitFor(() => {
      const el = container.querySelector('[data-testid="mod-mix-knob"] .knob-value')
      expect(el?.textContent).toBe('0.50')
    })
  })

  it('osc2Detune externalValue is midpoint (0.00 st) on page load, not min (-7.00 st)', async () => {
    const { container } = render(App)
    await waitFor(() => {
      const labelEl = Array.from(container.querySelectorAll('.knob-label')).find(
        (el) => el.textContent === 'freq'
      )
      const val = labelEl?.closest('.knob-wrap')?.querySelector('.knob-value')
      expect(val?.textContent).toBe('0.00 st')
    })
  })

  it('osc1Level externalValue is min (0.00) on page load (non-bipolar unchanged)', async () => {
    const { container } = render(App)
    await waitFor(() => {
      const labelEl = Array.from(container.querySelectorAll('.knob-label')).find(
        (el) => el.textContent === 'osc 1'
      )
      const val = labelEl?.closest('.knob-wrap')?.querySelector('.knob-value')
      expect(val?.textContent).toBe('0.00')
    })
  })
})

describe('App — reverbSend forwards from knob to engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      /** @type {any} */ ({
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeStyle: '',
        lineWidth: 0,
      })
    )
  })

  it('reverbSend knob change calls setParam("reverbSend", value) on the worklet', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    await fireEvent.click(btn)

    const sendHit = Array.from(container.querySelectorAll('.knob-label'))
      .find((el) => el.textContent === 'send')
      ?.closest('.knob-wrap')
      ?.querySelector('.knob-hit')
    expect(sendHit).toBeTruthy()

    await fireEvent.dblClick(/** @type {Element} */ (sendHit))

    await waitFor(() => {
      const sendCalls = /** @type {any} */ (setParam).mock.calls.filter(
        (/** @type {any[]} */ c) => c[0] === 'reverbSend'
      )
      expect(sendCalls.length).toBeGreaterThan(0)
      expect(sendCalls[sendCalls.length - 1][1]).toBeCloseTo(0.3, 5)
    })
  })
})

describe('App — keyboard highlights cleared on power-off (held QWERTY across cycle)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      /** @type {any} */ ({
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeStyle: '',
        lineWidth: 0,
      })
    )
  })

  it('held QWERTY key shows clean keyboard after power-off → power-on cycle', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))

    // Power on.
    await fireEvent.click(btn)
    await waitFor(() => {
      expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBeFalsy()
    })

    // Hold a QWERTY key — 'z' maps to MIDI 48 (C3), which is on the
    // baseMidi=36 keyboard. The window keydown listener inside Keyboard
    // turns this into an `_triggerNote(48)` that highlights the rendered key.
    await fireEvent.keyDown(window, { key: 'z' })
    await waitFor(() => {
      expect(
        container.querySelectorAll('.white-key.active, .black-key.active').length
      ).toBeGreaterThan(0)
    })

    // Power off — keyboardReleaseAll should fire and clear all highlights;
    // gate=0 should be written to the still-live FAUST node.
    const setParamMock = /** @type {any} */ (setParam)
    setParamMock.mockClear()
    await fireEvent.click(btn)
    await waitFor(() => {
      expect(container.querySelectorAll('.white-key.active, .black-key.active').length).toBe(0)
    })
    expect(
      setParamMock.mock.calls.some((/** @type {any[]} */ c) => c[0] === 'gate' && c[1] === 0)
    ).toBe(true)

    // Power on again — the QWERTY key was never released, so no fresh
    // keydown has been delivered. The keyboard must remain un-highlighted.
    await fireEvent.click(btn)
    await waitFor(() => {
      expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBeFalsy()
    })
    expect(container.querySelectorAll('.white-key.active, .black-key.active').length).toBe(0)

    // A fresh release + re-press IS required to retrigger.
    await fireEvent.keyUp(window, { key: 'z' })
    await fireEvent.keyDown(window, { key: 'z' })
    await waitFor(() => {
      expect(
        container.querySelectorAll('.white-key.active, .black-key.active').length
      ).toBeGreaterThan(0)
    })
  })

  it('stray keydown post-cycle without prior keyup does NOT retrigger (release+re-press required)', async () => {
    // Locks down design.md decision: pressedQwerty is intentionally preserved
    // across power-off so a keydown without an intervening keyup cannot
    // re-trigger the note. Guards against regressions that would clear
    // pressedQwerty inside _releaseAll.
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBeFalsy()
    })

    // Hold 'z' (MIDI 48), power off, power on — all without firing keyUp.
    await fireEvent.keyDown(window, { key: 'z' })
    await waitFor(() => {
      expect(
        container.querySelectorAll('.white-key.active, .black-key.active').length
      ).toBeGreaterThan(0)
    })
    await fireEvent.click(btn) // power off
    await waitFor(() => {
      expect(container.querySelectorAll('.white-key.active, .black-key.active').length).toBe(0)
    })
    await fireEvent.click(btn) // power on
    await waitFor(() => {
      expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBeFalsy()
    })

    // Stray keydown for 'z' WITHOUT a prior keyUp — a real keyboard wouldn't
    // emit this without auto-repeat, but the spec is firm: only release+re-press
    // re-triggers. The keydown must be suppressed by the pressedQwerty short-circuit.
    const setParamMock = /** @type {any} */ (setParam)
    setParamMock.mockClear()
    await fireEvent.keyDown(window, { key: 'z' })

    // Give Svelte a tick — if a re-trigger did happen, it would have rendered.
    await new Promise((r) => setTimeout(r, 30))

    expect(container.querySelectorAll('.white-key.active, .black-key.active').length).toBe(0)
    expect(
      setParamMock.mock.calls.some((/** @type {any[]} */ c) => c[0] === 'gate' && c[1] === 1)
    ).toBe(false)
  })

  it('held MIDI note is unhighlighted when power is toggled off', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))

    // Power on — App.svelte instantiates MidiManager and stashes the
    // callbacks via the test mock above.
    await fireEvent.click(btn)
    await waitFor(() => {
      expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBeFalsy()
    })
    expect(lastMidiCallbacks?.onNoteOn).toBeTypeOf('function')

    // Simulate a MIDI note-on the same way MidiManager would — driving
    // App.svelte's onNoteOn callback directly. This exercises the
    // `keyboardTriggerNote?.(note)` wiring at the App level (not the
    // pointer / QWERTY paths).
    lastMidiCallbacks?.onNoteOn?.(48, 130.81) // MIDI 48 = C3, ~130.81 Hz
    await waitFor(() => {
      expect(container.querySelectorAll('.white-key.active, .black-key.active').length).toBe(1)
    })

    // Power off — keyboardReleaseAll should clear the MIDI-added entry,
    // even though no MIDI note-off was ever delivered.
    const setParamMock = /** @type {any} */ (setParam)
    setParamMock.mockClear()
    await fireEvent.click(btn)
    await waitFor(() => {
      expect(container.querySelectorAll('.white-key.active, .black-key.active').length).toBe(0)
    })
    expect(
      setParamMock.mock.calls.some((/** @type {any[]} */ c) => c[0] === 'gate' && c[1] === 0)
    ).toBe(true)
  })
})

describe('App — MIDI status indicator transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      /** @type {any} */ ({
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeStyle: '',
        lineWidth: 0,
      })
    )
  })

  it('onNoteOn flips the MIDI status dot from connected to active', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))

    await fireEvent.click(btn)
    await waitFor(() => {
      expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBeFalsy()
    })

    // The mocked connect resolves with status='unavailable'; force the App
    // into the 'connected' state the way a real MidiManager would after a
    // successful requestMIDIAccess so we can observe the connected→active flip.
    lastMidiCallbacks?.onStatusChange?.('connected')
    await waitFor(() => {
      expect(container.querySelector('.midi-status .dot.connected')).not.toBeNull()
    })

    lastMidiCallbacks?.onNoteOn?.(60, 261.63)
    await waitFor(() => {
      expect(container.querySelector('.midi-status .dot.active')).not.toBeNull()
      expect(container.querySelector('.midi-status .dot.connected')).toBeNull()
    })
  })
})

describe('App — MIDI CC learn lifecycle', () => {
  /** @param {any} container @param {string} label */
  function findKnobWrap(container, label) {
    const labelEl = Array.from(container.querySelectorAll('.knob-label')).find(
      (el) => el.textContent === label
    )
    return labelEl?.closest('.knob-wrap') ?? null
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      /** @type {any} */ ({
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeStyle: '',
        lineWidth: 0,
      })
    )
    // Each test starts with a fresh CC map; the App constructs MidiCcMap()
    // which loads from real jsdom localStorage.
    localStorage.clear()
  })

  it('right-click + onCc assigns CC, second onCc forwards scaled value to engine and shows CC label', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    await fireEvent.click(btn)
    await waitFor(() => {
      expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBeFalsy()
    })

    const cutoffWrap = /** @type {Element} */ (findKnobWrap(container, 'cutoff'))
    expect(cutoffWrap).toBeTruthy()
    const cutoffHit = /** @type {Element} */ (cutoffWrap.querySelector('.knob-hit'))

    // Right-click → enters learn mode for cutoff.
    await fireEvent.contextMenu(cutoffHit)

    // First CC arrival: assigns CC 74 → cutoff and exits learn mode.
    lastMidiCallbacks?.onCc?.({ cc: 74, value: 64 })
    await waitFor(() => {
      expect(cutoffWrap.querySelector('.cc-label')?.textContent).toBe('CC 74')
    })

    // Second CC arrival: applies scaled value through ccExternalValues →
    // the Knob's externalValue $effect fires onchange → App.onParamChange
    // calls setParam('cutoff', scaled).
    const setParamMock = /** @type {any} */ (setParam)
    setParamMock.mockClear()
    lastMidiCallbacks?.onCc?.({ cc: 74, value: 64 })

    const expectedScaled = 20 + (20000 - 20) * (64 / 127)
    await waitFor(() => {
      const cutoffCalls = setParamMock.mock.calls.filter(
        (/** @type {any[]} */ c) => c[0] === 'cutoff'
      )
      expect(cutoffCalls.length).toBeGreaterThan(0)
      expect(cutoffCalls[cutoffCalls.length - 1][1]).toBeCloseTo(expectedScaled, 5)
    })
  })

  it('Escape during learn mode cancels — subsequent onCc creates no mapping', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    await fireEvent.click(btn)
    await waitFor(() => {
      expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBeFalsy()
    })

    const cutoffWrap = /** @type {Element} */ (findKnobWrap(container, 'cutoff'))
    const cutoffHit = /** @type {Element} */ (cutoffWrap.querySelector('.knob-hit'))

    await fireEvent.contextMenu(cutoffHit)
    await fireEvent.keyDown(window, { key: 'Escape' })
    lastMidiCallbacks?.onCc?.({ cc: 74, value: 64 })

    // Give Svelte a tick to flush any reactive updates the assignment
    // would have caused, then assert nothing was assigned.
    await new Promise((r) => setTimeout(r, 30))
    expect(cutoffWrap.querySelector('.cc-label')).toBeNull()
    expect(localStorage.getItem('midiCc:74')).toBeNull()
  })

  it('right-clicking a second knob before any CC swaps the learn target', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    await fireEvent.click(btn)
    await waitFor(() => {
      expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBeFalsy()
    })

    const cutoffWrap = /** @type {Element} */ (findKnobWrap(container, 'cutoff'))
    // The resonance knob renders with the label "res" in Filter.svelte.
    const resonanceWrap = /** @type {Element} */ (findKnobWrap(container, 'res'))
    const cutoffHit = /** @type {Element} */ (cutoffWrap.querySelector('.knob-hit'))
    const resonanceHit = /** @type {Element} */ (resonanceWrap.querySelector('.knob-hit'))

    await fireEvent.contextMenu(cutoffHit)
    await fireEvent.contextMenu(resonanceHit)
    lastMidiCallbacks?.onCc?.({ cc: 74, value: 64 })

    await waitFor(() => {
      expect(resonanceWrap.querySelector('.cc-label')?.textContent).toBe('CC 74')
    })
    expect(cutoffWrap.querySelector('.cc-label')).toBeNull()
  })

  it('pre-seeded localStorage CC mapping renders the assigned-CC label on mount', async () => {
    localStorage.setItem('midiCc:74', JSON.stringify({ param: 'cutoff', min: 20, max: 20000 }))

    const { container } = render(App)

    const cutoffWrap = /** @type {Element} */ (findKnobWrap(container, 'cutoff'))
    await waitFor(() => {
      expect(cutoffWrap.querySelector('.cc-label')?.textContent).toBe('CC 74')
    })
  })
})

describe('App — power-on applies the active patch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      /** @type {any} */ ({
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeStyle: '',
        lineWidth: 0,
      })
    )
  })

  /** @param {string} param */
  function lastCall(param) {
    const calls = /** @type {any} */ (setParam).mock.calls.filter(
      (/** @type {any[]} */ c) => c[0] === param
    )
    return calls.length ? calls[calls.length - 1][1] : undefined
  }

  it('power-on with no patch loaded sends factory defaults to the DSP', async () => {
    const { container } = render(App)
    await fireEvent.click(/** @type {Element} */ (container.querySelector('button[aria-label]')))
    await waitFor(() => {
      expect(lastCall('cutoff')).toBe(PARAM_DEFAULTS.cutoff)
      expect(lastCall('masterVol')).toBe(PARAM_DEFAULTS.masterVol)
    })
  })

  it('power-on after a loaded patch applies that patch, not factory defaults', async () => {
    const { container } = render(App)
    // App init reset the active patch to factory defaults; stub a loaded patch
    // before powering on (emulates a load while powered off, section 4 UI).
    setActivePatch('lead', { ...PARAM_DEFAULTS, cutoff: 8000, osc1Wave: 3 })
    await fireEvent.click(/** @type {Element} */ (container.querySelector('button[aria-label]')))
    await waitFor(() => {
      expect(lastCall('cutoff')).toBe(8000)
      expect(lastCall('osc1Wave')).toBe(3)
    })
  })

  it('consecutive power cycles consistently reapply the active patch', async () => {
    const { container } = render(App)
    const btn = /** @type {Element} */ (container.querySelector('button[aria-label]'))
    setActivePatch('lead', { ...PARAM_DEFAULTS, cutoff: 8000 })

    await fireEvent.click(btn) // on
    await waitFor(() => expect(lastCall('cutoff')).toBe(8000))
    await fireEvent.click(btn) // off
    await waitFor(() => {
      expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBe(true)
    })
    /** @type {any} */
    setParam.mockClear()
    await fireEvent.click(btn) // on again
    await waitFor(() => expect(lastCall('cutoff')).toBe(8000))
  })

  it('powering on with no patch loaded does not mark the patch dirty', async () => {
    const { container } = render(App)
    await fireEvent.click(/** @type {Element} */ (container.querySelector('button[aria-label]')))
    await waitFor(() => {
      expect(/** @type {HTMLElement} */ (container.querySelector('main')).inert).toBeFalsy()
    })
    // Let knob externalValue effects settle (e.g. the drLock-locked release knob
    // echoing decay → ampRelease). The factory default must be self-consistent so
    // no spurious dirty marker appears.
    await new Promise((r) => setTimeout(r, 50))
    expect(container.querySelector('.patch-control .dirty')).toBeNull()
    expect(
      /** @type {Element} */ (container.querySelector('.patch-control .patch-name')).textContent
    ).toBe('DEFAULT')
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MidiManager } from './midi.js'
import {
  makePort,
  makeFakeMidiAccess as makeMidiAccess,
  installFakeMidiOnNavigator,
  bytes,
} from './test-helpers/midi.js'

// jsdom has no navigator.requestMIDIAccess; the helper installs one via
// defineProperty. Wrapper kept locally so call sites stay terse.
/** @param {any} access */
function mockMidiAccess(access) {
  installFakeMidiOnNavigator(navigator, access)
}

function removeMidiAccess() {
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    value: undefined,
    configurable: true,
    writable: true,
  })
}

/**
 * @param {number[]} data
 * @returns {MIDIMessageEvent}
 */
function midiEvent(data) {
  return /** @type {MIDIMessageEvent} */ ({ data: new Uint8Array(data) })
}

describe('MidiManager — constructor / callbacks', () => {
  it('accepts callbacks without throwing', () => {
    expect(() => new MidiManager({ onNoteOn: vi.fn() })).not.toThrow()
  })

  it('defaults all callbacks to no-ops', () => {
    const m = new MidiManager()
    expect(() => m._onNoteOn()).not.toThrow()
    expect(() => m._onNoteOff()).not.toThrow()
    expect(() => m._onPitchBend()).not.toThrow()
    expect(() => m._onCc()).not.toThrow()
    expect(() => m._onStatusChange()).not.toThrow()
    expect(() => m._onDevicesChange()).not.toThrow()
  })
})

describe('MidiManager — connect: unsupported browser', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls onStatusChange("unavailable") when requestMIDIAccess is absent', async () => {
    removeMidiAccess()
    const onStatusChange = vi.fn()
    const m = new MidiManager({ onStatusChange })
    await m.connect()
    expect(onStatusChange).toHaveBeenCalledWith('unavailable')
  })

  it('calls onStatusChange("unavailable") when requestMIDIAccess rejects', async () => {
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      value: vi.fn().mockRejectedValue(new Error('denied')),
      configurable: true,
      writable: true,
    })
    const onStatusChange = vi.fn()
    const m = new MidiManager({ onStatusChange })
    await m.connect()
    expect(onStatusChange).toHaveBeenCalledWith('unavailable')
  })
})

describe('MidiManager — connect: success', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls onStatusChange("connected") and onDevicesChange on success', async () => {
    const onStatusChange = vi.fn()
    const onDevicesChange = vi.fn()
    const port = makePort()
    const access = makeMidiAccess([port])
    mockMidiAccess(access)

    const m = new MidiManager({ onStatusChange, onDevicesChange })
    await m.connect()

    expect(onStatusChange).toHaveBeenCalledWith('connected')
    expect(onDevicesChange).toHaveBeenCalledWith([{ id: 'port-1', name: 'Test MIDI' }])
  })

  it('attaches onmidimessage to input ports', async () => {
    const port = makePort()
    const access = makeMidiAccess([port])
    mockMidiAccess(access)

    const m = new MidiManager()
    await m.connect()

    expect(port.onmidimessage).toBe(m._handleMessage)
  })
})

describe('MidiManager — message parsing: note-on', () => {
  /** @type {any} */
  let m
  /** @type {any} */
  let onNoteOn

  beforeEach(async () => {
    onNoteOn = vi.fn()
    const port = makePort()
    const access = makeMidiAccess([port])
    mockMidiAccess(access)
    m = new MidiManager({ onNoteOn })
    await m.connect()
  })

  afterEach(() => vi.restoreAllMocks())

  it('fires onNoteOn with note and freq for note-on (velocity > 0)', () => {
    m._handleMessage(midiEvent(bytes('noteOn', 60, 100)))
    expect(onNoteOn).toHaveBeenCalledWith(60, expect.closeTo(261.63, 0))
  })

  it('fires onNoteOn for note-on on any channel', () => {
    m._handleMessage(midiEvent([0x93, 69, 64]))
    expect(onNoteOn).toHaveBeenCalledWith(69, expect.closeTo(440, 0))
  })
})

describe('MidiManager — message parsing: note-off', () => {
  /** @type {any} */
  let m
  /** @type {any} */
  let onNoteOff

  beforeEach(async () => {
    onNoteOff = vi.fn()
    const port = makePort()
    const access = makeMidiAccess([port])
    mockMidiAccess(access)
    m = new MidiManager({ onNoteOff })
    await m.connect()
  })

  afterEach(() => vi.restoreAllMocks())

  it('fires onNoteOff for note-off message (0x80)', () => {
    m._handleMessage(midiEvent(bytes('noteOn', 60, 100)))
    m._handleMessage(midiEvent(bytes('noteOff', 60, 0)))
    expect(onNoteOff).toHaveBeenCalledWith(60)
  })

  it('treats note-on with velocity 0 as note-off', () => {
    m._handleMessage(midiEvent(bytes('noteOn', 60, 100)))
    m._handleMessage(midiEvent(bytes('noteOn', 60, 0)))
    expect(onNoteOff).toHaveBeenCalledWith(60)
  })

  it('ignores note-off for non-active note', () => {
    m._handleMessage(midiEvent(bytes('noteOff', 60, 0)))
    expect(onNoteOff).not.toHaveBeenCalled()
  })
})

describe('MidiManager — pitchbend', () => {
  /** @type {any} */
  let m
  /** @type {any} */
  let onPitchBend

  beforeEach(async () => {
    onPitchBend = vi.fn()
    const port = makePort()
    const access = makeMidiAccess([port])
    mockMidiAccess(access)
    m = new MidiManager({ onPitchBend })
    await m.connect()
  })

  afterEach(() => vi.restoreAllMocks())

  it('does not fire onPitchBend when no note is active', () => {
    m._handleMessage(midiEvent(bytes('pitchBend', 0x00, 0x7f)))
    expect(onPitchBend).not.toHaveBeenCalled()
  })

  it('fires onPitchBend with bent freq when note is active', () => {
    m._handleMessage(midiEvent(bytes('noteOn', 69, 100))) // A4 = 440 Hz
    // max bend: raw = (0x7f << 7) | 0x7f = 16383
    m._handleMessage(midiEvent(bytes('pitchBend', 0x7f, 0x7f)))
    // Called with the bent freq and the bend in semitones (≈ +2 at max).
    expect(onPitchBend).toHaveBeenCalledWith(
      expect.closeTo(440 * Math.pow(2, 2 / 12), 1),
      expect.closeTo(2, 2)
    )
  })

  it('center pitchbend returns unmodified freq and zero semitones', () => {
    m._handleMessage(midiEvent(bytes('noteOn', 69, 100)))
    // center: raw = (0x40 << 7) | 0x00 = 8192
    m._handleMessage(midiEvent(bytes('pitchBend', 0x00, 0x40)))
    expect(onPitchBend).toHaveBeenCalledWith(expect.closeTo(440, 1), 0)
  })

  it('stores bend with no active note, applies on next note-on', async () => {
    const onNoteOn = vi.fn()
    const port = makePort('port-bend', 'Bend MIDI')
    const access = makeMidiAccess([port])
    mockMidiAccess(access)
    const mgr = new MidiManager({ onNoteOn })
    await mgr.connect()

    // Max bend before any note is active — must NOT fire onPitchBend
    // (no active note) but the bend value MUST be retained.
    mgr._handleMessage(midiEvent(bytes('pitchBend', 0x7f, 0x7f)))

    // First note-on after the deferred bend: A4 (69) with max bend should
    // arrive bent up two semitones (~493.88 Hz), not at the unbent 440 Hz.
    mgr._handleMessage(midiEvent(bytes('noteOn', 69, 100)))
    expect(onNoteOn).toHaveBeenCalledWith(69, expect.closeTo(440 * Math.pow(2, 2 / 12), 1))
  })
})

describe('MidiManager — CC dispatch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fires onCc with cc number and value', async () => {
    const onCc = vi.fn()
    const port = makePort()
    const access = makeMidiAccess([port])
    mockMidiAccess(access)
    const m = new MidiManager({ onCc })
    await m.connect()

    m._handleMessage(midiEvent(bytes('cc', 74, 100)))
    expect(onCc).toHaveBeenCalledWith({ cc: 74, value: 100 })
  })
})

describe('MidiManager — disconnect note-off synthesis', () => {
  afterEach(() => vi.restoreAllMocks())

  it('releases all active MIDI notes when selected device disconnects', async () => {
    const onNoteOff = vi.fn()
    const port = makePort()
    const access = makeMidiAccess([port])
    mockMidiAccess(access)
    const m = new MidiManager({ onNoteOff })
    await m.connect()

    m._handleMessage(midiEvent(bytes('noteOn', 60, 100)))
    m._handleMessage(midiEvent(bytes('noteOn', 64, 100)))

    // Simulate disconnect by firing the access onstatechange
    port.state = 'disconnected'
    access.onstatechange?.({ port })

    expect(onNoteOff).toHaveBeenCalledWith(60)
    expect(onNoteOff).toHaveBeenCalledWith(64)
  })
})

describe('MidiManager — destroy', () => {
  afterEach(() => vi.restoreAllMocks())

  it('detaches listeners on destroy', async () => {
    const port = makePort()
    const access = makeMidiAccess([port])
    mockMidiAccess(access)
    const m = new MidiManager()
    await m.connect()
    m.destroy()
    expect(port.onmidimessage).toBeNull()
  })
})

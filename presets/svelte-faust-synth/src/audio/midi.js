import { midiToFreq } from './keyboard.js'
import { parseBend, bentFreq } from './pitchbend.js'

export class MidiManager {
  /** @type {MIDIAccess | null} */
  #access = null
  /** @type {string | null} */
  #selectedId = null
  /** @type {Set<number>} */
  #activeNotes = new Set()
  #bendValue = 0
  /** @type {number | null} */
  #lastNote = null

  /** @param {{ onNoteOn?: Function, onNoteOff?: Function, onPitchBend?: Function, onCc?: Function, onStatusChange?: Function, onDevicesChange?: Function }} callbacks */
  constructor(callbacks = {}) {
    this._onNoteOn = callbacks.onNoteOn ?? (() => {})
    this._onNoteOff = callbacks.onNoteOff ?? (() => {})
    this._onPitchBend = callbacks.onPitchBend ?? (() => {})
    this._onCc = callbacks.onCc ?? (() => {})
    this._onStatusChange = callbacks.onStatusChange ?? (() => {})
    this._onDevicesChange = callbacks.onDevicesChange ?? (() => {})
    this._handleMessage = this._handleMessage.bind(this)
    this._handleStateChange = this._handleStateChange.bind(this)
  }

  async connect() {
    if (!navigator.requestMIDIAccess) {
      this._onStatusChange('unavailable')
      return
    }
    try {
      this.#access = await navigator.requestMIDIAccess({ sysex: false })
    } catch {
      this._onStatusChange('unavailable')
      return
    }
    this.#access.onstatechange = this._handleStateChange
    this._attachListeners()
    this._onStatusChange('connected')
    this._notifyDevices()
  }

  /** @param {string} id */
  selectDevice(id) {
    this._detachListeners()
    this.#selectedId = id
    this._attachListeners()
  }

  destroy() {
    this._detachListeners()
    if (this.#access) {
      this.#access.onstatechange = null
      this.#access = null
    }
  }

  // --- private ---

  _devices() {
    if (!this.#access) return []
    return Array.from(this.#access.inputs.values()).map((p) => ({ id: p.id, name: p.name }))
  }

  _notifyDevices() {
    const devices = this._devices()
    this._onDevicesChange(devices)
    if (devices.length > 0 && !this.#selectedId) {
      this.#selectedId = devices[0].id
    }
  }

  _attachListeners() {
    if (!this.#access) return
    for (const port of this.#access.inputs.values()) {
      if (this.#selectedId === null || port.id === this.#selectedId) {
        port.onmidimessage = this._handleMessage
      }
    }
  }

  _detachListeners() {
    if (!this.#access) return
    for (const port of this.#access.inputs.values()) {
      port.onmidimessage = null
    }
  }

  /** @param {MIDIConnectionEvent} event */
  _handleStateChange(event) {
    const port = event.port
    if (!port || port.type !== 'input') return
    const inputPort = /** @type {MIDIInput} */ (port)

    if (inputPort.state === 'disconnected') {
      inputPort.onmidimessage = null
      if (inputPort.id === this.#selectedId) {
        this.#selectedId = null
        this._releaseAllNotes()
      }
    } else if (inputPort.state === 'connected') {
      if (this.#selectedId === null || inputPort.id === this.#selectedId) {
        inputPort.onmidimessage = this._handleMessage
        if (this.#selectedId === null) this.#selectedId = inputPort.id
      }
    }

    this._notifyDevices()
  }

  _releaseAllNotes() {
    for (const note of this.#activeNotes) {
      this._onNoteOff(note)
    }
    this.#activeNotes.clear()
  }

  /** @param {MIDIMessageEvent} event */
  _handleMessage(event) {
    if (!event.data) return
    const data = Array.from(event.data)
    const status = data[0]
    const data1 = data[1]
    const data2 = data[2]
    const type = status & 0xf0

    if (type === 0x90) {
      // Note-on
      if (data2 === 0) {
        this._noteOff(data1)
      } else {
        this._noteOn(data1)
      }
    } else if (type === 0x80) {
      // Note-off
      this._noteOff(data1)
    } else if (type === 0xe0) {
      // Pitchbend — 14-bit value from two 7-bit bytes
      const raw = (data2 << 7) | data1
      this._pitchBend(raw)
    } else if (type === 0xb0) {
      // CC
      this._onCc({ cc: data1, value: data2 })
    }
  }

  /** @param {number} note */
  _noteOn(note) {
    this.#activeNotes.add(note)
    this.#lastNote = note
    const freq = this._bentFreq(note)
    this._onNoteOn(note, freq)
  }

  /** @param {number} note */
  _noteOff(note) {
    if (!this.#activeNotes.has(note)) return
    this.#activeNotes.delete(note)
    this._onNoteOff(note)
  }

  /** @param {number} raw */
  _pitchBend(raw) {
    this.#bendValue = parseBend(raw)
    if (this.#lastNote !== null && this.#activeNotes.has(this.#lastNote)) {
      // Pass the bend in semitones alongside the bent freq so the on-screen
      // PITCH wheel can mirror the hardware control's position.
      this._onPitchBend(this._bentFreq(this.#lastNote), this.#bendValue)
    }
  }

  /** @param {number} note */
  _bentFreq(note) {
    return bentFreq(midiToFreq(note), this.#bendValue)
  }
}

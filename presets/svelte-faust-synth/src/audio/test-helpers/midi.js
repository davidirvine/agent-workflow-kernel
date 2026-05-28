// Shared MIDI mocking primitives for unit, component, and E2E tests.
//
// This module is the single source of truth for fake-port shape and byte
// builders. The class-level `MidiManager` mock in `App.test.js` operates at
// a different abstraction layer and intentionally does not consume these
// primitives.

/**
 * Build a `MIDIInput`-shaped fake port. The returned object has the minimal
 * surface the production `MidiManager` reads (`id`, `name`, `type`, `state`,
 * `onmidimessage`). Callers may mutate `state` or `onmidimessage` to drive
 * statechange and message handlers.
 *
 * @param {string} [id]
 * @param {string} [name]
 */
export function makePort(id = 'port-1', name = 'Test MIDI') {
  return { id, name, type: 'input', state: 'connected', onmidimessage: null }
}

/**
 * Build a `MIDIAccess`-shaped fake. Returns the minimum surface the
 * production code reads: `inputs` (a Map keyed by port id) and
 * `onstatechange` (settable handler — production code assigns a listener,
 * tests dispatch via `access.onstatechange?.(event)`).
 *
 * @param {Array<ReturnType<typeof makePort>>} [ports]
 * @returns {{ inputs: Map<string, ReturnType<typeof makePort>>, onstatechange: ((event: any) => void) | null }}
 */
export function makeFakeMidiAccess(ports = []) {
  return {
    inputs: new Map(ports.map((p) => [p.id, p])),
    onstatechange: null,
  }
}

// Status nibbles for the supported MIDI message families. Only channel 1
// is exposed — multi-channel handling is a non-goal for the test surface.
const STATUS = /** @type {const} */ ({
  noteOn: 0x90,
  noteOff: 0x80,
  cc: 0xb0,
  pitchBend: 0xe0,
})

/**
 * Build a MIDI byte sequence by message name. Examples:
 *
 *   bytes('noteOn', 60, 100)      → [0x90, 60, 100]
 *   bytes('noteOff', 60, 0)       → [0x80, 60, 0]
 *   bytes('cc', 74, 64)           → [0xb0, 74, 64]
 *   bytes('pitchBend', lsb, msb)  → [0xe0, lsb, msb]
 *
 * @param {keyof typeof STATUS} name
 * @param {number} data1
 * @param {number} data2
 * @returns {number[]}
 */
export function bytes(name, data1, data2) {
  const status = STATUS[name]
  if (status === undefined) throw new Error(`Unknown MIDI message name: ${name}`)
  return [status, data1, data2]
}

/**
 * Install a fake `requestMIDIAccess` on the given navigator-like target so
 * the production `MidiManager.connect()` resolves to `access`. Returns a
 * teardown function that restores the property to its prior state — call
 * it in `afterEach` to keep tests hermetic.
 *
 * Works in jsdom (`globalThis.navigator`) and any other context that
 * exposes a `navigator` object with mutable properties.
 *
 * @param {{ requestMIDIAccess?: any } | undefined} target
 * @param {ReturnType<typeof makeFakeMidiAccess>} access
 */
export function installFakeMidiOnNavigator(target, access) {
  if (!target) throw new Error('installFakeMidiOnNavigator requires a navigator-like target')
  const had = Object.prototype.hasOwnProperty.call(target, 'requestMIDIAccess')
  const prior = target.requestMIDIAccess
  Object.defineProperty(target, 'requestMIDIAccess', {
    value: () => Promise.resolve(access),
    configurable: true,
    writable: true,
  })
  return function teardown() {
    if (had) {
      Object.defineProperty(target, 'requestMIDIAccess', {
        value: prior,
        configurable: true,
        writable: true,
      })
    } else {
      delete target.requestMIDIAccess
    }
  }
}

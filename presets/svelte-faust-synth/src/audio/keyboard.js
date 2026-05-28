import { mtof } from './math.js'

// Base keyboard: C3 (MIDI 48) to C5 (MIDI 72), two octaves, 25 keys.
const BASE_MIDI = 48

// Lower octave: z–m row (white keys) and s/d/g/h/j row (black keys).
// Upper octave: q–i row (white keys) and 2/3/5/6/7 row (black keys).
/** @type {Record<string, number>} */
export const QWERTY_MAP = {
  // Lower octave (C3–B3)
  z: BASE_MIDI + 0, // C3
  s: BASE_MIDI + 1, // C#3
  x: BASE_MIDI + 2, // D3
  d: BASE_MIDI + 3, // D#3
  c: BASE_MIDI + 4, // E3
  v: BASE_MIDI + 5, // F3
  g: BASE_MIDI + 6, // F#3
  b: BASE_MIDI + 7, // G3
  h: BASE_MIDI + 8, // G#3
  n: BASE_MIDI + 9, // A3
  j: BASE_MIDI + 10, // A#3
  m: BASE_MIDI + 11, // B3
  // Upper octave (C4–C5)
  q: BASE_MIDI + 12, // C4
  2: BASE_MIDI + 13, // C#4
  w: BASE_MIDI + 14, // D4
  3: BASE_MIDI + 15, // D#4
  e: BASE_MIDI + 16, // E4
  r: BASE_MIDI + 17, // F4
  5: BASE_MIDI + 18, // F#4
  t: BASE_MIDI + 19, // G4
  6: BASE_MIDI + 20, // G#4
  y: BASE_MIDI + 21, // A4
  7: BASE_MIDI + 22, // A#4
  u: BASE_MIDI + 23, // B4
  i: BASE_MIDI + 24, // C5
}

/**
 * Returns the 25 MIDI notes for the keyboard shifted by octaveOffset semitones.
 * @param {number} octaveOffset
 * @returns {number[]}
 */
export function midiNotesForOctave(octaveOffset) {
  return Array.from({ length: 25 }, (_, i) => BASE_MIDI + i + octaveOffset * 12)
}

/**
 * Returns the ordered parameter messages to send to the DSP engine for a note-on.
 * When already active, only freq is updated to avoid an amplitude discontinuity click.
 * @param {number} freq
 * @param {boolean} currentlyActive
 * @returns {Array<{ param: string, value: number }>}
 */
export function buildNoteOnMessages(freq, currentlyActive) {
  if (currentlyActive) {
    return [{ param: 'freq', value: freq }]
  }
  return [
    { param: 'freq', value: freq },
    { param: 'gate', value: 1 },
  ]
}

/**
 * Converts a MIDI note number to Hz, applying an octave transpose offset.
 * @param {number} midiNote
 * @param {number} [octaveOffset]
 * @returns {number}
 */
export function midiToFreq(midiNote, octaveOffset = 0) {
  return mtof(midiNote + octaveOffset * 12)
}

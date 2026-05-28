// Pure pitchbend math, extracted from MidiManager so Stryker can mutate it
// without crawling the surrounding I/O wrapper.

// Center of the 14-bit pitchbend range. Raw values below this bend down,
// above bend up.
export const BEND_CENTER = 8192

// Maximum bend in semitones at the extreme ends of the 14-bit range.
// Matches the General MIDI default of ±2 semitones.
export const BEND_SEMITONES = 2

/**
 * Convert a 14-bit raw pitchbend value to a signed semitone offset.
 *
 * @param {number} raw 0–16383 (14-bit MSB|LSB)
 * @returns {number} semitones in the closed interval [-BEND_SEMITONES, +BEND_SEMITONES]
 */
export function parseBend(raw) {
  return ((raw - BEND_CENTER) / BEND_CENTER) * BEND_SEMITONES
}

/**
 * Apply a semitone bend to a base note frequency.
 *
 * @param {number} noteFreq Hz
 * @param {number} bendSemitones signed semitone offset (e.g. from `parseBend`)
 * @returns {number} bent frequency in Hz
 */
export function bentFreq(noteFreq, bendSemitones) {
  return noteFreq * Math.pow(2, bendSemitones / 12)
}

import { describe, it, expect } from 'vitest'
import { QWERTY_MAP, midiNotesForOctave, buildNoteOnMessages, midiToFreq } from './keyboard.js'

describe('QWERTY_MAP', () => {
  it("'z' maps to MIDI 48 (C3)", () => {
    expect(QWERTY_MAP['z']).toBe(48)
  })

  it("'s' is one semitone above 'z'", () => {
    expect(QWERTY_MAP['s']).toBe(QWERTY_MAP['z'] + 1)
  })

  it("'i' maps to MIDI 72 (C5)", () => {
    expect(QWERTY_MAP['i']).toBe(72)
  })

  it('covers exactly 25 keys', () => {
    expect(Object.keys(QWERTY_MAP).length).toBe(25)
  })

  it('all MIDI values are in range 48–72', () => {
    for (const midi of Object.values(QWERTY_MAP)) {
      expect(midi).toBeGreaterThanOrEqual(48)
      expect(midi).toBeLessThanOrEqual(72)
    }
  })

  it('all 25 MIDI values are unique', () => {
    const values = Object.values(QWERTY_MAP)
    expect(new Set(values).size).toBe(25)
  })
})

describe('midiNotesForOctave', () => {
  it('offset=0 starts at MIDI 48', () => {
    const notes = midiNotesForOctave(0)
    expect(notes[0]).toBe(48)
    expect(notes.length).toBe(25)
  })

  it('offset=0 second note is MIDI 49', () => {
    expect(midiNotesForOctave(0)[1]).toBe(49)
  })

  it('offset=0 last note is MIDI 72', () => {
    expect(midiNotesForOctave(0)[24]).toBe(72)
  })

  it('offset=1 shifts all notes up by 12', () => {
    const base = midiNotesForOctave(0)
    const shifted = midiNotesForOctave(1)
    shifted.forEach((n, i) => expect(n).toBe(base[i] + 12))
  })

  it('offset=-1 shifts all notes down by 12', () => {
    const base = midiNotesForOctave(0)
    const shifted = midiNotesForOctave(-1)
    shifted.forEach((n, i) => expect(n).toBe(base[i] - 12))
  })
})

describe('buildNoteOnMessages — new note (not active)', () => {
  it('returns freq then gate=1 when not active', () => {
    const msgs = buildNoteOnMessages(440, false)
    expect(msgs).toEqual([
      { param: 'freq', value: 440 },
      { param: 'gate', value: 1 },
    ])
  })

  it('freq message comes before gate message', () => {
    const msgs = buildNoteOnMessages(880, false)
    expect(msgs[0].param).toBe('freq')
    expect(msgs[msgs.length - 1].param).toBe('gate')
    expect(msgs[msgs.length - 1].value).toBe(1)
  })

  it('has exactly 2 messages on new note', () => {
    expect(buildNoteOnMessages(330, false).length).toBe(2)
  })
})

describe('buildNoteOnMessages — legato (already active)', () => {
  it('returns only freq update when active (no gate pulse to avoid click)', () => {
    const msgs = buildNoteOnMessages(440, true)
    expect(msgs).toEqual([{ param: 'freq', value: 440 }])
  })

  it('has exactly 1 message when active', () => {
    expect(buildNoteOnMessages(330, true).length).toBe(1)
  })

  it('freq value matches argument when active', () => {
    expect(buildNoteOnMessages(220, true)[0].value).toBe(220)
  })

  it('no gate messages when active', () => {
    const gateMessages = buildNoteOnMessages(440, true).filter((m) => m.param === 'gate')
    expect(gateMessages.length).toBe(0)
  })
})

describe('midiToFreq', () => {
  it('MIDI 69 with offset=0 = 440 Hz', () => {
    expect(midiToFreq(69, 0)).toBeCloseTo(440, 5)
  })

  it('octave offset=1 doubles the frequency', () => {
    expect(midiToFreq(69, 1)).toBeCloseTo(880, 5)
  })

  it('octave offset=-1 halves the frequency', () => {
    expect(midiToFreq(69, -1)).toBeCloseTo(220, 5)
  })

  it('default offset is 0', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5)
  })
})

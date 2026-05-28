import { describe, it, expect } from 'vitest'
import { parseBend, bentFreq, BEND_CENTER, BEND_SEMITONES } from './pitchbend.js'

describe('pitchbend — parseBend', () => {
  it('returns 0 semitones at the bend center', () => {
    expect(parseBend(8192)).toBe(0)
  })

  it('returns -BEND_SEMITONES at raw 0 (full bend down)', () => {
    expect(parseBend(0)).toBe(-2)
  })

  it('approaches +BEND_SEMITONES at raw 16383 (full 14-bit value)', () => {
    // (16383 - 8192) / 8192 * 2 ≈ 1.99975 — not exactly 2 because the
    // 14-bit positive half has 8191 steps to cover the same range that the
    // negative half covers in 8192 steps.
    expect(parseBend(16383)).toBeCloseTo(2, 3)
  })

  it('is monotonic across the range', () => {
    expect(parseBend(0)).toBeLessThan(parseBend(8192))
    expect(parseBend(8192)).toBeLessThan(parseBend(16383))
  })

  it('exposes BEND_CENTER = 8192 and BEND_SEMITONES = 2', () => {
    expect(BEND_CENTER).toBe(8192)
    expect(BEND_SEMITONES).toBe(2)
  })
})

describe('pitchbend — bentFreq', () => {
  it('returns the unbent frequency when bend is 0', () => {
    expect(bentFreq(440, 0)).toBe(440)
  })

  it('returns 2^(2/12) above base at +2 semitones', () => {
    expect(bentFreq(440, 2)).toBeCloseTo(440 * Math.pow(2, 2 / 12), 5)
  })

  it('returns half the base frequency at -12 semitones (one octave down)', () => {
    expect(bentFreq(440, -12)).toBe(220)
  })

  it('returns double the base frequency at +12 semitones (one octave up)', () => {
    expect(bentFreq(440, 12)).toBe(880)
  })
})

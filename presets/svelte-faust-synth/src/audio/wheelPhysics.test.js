import { describe, it, expect } from 'vitest'
import {
  stepSpring,
  isAtRest,
  REST,
  MAX_DT,
  DEFAULT_PHYSICS,
  PHYSICS_RANGES,
  REST_VALUE_EPSILON,
  REST_VELOCITY_EPSILON,
} from './wheelPhysics.js'

/**
 * Run the integrator from a starting value until it settles (or `maxFrames`),
 * recording every value. Returns the trajectory plus whether it ever crossed
 * past REST (overshoot) and how many frames it took to come to rest.
 *
 * @param {{ value: number, mass?: number, spring?: number, dampingRatio?: number, dt?: number, maxFrames?: number }} opts
 */
function settle({
  value,
  mass = DEFAULT_PHYSICS.mass,
  spring = DEFAULT_PHYSICS.spring,
  dampingRatio = DEFAULT_PHYSICS.damping,
  dt = 1 / 60,
  maxFrames = 6000,
}) {
  const startSide = Math.sign(value - REST)
  let state = { value, velocity: 0 }
  const values = [value]
  let overshot = false
  let frames = 0
  for (let i = 0; i < maxFrames; i++) {
    state = stepSpring({ ...state, mass, spring, dampingRatio, dt })
    values.push(state.value)
    frames++
    if (startSide !== 0 && Math.sign(state.value - REST) === -startSide) overshot = true
    if (isAtRest(state.value, state.velocity)) break
  }
  return { values, overshot, frames, final: state }
}

describe('wheelPhysics — constants', () => {
  it('rests at center 0.5', () => {
    expect(REST).toBe(0.5)
  })

  it('exposes the documented ranges and defaults', () => {
    expect(PHYSICS_RANGES.mass).toEqual({ min: 0.05, max: 5, default: 0.1 })
    expect(PHYSICS_RANGES.spring).toEqual({ min: 1, max: 70, default: 50 })
    expect(PHYSICS_RANGES.damping).toEqual({ min: 0.05, max: 1, default: 0.3 })
    expect(DEFAULT_PHYSICS).toEqual({ mass: 0.1, spring: 50, damping: 0.3 })
  })

  it('defaults are underdamped (ζ < 1)', () => {
    expect(DEFAULT_PHYSICS.damping).toBeLessThan(1)
  })
})

describe('wheelPhysics — stepSpring acceleration', () => {
  it('accelerates back toward REST from above (velocity goes negative)', () => {
    const next = stepSpring({
      value: 0.9,
      velocity: 0,
      mass: 1,
      spring: 20,
      dampingRatio: 0.3,
      dt: 1 / 60,
    })
    // Displacement is positive, so the restoring force is negative.
    expect(next.velocity).toBeLessThan(0)
    expect(next.value).toBeLessThan(0.9)
  })

  it('accelerates back toward REST from below (velocity goes positive)', () => {
    const next = stepSpring({
      value: 0.1,
      velocity: 0,
      mass: 1,
      spring: 20,
      dampingRatio: 0.3,
      dt: 1 / 60,
    })
    expect(next.velocity).toBeGreaterThan(0)
    expect(next.value).toBeGreaterThan(0.1)
  })

  it('applies no force and no motion exactly at REST with zero velocity', () => {
    const next = stepSpring({
      value: REST,
      velocity: 0,
      mass: 1,
      spring: 20,
      dampingRatio: 0.3,
      dt: 1 / 60,
    })
    expect(next.value).toBe(REST)
    expect(next.velocity).toBe(0)
  })

  it('damping opposes motion: a moving cursor at REST is decelerated', () => {
    const next = stepSpring({
      value: REST,
      velocity: 1,
      mass: 1,
      spring: 20,
      dampingRatio: 0.3,
      dt: 1 / 60,
    })
    // At REST the spring term is zero, so only damping acts — velocity shrinks.
    expect(next.velocity).toBeLessThan(1)
    expect(next.velocity).toBeGreaterThan(0)
  })
})

describe('wheelPhysics — stepSpring clamping', () => {
  it('clamps value to [0,1] (cannot exceed the top edge)', () => {
    const next = stepSpring({
      value: 0.99,
      velocity: 100,
      mass: 1,
      spring: 20,
      dampingRatio: 0.3,
      dt: 1 / 60,
    })
    expect(next.value).toBeLessThanOrEqual(1)
  })

  it('clamps value to [0,1] (cannot pass the bottom edge)', () => {
    const next = stepSpring({
      value: 0.01,
      velocity: -100,
      mass: 1,
      spring: 20,
      dampingRatio: 0.3,
      dt: 1 / 60,
    })
    expect(next.value).toBeGreaterThanOrEqual(0)
  })

  it('clamps dt to MAX_DT: a huge dt steps no further than dt = MAX_DT', () => {
    const base = { value: 0.9, velocity: 0, mass: 1, spring: 20, dampingRatio: 0.3 }
    const huge = stepSpring({ ...base, dt: 100 })
    const capped = stepSpring({ ...base, dt: MAX_DT })
    expect(huge).toEqual(capped)
  })

  it('zeroes velocity when the cursor hits a wall (no accumulation past the clamp)', () => {
    const top = stepSpring({
      value: 0.99,
      velocity: 100,
      mass: 1,
      spring: 20,
      dampingRatio: 0.3,
      dt: 1 / 60,
    })
    expect(top.value).toBe(1)
    expect(top.velocity).toBe(0)

    const bottom = stepSpring({
      value: 0.01,
      velocity: -100,
      mass: 1,
      spring: 20,
      dampingRatio: 0.3,
      dt: 1 / 60,
    })
    expect(bottom.value).toBe(0)
    expect(bottom.velocity).toBe(0)
  })

  it('preserves velocity on a step that does not hit a wall', () => {
    const next = stepSpring({
      value: 0.9,
      velocity: 0,
      mass: 1,
      spring: 20,
      dampingRatio: 0.3,
      dt: 1 / 60,
    })
    // Interior step: velocity is the integrated value, not forced to 0.
    expect(next.value).toBeGreaterThan(0)
    expect(next.value).toBeLessThan(1)
    expect(next.velocity).not.toBe(0)
  })
})

describe('wheelPhysics — settling behaviour', () => {
  it('underdamped release overshoots center, then settles at REST', () => {
    const { overshot, final } = settle({ value: 0.9, dampingRatio: 0.3 })
    expect(overshot).toBe(true)
    expect(final.value).toBeCloseTo(REST, 2)
    expect(isAtRest(final.value, final.velocity)).toBe(true)
  })

  it('critical damping (ζ=1) returns without crossing past center', () => {
    const { overshot, final } = settle({ value: 0.9, dampingRatio: 1 })
    expect(overshot).toBe(false)
    expect(final.value).toBeCloseTo(REST, 2)
  })

  it('heavier mass takes more frames to settle than lighter mass', () => {
    const light = settle({ value: 0.9, mass: 0.5 })
    const heavy = settle({ value: 0.9, mass: 3 })
    expect(heavy.frames).toBeGreaterThan(light.frames)
  })

  it('the rest threshold actually terminates the loop short of maxFrames', () => {
    const { frames } = settle({ value: 0.9, maxFrames: 6000 })
    expect(frames).toBeLessThan(6000)
  })
})

describe('wheelPhysics — isAtRest', () => {
  it('is true at REST with zero velocity', () => {
    expect(isAtRest(REST, 0)).toBe(true)
  })

  it('is false when displaced beyond the value epsilon', () => {
    expect(isAtRest(REST + REST_VALUE_EPSILON * 2, 0)).toBe(false)
  })

  it('is false when velocity exceeds the velocity epsilon even at REST', () => {
    expect(isAtRest(REST, REST_VELOCITY_EPSILON * 2)).toBe(false)
  })

  it('is true just inside both thresholds', () => {
    expect(isAtRest(REST + REST_VALUE_EPSILON / 2, REST_VELOCITY_EPSILON / 2)).toBe(true)
  })
})

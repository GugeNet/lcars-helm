import { describe, expect, it } from 'vitest'
import { crossTrackError, distanceBetween, moveAlong, bearingTo } from '../src/model/geo.js'
import { bestVmg, DEFAULT_POLAR, polarSpeed } from '../src/model/polars.js'
import { apparentWind } from '../src/model/wind.js'
import { Simulation } from '../src/model/simulation.js'
import { createScenario } from '../src/scenarios/index.js'
import { degrees, knots, nauticalMiles, normalizeSigned, toDegrees, toKnots } from '../src/model/units.js'

describe('geo', () => {
  it('moves a known distance along a known bearing', () => {
    const start = { latitude: 59.3, longitude: 10.5 }
    const north = moveAlong(start, 0, nauticalMiles(10))
    expect(distanceBetween(start, north)).toBeCloseTo(nauticalMiles(10), 0)
    expect(toDegrees(bearingTo(start, north))).toBeCloseTo(0, 3)
    expect(north.latitude).toBeGreaterThan(start.latitude)
  })

  it('reports cross-track error as positive to the right of the track', () => {
    const start = { latitude: 59.0, longitude: 10.0 }
    const end = moveAlong(start, 0, nauticalMiles(10)) // due north
    const midpoint = moveAlong(start, 0, nauticalMiles(5))

    const toStarboard = moveAlong(midpoint, degrees(90), 500)
    const toPort = moveAlong(midpoint, degrees(270), 500)

    expect(crossTrackError(start, end, toStarboard)).toBeCloseTo(500, 0)
    expect(crossTrackError(start, end, toPort)).toBeCloseTo(-500, 0)
    expect(crossTrackError(start, end, midpoint)).toBeCloseTo(0, 1)
  })
})

describe('polars', () => {
  it('interpolates between table entries', () => {
    // Halfway between the 8 kt and 10 kt columns at 90°: 6.4 and 7.0 kt.
    const speed = polarSpeed(DEFAULT_POLAR, degrees(90), knots(9))
    expect(toKnots(speed)).toBeCloseTo(6.7, 1)
  })

  it('is symmetric about the bow', () => {
    const port = polarSpeed(DEFAULT_POLAR, degrees(-60), knots(12))
    const starboard = polarSpeed(DEFAULT_POLAR, degrees(60), knots(12))
    expect(port).toBe(starboard)
  })

  it('makes no way head to wind', () => {
    expect(polarSpeed(DEFAULT_POLAR, 0, knots(12))).toBe(0)
  })

  it('finds plausible best VMG angles', () => {
    const upwind = bestVmg(DEFAULT_POLAR, knots(12), 'upwind')
    const downwind = bestVmg(DEFAULT_POLAR, knots(12), 'downwind')

    expect(toDegrees(upwind.angle)).toBeGreaterThan(35)
    expect(toDegrees(upwind.angle)).toBeLessThan(55)
    expect(toDegrees(downwind.angle)).toBeGreaterThan(130)
    expect(upwind.vmg).toBeGreaterThan(0)
    expect(downwind.vmg).toBeGreaterThan(0)
  })
})

describe('apparent wind', () => {
  it('adds boat speed when the wind is dead ahead', () => {
    const result = apparentWind(0, knots(10), knots(5))
    expect(toKnots(result.speed)).toBeCloseTo(15, 3)
    expect(result.angle).toBeCloseTo(0, 6)
  })

  it('subtracts boat speed when the wind is dead astern', () => {
    const result = apparentWind(Math.PI, knots(10), knots(4))
    expect(toKnots(result.speed)).toBeCloseTo(6, 3)
    expect(Math.abs(result.angle)).toBeCloseTo(Math.PI, 6)
  })

  it('draws the wind forward of the beam when reaching', () => {
    const result = apparentWind(degrees(90), knots(10), knots(6))
    expect(toDegrees(result.angle)).toBeGreaterThan(0)
    expect(toDegrees(result.angle)).toBeLessThan(90)
    expect(result.speed).toBeGreaterThan(knots(10))
  })
})

describe('simulation', () => {
  it('sails towards the destination when cruising', () => {
    const simulation = new Simulation(createScenario('cruising'))
    const start = simulation.current
    const mark = start.destination!.position
    const initialDistance = distanceBetween(start.position, mark)

    for (let t = 0; t < 6000; t += 1) simulation.tick(0.1) // ten minutes

    const after = simulation.current
    expect(distanceBetween(after.position, mark)).toBeLessThan(initialDistance)
    expect(after.stw).toBeGreaterThan(knots(2))
    // Beating: the boat should be sailing at a sensible angle to the wind.
    expect(Math.abs(toDegrees(after.wind.angleTrue))).toBeGreaterThan(30)
  })

  it('keeps the boat within its scope while anchored and reports the drag', () => {
    const simulation = new Simulation(createScenario('anchored'))
    for (let t = 0; t < 3000; t += 1) simulation.tick(0.1) // five minutes, before any event

    const state = simulation.current
    expect(state.anchor.deployed).toBe(true)
    expect(state.stw).toBe(0)

    const scope = distanceBetween(state.position, state.anchor.position!)
    expect(scope).toBeLessThanOrEqual(state.anchor.rodeLength)
    expect(scope).toBeGreaterThan(0)

    // The bow lies within a reasonable angle of head to wind.
    expect(Math.abs(toDegrees(normalizeSigned(state.wind.angleTrue)))).toBeLessThan(45)
  })

  it('keeps a sane speed over ground at anchor, even through a wind shift', () => {
    const simulation = new Simulation(createScenario('anchored'))
    let peak = 0

    // Run past the veer at t=480 s and the build at t=900 s, but stop before the
    // anchor starts dragging at t=1320 s.
    for (let t = 0; t < 12_000; t += 1) {
      simulation.tick(0.1)
      peak = Math.max(peak, simulation.current.sog)
    }

    // A boat sheering about on its rode makes well under a knot over ground.
    // Anything more means the model is teleporting it around the anchor.
    expect(peak).toBeLessThan(knots(1.2))
  })

  it('reports a course over ground while sheering at anchor', () => {
    const simulation = new Simulation(createScenario('anchored'))
    const courses = new Set<number>()
    for (let t = 0; t < 3000; t += 1) {
      simulation.tick(0.2)
      courses.add(Math.round(toDegrees(simulation.current.cog)))
    }
    // The boat swings both ways, so COG must actually vary rather than stick at
    // whatever it was when the scenario loaded.
    expect(courses.size).toBeGreaterThan(5)
  })

  it('drags the anchor once the scripted event fires', () => {
    const simulation = new Simulation(createScenario('anchored'))
    // Step in one-second ticks past the drag event at t=1320 s.
    for (let t = 0; t < 1200; t += 1) simulation.tick(1)
    const beforeDrag = simulation.current.anchor.position!

    for (let t = 0; t < 400; t += 1) simulation.tick(1)
    const afterDrag = simulation.current.anchor.position!

    expect(distanceBetween(beforeDrag, afterDrag)).toBeGreaterThan(5)
  })

  it('runs the engine and stays put in the marina', () => {
    const marina = new Simulation(createScenario('marina'))
    const berth = marina.current.position
    for (let t = 0; t < 600; t += 1) marina.tick(1)
    expect(distanceBetween(marina.current.position, berth)).toBeLessThan(1)
    expect(marina.current.electrical.shoreConnected).toBe(true)

    const motoring = new Simulation(createScenario('motoring'))
    for (let t = 0; t < 600; t += 1) motoring.tick(0.1)
    expect(motoring.current.engine.running).toBe(true)
    expect(motoring.current.engine.rpm).toBeGreaterThan(1000)
    expect(motoring.current.stw).toBeGreaterThan(knots(3))
  })

  it('discharges the battery when shore power is lost in the marina', () => {
    const simulation = new Simulation(createScenario('marina'))
    for (let t = 0; t < 590; t += 1) simulation.tick(1)
    expect(simulation.current.electrical.shoreConnected).toBe(true)

    for (let t = 0; t < 120; t += 1) simulation.tick(1)
    expect(simulation.current.electrical.shoreConnected).toBe(false)
    expect(simulation.current.electrical.batteryCurrent).toBeLessThan(0)
  })
})

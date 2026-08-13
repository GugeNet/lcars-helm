import { coastalTraffic } from '../model/ais.js'
import { celsius, degrees, knots, nauticalMiles } from '../model/units.js'
import { moveAlong } from '../model/geo.js'
import { sailingHeading, type Tack } from './helpers.js'
import type { Controls } from '../model/types.js'
import type { Scenario, ScenarioRuntime } from './types.js'

const ORIGIN = { latitude: 59.3021, longitude: 10.5794 }
const DESTINATION = moveAlong(ORIGIN, degrees(25), nauticalMiles(14))

/**
 * A relaxed afternoon passage in a steady breeze. The destination sits far
 * enough upwind that the boat has to work to windward for part of it, which
 * exercises tacking, the ETA calculation and the comfort readouts.
 */
export function cruisingScenario(): Scenario {
  let tack: Tack = 1
  let lastTackAt = 0

  return {
    id: 'cruising',
    name: 'Cruising under sail',
    description: 'Steady 12 kt breeze, 14 NM to run, destination on the wind.',
    setup: {
      origin: ORIGIN,
      heading: degrees(25),
      timeOfDay: 14.5,
      wind: {
        baseDirection: degrees(45),
        baseSpeed: knots(12),
        oscillationAmplitude: degrees(6),
        oscillationPeriod: 260,
        gustiness: 0.16
      },
      atmosphere: { airTemperature: celsius(18), waterTemperature: celsius(15), pressure: 101800 },
      depth: { baseDepth: 42, variation: 26, featureSize: 700 },
      electrical: { initialStateOfCharge: 0.82 },
      current: { set: degrees(200), drift: knots(0.4) },
      aisTargets: coastalTraffic(),
      destination: {
        name: 'HANKO NORD',
        position: DESTINATION,
        arrivalRadius: 150
      },
      extraLoad: 35 // autopilot and instruments
    },

    step(runtime: ScenarioRuntime, _dt: number): Controls {
      const mark = runtime.destination?.position ?? DESTINATION
      const wind = runtime.state.wind.directionTrue
      const plan = sailingHeading(runtime.state.position, wind, mark, tack)

      // Hold a tack for at least 90 s. Without this the boat chatters between
      // tacks every time a shift moves the mark across the bow.
      if (!plan.layingMark && plan.suggestedTack !== tack && runtime.elapsed - lastTackAt > 90) {
        tack = plan.suggestedTack
        lastTackAt = runtime.elapsed
        runtime.announce(`tacking onto ${tack === 1 ? 'starboard' : 'port'}`)
        return {
          targetHeading: sailingHeading(runtime.state.position, wind, mark, tack).heading,
          throttle: 0,
          sailsUp: true,
          anchored: false,
          moored: false
        }
      }

      return {
        targetHeading: plan.heading,
        throttle: 0,
        sailsUp: true,
        anchored: false,
        moored: false
      }
    }
  }
}

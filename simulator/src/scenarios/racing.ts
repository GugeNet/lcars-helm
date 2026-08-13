import { coastalTraffic } from '../model/ais.js'
import { distanceBetween, moveAlong } from '../model/geo.js'
import { celsius, degrees, knots, nauticalMiles } from '../model/units.js'
import { sailingHeading, type Tack } from './helpers.js'
import type { Controls, Waypoint } from '../model/types.js'
import type { Scenario, ScenarioRuntime } from './types.js'

const ORIGIN = { latitude: 59.1902, longitude: 10.6215 }

/** A windward–leeward course, the wind blowing from 010°. */
const COURSE: Waypoint[] = [
  { name: 'MARK 1 WW', position: moveAlong(ORIGIN, degrees(10), nauticalMiles(2.2)), arrivalRadius: 60 },
  { name: 'MARK 2 GATE', position: moveAlong(ORIGIN, degrees(190), nauticalMiles(0.15)), arrivalRadius: 60 },
  { name: 'MARK 3 WW', position: moveAlong(ORIGIN, degrees(8), nauticalMiles(2.2)), arrivalRadius: 60 },
  { name: 'FINISH', position: moveAlong(ORIGIN, degrees(195), nauticalMiles(0.2)), arrivalRadius: 80 }
]

/**
 * Round-the-buoys racing. Beats and runs alternate, so VMG is the number that
 * matters on every leg and the racing dashboard gets a proper workout. Tacks
 * are taken more eagerly than when cruising.
 */
export function racingScenario(): Scenario {
  let tack: Tack = 1
  let lastTackAt = 0
  let legIndex = 0

  return {
    id: 'racing',
    name: 'Racing',
    description: 'Windward–leeward course in 14 kt, four marks to round.',
    setup: {
      origin: ORIGIN,
      heading: degrees(45),
      timeOfDay: 12,
      wind: {
        baseDirection: degrees(10),
        baseSpeed: knots(14),
        oscillationAmplitude: degrees(9),
        oscillationPeriod: 150,
        gustiness: 0.2,
        wanderAmplitude: degrees(11)
      },
      atmosphere: { airTemperature: celsius(16), waterTemperature: celsius(14), pressure: 101300 },
      depth: { baseDepth: 38, variation: 18, featureSize: 600 },
      electrical: { initialStateOfCharge: 0.91 },
      current: { set: degrees(170), drift: knots(0.5) },
      aisTargets: coastalTraffic(),
      destination: COURSE[0] ?? null,
      extraLoad: 25
    },

    step(runtime: ScenarioRuntime, _dt: number): Controls {
      const mark = COURSE[legIndex]
      if (!mark) {
        // Course finished — reach around and wait.
        return {
          targetHeading: runtime.state.heading,
          throttle: 0,
          sailsUp: true,
          anchored: false,
          moored: false
        }
      }

      if (distanceBetween(runtime.state.position, mark.position) < mark.arrivalRadius) {
        runtime.announce(`rounded ${mark.name}`)
        legIndex += 1
        runtime.destination = COURSE[legIndex] ?? null
        lastTackAt = runtime.elapsed // free to tack immediately after a rounding
      }

      const wind = runtime.state.wind.directionTrue
      const plan = sailingHeading(runtime.state.position, wind, mark.position, tack)

      if (!plan.layingMark && plan.suggestedTack !== tack && runtime.elapsed - lastTackAt > 40) {
        tack = plan.suggestedTack
        lastTackAt = runtime.elapsed
        return {
          targetHeading: sailingHeading(runtime.state.position, wind, mark.position, tack).heading,
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

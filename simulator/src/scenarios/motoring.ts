import { coastalTraffic } from '../model/ais.js'
import { bearingTo, distanceBetween, moveAlong } from '../model/geo.js'
import { celsius, degrees, knots, nauticalMiles } from '../model/units.js'
import type { Controls } from '../model/types.js'
import type { Scenario, ScenarioRuntime } from './types.js'

const ORIGIN = { latitude: 59.2455, longitude: 10.4802 }
const DESTINATION = moveAlong(ORIGIN, degrees(190), nauticalMiles(9))

/**
 * Transport leg under engine in a light headwind and a lumpy sea. The point of
 * this one is the comfort trade-off: the scenario eases the throttle when the
 * boat starts slamming, so the motoring dashboard has something to show.
 */
export function motoringScenario(): Scenario {
  let throttle = 0.75
  let arrived = false

  return {
    id: 'motoring',
    name: 'Motoring on passage',
    description: 'Engine on, 9 NM to run against a light headwind and short chop.',
    setup: {
      origin: ORIGIN,
      heading: degrees(190),
      timeOfDay: 9.25,
      wind: {
        baseDirection: degrees(195),
        baseSpeed: knots(9),
        oscillationAmplitude: degrees(8),
        oscillationPeriod: 190,
        gustiness: 0.22
      },
      atmosphere: { airTemperature: celsius(13), waterTemperature: celsius(12), pressure: 100900 },
      depth: { baseDepth: 55, variation: 30, featureSize: 900 },
      electrical: { initialStateOfCharge: 0.64 },
      current: { set: degrees(15), drift: knots(0.6) },
      aisTargets: coastalTraffic(),
      destination: {
        name: 'SANDEFJORD',
        position: DESTINATION,
        arrivalRadius: 200
      },
      extraLoad: 70 // autopilot, radar, plotter
    },

    step(runtime: ScenarioRuntime, dt: number): Controls {
      const mark = runtime.destination?.position ?? DESTINATION
      const remaining = distanceBetween(runtime.state.position, mark)

      if (!arrived && remaining < (runtime.destination?.arrivalRadius ?? 200)) {
        arrived = true
        runtime.announce('destination reached, coming off the throttle')
      }

      // Back off when the pitching gets uncomfortable, ease back on when it settles.
      const pitching = Math.abs(runtime.state.pitch)
      if (pitching > degrees(3.5)) {
        throttle = Math.max(0.45, throttle - 0.05 * dt)
      } else if (pitching < degrees(2)) {
        throttle = Math.min(0.8, throttle + 0.02 * dt)
      }

      return {
        targetHeading: bearingTo(runtime.state.position, mark),
        throttle: arrived ? 0.15 : throttle,
        sailsUp: false,
        anchored: false,
        moored: false
      }
    }
  }
}

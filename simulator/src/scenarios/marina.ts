import { stationaryNeighbours } from '../model/ais.js'
import { celsius, degrees, knots } from '../model/units.js'
import type { Controls } from '../model/types.js'
import type { Scenario, ScenarioRuntime } from './types.js'

const BERTH = { latitude: 59.4103, longitude: 10.4835 }

/** Seconds into the scenario at which each scripted event fires. */
const SHORE_POWER_TRIPS_AT = 600
const SHORE_POWER_RESTORED_AT = 780

/**
 * Alongside in a marina overnight. Nothing moves, so the interesting behaviour
 * is electrical: the boat runs off shore power until the pedestal trips, the
 * bank starts discharging, and then shore power comes back.
 */
export function marinaScenario(): Scenario {
  let tripped = false
  let restored = false

  return {
    id: 'marina',
    name: 'In the marina',
    description: 'Alongside on shore power, with a breaker trip partway through the evening.',
    setup: {
      origin: BERTH,
      heading: degrees(285),
      timeOfDay: 19,
      wind: {
        baseDirection: degrees(250),
        baseSpeed: knots(6),
        oscillationAmplitude: degrees(20),
        oscillationPeriod: 120,
        gustiness: 0.4,
        wanderAmplitude: degrees(25)
      },
      atmosphere: { airTemperature: celsius(14), waterTemperature: celsius(13), pressure: 101600 },
      depth: { baseDepth: 4.2, variation: 0.8, featureSize: 120, minimumDepth: 2 },
      electrical: { initialStateOfCharge: 0.58 },
      current: { set: 0, drift: 0 },
      aisTargets: stationaryNeighbours(),
      anchor: { deployed: false, position: null, rodeLength: 0, alarmRadius: 0 },
      destination: null,
      shoreConnected: true,
      extraLoad: 180 // water heater, charger loads, cabin lights
    },

    step(runtime: ScenarioRuntime, _dt: number): Controls {
      if (!tripped && runtime.elapsed > SHORE_POWER_TRIPS_AT) {
        tripped = true
        runtime.electrical.setShoreConnected(false)
        runtime.announce('shore power lost — pedestal breaker tripped')
      }

      if (tripped && !restored && runtime.elapsed > SHORE_POWER_RESTORED_AT) {
        restored = true
        runtime.electrical.setShoreConnected(true)
        runtime.announce('shore power restored')
      }

      return {
        targetHeading: runtime.state.heading,
        throttle: 0,
        sailsUp: false,
        anchored: false,
        moored: true
      }
    }
  }
}

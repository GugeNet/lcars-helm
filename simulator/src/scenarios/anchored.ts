import { stationaryNeighbours } from '../model/ais.js'
import { moveAlong } from '../model/geo.js'
import { celsius, degrees, knots } from '../model/units.js'
import type { Controls } from '../model/types.js'
import type { Scenario, ScenarioRuntime } from './types.js'

const ANCHORAGE = { latitude: 59.0518, longitude: 10.9337 }

/** Seconds into the scenario at which each scripted event fires. */
const WIND_SHIFT_AT = 480
const WIND_BUILD_AT = 900
const DRAG_STARTS_AT = 1320

/**
 * A night at anchor that slowly goes wrong: the wind veers, then builds, then
 * the anchor starts to drag. This is the scenario the anchored dashboard and
 * its alarm exist for, so all three events are worth watching end to end.
 */
export function anchoredScenario(): Scenario {
  let shifted = false
  let built = false
  let dragging = false

  return {
    id: 'anchored',
    name: 'At anchor',
    description: 'Quiet anchorage, then a veering and building wind, then a dragging anchor.',
    setup: {
      origin: moveAlong(ANCHORAGE, degrees(210), 32),
      heading: degrees(30),
      timeOfDay: 20.5,
      wind: {
        baseDirection: degrees(30),
        baseSpeed: knots(8),
        oscillationAmplitude: degrees(12),
        oscillationPeriod: 300,
        gustiness: 0.25,
        wanderAmplitude: degrees(16)
      },
      atmosphere: { airTemperature: celsius(11), waterTemperature: celsius(13), pressure: 101200 },
      depth: { baseDepth: 8, variation: 3, featureSize: 250, minimumDepth: 3 },
      electrical: { initialStateOfCharge: 0.72 },
      current: { set: degrees(0), drift: 0 },
      aisTargets: stationaryNeighbours(),
      anchor: {
        deployed: true,
        position: ANCHORAGE,
        rodeLength: 38,
        alarmRadius: 45
      },
      destination: null,
      extraLoad: 22 // anchor light, fridge, instruments on standby
    },

    step(runtime: ScenarioRuntime, dt: number): Controls {
      if (!shifted && runtime.elapsed > WIND_SHIFT_AT) {
        shifted = true
        runtime.wind.reconfigure({ baseDirection: degrees(140) })
        runtime.atmosphere.setPressureTrend(-1.4)
        runtime.announce('wind veering to the south-east, glass falling')
      }

      if (!built && runtime.elapsed > WIND_BUILD_AT) {
        built = true
        runtime.wind.reconfigure({ baseSpeed: knots(24), gustiness: 0.34 })
        runtime.announce('wind building to 24 kt')
      }

      if (!dragging && runtime.elapsed > DRAG_STARTS_AT) {
        dragging = true
        runtime.announce('anchor has broken out and is dragging')
      }

      if (dragging && runtime.anchor.position) {
        // The anchor skips downwind at a little under half a knot.
        const downwind = runtime.state.wind.directionTrue + Math.PI
        runtime.anchor = {
          ...runtime.anchor,
          position: moveAlong(runtime.anchor.position, downwind, knots(0.4) * dt)
        }
      }

      return {
        targetHeading: runtime.state.heading,
        throttle: 0,
        sailsUp: false,
        anchored: true,
        moored: false
      }
    }
  }
}

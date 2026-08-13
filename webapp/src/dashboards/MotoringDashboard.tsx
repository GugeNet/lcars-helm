import type { ReactNode } from 'react'
import { Gauge, Readout } from '../lcars/index.js'
import {
  bearing,
  celsius,
  clockTime,
  duration,
  knots,
  metres,
  nauticalMiles,
  NO_DATA,
  relativeAngle,
  rpm
} from '../format.js'
import { useNumbers } from '../store/vesselStore.js'
import { coolantTone, depthTone } from './tones.js'

const WATCHED = [
  'speedOverGround',
  'headingTrue',
  'courseOverGround',
  'depthBelowTransducer',
  'engineRevolutions',
  'engineTemperature',
  'engineFuelRate',
  'nextPointDistance',
  'nextPointTimeToGo'
] as const

/** Cruising revolutions, used as the top of the tachometer bar. */
const MAX_RPM = 3000

/**
 * Motoring on passage: distance to run and whether the engine is happy.
 *
 * Pitch appears next to the throttle numbers because on a transport leg the
 * trade-off being made all day is speed against how much the boat is slamming.
 */
export function MotoringDashboard({ pitch }: { pitch: number | null }): ReactNode {
  const values = useNumbers(WATCHED)

  const eta = values.nextPointTimeToGo === null ? null : Date.now() + values.nextPointTimeToGo * 1000
  const revolutions = values.engineRevolutions === null ? null : values.engineRevolutions * 60

  return (
    <div className="dash dash--motoring">
      <div className="dash-cell--wide dash-cell--hero">
        <Readout label="Speed over ground" value={knots(values.speedOverGround)} unit="kn" hero />
      </div>
      <div className="dash-cell--wide">
        <Readout label="Engine" value={rpm(values.engineRevolutions)} unit="rpm" />
        <Gauge fraction={revolutions === null ? null : revolutions / MAX_RPM} />
      </div>

      <div>
        <Readout label="Heading" value={bearing(values.headingTrue)} unit="°T" />
      </div>
      <div>
        <Readout label="Course" value={bearing(values.courseOverGround)} unit="°T" />
      </div>
      <div>
        <Readout
          label="Coolant"
          value={celsius(values.engineTemperature, 0)}
          unit="°C"
          tone={coolantTone(values.engineTemperature)}
        />
      </div>
      <div>
        <Readout label="Fuel" value={fuelLitresPerHour(values.engineFuelRate)} unit="L/h" />
      </div>

      <div>
        <Readout
          label="Depth"
          value={metres(values.depthBelowTransducer)}
          unit="m"
          tone={depthTone(values.depthBelowTransducer)}
        />
      </div>
      <div>
        <Readout label="Pitch" value={pitch === null ? NO_DATA : relativeAngle(pitch)} />
      </div>
      <div>
        <Readout label="To go" value={nauticalMiles(values.nextPointDistance, 1)} unit="NM" />
      </div>
      <div>
        <Readout
          label={`ETA · ${duration(values.nextPointTimeToGo)} to run`}
          value={clockTime(eta)}
        />
      </div>
    </div>
  )
}

/** Signal K reports fuel rate in m³/s; the gauge on the panel reads litres per hour. */
function fuelLitresPerHour(cubicMetresPerSecond: number | null): string {
  if (cubicMetresPerSecond === null || !Number.isFinite(cubicMetresPerSecond)) return NO_DATA
  return (cubicMetresPerSecond * 3_600_000).toFixed(1)
}

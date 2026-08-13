import type { ReactNode } from 'react'
import { Readout } from '../lcars/index.js'
import {
  bearing,
  clockTime,
  duration,
  knots,
  metres,
  nauticalMiles,
  NO_DATA,
  relativeAngle
} from '../format.js'
import { useNumbers } from '../store/vesselStore.js'
import { depthTone, heelTone } from './tones.js'

const WATCHED = [
  'speedOverGround',
  'speedThroughWater',
  'headingTrue',
  'courseOverGround',
  'windAngleApparent',
  'windSpeedApparent',
  'windAngleTrue',
  'windSpeedTrue',
  'depthBelowTransducer',
  'nextPointDistance',
  'nextPointTimeToGo'
] as const

/**
 * Cruising under sail: how is she going, and when do we get there.
 *
 * Speed leads because it is the number a cruising crew glances at most, the
 * wind sits beside it, and the arrival figures close the bottom row. Heel earns
 * its place here rather than in racing — off watch, it decides whether anyone
 * can sleep.
 */
export function CruisingDashboard({ heel }: { heel: number | null }): ReactNode {
  const values = useNumbers(WATCHED)

  const eta = values.nextPointTimeToGo === null ? null : Date.now() + values.nextPointTimeToGo * 1000
  const etaLabel =
    values.nextPointDistance === null
      ? 'ETA'
      : `ETA · ${nauticalMiles(values.nextPointDistance, 1)} NM, ${duration(values.nextPointTimeToGo)}`

  return (
    <div className="dash dash--cruising">
      <div className="dash-cell--wide dash-cell--hero">
        <Readout label="Speed over ground" value={knots(values.speedOverGround)} unit="kn" hero />
      </div>
      <div>
        <Readout label="Apparent wind" value={relativeAngle(values.windAngleApparent)} />
      </div>
      <div>
        <Readout label="Apparent speed" value={knots(values.windSpeedApparent)} unit="kn" />
      </div>

      <div>
        <Readout label="Heading" value={bearing(values.headingTrue)} unit="°T" />
      </div>
      <div>
        <Readout label="Course" value={bearing(values.courseOverGround)} unit="°T" />
      </div>
      <div>
        <Readout label="Through water" value={knots(values.speedThroughWater)} unit="kn" />
      </div>
      <div>
        <Readout
          label="Heel"
          value={heel === null ? NO_DATA : relativeAngle(heel)}
          tone={heelTone(heel)}
        />
      </div>

      <div>
        <Readout label="True wind" value={relativeAngle(values.windAngleTrue)} />
      </div>
      <div>
        <Readout label="True speed" value={knots(values.windSpeedTrue)} unit="kn" />
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
        <Readout label={etaLabel} value={clockTime(eta)} />
      </div>
    </div>
  )
}

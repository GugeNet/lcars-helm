import type { ReactNode } from 'react'
import { Panel, Readout, TrendGraph } from '../lcars/index.js'
import { bearing, knots, nauticalMiles, relativeAngle } from '../format.js'
import { useHistory, unwrapAngles } from '../store/useHistory.js'
import { useNumbers } from '../store/vesselStore.js'

const WATCHED = [
  'nextPointVmg',
  'speedOverGround',
  'speedThroughWater',
  'headingTrue',
  'courseOverGround',
  'windAngleTrue',
  'windSpeedTrue',
  'windAngleApparent',
  'windSpeedApparent',
  'nextPointDistance',
  'nextPointBearing'
] as const

/**
 * Racing: velocity made good to the next mark, and nothing that distracts from
 * it.
 *
 * VMG takes the hero slot because it is the only number that says whether the
 * last shift was worth taking. The wind-direction trend below it is what a
 * tactician actually reads — the oscillation, not the instantaneous heading —
 * so it is drawn unwrapped, without the jump through north.
 */
export function RacingDashboard(): ReactNode {
  const values = useNumbers(WATCHED)
  const windDirectionHistory = useHistory('windDirectionTrue', { intervalMs: 4000, samples: 75 })
  const unwrapped = unwrapAngles(windDirectionHistory)

  // Which side of the course the mark is on, given where the boat is heading.
  const markRelative =
    values.nextPointBearing === null || values.headingTrue === null
      ? null
      : values.nextPointBearing - values.headingTrue

  return (
    <div className="dash dash--racing">
      <div className="dash-cell--wide dash-cell--hero">
        <Readout label="VMG to mark" value={knots(values.nextPointVmg)} unit="kn" hero />
      </div>
      <div>
        <Readout label="True wind angle" value={relativeAngle(values.windAngleTrue)} />
      </div>
      <div>
        <Readout label="True wind speed" value={knots(values.windSpeedTrue)} unit="kn" />
      </div>

      <div>
        <Readout label="Boat speed" value={knots(values.speedThroughWater)} unit="kn" />
      </div>
      <div>
        <Readout label="Heading" value={bearing(values.headingTrue)} unit="°T" />
      </div>
      <div>
        <Readout label="Apparent wind" value={relativeAngle(values.windAngleApparent)} />
      </div>
      <div>
        <Readout label="Apparent speed" value={knots(values.windSpeedApparent)} unit="kn" />
      </div>

      <div className="dash-trend dash-cell--wide">
        <Panel title="True wind direction · last five minutes">
          <TrendGraph samples={unwrapped} label="True wind direction trend" />
        </Panel>
      </div>
      <div>
        <Readout label="Mark bearing" value={bearing(values.nextPointBearing)} unit="°T" />
      </div>
      <div>
        <Readout
          label={`To mark${markRelative === null ? '' : ` · ${relativeAngle(markRelative)}`}`}
          value={nauticalMiles(values.nextPointDistance, 2)}
          unit="NM"
        />
      </div>
    </div>
  )
}

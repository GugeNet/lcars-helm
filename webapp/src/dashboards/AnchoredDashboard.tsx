import type { ReactNode } from 'react'
import { Panel, PillButton, Readout, TrendGraph } from '../lcars/index.js'
import { bearing, hectopascal, knots, metres, NO_DATA, percent } from '../format.js'
import { unwrapAngles, useHistory } from '../store/useHistory.js'
import { useNumbers, usePosition } from '../store/vesselStore.js'
import {
  MAX_ALARM_RADIUS,
  MIN_ALARM_RADIUS,
  useAnchorStore,
  useAnchorWatch
} from '../situations/anchorStore.js'
import { AnchorPlot } from './AnchorPlot.js'
import { chargeTone, depthTone } from './tones.js'

const WATCHED = [
  'windSpeedApparent',
  'windDirectionTrue',
  'depthBelowTransducer',
  'pressure',
  'batteryStateOfCharge',
  'batteryCurrent'
] as const

const RADIUS_STEP = 5

/**
 * At anchor. Three things matter overnight: whether the boat is staying put,
 * what the wind is doing, and whether the batteries will last until morning.
 *
 * Distance from the anchor is the hero number and turns red the moment the boat
 * leaves the circle. The wind-direction trend beside it is what tells you a
 * shift is coming before the boat swings onto a lee shore.
 */
export function AnchoredDashboard(): ReactNode {
  const values = useNumbers(WATCHED)
  const position = usePosition()
  const { anchor, alarmRadius, distance, breached, track } = useAnchorWatch()
  const drop = useAnchorStore((state) => state.drop)
  const weigh = useAnchorStore((state) => state.weigh)
  const setAlarmRadius = useAnchorStore((state) => state.setAlarmRadius)

  const windDirectionHistory = unwrapAngles(
    useHistory('windDirectionTrue', { intervalMs: 15_000, samples: 80 })
  )

  return (
    <div className="dash dash--anchored">
      <div className="dash-cell--wide dash-cell--hero" style={{ gridArea: 'dist' }}>
        <Readout
          label={anchor ? `From anchor · circle ${alarmRadius} m` : 'Anchor not set'}
          value={distance === null ? NO_DATA : metres(distance, 0)}
          unit="m"
          hero
          tone={breached ? 'alarm' : 'normal'}
        />
      </div>

      <div style={{ gridArea: 'wind' }}>
        <Readout label="Wind" value={knots(values.windSpeedApparent)} unit="kn" />
      </div>

      <div style={{ gridArea: 'dir' }}>
        <Readout label="Wind from" value={bearing(values.windDirectionTrue)} unit="°T" />
      </div>
      <div style={{ gridArea: 'depth' }}>
        <Readout
          label="Depth"
          value={metres(values.depthBelowTransducer)}
          unit="m"
          tone={depthTone(values.depthBelowTransducer)}
        />
      </div>
      <div style={{ gridArea: 'soc' }}>
        <Readout
          label={`Battery · ${values.batteryCurrent === null ? '—' : `${values.batteryCurrent.toFixed(0)} A`}`}
          value={percent(values.batteryStateOfCharge)}
          unit="%"
          tone={chargeTone(values.batteryStateOfCharge)}
        />
      </div>

      <div className="dash-trend" style={{ gridArea: 'trend' }}>
        <Panel title={`Wind direction · last twenty minutes · ${hectopascal(values.pressure)} mb`}>
          <TrendGraph samples={windDirectionHistory} label="Wind direction trend" />
        </Panel>
      </div>

      <div className="dash-cell--plain" style={{ gridArea: 'plot', display: 'flex', flexDirection: 'column', gap: 'var(--lcars-gap)', minHeight: 0 }}>
        <div className="anchor-plot__frame">
          <AnchorPlot
            anchor={anchor?.position ?? null}
            boat={position}
            track={track}
            alarmRadius={alarmRadius}
            breached={breached}
          />
        </div>
        <div style={{ display: 'flex', gap: 'var(--lcars-gap)', flex: '0 0 auto' }}>
          {anchor ? (
            <>
              <PillButton
                onClick={() => setAlarmRadius(alarmRadius - RADIUS_STEP)}
                disabled={alarmRadius <= MIN_ALARM_RADIUS}
                aria-label="Reduce the alarm radius"
              >
                −
              </PillButton>
              <PillButton
                onClick={() => setAlarmRadius(alarmRadius + RADIUS_STEP)}
                disabled={alarmRadius >= MAX_ALARM_RADIUS}
                aria-label="Increase the alarm radius"
              >
                +
              </PillButton>
              <PillButton onClick={weigh} style={{ flex: '1 1 auto' }}>
                Weigh
              </PillButton>
            </>
          ) : (
            <PillButton
              onClick={() => position && drop(position)}
              disabled={position === null}
              style={{ flex: '1 1 auto' }}
            >
              Set anchor here
            </PillButton>
          )}
        </div>
      </div>
    </div>
  )
}

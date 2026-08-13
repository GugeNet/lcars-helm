import type { ReactNode } from 'react'
import { Gauge, Panel, Readout, TrendGraph } from '../lcars/index.js'
import { bearing, celsius, clockTime, hectopascal, knots, metres, percent, watts } from '../format.js'
import { useHistory } from '../store/useHistory.js'
import { useNumbers } from '../store/vesselStore.js'
import { chargeTone, depthTone } from './tones.js'
import { SHORE_CONNECTED_WATTS } from '../situations/detect.js'

const WATCHED = [
  'batteryStateOfCharge',
  'batteryVoltage',
  'batteryCurrent',
  'shorePower',
  'solarPower',
  'depthBelowTransducer',
  'windSpeedApparent',
  'windDirectionTrue',
  'airTemperature',
  'pressure'
] as const

/**
 * Alongside in a marina. Nothing is moving, so the panel turns to the two
 * things that actually go wrong on a berth: the shore lead tripping out
 * overnight, and the tide leaving the boat sitting on the bottom.
 */
export function MarinaDashboard(): ReactNode {
  const values = useNumbers(WATCHED)
  const depthHistory = useHistory('depthBelowTransducer', { intervalMs: 30_000, samples: 80 })

  const onShorePower = values.shorePower !== null && values.shorePower > SHORE_CONNECTED_WATTS

  return (
    <div className="dash dash--marina">
      <div className="dash-cell--wide dash-cell--hero">
        <Readout
          label={`House bank · ${values.batteryVoltage === null ? '—' : `${values.batteryVoltage.toFixed(1)} V`}`}
          value={percent(values.batteryStateOfCharge)}
          unit="%"
          hero
          tone={chargeTone(values.batteryStateOfCharge)}
        />
        <Gauge fraction={values.batteryStateOfCharge} tone={chargeTone(values.batteryStateOfCharge)} />
      </div>
      <div>
        <Readout
          label="Shore power"
          value={onShorePower ? watts(values.shorePower) : 'OFF'}
          unit={onShorePower ? 'W' : undefined}
          tone={onShorePower ? 'normal' : 'warn'}
        />
      </div>
      <div>
        <Readout label="Solar" value={watts(values.solarPower)} unit="W" />
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
        <Readout label="Wind" value={knots(values.windSpeedApparent)} unit="kn" />
      </div>
      <div>
        <Readout label="Wind from" value={bearing(values.windDirectionTrue)} unit="°T" />
      </div>
      <div>
        <Readout label="Time" value={clockTime(Date.now())} />
      </div>

      <div className="dash-trend dash-cell--wide">
        <Panel title="Depth · last forty minutes">
          <TrendGraph samples={depthHistory} filled label="Depth trend" />
        </Panel>
      </div>
      <div>
        <Readout label="Air" value={celsius(values.airTemperature)} unit="°C" />
      </div>
      <div>
        <Readout label="Pressure" value={hectopascal(values.pressure)} unit="mb" />
      </div>
    </div>
  )
}

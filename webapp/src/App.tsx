import { bearing, celsius, knots, metres, relativeAngle } from './format.js'
import { useConnection, useNumbers } from './store/vesselStore.js'

const WATCHED = [
  'headingTrue',
  'courseOverGround',
  'speedOverGround',
  'speedThroughWater',
  'windAngleApparent',
  'windSpeedApparent',
  'windSpeedTrue',
  'depthBelowTransducer',
  'waterTemperature'
] as const

/**
 * A plain readout of the live Signal K values. The LCARS interface proper is
 * built on top of this data layer; this view exists so the connection can be
 * checked on its own.
 */
export function App(): JSX.Element {
  const connection = useConnection()
  const values = useNumbers(WATCHED)

  const rows: [string, string][] = [
    ['Heading', `${bearing(values.headingTrue)}°`],
    ['COG', `${bearing(values.courseOverGround)}°`],
    ['SOG', `${knots(values.speedOverGround)} kn`],
    ['STW', `${knots(values.speedThroughWater)} kn`],
    ['AWA', relativeAngle(values.windAngleApparent)],
    ['AWS', `${knots(values.windSpeedApparent)} kn`],
    ['TWS', `${knots(values.windSpeedTrue)} kn`],
    ['Depth', `${metres(values.depthBelowTransducer)} m`],
    ['Water', `${celsius(values.waterTemperature)} °C`]
  ]

  return (
    <main style={{ padding: '2rem', fontSize: '1.5rem' }}>
      <h1 style={{ letterSpacing: '0.2em' }}>LCARS HELM</h1>
      <p>Signal K: {connection}</p>
      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content max-content', gap: '0.5rem 2rem' }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'contents' }}>
            <dt>{label}</dt>
            <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</dd>
          </div>
        ))}
      </dl>
    </main>
  )
}

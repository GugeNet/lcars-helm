import { useMemo, type ReactNode } from 'react'
import { offsetMetres } from '../geo.js'
import type { PositionValue } from '../signalk/paths.js'

export interface AnchorPlotProps {
  anchor: PositionValue | null
  boat: PositionValue | null
  /** Swing track, oldest first. */
  track: PositionValue[]
  alarmRadius: number
  breached: boolean
}

const VIEW = 100
const CENTRE = VIEW / 2

/**
 * A plan view of the anchorage, anchor at the centre.
 *
 * The scale follows the alarm circle and the track, so the picture stays
 * readable whether the boat is sitting quietly on a short scope or ranging
 * around on a long one. North is up — at anchor the wind does the moving, and a
 * head-up plot would spin all night.
 */
export function AnchorPlot({
  anchor,
  boat,
  track,
  alarmRadius,
  breached
}: AnchorPlotProps): ReactNode {
  const geometry = useMemo(() => {
    if (!anchor) return null

    const points = track.map((position) => offsetMetres(anchor, position))
    const boatOffset = boat ? offsetMetres(anchor, boat) : null

    const furthest = Math.max(
      alarmRadius,
      boatOffset ? Math.hypot(boatOffset.east, boatOffset.north) : 0,
      ...points.map((point) => Math.hypot(point.east, point.north))
    )
    // A tenth of margin keeps the outermost swing off the edge of the panel.
    const metresPerUnit = (furthest * 1.15) / CENTRE || 1

    const toView = (offset: { east: number; north: number }): [number, number] => [
      CENTRE + offset.east / metresPerUnit,
      // North is up, so northward offsets move towards smaller y.
      CENTRE - offset.north / metresPerUnit
    ]

    return {
      radius: alarmRadius / metresPerUnit,
      boat: boatOffset ? toView(boatOffset) : null,
      trackPath:
        points.length > 1
          ? points
              .map((point, index) => {
                const [x, y] = toView(point)
                return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
              })
              .join(' ')
          : null
    }
  }, [anchor, boat, track, alarmRadius])

  if (!geometry) {
    return <svg className="anchor-plot" role="img" aria-label="No anchor set" />
  }

  return (
    <svg
      className="anchor-plot"
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      role="img"
      aria-label={breached ? 'Anchor watch: outside the alarm circle' : 'Anchor watch'}
    >
      <circle
        className={`anchor-plot__alarm-circle${breached ? ' anchor-plot__alarm-circle--breached' : ''}`}
        cx={CENTRE}
        cy={CENTRE}
        r={geometry.radius}
      />
      {geometry.trackPath ? <path className="anchor-plot__track" d={geometry.trackPath} /> : null}
      {geometry.boat ? (
        <line
          className="anchor-plot__rode"
          x1={CENTRE}
          y1={CENTRE}
          x2={geometry.boat[0]}
          y2={geometry.boat[1]}
        />
      ) : null}
      <circle className="anchor-plot__anchor" cx={CENTRE} cy={CENTRE} r={2.4} />
      {geometry.boat ? (
        <circle
          className={`anchor-plot__boat${breached ? ' anchor-plot__boat--breached' : ''}`}
          cx={geometry.boat[0]}
          cy={geometry.boat[1]}
          r={3.2}
        />
      ) : null}
    </svg>
  )
}

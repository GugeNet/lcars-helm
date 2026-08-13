import { useMemo, type ReactNode } from 'react'

export interface TrendGraphProps {
  /** Oldest first. Nulls mark gaps where the instrument had nothing to say. */
  samples: (number | null)[]
  /** Fix the vertical scale; by default it follows the data. */
  min?: number
  max?: number
  /** Draw a filled area beneath the line. */
  filled?: boolean
  /** Value at which to draw a reference line, e.g. the mean wind direction. */
  reference?: number
  label?: string
}

const VIEW_WIDTH = 100
const VIEW_HEIGHT = 100

/**
 * A sparkline. Wind strength and direction over the last several minutes tell
 * you more about what the weather is doing than any instantaneous reading, and
 * at anchor that trend is the whole point.
 */
export function TrendGraph({
  samples,
  min,
  max,
  filled = false,
  reference,
  label
}: TrendGraphProps): ReactNode {
  const geometry = useMemo(() => {
    const present = samples.filter((value): value is number => value !== null)
    if (present.length < 2) return null

    const lowest = min ?? Math.min(...present, ...(reference === undefined ? [] : [reference]))
    const highest = max ?? Math.max(...present, ...(reference === undefined ? [] : [reference]))
    // A flat trace still needs a range, or every point lands on the same pixel.
    const span = highest - lowest || 1

    const x = (index: number): number =>
      samples.length < 2 ? 0 : (index / (samples.length - 1)) * VIEW_WIDTH
    const y = (value: number): number => VIEW_HEIGHT - ((value - lowest) / span) * VIEW_HEIGHT

    // Break the path at gaps rather than drawing a straight line across them.
    const segments: string[] = []
    let current: string[] = []
    samples.forEach((value, index) => {
      if (value === null) {
        if (current.length > 1) segments.push(current.join(' '))
        current = []
        return
      }
      current.push(`${current.length === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(value).toFixed(2)}`)
    })
    if (current.length > 1) segments.push(current.join(' '))

    const firstIndex = samples.findIndex((value) => value !== null)
    const lastIndex = samples.length - 1 - [...samples].reverse().findIndex((value) => value !== null)
    const area =
      filled && segments.length > 0
        ? `${segments.join(' ')} L${x(lastIndex).toFixed(2)},${VIEW_HEIGHT} L${x(firstIndex).toFixed(2)},${VIEW_HEIGHT} Z`
        : null

    return {
      line: segments.join(' '),
      area,
      referenceY: reference === undefined ? null : y(reference)
    }
  }, [samples, min, max, filled, reference])

  if (!geometry) return <svg className="lcars-trend" role="img" aria-label={label} />

  return (
    <svg
      className="lcars-trend"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {geometry.area ? <path className="lcars-trend__area" d={geometry.area} /> : null}
      {geometry.referenceY !== null ? (
        <line
          className="lcars-trend__axis"
          x1={0}
          x2={VIEW_WIDTH}
          y1={geometry.referenceY}
          y2={geometry.referenceY}
        />
      ) : null}
      <path className="lcars-trend__line" d={geometry.line} />
    </svg>
  )
}

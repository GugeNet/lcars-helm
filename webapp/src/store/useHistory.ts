import { useEffect, useState } from 'react'
import { PATHS, type PathKey } from '../signalk/paths.js'
import { STALE_AFTER_MS, useVesselStore } from './vesselStore.js'

export interface HistoryOptions {
  /** Seconds between samples. */
  intervalMs?: number
  /** How many samples to keep; the trend covers intervalMs × samples. */
  samples?: number
}

/**
 * A rolling window of one path's recent values, for the trend graphs.
 *
 * It samples on a timer rather than recording every delta: what matters on a
 * wind trend is the shape over the last half hour, and keeping one value every
 * few seconds costs nothing on a Raspberry Pi.
 */
export function useHistory(key: PathKey, options: HistoryOptions = {}): (number | null)[] {
  const intervalMs = options.intervalMs ?? 5000
  const sampleCount = options.samples ?? 60

  const [history, setHistory] = useState<(number | null)[]>(() =>
    new Array<number | null>(sampleCount).fill(null)
  )

  useEffect(() => {
    setHistory(new Array<number | null>(sampleCount).fill(null))

    const sample = (): void => {
      // Read imperatively: this hook must not re-render on every delta, only on
      // its own timer.
      const entry = useVesselStore.getState().values[PATHS[key]]
      const fresh = entry !== undefined && Date.now() - entry.timestamp < STALE_AFTER_MS
      const value = fresh && typeof entry.value === 'number' ? entry.value : null
      setHistory((previous) => [...previous.slice(1), value])
    }

    sample()
    const timer = setInterval(sample, intervalMs)
    return () => clearInterval(timer)
  }, [key, intervalMs, sampleCount])

  return history
}

/**
 * Remove the 0°/360° discontinuity from a series of angles so that a wind
 * direction oscillating around north draws as a line rather than a sawtooth.
 * The absolute values shift, but the shape — which is the point — is preserved.
 */
export function unwrapAngles(samples: (number | null)[]): (number | null)[] {
  const TWO_PI = Math.PI * 2
  let offset = 0
  let previous: number | null = null

  return samples.map((value) => {
    if (value === null) return null
    if (previous === null) {
      previous = value
      return value + offset
    }
    let delta = value - previous
    // Any apparent jump of more than half a turn is really a wrap the short way.
    while (delta > Math.PI) {
      offset -= TWO_PI
      delta -= TWO_PI
    }
    while (delta < -Math.PI) {
      offset += TWO_PI
      delta += TWO_PI
    }
    previous = value
    return value + offset
  })
}

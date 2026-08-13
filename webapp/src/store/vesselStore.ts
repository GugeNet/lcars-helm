import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { SignalKClient, type ConnectionState, type SignalKValue } from '../signalk/client.js'
import { isAttitude, isPosition, PATHS, type AttitudeValue, type PathKey, type PositionValue } from '../signalk/paths.js'

/** How long a value stays trustworthy before the display treats it as missing. */
export const STALE_AFTER_MS = 15_000

/**
 * How long the whole stream may go quiet before the display says so. Instruments
 * report several times a second, so ten seconds of complete silence means
 * something has stopped — not that the boat is sitting still.
 */
export const DATA_SILENT_AFTER_MS = 10_000

export type DataHealth =
  /** Deltas are arriving. */
  | 'live'
  /** Connected, but nothing has arrived for a while. */
  | 'stale'
  /** Connected to Signal K, but it has never sent anything. */
  | 'no-data'
  /** No usable connection to Signal K at all. */
  | 'disconnected'

/**
 * Judge whether the display can be believed.
 *
 * The distinction that matters is between losing Signal K and Signal K losing
 * the boat: a blank screen means something very different depending on which,
 * and the crew cannot tell them apart by looking at empty readouts.
 */
export function assessDataHealth(input: {
  connection: ConnectionState
  /** Newest instrument timestamp, not the time a delta last arrived. */
  newestDataAt: number | null
  now: number
}): DataHealth {
  if (input.connection !== 'open') return 'disconnected'
  if (input.newestDataAt === null) return 'no-data'
  return input.now - input.newestDataAt > DATA_SILENT_AFTER_MS ? 'stale' : 'live'
}

interface VesselState {
  connection: ConnectionState
  /** Every path we have seen, keyed by its Signal K path. */
  values: Record<string, SignalKValue>
  /**
   * The newest instrument timestamp seen, not the time a delta last arrived.
   *
   * Signal K keeps re-sending its cached values long after the source has gone
   * away — with the simulator killed it still streams a couple of hundred
   * deltas a minute, all tagged with the gateway that stopped talking. What it
   * does not do is falsify the timestamps, so those are the only trustworthy
   * evidence that the boat is still reporting.
   */
  newestDataAt: number | null
  apply: (batch: Map<string, SignalKValue>) => void
  setConnection: (state: ConnectionState) => void
}

export const useVesselStore = create<VesselState>((set) => ({
  connection: 'connecting',
  values: {},
  newestDataAt: null,
  apply: (batch) =>
    set((state) => {
      const values = { ...state.values }
      let newest = state.newestDataAt ?? 0
      for (const [path, value] of batch) {
        values[path] = value
        // The empty path carries server housekeeping rather than boat data, and
        // counting it would keep the display looking alive with nothing on it.
        if (path !== '' && Number.isFinite(value.timestamp) && value.timestamp > newest) {
          newest = value.timestamp
        }
      }
      return { values, newestDataAt: newest === 0 ? null : newest }
    }),
  setConnection: (connection) => set({ connection })
}))

let client: SignalKClient | null = null

/** Open the delta stream. Safe to call more than once; only the first connects. */
export function connectVesselStream(url?: string): void {
  if (client) return
  const { apply, setConnection } = useVesselStore.getState()
  client = new SignalKClient({
    url,
    onValues: apply,
    onState: setConnection
  })
  client.connect()
}

export function disconnectVesselStream(): void {
  client?.close()
  client = null
}

function readValue(values: Record<string, SignalKValue>, key: PathKey): SignalKValue | undefined {
  const entry = values[PATHS[key]]
  if (!entry) return undefined
  // An instrument that has stopped reporting is worse than no instrument: the
  // last value looks live and is quietly wrong, so it is dropped once stale.
  if (Date.now() - entry.timestamp > STALE_AFTER_MS) return undefined
  return entry
}

/** A numeric path, or null when it is missing or stale. */
export function useNumber(key: PathKey): number | null {
  return useVesselStore((state) => {
    const entry = readValue(state.values, key)
    return typeof entry?.value === 'number' ? entry.value : null
  })
}

export function usePosition(key: PathKey = 'position'): PositionValue | null {
  return useVesselStore(
    useShallow((state) => {
      const entry = readValue(state.values, key)
      return entry && isPosition(entry.value) ? entry.value : null
    })
  )
}

export function useAttitude(): AttitudeValue | null {
  return useVesselStore(
    useShallow((state) => {
      const entry = readValue(state.values, 'attitude')
      return entry && isAttitude(entry.value) ? entry.value : null
    })
  )
}

/** Several numeric paths at once, without re-rendering on unrelated changes. */
export function useNumbers<K extends PathKey>(keys: readonly K[]): Record<K, number | null> {
  return useVesselStore(
    useShallow((state) => {
      const result = {} as Record<K, number | null>
      for (const key of keys) {
        const entry = readValue(state.values, key)
        result[key] = typeof entry?.value === 'number' ? entry.value : null
      }
      return result
    })
  )
}

export function useConnection(): ConnectionState {
  return useVesselStore((state) => state.connection)
}

/**
 * Whether the display can be believed, re-evaluated on a timer.
 *
 * Staleness is a function of elapsed time rather than of anything arriving, so
 * it cannot be derived from deltas alone — when the data stops, so do the
 * re-renders that would notice.
 */
export function useDataHealth(): { health: DataHealth; silentForMs: number | null } {
  const connection = useVesselStore((state) => state.connection)
  const newestDataAt = useVesselStore((state) => state.newestDataAt)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000)
    return () => clearInterval(timer)
  }, [])

  return {
    health: assessDataHealth({ connection, newestDataAt, now }),
    silentForMs: newestDataAt === null ? null : Math.max(0, now - newestDataAt)
  }
}

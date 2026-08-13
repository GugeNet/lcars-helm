import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { SignalKClient, type ConnectionState, type SignalKValue } from '../signalk/client.js'
import { isAttitude, isPosition, PATHS, type AttitudeValue, type PathKey, type PositionValue } from '../signalk/paths.js'

/** How long a value stays trustworthy before the display treats it as missing. */
export const STALE_AFTER_MS = 15_000

interface VesselState {
  connection: ConnectionState
  /** Every path we have seen, keyed by its Signal K path. */
  values: Record<string, SignalKValue>
  /** When the last delta of any kind arrived. */
  lastUpdateAt: number | null
  apply: (batch: Map<string, SignalKValue>) => void
  setConnection: (state: ConnectionState) => void
}

export const useVesselStore = create<VesselState>((set) => ({
  connection: 'connecting',
  values: {},
  lastUpdateAt: null,
  apply: (batch) =>
    set((state) => {
      const values = { ...state.values }
      for (const [path, value] of batch) values[path] = value
      return { values, lastUpdateAt: Date.now() }
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

/** True once we are connected and data is actually flowing. */
export function useHasData(): boolean {
  return useVesselStore((state) => state.connection === 'open' && state.lastUpdateAt !== null)
}

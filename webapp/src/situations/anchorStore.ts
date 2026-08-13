import { useEffect } from 'react'
import { create } from 'zustand'
import { distanceBetween } from '../geo.js'
import type { PositionValue } from '../signalk/paths.js'
import { usePosition, useVesselStore } from '../store/vesselStore.js'

const STORAGE_KEY = 'lcars-helm.anchor'

/** How often the boat's position is added to the swing track, in ms. */
const TRACK_INTERVAL_MS = 10_000
/** How many track points to keep — about two hours at the interval above. */
const TRACK_POINTS = 720

export const MIN_ALARM_RADIUS = 15
export const MAX_ALARM_RADIUS = 150
export const DEFAULT_ALARM_RADIUS = 45

export interface AnchorFix {
  position: PositionValue
  droppedAt: number
}

interface PersistedAnchor {
  position: PositionValue
  droppedAt: number
  alarmRadius: number
}

function load(): PersistedAnchor | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedAnchor
    if (
      typeof parsed?.position?.latitude === 'number' &&
      typeof parsed?.position?.longitude === 'number' &&
      typeof parsed?.alarmRadius === 'number'
    ) {
      return parsed
    }
  } catch {
    // Corrupt or unavailable storage just means no anchor is remembered.
  }
  return null
}

function save(value: PersistedAnchor | null): void {
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Ignore; the anchor watch still works for this session.
  }
}

interface AnchorState {
  anchor: AnchorFix | null
  alarmRadius: number
  /** Positions the boat has occupied since the anchor went down, oldest first. */
  track: PositionValue[]
  /** True once the crew has silenced an alarm that is still sounding. */
  acknowledged: boolean
  drop: (position: PositionValue) => void
  weigh: () => void
  setAlarmRadius: (metres: number) => void
  addTrackPoint: (position: PositionValue) => void
  acknowledge: () => void
}

const persisted = load()

/**
 * The anchor watch keeps its own record of where the anchor was dropped rather
 * than relying on a Signal K plugin. It is the one piece of state the display
 * owns outright, it has to survive the browser reloading in the middle of the
 * night, and the crew must be able to set it with one tap from the cockpit.
 */
export const useAnchorStore = create<AnchorState>((set, get) => ({
  anchor: persisted ? { position: persisted.position, droppedAt: persisted.droppedAt } : null,
  alarmRadius: persisted?.alarmRadius ?? DEFAULT_ALARM_RADIUS,
  track: [],
  acknowledged: false,

  drop: (position) => {
    const anchor: AnchorFix = { position, droppedAt: Date.now() }
    save({ ...anchor, alarmRadius: get().alarmRadius })
    set({ anchor, track: [position], acknowledged: false })
  },

  weigh: () => {
    save(null)
    set({ anchor: null, track: [], acknowledged: false })
  },

  setAlarmRadius: (metres) => {
    const alarmRadius = Math.min(MAX_ALARM_RADIUS, Math.max(MIN_ALARM_RADIUS, Math.round(metres)))
    const { anchor } = get()
    if (anchor) save({ ...anchor, alarmRadius })
    // Widening the circle should silence an alarm that no longer applies.
    set({ alarmRadius, acknowledged: false })
  },

  addTrackPoint: (position) =>
    set((state) => ({
      track: [...state.track, position].slice(-TRACK_POINTS)
    })),

  acknowledge: () => set({ acknowledged: true })
}))

export interface AnchorWatch {
  anchor: AnchorFix | null
  alarmRadius: number
  /** Current distance from the anchor in metres, or null with no fix. */
  distance: number | null
  /** True when the boat is outside the alarm circle. */
  breached: boolean
  track: PositionValue[]
}

/** The live state of the anchor watch, recomputed from the boat's position. */
export function useAnchorWatch(): AnchorWatch {
  const anchor = useAnchorStore((state) => state.anchor)
  const alarmRadius = useAnchorStore((state) => state.alarmRadius)
  const track = useAnchorStore((state) => state.track)
  const position = usePosition()

  const distance = anchor && position ? distanceBetween(anchor.position, position) : null

  return {
    anchor,
    alarmRadius,
    distance,
    breached: distance !== null && distance > alarmRadius,
    track
  }
}

/**
 * Records the swing track while the anchor is down. Runs on a timer so the
 * track is evenly spaced in time regardless of how fast position deltas arrive.
 */
export function useAnchorTrackRecorder(): void {
  const anchorDown = useAnchorStore((state) => state.anchor !== null)
  const addTrackPoint = useAnchorStore((state) => state.addTrackPoint)

  useEffect(() => {
    if (!anchorDown) return

    const record = (): void => {
      const entry = useVesselStore.getState().values['navigation.position']
      const value = entry?.value as PositionValue | undefined
      if (value && typeof value.latitude === 'number') addTrackPoint(value)
    }

    record()
    const timer = setInterval(record, TRACK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [anchorDown, addTrackPoint])
}

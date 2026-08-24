import type { SituationId } from './types.js'

/** A knot in m/s, the unit everything here is measured in. */
const KNOT = 0.514444

/** Above this speed over ground the boat counts as under way. */
export const UNDER_WAY_SPEED = 1 * KNOT
/** Below this speed over ground the boat counts as stopped. */
export const STOPPED_SPEED = 0.5 * KNOT
/** Engine revolutions (Hz) above which the engine counts as running. */
export const ENGINE_RUNNING_HZ = 5

/**
 * How long a condition has to hold before the display offers to change
 * situation. A wind hole, a moment head to wind, or a brief burst of engine
 * while picking up a mooring should not prompt anything.
 */
export const SUGGESTION_STABILITY_MS = 45_000

export interface SituationSnapshot {
  /** Speed over ground, m/s. */
  speedOverGround: number | null
  /** Engine speed, Hz, as Signal K reports it. */
  engineRevolutions: number | null
  /** Whether the anchor alarm plugin has an anchor down. */
  anchorDown: boolean
  /** The Multiplus's own mains LED, 1 or 0 — not a power draw. */
  shoreConnected: number | null
}

export interface SituationSuggestion {
  situation: SituationId
  /** Shown to the crew so the suggestion can be judged, not just obeyed. */
  reason: string
}

/**
 * Work out which situation the boat appears to be in.
 *
 * Racing is deliberately never suggested: it is indistinguishable from cruising
 * from the sensors alone, and being dropped into a racing dashboard by surprise
 * is worse than having to press a button. The crew chooses that one.
 *
 * Returns null when the data does not support any confident answer.
 */
export function detectSituation(snapshot: SituationSnapshot): SituationSuggestion | null {
  const { speedOverGround, engineRevolutions, anchorDown, shoreConnected } = snapshot

  const engineRunning = engineRevolutions !== null && engineRevolutions > ENGINE_RUNNING_HZ
  const plugged = shoreConnected !== null && shoreConnected > 0
  const stopped = speedOverGround !== null && speedOverGround < STOPPED_SPEED
  const underWay = speedOverGround !== null && speedOverGround > UNDER_WAY_SPEED

  // Shore power is only available alongside, so it settles the question.
  if (plugged && stopped) {
    return { situation: 'marina', reason: 'on shore power and not moving' }
  }

  // The anchor being down is a deliberate act by the crew, so it outranks any
  // inference from speed — a boat sheering around at anchor can log a knot.
  if (anchorDown && speedOverGround !== null && speedOverGround < UNDER_WAY_SPEED) {
    return { situation: 'anchored', reason: 'anchor is down and the boat is lying to it' }
  }

  if (underWay && engineRunning) {
    return { situation: 'motoring', reason: 'engine running and making way' }
  }

  if (underWay && !engineRunning) {
    return { situation: 'cruising', reason: 'sailing with the engine off' }
  }

  return null
}

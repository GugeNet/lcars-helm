import { bearingTo, distanceBetween, type LatLon } from '../model/geo.js'
import { degrees, normalizeAngle, normalizeSigned } from '../model/units.js'
import type { VesselState } from '../model/types.js'

export type Tack = 1 | -1

export interface SailingPlan {
  /** Heading to steer, radians true, honouring the tack the boat is already on. */
  heading: number
  /** The tack that points closest to the mark; compare with the current one to decide when to tack. */
  suggestedTack: Tack
  /** True when the mark can be sailed directly. */
  layingMark: boolean
}

export interface SailingLimits {
  /** Closest the boat sails to the wind, radians. */
  closeHauled: number
  /** Deepest the boat sails downwind before gybing, radians. */
  broadReach: number
}

export const DEFAULT_LIMITS: SailingLimits = {
  closeHauled: degrees(42),
  broadReach: degrees(155)
}

/**
 * Work out what to steer for a mark, beating or running as required.
 *
 * When the mark lies inside the no-go zone the boat sails the limiting angle on
 * the tack it is currently on, and `suggestedTack` reports which tack points
 * closer. The caller decides when to act on that, so it can hold a tack long
 * enough to make ground rather than chattering back and forth on every shift.
 */
export function sailingHeading(
  position: LatLon,
  windDirection: number,
  mark: LatLon,
  currentTack: Tack,
  limits: SailingLimits = DEFAULT_LIMITS
): SailingPlan {
  const markBearing = bearingTo(position, mark)
  // The true wind angle the boat would have if it pointed straight at the mark.
  const requiredTwa = normalizeSigned(windDirection - markBearing)
  const magnitude = Math.abs(requiredTwa)

  if (magnitude >= limits.closeHauled && magnitude <= limits.broadReach) {
    return { heading: markBearing, suggestedTack: requiredTwa >= 0 ? 1 : -1, layingMark: true }
  }

  const limit = magnitude < limits.closeHauled ? limits.closeHauled : limits.broadReach
  const suggestedTack: Tack = requiredTwa === 0 ? currentTack : requiredTwa > 0 ? 1 : -1
  return {
    heading: normalizeAngle(windDirection - currentTack * limit),
    suggestedTack,
    layingMark: false
  }
}

/** Distance to the active waypoint in metres, or null when there is none. */
export function distanceToDestination(state: VesselState): number | null {
  if (!state.destination) return null
  return distanceBetween(state.position, state.destination.position)
}

/**
 * Velocity made good towards a mark: the component of the boat's motion over
 * ground that actually shortens the distance to it.
 */
export function velocityMadeGood(state: VesselState, mark: LatLon): number {
  const bearing = bearingTo(state.position, mark)
  return state.sog * Math.cos(normalizeSigned(bearing - state.cog))
}

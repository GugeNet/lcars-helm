/**
 * The simulator works in SI units throughout, matching both NMEA 2000 and Signal K:
 * angles in radians, speeds in m/s, temperatures in Kelvin, distances in metres.
 * Conversions live here so that scenario definitions can be written in the units
 * a sailor actually thinks in.
 */

export const KNOTS_TO_MS = 0.5144444444
export const NM_TO_M = 1852
export const KELVIN_OFFSET = 273.15
export const DEG_TO_RAD = Math.PI / 180
export const RAD_TO_DEG = 180 / Math.PI
export const TWO_PI = Math.PI * 2

export const knots = (value: number): number => value * KNOTS_TO_MS
export const toKnots = (value: number): number => value / KNOTS_TO_MS
export const degrees = (value: number): number => value * DEG_TO_RAD
export const toDegrees = (value: number): number => value * RAD_TO_DEG
export const celsius = (value: number): number => value + KELVIN_OFFSET
export const nauticalMiles = (value: number): number => value * NM_TO_M
export const feet = (value: number): number => value * 0.3048

/** Wrap an angle into [0, 2π). */
export function normalizeAngle(radians: number): number {
  const wrapped = radians % TWO_PI
  return wrapped < 0 ? wrapped + TWO_PI : wrapped
}

/** Wrap an angle into (-π, π] — the signed form used for wind and rudder angles. */
export function normalizeSigned(radians: number): number {
  const wrapped = normalizeAngle(radians)
  return wrapped > Math.PI ? wrapped - TWO_PI : wrapped
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Linear interpolation with `t` clamped to [0, 1]. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1)
}

/**
 * Move `current` towards `target` by at most `maxDelta`. Used for the many
 * first-order lags in the model (engine spooling up, heel building, and so on).
 */
export function approach(current: number, target: number, maxDelta: number): number {
  const delta = target - current
  if (Math.abs(delta) <= maxDelta) return target
  return current + Math.sign(delta) * maxDelta
}

/** Shortest signed angular difference from `from` to `to`, in (-π, π]. */
export function angleDifference(from: number, to: number): number {
  return normalizeSigned(to - from)
}

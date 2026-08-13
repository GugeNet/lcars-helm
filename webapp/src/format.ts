/**
 * Signal K delivers SI units. Sailors read knots, degrees, metres and Celsius,
 * so every value crosses this boundary exactly once, on its way to the screen.
 */
export const MS_TO_KNOTS = 1.9438444924
export const RAD_TO_DEG = 57.29577951308232
export const M_TO_NM = 1 / 1852

/** Placeholder shown whenever an instrument has not reported yet. */
export const NO_DATA = '- -'

export function knots(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  return (value * MS_TO_KNOTS).toFixed(digits)
}

/** Compass bearing, 0–359, zero-padded the way an instrument displays it. */
export function bearing(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  const degrees = ((value * RAD_TO_DEG) % 360 + 360) % 360
  return Math.round(degrees).toString().padStart(3, '0')
}

/**
 * A relative angle such as wind or rudder: magnitude plus the side it is on,
 * because "38 P" is read faster on a heeling boat than "-38".
 */
export function relativeAngle(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  let degrees = ((value * RAD_TO_DEG) % 360 + 360) % 360
  if (degrees > 180) degrees -= 360
  const side = degrees < 0 ? 'P' : 'S'
  return `${Math.round(Math.abs(degrees))}${side}`
}

export function signedDegrees(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  return (value * RAD_TO_DEG).toFixed(digits)
}

export function metres(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  return value.toFixed(digits)
}

export function nauticalMiles(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  return (value * M_TO_NM).toFixed(digits)
}

export function celsius(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  return (value - 273.15).toFixed(digits)
}

export function hectopascal(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  return Math.round(value / 100).toString()
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  return (value * 100).toFixed(digits)
}

export function watts(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  return Math.round(value).toString()
}

/** Engine speed arrives in Hz; the tachometer is in RPM. */
export function rpm(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  return Math.round(value * 60).toString()
}

/** A duration as `H:MM` or `M:SS`, whichever suits the magnitude. */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return NO_DATA
  }
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}:${minutes.toString().padStart(2, '0')}`
  }
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

/** Clock time in the local zone, `HH:MM`. */
export function clockTime(epochMs: number | null | undefined): string {
  if (epochMs === null || epochMs === undefined || !Number.isFinite(epochMs)) return NO_DATA
  const date = new Date(epochMs)
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

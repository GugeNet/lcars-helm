import type { ReadoutTone } from '../lcars/index.js'

/**
 * Where the thresholds live that turn a number amber or red. They are gathered
 * here so that "what counts as shallow" is answered once, and the same figure
 * is used by every dashboard that shows depth.
 */

/** Water depth below the transducer, in metres. */
export const DEPTH_WARN = 8
export const DEPTH_ALARM = 4

/** Heel angle, in degrees. */
export const HEEL_WARN = 20
export const HEEL_ALARM = 28

/** House bank state of charge, as a fraction. */
export const CHARGE_WARN = 0.5
export const CHARGE_ALARM = 0.3

/** Engine coolant temperature, in Kelvin. */
export const COOLANT_WARN = 273.15 + 96
export const COOLANT_ALARM = 273.15 + 104

export function depthTone(depth: number | null): ReadoutTone {
  if (depth === null) return 'normal'
  if (depth < DEPTH_ALARM) return 'alarm'
  if (depth < DEPTH_WARN) return 'warn'
  return 'normal'
}

export function heelTone(heelRadians: number | null): ReadoutTone {
  if (heelRadians === null) return 'normal'
  const degrees = Math.abs((heelRadians * 180) / Math.PI)
  if (degrees > HEEL_ALARM) return 'alarm'
  if (degrees > HEEL_WARN) return 'warn'
  return 'normal'
}

export function chargeTone(stateOfCharge: number | null): ReadoutTone {
  if (stateOfCharge === null) return 'normal'
  if (stateOfCharge < CHARGE_ALARM) return 'alarm'
  if (stateOfCharge < CHARGE_WARN) return 'warn'
  return 'normal'
}

export function coolantTone(kelvin: number | null): ReadoutTone {
  if (kelvin === null) return 'normal'
  if (kelvin > COOLANT_ALARM) return 'alarm'
  if (kelvin > COOLANT_WARN) return 'warn'
  return 'normal'
}

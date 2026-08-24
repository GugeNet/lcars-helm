import type { ReadoutTone } from '../lcars/index.js'
import { NO_DATA, watts } from '../format.js'

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

export interface ShorePowerReadout {
  value: string
  unit?: string
  tone: ReadoutTone
}

/**
 * Connection state comes from the Multiplus's own mains LED, not from AC-in
 * wattage: power draw legitimately falls to near zero once the charger
 * reaches float, which used to read as "unplugged" while the panel's own
 * mains LED — and the mains — stayed on the whole time. Wattage is still
 * shown once connected, since it is a genuinely useful number; it is just not
 * the one that decides on/off.
 *
 * "No reading has ever arrived" and "a reading arrived and it is off" collapse
 * to the same `null` in the data model, but they are not the same fact about
 * the boat — one is a gap in what the Cerbo can see, the other is confirmed.
 * Found the hard way: a Cerbo with no inverter/charger linked to it reports
 * this as `null` permanently, and a dashboard that shows "OFF" for that looks
 * exactly as confident as one reporting a genuine off state, which is not a
 * distinction to blur on a boat.
 */
export function describeShorePower(
  shorePowerWatts: number | null,
  shoreConnected: number | null
): ShorePowerReadout {
  if (shoreConnected === null) return { value: NO_DATA, tone: 'normal' }
  if (shoreConnected === 0) return { value: 'OFF', tone: 'warn' }
  return { value: watts(shorePowerWatts ?? 0), unit: 'W', tone: 'normal' }
}

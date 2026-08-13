import { knots, toKnots, toDegrees, degrees, clamp } from './units.js'

/**
 * A boat speed polar: for each true wind speed and true wind angle, the speed
 * the boat can sustain. The table below is a generic ~36 ft cruiser-racer.
 * Replace `DEFAULT_POLAR` with measured numbers from the real boat when they
 * exist — everything downstream (target speed, VMG, ETA) improves for free.
 */
export interface PolarTable {
  /** True wind speeds in knots, ascending. */
  windSpeeds: number[]
  /** True wind angles in degrees, ascending, 0..180. */
  windAngles: number[]
  /** boatSpeeds[angleIndex][windIndex], in knots. */
  boatSpeeds: number[][]
}

export const DEFAULT_POLAR: PolarTable = {
  windSpeeds: [4, 6, 8, 10, 12, 14, 16, 20],
  windAngles: [0, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180],
  boatSpeeds: [
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], // 0
    [2.2, 3.3, 4.0, 4.4, 4.7, 4.9, 5.0, 5.1], // 30
    [2.9, 4.0, 4.8, 5.3, 5.6, 5.8, 5.9, 6.0], // 35
    [3.4, 4.5, 5.3, 5.8, 6.1, 6.3, 6.4, 6.5], // 40
    [3.7, 4.8, 5.6, 6.1, 6.4, 6.6, 6.7, 6.8], // 45
    [3.9, 5.0, 5.8, 6.3, 6.6, 6.8, 6.9, 7.0], // 50
    [4.2, 5.3, 6.1, 6.6, 6.9, 7.1, 7.2, 7.4], // 60
    [4.4, 5.5, 6.3, 6.8, 7.1, 7.3, 7.5, 7.7], // 70
    [4.5, 5.6, 6.4, 6.9, 7.2, 7.5, 7.7, 8.0], // 80
    [4.5, 5.6, 6.4, 7.0, 7.4, 7.7, 7.9, 8.3], // 90
    [4.4, 5.5, 6.4, 7.0, 7.4, 7.8, 8.1, 8.6], // 100
    [4.2, 5.4, 6.3, 7.0, 7.5, 7.9, 8.2, 8.9], // 110
    [3.9, 5.1, 6.1, 6.9, 7.4, 7.9, 8.3, 9.1], // 120
    [3.5, 4.7, 5.8, 6.6, 7.2, 7.7, 8.2, 9.2], // 130
    [3.1, 4.3, 5.4, 6.2, 6.9, 7.4, 7.9, 9.0], // 140
    [2.8, 3.9, 4.9, 5.8, 6.4, 7.0, 7.5, 8.6], // 150
    [2.5, 3.5, 4.5, 5.3, 6.0, 6.6, 7.1, 8.1], // 160
    [2.3, 3.3, 4.2, 5.0, 5.6, 6.2, 6.7, 7.7], // 170
    [2.2, 3.2, 4.1, 4.8, 5.5, 6.0, 6.5, 7.5] // 180
  ]
}

/** Below this true wind angle the sails stall and the boat is in irons. */
export const IRONS_ANGLE = degrees(28)

function bracket(values: number[], target: number): { lo: number; hi: number; t: number } {
  if (target <= values[0]!) return { lo: 0, hi: 0, t: 0 }
  const last = values.length - 1
  if (target >= values[last]!) return { lo: last, hi: last, t: 0 }
  let hi = 1
  while (hi < last && values[hi]! < target) hi += 1
  const lo = hi - 1
  const span = values[hi]! - values[lo]!
  return { lo, hi, t: span === 0 ? 0 : (target - values[lo]!) / span }
}

/**
 * Boat speed for a given wind, by bilinear interpolation over the table.
 *
 * @param trueWindAngle signed or unsigned angle in radians; only magnitude matters
 * @param trueWindSpeed m/s
 * @returns boat speed through the water in m/s
 */
export function polarSpeed(
  polar: PolarTable,
  trueWindAngle: number,
  trueWindSpeed: number
): number {
  const angleDeg = Math.abs(toDegrees(trueWindAngle))
  const speedKn = toKnots(trueWindSpeed)

  const a = bracket(polar.windAngles, clamp(angleDeg, 0, 180))
  const w = bracket(polar.windSpeeds, speedKn)

  const rowLo = polar.boatSpeeds[a.lo]!
  const rowHi = polar.boatSpeeds[a.hi]!
  const lowAngle = rowLo[w.lo]! + (rowLo[w.hi]! - rowLo[w.lo]!) * w.t
  const highAngle = rowHi[w.lo]! + (rowHi[w.hi]! - rowHi[w.lo]!) * w.t

  return knots(lowAngle + (highAngle - lowAngle) * a.t)
}

export interface VmgOptimum {
  /** True wind angle in radians that maximises VMG. */
  angle: number
  /** Boat speed at that angle, m/s. */
  boatSpeed: number
  /** The resulting velocity made good, m/s. */
  vmg: number
}

/**
 * Search the polar for the angle giving best VMG towards (upwind) or away from
 * (downwind) the wind. This is what the racing dashboard shows as the target
 * angle, and what the routing-style ETA uses when the mark is dead upwind.
 */
export function bestVmg(
  polar: PolarTable,
  trueWindSpeed: number,
  direction: 'upwind' | 'downwind'
): VmgOptimum {
  const from = direction === 'upwind' ? 30 : 90
  const to = direction === 'upwind' ? 90 : 180
  let best: VmgOptimum = { angle: degrees(from), boatSpeed: 0, vmg: 0 }

  for (let deg = from; deg <= to; deg += 0.5) {
    const angle = degrees(deg)
    const boatSpeed = polarSpeed(polar, angle, trueWindSpeed)
    // Upwind VMG is the component towards the wind; downwind, away from it.
    const vmg = direction === 'upwind' ? boatSpeed * Math.cos(angle) : -boatSpeed * Math.cos(angle)
    if (vmg > best.vmg) best = { angle, boatSpeed, vmg }
  }

  return best
}

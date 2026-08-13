import type { PositionValue } from './signalk/paths.js'

const EARTH_RADIUS_M = 6371008.8
const DEG_TO_RAD = Math.PI / 180

/** Great-circle distance in metres. */
export function distanceBetween(from: PositionValue, to: PositionValue): number {
  const lat1 = from.latitude * DEG_TO_RAD
  const lat2 = to.latitude * DEG_TO_RAD
  const dLat = lat2 - lat1
  const dLon = (to.longitude - from.longitude) * DEG_TO_RAD
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Initial bearing in radians, 0 = true north. */
export function bearingTo(from: PositionValue, to: PositionValue): number {
  const lat1 = from.latitude * DEG_TO_RAD
  const lat2 = to.latitude * DEG_TO_RAD
  const dLon = (to.longitude - from.longitude) * DEG_TO_RAD
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const bearing = Math.atan2(y, x)
  return bearing < 0 ? bearing + Math.PI * 2 : bearing
}

/**
 * East/north offset in metres from `origin` to `point`. The anchor plot covers
 * at most a couple of hundred metres, so a flat tangent plane is exact enough.
 */
export function offsetMetres(
  origin: PositionValue,
  point: PositionValue
): { east: number; north: number } {
  const meanLat = ((origin.latitude + point.latitude) / 2) * DEG_TO_RAD
  return {
    east: (point.longitude - origin.longitude) * DEG_TO_RAD * EARTH_RADIUS_M * Math.cos(meanLat),
    north: (point.latitude - origin.latitude) * DEG_TO_RAD * EARTH_RADIUS_M
  }
}

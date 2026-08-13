import { normalizeAngle, DEG_TO_RAD, RAD_TO_DEG } from './units.js'

export interface LatLon {
  /** Degrees, positive north. */
  latitude: number
  /** Degrees, positive east. */
  longitude: number
}

const EARTH_RADIUS_M = 6371008.8

/**
 * Move a position along a great circle. Distances in this simulator are always
 * small relative to the earth, but the spherical form costs nothing and avoids
 * the flat-earth error growing over a long passage.
 */
export function moveAlong(from: LatLon, bearing: number, distance: number): LatLon {
  if (distance === 0) return { ...from }
  const angularDistance = distance / EARTH_RADIUS_M
  const lat1 = from.latitude * DEG_TO_RAD
  const lon1 = from.longitude * DEG_TO_RAD

  const sinLat1 = Math.sin(lat1)
  const cosLat1 = Math.cos(lat1)
  const sinAd = Math.sin(angularDistance)
  const cosAd = Math.cos(angularDistance)

  const sinLat2 = sinLat1 * cosAd + cosLat1 * sinAd * Math.cos(bearing)
  const lat2 = Math.asin(sinLat2)
  const lon2 =
    lon1 +
    Math.atan2(Math.sin(bearing) * sinAd * cosLat1, cosAd - sinLat1 * sinLat2)

  return {
    latitude: lat2 * RAD_TO_DEG,
    longitude: ((lon2 * RAD_TO_DEG + 540) % 360) - 180
  }
}

/** Great-circle distance in metres. */
export function distanceBetween(from: LatLon, to: LatLon): number {
  const lat1 = from.latitude * DEG_TO_RAD
  const lat2 = to.latitude * DEG_TO_RAD
  const dLat = lat2 - lat1
  const dLon = (to.longitude - from.longitude) * DEG_TO_RAD

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Initial great-circle bearing in radians, 0 = true north. */
export function bearingTo(from: LatLon, to: LatLon): number {
  const lat1 = from.latitude * DEG_TO_RAD
  const lat2 = to.latitude * DEG_TO_RAD
  const dLon = (to.longitude - from.longitude) * DEG_TO_RAD

  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return normalizeAngle(Math.atan2(y, x))
}

/**
 * Signed distance from `point` to the great-circle track running from `start`
 * to `end`, in metres. Positive means the point lies to the right of the track,
 * which is the sign convention Signal K expects for cross-track error.
 */
export function crossTrackError(start: LatLon, end: LatLon, point: LatLon): number {
  const angularDistance = distanceBetween(start, point) / EARTH_RADIUS_M
  const bearingToPoint = bearingTo(start, point)
  const bearingToEnd = bearingTo(start, end)
  return (
    Math.asin(
      clampToUnit(Math.sin(angularDistance) * Math.sin(bearingToPoint - bearingToEnd))
    ) * EARTH_RADIUS_M
  )
}

function clampToUnit(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value
}

/**
 * Local east/north offset in metres from `origin` to `point`. Used by the depth
 * field and the anchor watch, where a tangent plane is entirely adequate.
 */
export function offsetMetres(origin: LatLon, point: LatLon): { east: number; north: number } {
  const meanLat = ((origin.latitude + point.latitude) / 2) * DEG_TO_RAD
  return {
    east: (point.longitude - origin.longitude) * DEG_TO_RAD * EARTH_RADIUS_M * Math.cos(meanLat),
    north: (point.latitude - origin.latitude) * DEG_TO_RAD * EARTH_RADIUS_M
  }
}

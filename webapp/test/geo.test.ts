import { describe, expect, it } from 'vitest'
import { bearingTo, distanceBetween, offsetMetres } from '../src/geo.js'
import { unwrapAngles } from '../src/store/useHistory.js'

const RAD_TO_DEG = 180 / Math.PI

describe('geo', () => {
  const anchorage = { latitude: 59.0518, longitude: 10.9337 }

  it('measures short distances the anchor watch cares about', () => {
    // A tenth of a minute of latitude is 185.2 m.
    const north = { latitude: anchorage.latitude + 0.1 / 60, longitude: anchorage.longitude }
    expect(distanceBetween(anchorage, north)).toBeCloseTo(185.2, 0)
    expect(distanceBetween(anchorage, anchorage)).toBe(0)
  })

  it('reports bearings around the compass', () => {
    const north = { latitude: anchorage.latitude + 0.01, longitude: anchorage.longitude }
    const east = { latitude: anchorage.latitude, longitude: anchorage.longitude + 0.01 }
    const south = { latitude: anchorage.latitude - 0.01, longitude: anchorage.longitude }

    expect(bearingTo(anchorage, north) * RAD_TO_DEG).toBeCloseTo(0, 1)
    expect(bearingTo(anchorage, east) * RAD_TO_DEG).toBeCloseTo(90, 1)
    expect(bearingTo(anchorage, south) * RAD_TO_DEG).toBeCloseTo(180, 1)
  })

  it('gives east/north offsets with the right signs', () => {
    const northEast = { latitude: anchorage.latitude + 0.001, longitude: anchorage.longitude + 0.001 }
    const offset = offsetMetres(anchorage, northEast)
    expect(offset.north).toBeGreaterThan(0)
    expect(offset.east).toBeGreaterThan(0)
    // A thousandth of a degree of latitude is about 111 m.
    expect(offset.north).toBeCloseTo(111.2, 0)
  })
})

describe('unwrapping angles for the wind trend', () => {
  const deg = (value: number): number => (value * Math.PI) / 180

  it('leaves a series that never crosses north alone', () => {
    const samples = [deg(90), deg(95), deg(100)]
    const result = unwrapAngles(samples)
    expect(result[0]).toBeCloseTo(deg(90), 6)
    expect(result[2]).toBeCloseTo(deg(100), 6)
  })

  it('turns a wrap through north into a continuous line', () => {
    // Wind backing 010° -> 350°: a 20° shift, not a 340° one.
    const samples = [deg(10), deg(5), deg(355), deg(350)]
    const result = unwrapAngles(samples) as number[]

    for (let i = 1; i < result.length; i += 1) {
      expect(Math.abs(result[i]! - result[i - 1]!)).toBeLessThan(deg(180))
    }
    expect(result[3]! - result[0]!).toBeCloseTo(deg(-20), 5)
  })

  it('handles repeated wraps in the same direction', () => {
    const samples = [deg(350), deg(10), deg(30), deg(10), deg(350)]
    const result = unwrapAngles(samples) as number[]
    expect(result[2]! - result[0]!).toBeCloseTo(deg(40), 5)
    expect(result[4]! - result[0]!).toBeCloseTo(0, 5)
  })

  it('passes gaps through without joining across them', () => {
    const result = unwrapAngles([deg(10), null, deg(350)])
    expect(result[1]).toBeNull()
    expect(result[0]).toBeCloseTo(deg(10), 6)
    expect(result[2]).toBeCloseTo(deg(-10), 5)
  })
})

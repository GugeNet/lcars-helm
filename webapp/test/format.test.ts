import { describe, expect, it } from 'vitest'
import {
  bearing,
  celsius,
  clockTime,
  duration,
  hectopascal,
  knots,
  metres,
  nauticalMiles,
  NO_DATA,
  percent,
  relativeAngle,
  rpm
} from '../src/format.js'

const DEG = Math.PI / 180

describe('formatting for the display', () => {
  it('shows a placeholder rather than a wrong number when data is missing', () => {
    expect(knots(null)).toBe(NO_DATA)
    expect(bearing(undefined)).toBe(NO_DATA)
    expect(relativeAngle(Number.NaN)).toBe(NO_DATA)
    expect(metres(Number.POSITIVE_INFINITY)).toBe(NO_DATA)
    expect(duration(-5)).toBe(NO_DATA)
  })

  it('converts speed to knots', () => {
    expect(knots(5.144444)).toBe('10.0')
    expect(knots(0)).toBe('0.0')
  })

  it('zero-pads compass bearings and wraps them into 0–359', () => {
    expect(bearing(0)).toBe('000')
    expect(bearing(45 * DEG)).toBe('045')
    expect(bearing(359 * DEG)).toBe('359')
    // A negative angle is the same bearing read the other way round.
    expect(bearing(-90 * DEG)).toBe('270')
    expect(bearing(370 * DEG)).toBe('010')
  })

  it('labels relative angles by the side they are on', () => {
    expect(relativeAngle(38 * DEG)).toBe('38S')
    expect(relativeAngle(-38 * DEG)).toBe('38P')
    expect(relativeAngle(0)).toBe('0S')
    // Past 180° the wind is on the other side.
    expect(relativeAngle(200 * DEG)).toBe('160P')
  })

  it('converts the remaining units', () => {
    expect(celsius(288.15)).toBe('15.0')
    expect(hectopascal(101300)).toBe('1013')
    expect(nauticalMiles(1852)).toBe('1.00')
    expect(percent(0.86)).toBe('86')
    expect(rpm(30)).toBe('1800')
  })

  it('formats durations as hours or minutes depending on length', () => {
    expect(duration(90)).toBe('1:30')
    expect(duration(3600)).toBe('1:00')
    expect(duration(3900)).toBe('1:05')
    expect(duration(0)).toBe('0:00')
  })

  it('formats a clock time', () => {
    const noon = new Date(2026, 7, 13, 14, 5).getTime()
    expect(clockTime(noon)).toBe('14:05')
  })
})

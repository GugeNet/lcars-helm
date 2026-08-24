import { describe, expect, it } from 'vitest'
import { detectSituation, ENGINE_RUNNING_HZ, type SituationSnapshot } from '../src/situations/detect.js'

const KNOT = 0.514444

const base: SituationSnapshot = {
  speedOverGround: 0,
  engineRevolutions: 0,
  anchorDown: false,
  shoreConnected: 0
}

describe('detecting the situation', () => {
  it('recognises sailing when making way with the engine off', () => {
    const result = detectSituation({ ...base, speedOverGround: 5 * KNOT })
    expect(result?.situation).toBe('cruising')
  })

  it('recognises motoring when making way with the engine running', () => {
    const result = detectSituation({
      ...base,
      speedOverGround: 5 * KNOT,
      engineRevolutions: ENGINE_RUNNING_HZ + 20
    })
    expect(result?.situation).toBe('motoring')
  })

  it('recognises the marina from shore power and no movement', () => {
    const result = detectSituation({
      ...base,
      shoreConnected: 1,
      speedOverGround: 0.05
    })
    expect(result?.situation).toBe('marina')
  })

  it('recognises being at anchor', () => {
    const result = detectSituation({ ...base, anchorDown: true, speedOverGround: 0.2 })
    expect(result?.situation).toBe('anchored')
  })

  it('stays at anchor while the boat sheers about', () => {
    // A boat ranging around on its rode can log a useful fraction of a knot;
    // that must not read as getting under way.
    const result = detectSituation({ ...base, anchorDown: true, speedOverGround: 0.9 * KNOT })
    expect(result?.situation).toBe('anchored')
  })

  it('lets a real departure override the anchor being down', () => {
    const result = detectSituation({
      ...base,
      anchorDown: true,
      speedOverGround: 4 * KNOT,
      engineRevolutions: ENGINE_RUNNING_HZ + 20
    })
    expect(result?.situation).toBe('motoring')
  })

  it('prefers the marina over the anchorage when plugged in', () => {
    const result = detectSituation({
      ...base,
      anchorDown: true,
      shoreConnected: 1,
      speedOverGround: 0
    })
    expect(result?.situation).toBe('marina')
  })

  it('recognises the marina even when AC-in power is near zero in float', () => {
    // The bug found live: shore power genuinely on, confirmed by the mains
    // LED, but AC-in wattage down near zero because the charger has reached
    // float. Connection state must not depend on power draw.
    const result = detectSituation({
      ...base,
      shoreConnected: 1,
      speedOverGround: 0
    })
    expect(result?.situation).toBe('marina')
  })

  it('never suggests racing', () => {
    // Racing is indistinguishable from cruising in the data, and being dropped
    // into it unasked would be worse than pressing a button.
    const speeds = [0, 1, 3, 6, 9].map((knots) => knots * KNOT)
    for (const speedOverGround of speeds) {
      for (const anchorDown of [false, true]) {
        for (const engineRevolutions of [0, 30]) {
          const result = detectSituation({ ...base, speedOverGround, anchorDown, engineRevolutions })
          expect(result?.situation).not.toBe('racing')
        }
      }
    }
  })

  it('says nothing when the boat is stopped with no other evidence', () => {
    expect(detectSituation(base)).toBeNull()
  })

  it('says nothing when there is no position fix at all', () => {
    expect(detectSituation({ ...base, speedOverGround: null })).toBeNull()
  })

  it('does not flip between sailing and motoring in the deadband', () => {
    // Between the stopped and under-way thresholds nothing is claimed.
    const drifting = detectSituation({ ...base, speedOverGround: 0.4 })
    expect(drifting).toBeNull()
  })
})

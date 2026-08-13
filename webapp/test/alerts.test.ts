import { describe, expect, it } from 'vitest'
import { chooseAlert, type AlertInput } from '../src/alerts.js'

const KNOT = 0.514444

const quiet: AlertInput = {
  anchorSet: false,
  distanceFromAnchor: null,
  alarmRadius: 45,
  breached: false,
  acknowledged: false,
  depthBelowTransducer: 20,
  speedOverGround: 0
}

describe('choosing which alert to show', () => {
  it('says nothing when all is well', () => {
    expect(chooseAlert(quiet)).toBeNull()
  })

  it('raises the alarm when the anchor drags', () => {
    const alert = chooseAlert({
      ...quiet,
      anchorSet: true,
      breached: true,
      distanceFromAnchor: 63
    })
    expect(alert?.key).toBe('anchor-drag')
    expect(alert?.alarm).toBe(true)
    expect(alert?.message).toContain('63 m')
    expect(alert?.message).toContain('45 m')
  })

  it('stops nagging once the crew has silenced it', () => {
    const alert = chooseAlert({
      ...quiet,
      anchorSet: true,
      breached: true,
      distanceFromAnchor: 63,
      acknowledged: true
    })
    expect(alert).toBeNull()
  })

  it('warns about shallow water while making way', () => {
    const alert = chooseAlert({
      ...quiet,
      depthBelowTransducer: 2.4,
      speedOverGround: 5 * KNOT
    })
    expect(alert?.key).toBe('shallow')
    expect(alert?.message).toContain('2.4')
  })

  it('does not cry shallow at a boat that is not moving', () => {
    // Tied up in a shallow berth, or lying at anchor: the depth is simply the
    // depth. A standing alarm here would also hide the suggestion to switch to
    // the situation that explains it, since alarms outrank suggestions.
    expect(chooseAlert({ ...quiet, depthBelowTransducer: 2.4, speedOverGround: 0 })).toBeNull()
    expect(
      chooseAlert({ ...quiet, depthBelowTransducer: 2.4, speedOverGround: 0.2 * KNOT })
    ).toBeNull()
  })

  it('still warns a boat that is dragging into the shallows', () => {
    const alert = chooseAlert({
      ...quiet,
      depthBelowTransducer: 2.0,
      speedOverGround: 0.8 * KNOT
    })
    expect(alert?.key).toBe('shallow')
  })

  it('puts a dragging anchor ahead of shallow water', () => {
    const alert = chooseAlert({
      ...quiet,
      anchorSet: true,
      breached: true,
      distanceFromAnchor: 80,
      depthBelowTransducer: 1.5,
      speedOverGround: 2 * KNOT
    })
    expect(alert?.key).toBe('anchor-drag')
  })

  it('says nothing when the depth sounder has dropped out', () => {
    // A missing reading is not a shallow reading; the readout shows it as stale.
    expect(
      chooseAlert({ ...quiet, depthBelowTransducer: null, speedOverGround: 5 * KNOT })
    ).toBeNull()
  })
})

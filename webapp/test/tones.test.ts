import { describe, expect, it } from 'vitest'
import { describeShorePower } from '../src/dashboards/tones.js'
import { SHORE_CONNECTED_WATTS } from '../src/situations/detect.js'
import { NO_DATA } from '../src/format.js'

describe('describing shore power for the marina dashboard', () => {
  it('shows no data rather than a false OFF when nothing has ever been reported', () => {
    // This is exactly what a Cerbo with no inverter/charger linked to it
    // reports, permanently — confirmed against Cinderella's real Cerbo, which
    // had a battery monitor but no vebus device at all. The dashboard used to
    // render this identically to a confirmed-off reading, which is not the
    // same fact about the boat and should not look the same on screen.
    const result = describeShorePower(null)
    expect(result.value).toBe(NO_DATA)
    expect(result.tone).toBe('normal')
  })

  it('shows OFF, with a warn tone, once a genuine low reading has arrived', () => {
    const result = describeShorePower(0)
    expect(result.value).toBe('OFF')
    expect(result.tone).toBe('warn')
  })

  it('shows the wattage once a reading confirms shore power is on', () => {
    const result = describeShorePower(SHORE_CONNECTED_WATTS + 200)
    expect(result.value).not.toBe('OFF')
    expect(result.value).not.toBe(NO_DATA)
    expect(result.unit).toBe('W')
    expect(result.tone).toBe('normal')
  })

  it('treats the connected threshold itself as still off', () => {
    const result = describeShorePower(SHORE_CONNECTED_WATTS)
    expect(result.value).toBe('OFF')
  })
})

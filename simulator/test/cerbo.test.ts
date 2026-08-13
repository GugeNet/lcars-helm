import { describe, expect, it } from 'vitest'
import { buildVictronValues, type VictronValue } from '../src/protocol/cerbo.js'
import { Simulation } from '../src/model/simulation.js'
import { createScenario } from '../src/scenarios/index.js'

const INSTANCES = {
  portalId: 'lcarstest0001',
  batteryInstance: 512,
  solarInstance: 0,
  vebusInstance: 276
}

function valuesFor(scenario: 'marina' | 'anchored' | 'cruising', seconds: number): Map<string, VictronValue['value']> {
  const simulation = new Simulation(createScenario(scenario))
  for (let t = 0; t < seconds; t += 1) simulation.tick(1)
  return new Map(
    buildVictronValues(simulation.current, INSTANCES).map((entry) => [entry.topic, entry.value])
  )
}

describe('Cerbo GX emulation', () => {
  it('publishes the serial the plugin needs to learn the portal id', () => {
    // signalk-venus-plugin subscribes to N/+/+/# and waits for this exact topic
    // before it will subscribe to anything else.
    const values = valuesFor('marina', 10)
    expect(values.get('system/0/Serial')).toBe(INSTANCES.portalId)
  })

  it('uses the Venus topic layout the plugin parses', () => {
    const values = valuesFor('marina', 10)
    for (const topic of values.keys()) {
      // The plugin splits N/<portal>/<service>/<instance>/<path...>, so every
      // topic here must have a service, an instance and at least one path part.
      expect(topic.split('/').length).toBeGreaterThanOrEqual(3)
      expect(topic.startsWith('/')).toBe(false)
    }
    expect(values.has(`battery/${INSTANCES.batteryInstance}/Soc`)).toBe(true)
    expect(values.has(`solarcharger/${INSTANCES.solarInstance}/Yield/Power`)).toBe(true)
    expect(values.has(`vebus/${INSTANCES.vebusInstance}/Ac/ActiveIn/L1/P`)).toBe(true)
  })

  it('reports state of charge as a percentage, not a ratio', () => {
    // The plugin divides by 100 on the way to Signal K; sending a ratio here
    // would show a boat at 0.6% charge.
    const soc = valuesFor('marina', 10).get(`battery/${INSTANCES.batteryInstance}/Soc`)
    expect(typeof soc).toBe('number')
    expect(soc as number).toBeGreaterThan(1)
    expect(soc as number).toBeLessThanOrEqual(100)
  })

  it('reports shore power while alongside and none once it trips', () => {
    const onShore = valuesFor('marina', 60)
    expect(onShore.get(`vebus/${INSTANCES.vebusInstance}/Ac/ActiveIn/Connected`)).toBe(1)
    expect(onShore.get('system/0/Ac/ActiveIn/Source')).toBe(1)
    expect(onShore.get(`vebus/${INSTANCES.vebusInstance}/Ac/ActiveIn/L1/P`) as number).toBeGreaterThan(0)

    // The marina scenario trips the pedestal breaker at t=600 s.
    const tripped = valuesFor('marina', 700)
    expect(tripped.get(`vebus/${INSTANCES.vebusInstance}/Ac/ActiveIn/Connected`)).toBe(0)
    expect(tripped.get('system/0/Ac/ActiveIn/Source')).toBe(240)
    expect(tripped.get(`vebus/${INSTANCES.vebusInstance}/Ac/ActiveIn/L1/P`)).toBe(0)
  })

  it('gives a time to go only while discharging', () => {
    // Anchored overnight with no shore power and no sun: the bank is draining.
    const discharging = valuesFor('anchored', 120)
    const current = discharging.get(`battery/${INSTANCES.batteryInstance}/Dc/0/Current`) as number
    expect(current).toBeLessThan(0)
    expect(discharging.get(`battery/${INSTANCES.batteryInstance}/TimeToGo`)).toBeTypeOf('number')

    // Alongside on shore power the bank is charging, and Venus sends nothing.
    const charging = valuesFor('marina', 60)
    expect(charging.get(`battery/${INSTANCES.batteryInstance}/Dc/0/Current`) as number).toBeGreaterThan(0)
    expect(charging.get(`battery/${INSTANCES.batteryInstance}/TimeToGo`)).toBeNull()
  })

  it('reports consumed amp-hours as a negative number, as Venus does', () => {
    const values = valuesFor('anchored', 120)
    expect(values.get(`battery/${INSTANCES.batteryInstance}/ConsumedAmphours`) as number).toBeLessThan(0)
  })

  it('keeps battery power consistent with volts times amps', () => {
    const values = valuesFor('cruising', 120)
    const voltage = values.get(`battery/${INSTANCES.batteryInstance}/Dc/0/Voltage`) as number
    const current = values.get(`battery/${INSTANCES.batteryInstance}/Dc/0/Current`) as number
    const power = values.get(`battery/${INSTANCES.batteryInstance}/Dc/0/Power`) as number
    expect(power).toBeCloseTo(voltage * current, 0)
  })
})

import { anchoredScenario } from './anchored.js'
import { cruisingScenario } from './cruising.js'
import { marinaScenario } from './marina.js'
import { motoringScenario } from './motoring.js'
import { racingScenario } from './racing.js'
import type { Scenario, SituationId } from './types.js'

export type { Scenario, ScenarioRuntime, ScenarioSetup, SituationId } from './types.js'
export * from './helpers.js'

const FACTORIES: Record<SituationId, () => Scenario> = {
  cruising: cruisingScenario,
  motoring: motoringScenario,
  racing: racingScenario,
  anchored: anchoredScenario,
  marina: marinaScenario
}

export const SCENARIO_IDS = Object.keys(FACTORIES) as SituationId[]

export function isSituationId(value: string): value is SituationId {
  return value in FACTORIES
}

/**
 * Scenarios are built fresh on every request because each one carries mutable
 * progress — which tack, which mark, whether the anchor has started dragging.
 */
export function createScenario(id: SituationId): Scenario {
  return FACTORIES[id]()
}

export function describeScenarios(): { id: SituationId; name: string; description: string }[] {
  return SCENARIO_IDS.map((id) => {
    const { name, description } = FACTORIES[id]()
    return { id, name, description }
  })
}

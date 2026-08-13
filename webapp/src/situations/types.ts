/** The five situations the boat is used in, each with its own dashboard. */
export type SituationId = 'cruising' | 'motoring' | 'racing' | 'anchored' | 'marina'

export interface SituationDefinition {
  id: SituationId
  /** Shown in the header cap. */
  title: string
  /** Shown on the rail button, where there is room for about ten characters. */
  short: string
  /** What the dashboard is built to answer. */
  focus: string
}

export const SITUATIONS: SituationDefinition[] = [
  {
    id: 'cruising',
    title: 'Under sail — cruising',
    short: 'Cruise',
    focus: 'Comfort and time of arrival'
  },
  {
    id: 'motoring',
    title: 'Motoring — transport',
    short: 'Motor',
    focus: 'Comfort and distance to run'
  },
  {
    id: 'racing',
    title: 'Under sail — racing',
    short: 'Race',
    focus: 'VMG to the next mark'
  },
  {
    id: 'anchored',
    title: 'At anchor',
    short: 'Anchor',
    focus: 'Drag, wind shifts and power'
  },
  {
    id: 'marina',
    title: 'In the marina',
    short: 'Marina',
    focus: 'Safety and comfort alongside'
  }
]

export const SITUATION_IDS = SITUATIONS.map((situation) => situation.id)

const BY_ID = new Map(SITUATIONS.map((situation) => [situation.id, situation]))

export function situationDefinition(id: SituationId): SituationDefinition {
  const definition = BY_ID.get(id)
  if (!definition) throw new Error(`unknown situation: ${id}`)
  return definition
}

export function isSituationId(value: unknown): value is SituationId {
  return typeof value === 'string' && BY_ID.has(value as SituationId)
}

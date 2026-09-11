import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectSituation, type SituationSnapshot } from '../src/situations/detect.js'
import { isSituationId, type SituationId } from '../src/situations/types.js'

const FILE_NAME = 'situation.json'

interface PersistedSituation {
  situation: SituationId
}

/**
 * Tracks which situation to log under. The display is the source of truth — it is
 * the only place racing can ever come from, since that is indistinguishable from
 * cruising in the sensor data (see webapp/src/situations/detect.ts) — but the
 * plugin has to keep logging sensibly before the display has said anything at all,
 * or after a restart, which is what the local inference fallback is for.
 */
export class SituationTracker {
  private readonly filePath: string
  private situation: SituationId | null

  constructor(dataDir: string) {
    this.filePath = join(dataDir, FILE_NAME)
    this.situation = this.load()
  }

  /** The situation to log under right now, or null if nothing is known yet. */
  current(): SituationId | null {
    return this.situation
  }

  /** Called when the display tells the plugin what the crew has set or accepted. */
  setFromDisplay(situation: SituationId): void {
    this.situation = situation
    this.save(situation)
  }

  /**
   * Falls back to inference from live paths only for as long as the display has
   * never reported anything — once the display has spoken, its word stands even
   * across a plugin restart (the persisted value), because inference alone can
   * never produce "racing" and would otherwise silently downgrade a racing boat to
   * "cruising" the moment the plugin restarts mid-race.
   */
  inferFrom(snapshot: SituationSnapshot): SituationId | null {
    if (this.situation) return this.situation
    return detectSituation(snapshot)?.situation ?? null
  }

  private load(): SituationId | null {
    try {
      if (!existsSync(this.filePath)) return null
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as PersistedSituation
      return isSituationId(parsed.situation) ? parsed.situation : null
    } catch {
      return null
    }
  }

  private save(situation: SituationId): void {
    try {
      writeFileSync(this.filePath, JSON.stringify({ situation } satisfies PersistedSituation))
    } catch {
      // Losing the persisted situation only costs one extra restart's worth of
      // falling back to inference; not worth failing logging over.
    }
  }
}

export interface SamplingIntervals {
  underwayIntervalMs: number
  anchoredIntervalMs: number
  marinaIntervalMs: number
}

/** How often to sample given the current situation, per the plan's cadence:
 *  1 Hz under way, every 10 s at anchor, every 60 s in the marina. */
export function intervalForSituation(situation: SituationId | null, intervals: SamplingIntervals): number {
  switch (situation) {
    case 'anchored':
      return intervals.anchoredIntervalMs
    case 'marina':
      return intervals.marinaIntervalMs
    case 'cruising':
    case 'motoring':
    case 'racing':
    default:
      return intervals.underwayIntervalMs
  }
}

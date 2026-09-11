import { PATHS, type PathKey } from '../src/signalk/paths.js'
import type { SignalKPathValue } from './serverTypes.js'

/**
 * How long a value stays trustworthy before a sample treats it as missing — the
 * same threshold the display uses (see webapp/src/store/vesselStore.ts), so what
 * gets logged matches what the crew was actually shown at the time.
 */
export const STALE_AFTER_MS = 15_000

export type SignalKPathReader = (path: string) => SignalKPathValue | undefined

export type Sample = { t: string; situation?: string } & Record<string, unknown>

/**
 * Builds one combined snapshot from every Signal K path (see PATHS) that is
 * currently fresh. Returns null when nothing is fresh — a tick with no useful data
 * writes nothing, rather than a line that would just be noise in the log.
 */
export function buildSample(
  readPath: SignalKPathReader,
  now: number,
  situation: string | null
): Sample | null {
  const values: Record<string, unknown> = {}
  let any = false

  for (const key of Object.keys(PATHS) as PathKey[]) {
    const path = PATHS[key]
    const entry = readPath(path)
    if (!entry || entry.value === null || entry.value === undefined) continue

    const timestamp = Date.parse(entry.timestamp)
    if (!Number.isFinite(timestamp) || now - timestamp > STALE_AFTER_MS) continue

    values[path] = entry.value
    any = true
  }

  if (!any) return null

  const sample: Sample = { t: new Date(now).toISOString() }
  if (situation) sample.situation = situation
  Object.assign(sample, values)
  return sample
}

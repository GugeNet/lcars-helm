import { describe, expect, it } from 'vitest'
import { buildSample, STALE_AFTER_MS } from '../../plugin/sampler.js'
import { PATHS } from '../../src/signalk/paths.js'
import type { SignalKPathValue } from '../../plugin/serverTypes.js'

function reader(entries: Record<string, SignalKPathValue>) {
  return (path: string) => entries[path]
}

describe('buildSample', () => {
  it('returns null when nothing is fresh', () => {
    expect(buildSample(reader({}), Date.now(), null)).toBeNull()
  })

  it('includes a fresh path under its Signal K key', () => {
    const now = Date.now()
    const entries = { [PATHS.headingTrue]: { value: 1.23, timestamp: new Date(now).toISOString() } }

    const sample = buildSample(reader(entries), now, null)

    expect(sample).not.toBeNull()
    expect(sample![PATHS.headingTrue]).toBe(1.23)
  })

  it('drops a path older than the staleness threshold', () => {
    const now = Date.now()
    const entries = {
      [PATHS.headingTrue]: { value: 1.23, timestamp: new Date(now - STALE_AFTER_MS - 1).toISOString() }
    }

    expect(buildSample(reader(entries), now, null)).toBeNull()
  })

  it('keeps a path exactly at the staleness boundary', () => {
    const now = Date.now()
    const entries = {
      [PATHS.headingTrue]: { value: 1.23, timestamp: new Date(now - STALE_AFTER_MS).toISOString() }
    }

    expect(buildSample(reader(entries), now, null)).not.toBeNull()
  })

  it('carries the situation when one is known', () => {
    const now = Date.now()
    const entries = { [PATHS.headingTrue]: { value: 1, timestamp: new Date(now).toISOString() } }

    const sample = buildSample(reader(entries), now, 'racing')

    expect(sample?.situation).toBe('racing')
  })

  it('omits situation entirely when none is known', () => {
    const now = Date.now()
    const entries = { [PATHS.headingTrue]: { value: 1, timestamp: new Date(now).toISOString() } }

    const sample = buildSample(reader(entries), now, null)

    expect(sample).not.toHaveProperty('situation')
  })

  it('stamps the tick time, not any path timestamp', () => {
    const now = Date.now()
    const entries = { [PATHS.headingTrue]: { value: 1, timestamp: new Date(now - 1000).toISOString() } }

    const sample = buildSample(reader(entries), now, null)

    expect(sample?.t).toBe(new Date(now).toISOString())
  })

  it('ignores a path whose value is null', () => {
    const now = Date.now()
    const entries = { [PATHS.headingTrue]: { value: null, timestamp: new Date(now).toISOString() } }

    expect(buildSample(reader(entries), now, null)).toBeNull()
  })

  it('carries a nested value such as position verbatim', () => {
    const now = Date.now()
    const position = { latitude: 59.05, longitude: 10.93 }
    const entries = { [PATHS.position]: { value: position, timestamp: new Date(now).toISOString() } }

    const sample = buildSample(reader(entries), now, null)

    expect(sample![PATHS.position]).toEqual(position)
  })
})

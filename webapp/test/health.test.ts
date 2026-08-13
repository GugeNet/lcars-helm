import { describe, expect, it } from 'vitest'
import { assessDataHealth, DATA_SILENT_AFTER_MS } from '../src/store/vesselStore.js'
import { describeDataHealth } from '../src/alerts.js'

const NOW = 1_770_000_000_000

describe('judging whether the display can be believed', () => {
  it('is live while deltas keep arriving', () => {
    expect(
      assessDataHealth({ connection: 'open', newestDataAt: NOW - 1000, now: NOW })
    ).toBe('live')
  })

  it('reports no data when Signal K is up but has never sent anything', () => {
    // This is the case that used to look identical to a healthy display: the
    // app connects, renders its frame, and every readout is simply blank.
    expect(assessDataHealth({ connection: 'open', newestDataAt: null, now: NOW })).toBe('no-data')
  })

  it('reports stale once the stream goes quiet', () => {
    const justInside = NOW - DATA_SILENT_AFTER_MS + 500
    const wellOutside = NOW - DATA_SILENT_AFTER_MS - 5000
    expect(assessDataHealth({ connection: 'open', newestDataAt: justInside, now: NOW })).toBe('live')
    expect(assessDataHealth({ connection: 'open', newestDataAt: wellOutside, now: NOW })).toBe('stale')
  })

  it('reports the link itself as down regardless of past data', () => {
    for (const connection of ['connecting', 'closed'] as const) {
      expect(assessDataHealth({ connection, newestDataAt: NOW, now: NOW })).toBe('disconnected')
      expect(assessDataHealth({ connection, newestDataAt: null, now: NOW })).toBe('disconnected')
    }
  })
})

describe('explaining a fault to the crew', () => {
  it('says nothing when all is well', () => {
    expect(describeDataHealth('live', 0)).toBeNull()
  })

  it('distinguishes losing Signal K from Signal K losing the boat', () => {
    // These send you to different places, so they must not read the same.
    const link = describeDataHealth('disconnected', null)
    const data = describeDataHealth('no-data', null)

    expect(link?.message).toMatch(/Signal K/)
    expect(data?.message).toMatch(/gateway/i)
    expect(link?.message).not.toBe(data?.message)
    expect(link?.key).not.toBe(data?.key)
  })

  it('says how long the data has been missing, in readable units', () => {
    expect(describeDataHealth('stale', 25_000)?.message).toContain('25s')
    expect(describeDataHealth('stale', 240_000)?.message).toContain('4 min')
  })

  it('copes with staleness of unknown duration', () => {
    const result = describeDataHealth('stale', null)
    expect(result).not.toBeNull()
    expect(result?.message).toMatch(/stopped/)
  })
})


import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LogWriter } from '../../plugin/logWriter.js'

describe('LogWriter', () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'lcars-helm-logwriter-'))
  })

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true })
  })

  function newWriter(vesselId = 'vessel-1'): LogWriter {
    return new LogWriter({
      dataDir,
      getVesselId: () => vesselId,
      getVesselName: () => 'Bench',
      softwareVersion: 'lcars-helm test'
    })
  }

  function outboxFiles(writer: LogWriter): string[] {
    return readdirSync(writer.outboxPath).filter((name) => name.endsWith('.ndjson.gz'))
  }

  function readGzipLines(path: string): string[] {
    return gunzipSync(readFileSync(path))
      .toString('utf8')
      .trim()
      .split('\n')
  }

  it('writes a header and every sample to the current file', async () => {
    const writer = newWriter()

    writer.writeSample({ t: '2026-09-11T10:00:01.000Z' })
    writer.writeSample({ t: '2026-09-11T10:00:02.000Z' })

    expect(writer.currentLineCount).toBe(2)
    expect(writer.currentFileName).toMatch(/^vessel-1_.*\.ndjson$/)

    // Close out the file this test opened so nothing is left mid-write when the
    // temp directory is removed after this test.
    await writer.rotateAsync()
  })

  it('rotates the open file into a gzip outbox entry', async () => {
    const writer = newWriter()
    writer.writeSample({ t: '2026-09-11T10:00:01.000Z' })

    await writer.rotateAsync()

    const files = outboxFiles(writer)
    expect(files).toHaveLength(1)
    const lines = readGzipLines(join(writer.outboxPath, files[0]!))
    expect(JSON.parse(lines[0]!).type).toBe('header')
    expect(JSON.parse(lines[1]!).t).toBe('2026-09-11T10:00:01.000Z')
    expect(writer.currentFileName).toBeNull()
  })

  it('does nothing when rotating with no file open', async () => {
    const writer = newWriter()

    await writer.rotateAsync()

    expect(outboxFiles(writer)).toHaveLength(0)
  })

  it('reads the vessel id fresh for each new file', async () => {
    let vesselId = 'unregistered'
    const writer = new LogWriter({
      dataDir,
      getVesselId: () => vesselId,
      getVesselName: () => 'Bench',
      softwareVersion: 'lcars-helm test'
    })

    writer.writeSample({ t: '2026-09-11T10:00:01.000Z' })
    await writer.rotateAsync()

    vesselId = 'vessel-42'
    writer.writeSample({ t: '2026-09-11T10:01:01.000Z' })

    expect(writer.currentFileName).toMatch(/^vessel-42_/)

    await writer.rotateAsync()
  })

  it('recovers a file left open by an unclean shutdown into the outbox', async () => {
    const writer = newWriter()
    writer.writeSample({ t: '2026-09-11T10:00:01.000Z' })
    // No rotateAsync() call: simulates the process being killed mid-write. A new
    // LogWriter pointed at the same data directory stands in for the restart.
    // Give the abandoned WriteStream's async open+flush time to actually finish
    // before this test's temp directory gets removed — a real kill -9 has no
    // process left to race that deferred callback against, but this in-process
    // test does.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const recovered = newWriter()
    await recovered.recoverAsync()

    expect(outboxFiles(recovered)).toHaveLength(1)
  })

  it('discards a zero-byte leftover file on recovery rather than queuing it', async () => {
    const writer = newWriter()
    writeFileSync(join(dataDir, 'logs', 'current', 'stale.ndjson'), '')

    await writer.recoverAsync()

    expect(outboxFiles(writer)).toHaveLength(0)
  })

  it('detects the hour boundary has passed for the open file', async () => {
    const writer = newWriter()
    writer.writeSample({ t: '2026-09-11T10:00:01.000Z' })

    expect(writer.shouldRotateForHour(new Date())).toBe(false)
    expect(writer.shouldRotateForHour(new Date(Date.now() + 60 * 60 * 1000))).toBe(true)

    await writer.rotateAsync()
  })

  it('reports no rotation due when nothing is open', () => {
    const writer = newWriter()

    expect(writer.shouldRotateForHour(new Date())).toBe(false)
  })
})

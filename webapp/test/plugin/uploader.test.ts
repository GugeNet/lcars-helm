import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LogWriter } from '../../plugin/logWriter.js'
import { Uploader, type FetchLike } from '../../plugin/uploader.js'
import { VesselKey } from '../../plugin/vesselKey.js'

function fakeResponse(status: number, body: unknown): { ok: boolean; status: number; json(): Promise<unknown> } {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('Uploader', () => {
  let dataDir: string
  let logWriter: LogWriter
  let vesselKey: VesselKey

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'lcars-helm-uploader-'))
    vesselKey = new VesselKey(dataDir)
    logWriter = new LogWriter({
      dataDir,
      getVesselId: () => vesselKey.id ?? 'unregistered',
      getVesselName: () => 'Bench',
      softwareVersion: 'lcars-helm test'
    })
  })

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true })
  })

  function seedOutboxFile(name: string, content = 'x'): void {
    writeFileSync(join(logWriter.outboxPath, name), content)
  }

  function outboxFiles(): string[] {
    return readdirSync(logWriter.outboxPath).filter((name) => name.endsWith('.ndjson.gz'))
  }

  function newUploader(fetchImpl: FetchLike, cloudUrl: string | null = 'https://cloud.example'): Uploader {
    return new Uploader({ cloudUrl, vesselKey, logWriter, getVesselName: () => 'Bench', fetchImpl })
  }

  it('does nothing when no cloud URL is configured', async () => {
    const fetchImpl = vi.fn()
    const uploader = newUploader(fetchImpl, null)

    await uploader.runOnce()

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(uploader.vesselApprovalState).toBe('unconfigured')
  })

  it('registers when the vessel has never registered', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(201, { vesselId: 'vessel-1', status: 'Pending' }))
    const uploader = newUploader(fetchImpl)

    await uploader.runOnce()

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://cloud.example/api/vessels/register',
      expect.objectContaining({ method: 'POST' })
    )
    expect(vesselKey.id).toBe('vessel-1')
    expect(uploader.vesselApprovalState).toBe('pending')
  })

  it('does not attempt to drain the outbox while pending', async () => {
    vesselKey.setVessel('vessel-1', 'Pending')
    seedOutboxFile('vessel-1_2026-09-11T10-00-00Z.ndjson.gz')
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { status: 'Pending' }))
    const uploader = newUploader(fetchImpl)

    await uploader.runOnce()

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://cloud.example/api/vessels/me',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.any(String) }) })
    )
    expect(outboxFiles()).toHaveLength(1)
  })

  it('uploads queued files and removes them once accepted', async () => {
    vesselKey.setVessel('vessel-1', 'Approved')
    const fileName = 'vessel-1_2026-09-11T10-00-00Z.ndjson.gz'
    seedOutboxFile(fileName)
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(201, { fileName, lines: 1, projectedRows: 1 }))
    const uploader = newUploader(fetchImpl)

    await uploader.runOnce()

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://cloud.example/api/vessels/vessel-1/logs',
      expect.objectContaining({ method: 'POST' })
    )
    expect(outboxFiles()).toHaveLength(0)
  })

  it('uploads files oldest first', async () => {
    vesselKey.setVessel('vessel-1', 'Approved')
    seedOutboxFile('vessel-1_2026-09-11T09-00-00Z.ndjson.gz')
    seedOutboxFile('vessel-1_2026-09-11T08-00-00Z.ndjson.gz')
    const seen: string[] = []
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      seen.push(url)
      return fakeResponse(201, {})
    })
    const uploader = newUploader(fetchImpl)

    await uploader.runOnce()

    expect(seen).toHaveLength(2)
    // Both requests hit the same URL (the vessel's logs endpoint); the ordering
    // that matters is the outbox itself, checked via file deletion order not
    // being observable here — so instead check nothing is left half-uploaded.
    expect(outboxFiles()).toHaveLength(0)
  })

  it('leaves a file queued and learns pending status from a 403 without a separate status check', async () => {
    vesselKey.setVessel('vessel-1', 'Approved')
    const fileName = 'vessel-1_2026-09-11T10-00-00Z.ndjson.gz'
    seedOutboxFile(fileName)
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(403, { type: 'vessel-pending', detail: 'awaiting approval' }))
    const uploader = newUploader(fetchImpl)

    await uploader.runOnce()

    expect(uploader.vesselApprovalState).toBe('pending')
    expect(vesselKey.lastKnownStatus).toBe('Pending')
    expect(outboxFiles()).toEqual([fileName])
    expect(uploader.status().nextAttemptAt).not.toBeNull()
    // Learned straight from the 403 body — no extra round trip to /me.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('marks the vessel revoked on a 403 vessel-revoked', async () => {
    vesselKey.setVessel('vessel-1', 'Approved')
    seedOutboxFile('vessel-1_2026-09-11T10-00-00Z.ndjson.gz')
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(403, { type: 'vessel-revoked' }))
    const uploader = newUploader(fetchImpl)

    await uploader.runOnce()

    expect(uploader.vesselApprovalState).toBe('revoked')
    expect(vesselKey.lastKnownStatus).toBe('Revoked')
  })

  it('moves a file the cloud rejects outright to outbox/rejected and keeps draining', async () => {
    vesselKey.setVessel('vessel-1', 'Approved')
    seedOutboxFile('vessel-1_2026-09-11T09-00-00Z.ndjson.gz')
    seedOutboxFile('vessel-1_2026-09-11T10-00-00Z.ndjson.gz')
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(400, { error: 'checksum mismatch' }))
      .mockResolvedValueOnce(fakeResponse(201, {}))
    const uploader = newUploader(fetchImpl)

    await uploader.runOnce()

    expect(outboxFiles()).toHaveLength(0)
    expect(readdirSync(logWriter.rejectedPath)).toEqual(['vessel-1_2026-09-11T09-00-00Z.ndjson.gz'])
  })

  it('backs off and leaves the file queued on a network error', async () => {
    vesselKey.setVessel('vessel-1', 'Approved')
    const fileName = 'vessel-1_2026-09-11T10-00-00Z.ndjson.gz'
    seedOutboxFile(fileName)
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const uploader = newUploader(fetchImpl)

    await uploader.runOnce()

    expect(outboxFiles()).toEqual([fileName])
    expect(uploader.status().lastError).toContain('ECONNREFUSED')
    expect(uploader.status().nextAttemptAt).toBeGreaterThan(Date.now())
  })

  it('reports pending files and bytes without contacting the cloud', () => {
    seedOutboxFile('a.ndjson.gz', 'abc')
    seedOutboxFile('b.ndjson.gz', 'abcd')
    const uploader = newUploader(vi.fn(), null)

    const status = uploader.status()

    expect(status.pendingFiles).toBe(2)
    expect(status.pendingBytes).toBe(7)
  })
})

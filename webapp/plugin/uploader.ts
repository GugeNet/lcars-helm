import { createHash } from 'node:crypto'
import { readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LogWriter } from './logWriter.js'
import type { VesselKey } from './vesselKey.js'

export type VesselApprovalState = 'unconfigured' | 'unregistered' | 'pending' | 'approved' | 'revoked'

export interface UploadStatus {
  pendingFiles: number
  pendingBytes: number
  lastSuccessAt: number | null
  lastAttemptAt: number | null
  lastError: string | null
  nextAttemptAt: number | null
}

/**
 * The minimal shape of `fetch` this module actually calls — narrower than
 * `typeof fetch` so tests can inject a plain mock without needing a real `fetch`
 * or `Response` global (which the jsdom test environment does not provide).
 * The real global `fetch` satisfies this structurally with no adapter needed.
 */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string | Buffer }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export interface UploaderOptions {
  /** Null when no cloud URL has been configured — logging still runs, only upload
   *  is skipped. */
  cloudUrl: string | null
  vesselKey: VesselKey
  logWriter: LogWriter
  getVesselName: () => string
  onLog?: (message: string) => void
  fetchImpl?: FetchLike
}

const TICK_MS = 60_000
const MIN_BACKOFF_MS = 60_000
const MAX_BACKOFF_MS = 15 * 60_000
const PENDING_RECHECK_MS = 15 * 60_000

/**
 * Drains the outbox to the cloud whenever the network allows, one file at a time,
 * oldest first (file names sort chronologically since the vessel id prefix is
 * constant). Registers and re-checks approval status as needed; never blocks
 * logging, which keeps running locally regardless of what upload is doing.
 */
export class Uploader {
  private readonly cloudUrl: string | null
  private readonly fetchImpl: FetchLike
  private vesselState: VesselApprovalState
  private backoffMs = MIN_BACKOFF_MS
  private nextAttemptAt = 0
  private lastSuccessAt: number | null = null
  private lastAttemptAt: number | null = null
  private lastError: string | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(private readonly options: UploaderOptions) {
    this.cloudUrl = options.cloudUrl
    this.fetchImpl = options.fetchImpl ?? fetch
    this.vesselState = this.cloudUrl ? 'unregistered' : 'unconfigured'
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.runOnce()
    }, TICK_MS)
    void this.runOnce()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  get vesselApprovalState(): VesselApprovalState {
    return this.vesselState
  }

  status(): UploadStatus {
    const dir = this.options.logWriter.outboxPath
    let pendingFiles = 0
    let pendingBytes = 0
    try {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.ndjson.gz')) continue
        pendingFiles += 1
        pendingBytes += statSync(join(dir, name)).size
      }
    } catch {
      // The outbox directory always exists once LogWriter has constructed, but a
      // status call racing very early startup should not throw.
    }

    return {
      pendingFiles,
      pendingBytes,
      lastSuccessAt: this.lastSuccessAt,
      lastAttemptAt: this.lastAttemptAt,
      lastError: this.lastError,
      nextAttemptAt: this.nextAttemptAt || null
    }
  }

  private log(message: string): void {
    this.options.onLog?.(message)
  }

  /**
   * Does one registration/status/upload cycle right now. Scheduled by `start()`
   * every minute; exposed as public so it can also be driven directly (a "sync
   * now" action, or a test).
   */
  async runOnce(): Promise<void> {
    if (this.running || !this.cloudUrl || Date.now() < this.nextAttemptAt) return

    this.running = true
    try {
      await this.ensureRegisteredAndApproved()
      if (this.vesselState === 'approved') {
        await this.drainOutbox()
      }
    } catch (err) {
      this.recordFailure(err)
    } finally {
      this.running = false
    }
  }

  private async ensureRegisteredAndApproved(): Promise<void> {
    const key = this.options.vesselKey
    if (!key.id) {
      await this.register()
      return
    }
    if (key.lastKnownStatus === 'Approved') {
      this.vesselState = 'approved'
      return
    }
    await this.refreshStatus()
  }

  private async register(): Promise<void> {
    const response = await this.fetchImpl(`${this.cloudUrl}/api/vessels/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: this.options.getVesselName(),
        publicKeyPem: this.options.vesselKey.publicKeyPem
      })
    })
    if (!response.ok) throw new Error(`registration failed: HTTP ${response.status}`)

    const body = (await response.json()) as { vesselId: string; status: string }
    this.options.vesselKey.setVessel(body.vesselId, body.status)
    this.vesselState = statusToState(body.status)
    this.resetBackoff()
    this.log(`registered as vessel ${body.vesselId} (${body.status})`)
  }

  /** Re-checks approval, no more than every fifteen minutes while not approved —
   *  see PENDING_RECHECK_MS, shared with the same throttle after a 403. */
  private async refreshStatus(): Promise<void> {
    const key = this.options.vesselKey
    const response = await this.fetchImpl(`${this.cloudUrl}/api/vessels/me`, {
      headers: { Authorization: `Bearer ${key.mintToken()}` }
    })
    if (!response.ok) throw new Error(`status check failed: HTTP ${response.status}`)

    const body = (await response.json()) as { status: string }
    key.setStatus(body.status)
    this.vesselState = statusToState(body.status)
    if (this.vesselState !== 'approved') {
      this.nextAttemptAt = Date.now() + PENDING_RECHECK_MS
    } else {
      this.resetBackoff()
    }
  }

  private async drainOutbox(): Promise<void> {
    const dir = this.options.logWriter.outboxPath
    let names: string[]
    try {
      names = readdirSync(dir)
        .filter((name) => name.endsWith('.ndjson.gz'))
        .sort()
    } catch {
      return
    }
    if (names.length === 0) return

    for (const name of names) {
      const ok = await this.uploadOne(dir, name)
      if (!ok) return // stop at the first failure; the rest retry from here next tick
    }

    this.lastSuccessAt = Date.now()
    this.resetBackoff()
  }

  private async uploadOne(dir: string, name: string): Promise<boolean> {
    const filePath = join(dir, name)
    const bytes = await readFile(filePath)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const key = this.options.vesselKey

    this.lastAttemptAt = Date.now()

    let response: Awaited<ReturnType<FetchLike>>
    try {
      response = await this.fetchImpl(`${this.cloudUrl}/api/vessels/${key.id}/logs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key.mintToken()}`,
          'Content-Type': 'application/x-ndjson',
          'Content-Encoding': 'gzip',
          'X-Log-File': name,
          'X-Content-Sha256': sha256
        },
        body: bytes
      })
    } catch (err) {
      this.recordFailure(err)
      return false
    }

    if (response.ok) {
      unlinkSync(filePath)
      return true
    }

    if (response.status === 403) {
      // The response body carries which of the two reasons applies — see
      // VesselAuthorizationResultHandler on the cloud side — so this is the
      // simplest way to learn approval status; no separate GET /me round trip.
      const problem = await safeReadProblem(response)
      const revoked = problem?.type === 'vessel-revoked'
      key.setStatus(revoked ? 'Revoked' : 'Pending')
      this.vesselState = revoked ? 'revoked' : 'pending'
      this.nextAttemptAt = Date.now() + PENDING_RECHECK_MS
      this.lastError = problem?.detail ?? 'HTTP 403'
      return false
    }

    if (response.status >= 400 && response.status < 500) {
      // A definitive rejection of this file's content (bad checksum, a conflicting
      // re-upload), not a transient failure. Retrying it forever would only ever
      // block every file queued behind it.
      renameSync(filePath, join(this.options.logWriter.rejectedPath, name))
      this.lastError = `${name} rejected: HTTP ${response.status}`
      this.log(`${name} rejected by the cloud (HTTP ${response.status}); moved to outbox/rejected`)
      return true
    }

    this.lastError = `HTTP ${response.status} uploading ${name}`
    this.recordBackoff()
    return false
  }

  private recordFailure(err: unknown): void {
    this.lastError = err instanceof Error ? err.message : String(err)
    this.lastAttemptAt = Date.now()
    this.recordBackoff()
  }

  private recordBackoff(): void {
    this.nextAttemptAt = Date.now() + this.backoffMs
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
  }

  private resetBackoff(): void {
    this.backoffMs = MIN_BACKOFF_MS
    this.nextAttemptAt = 0
  }
}

function statusToState(status: string): VesselApprovalState {
  switch (status) {
    case 'Approved':
      return 'approved'
    case 'Revoked':
      return 'revoked'
    default:
      return 'pending'
  }
}

async function safeReadProblem(
  response: Awaited<ReturnType<FetchLike>>
): Promise<{ type?: string; detail?: string } | null> {
  try {
    return (await response.json()) as { type?: string; detail?: string }
  } catch {
    return null
  }
}

import {
  createReadStream,
  createWriteStream,
  fdatasync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  type WriteStream
} from 'node:fs'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import type { Sample } from './sampler.js'

export interface LogWriterOptions {
  dataDir: string
  /** Read fresh each time a file is opened, so a vessel that registers after the
   *  plugin has already started tags its very next file correctly. */
  getVesselId: () => string
  getVesselName: () => string
  softwareVersion: string
  onLog?: (message: string) => void
}

interface OpenFile {
  rawPath: string
  startedAt: Date
  stream: WriteStream
  lines: number
}

const FSYNC_INTERVAL_MS = 30_000

function fileBaseName(vesselId: string, startedAt: Date): string {
  const iso = startedAt.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')
  return `${vesselId}_${iso}`
}

/**
 * Owns the on-disk log: an append-only NDJSON file in `logs/current/` while it is
 * being written, gzipped into `logs/outbox/` on rotation for the uploader to send.
 * A file is rotated on the hour, on a situation change, and on shutdown; recovery
 * at startup gzips and queues anything a previous, uncleanly-stopped process left
 * open in `current/` rather than resuming it — the server tolerates a torn last
 * line on the file that follows it, and losing at most one in-flight tick's worth
 * of data is preferable to the complexity of resuming a partial write.
 */
export class LogWriter {
  private readonly currentDir: string
  private readonly outboxDir: string
  private readonly rejectedDir: string
  private open: OpenFile | null = null
  private lastSyncAt = 0

  constructor(private readonly options: LogWriterOptions) {
    this.currentDir = join(options.dataDir, 'logs', 'current')
    this.outboxDir = join(options.dataDir, 'logs', 'outbox')
    this.rejectedDir = join(this.outboxDir, 'rejected')
    mkdirSync(this.currentDir, { recursive: true })
    mkdirSync(this.outboxDir, { recursive: true })
    mkdirSync(this.rejectedDir, { recursive: true })
  }

  get outboxPath(): string {
    return this.outboxDir
  }

  get rejectedPath(): string {
    return this.rejectedDir
  }

  get currentFileName(): string | null {
    return this.open ? basename(this.open.rawPath) : null
  }

  get currentLineCount(): number {
    return this.open?.lines ?? 0
  }

  private log(message: string): void {
    this.options.onLog?.(message)
  }

  async recoverAsync(): Promise<void> {
    let leftovers: string[]
    try {
      leftovers = readdirSync(this.currentDir).filter((name) => name.endsWith('.ndjson'))
    } catch {
      return
    }

    for (const name of leftovers) {
      const rawPath = join(this.currentDir, name)
      if (statSync(rawPath).size === 0) {
        unlinkSync(rawPath)
        continue
      }
      await this.gzipToOutbox(rawPath, name.replace(/\.ndjson$/, ''))
      this.log(`recovered ${name}, left over from an unclean shutdown`)
    }
  }

  private ensureOpen(): OpenFile {
    if (this.open) return this.open

    const startedAt = new Date()
    const baseName = fileBaseName(this.options.getVesselId(), startedAt)
    const rawPath = join(this.currentDir, `${baseName}.ndjson`)
    const stream = createWriteStream(rawPath, { flags: 'a' })
    const open: OpenFile = { rawPath, startedAt, stream, lines: 0 }
    this.open = open

    const header = {
      type: 'header',
      schema: 1,
      vesselId: this.options.getVesselId(),
      vesselName: this.options.getVesselName(),
      software: this.options.softwareVersion,
      startedAt: startedAt.toISOString()
    }
    stream.write(`${JSON.stringify(header)}\n`)

    return open
  }

  writeSample(sample: Sample): void {
    const open = this.ensureOpen()
    open.stream.write(`${JSON.stringify(sample)}\n`)
    open.lines += 1

    const now = Date.now()
    if (now - this.lastSyncAt <= FSYNC_INTERVAL_MS) return
    this.lastSyncAt = now
    const fd = (open.stream as unknown as { fd?: number }).fd
    if (typeof fd === 'number') {
      fdatasync(fd, () => {
        // Best effort — a failed fsync is not worth surfacing over a display
        // status line, and the next successful one covers for it.
      })
    }
  }

  /** True once the wall clock has moved past the hour the currently open file was
   *  started in — checked on a timer, not scheduled, so a suspended machine that
   *  wakes up hours later still rotates promptly on its next tick. */
  shouldRotateForHour(now: Date): boolean {
    if (!this.open) return false
    return (
      now.getUTCHours() !== this.open.startedAt.getUTCHours() ||
      now.getUTCDate() !== this.open.startedAt.getUTCDate() ||
      now.getUTCMonth() !== this.open.startedAt.getUTCMonth()
    )
  }

  /** Closes the file being written and gzips it into the outbox, then the next
   *  sample opens a fresh one. A file nothing was ever sampled into is discarded
   *  rather than queued — an empty upload would tell the cloud nothing. */
  async rotateAsync(): Promise<void> {
    const open = this.open
    if (!open) return
    this.open = null

    await new Promise<void>((resolve, reject) => {
      open.stream.end((err?: Error | null) => (err ? reject(err) : resolve()))
    })

    if (open.lines === 0) {
      unlinkSync(open.rawPath)
      return
    }

    await this.gzipToOutbox(open.rawPath, basename(open.rawPath).replace(/\.ndjson$/, ''))
  }

  private async gzipToOutbox(rawPath: string, baseName: string): Promise<void> {
    const gzPath = join(this.outboxDir, `${baseName}.ndjson.gz`)
    await pipeline(createReadStream(rawPath), createGzip(), createWriteStream(gzPath))
    unlinkSync(rawPath)
  }
}

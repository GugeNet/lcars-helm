import { PATHS } from '../src/signalk/paths.js'
import type { SituationSnapshot } from '../src/situations/detect.js'
import packageJson from '../package.json'
import { LogWriter } from './logWriter.js'
import { buildSample } from './sampler.js'
import type { PluginDefinition, PluginRouter, ServerApi, SignalKPathValue } from './serverTypes.js'
import { intervalForSituation, SituationTracker, type SamplingIntervals } from './situation.js'
import { registerStatusRoutes } from './status.js'
import { Uploader } from './uploader.js'
import { VesselKey } from './vesselKey.js'

const { version } = packageJson as { version: string }

interface PluginConfig extends SamplingIntervals {
  cloudUrl: string
  vesselName: string
  logging: boolean
  maxOutboxBytes: number
}

const DEFAULT_CONFIG: PluginConfig = {
  cloudUrl: '',
  vesselName: '',
  logging: true,
  underwayIntervalMs: 1_000,
  anchoredIntervalMs: 10_000,
  marinaIntervalMs: 60_000,
  maxOutboxBytes: 500 * 1024 * 1024
}

/** Fine enough to hit every interval down to the 1 Hz underway rate exactly. */
const HEARTBEAT_MS = 1_000

/**
 * Samples the boat's instruments (both NMEA 2000 and Victron, already merged into
 * Signal K paths by the time this plugin sees them) at a rate that depends on the
 * situation, writes them to a local NDJSON log, and uploads finished files to the
 * cloud whenever the network and the vessel's approval allow. See
 * webapp/plugin/sampler.ts, logWriter.ts, vesselKey.ts and uploader.ts for the
 * pieces; this file only wires them together to the Signal K plugin lifecycle.
 */
class LcarsHelmPlugin {
  private config: PluginConfig = DEFAULT_CONFIG
  private vesselKey!: VesselKey
  private logWriter!: LogWriter
  private uploader!: Uploader
  private situationTracker!: SituationTracker
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private lastSampleAt = 0
  private lastLoggedSituation: string | null = null

  constructor(private readonly app: ServerApi) {}

  schema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        cloudUrl: {
          type: 'string',
          title: 'Cloud URL',
          description:
            'Base URL of the LcarsHelm.Cloud.Api service, e.g. https://lcarshelm-api.azurewebsites.net. Leave blank to log locally without uploading.'
        },
        vesselName: {
          type: 'string',
          title: 'Vessel name',
          description: 'Shown in the cloud dashboard once this vessel is approved.'
        },
        logging: { type: 'boolean', title: 'Enable logging', default: DEFAULT_CONFIG.logging },
        underwayIntervalMs: {
          type: 'number',
          title: 'Sample interval under way — cruising, motoring, racing (ms)',
          default: DEFAULT_CONFIG.underwayIntervalMs
        },
        anchoredIntervalMs: {
          type: 'number',
          title: 'Sample interval at anchor (ms)',
          default: DEFAULT_CONFIG.anchoredIntervalMs
        },
        marinaIntervalMs: {
          type: 'number',
          title: 'Sample interval in the marina (ms)',
          default: DEFAULT_CONFIG.marinaIntervalMs
        },
        maxOutboxBytes: {
          type: 'number',
          title: 'Maximum bytes to keep queued for upload before the oldest is dropped',
          default: DEFAULT_CONFIG.maxOutboxBytes
        }
      }
    }
  }

  start(options: Record<string, unknown>): void {
    this.config = { ...DEFAULT_CONFIG, ...(options as Partial<PluginConfig>) }
    const dataDir = this.app.getDataDirPath()

    this.vesselKey = new VesselKey(dataDir)
    this.situationTracker = new SituationTracker(dataDir)
    this.logWriter = new LogWriter({
      dataDir,
      getVesselId: () => this.vesselKey.id ?? 'unregistered',
      getVesselName: () => this.vesselName(),
      softwareVersion: `lcars-helm ${version}`,
      onLog: (message) => this.app.setPluginStatus(message)
    })
    this.uploader = new Uploader({
      cloudUrl: this.config.cloudUrl.trim() || null,
      vesselKey: this.vesselKey,
      logWriter: this.logWriter,
      getVesselName: () => this.vesselName(),
      onLog: (message) => this.app.setPluginStatus(message)
    })

    // start() must return synchronously; recovery runs in the background and only
    // ever touches a file nothing is currently writing to.
    void this.logWriter.recoverAsync().catch((err) => this.app.setPluginError(String(err)))

    this.uploader.start()
    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_MS)
    this.app.setPluginStatus('Running')
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    this.uploader.stop()
    // Best effort: if this fails, the file is simply picked up by recovery on the
    // next start rather than sitting unqueued until then.
    void this.logWriter.rotateAsync().catch(() => {})
  }

  registerWithRouter(router: PluginRouter): void {
    registerStatusRoutes(
      router,
      {
        logWriter: this.logWriter,
        uploader: this.uploader,
        vesselKey: this.vesselKey,
        situationTracker: this.situationTracker,
        loggingEnabled: () => this.config.logging,
        intervalMs: () => intervalForSituation(this.situationTracker.current(), this.config),
        getVesselName: () => this.vesselName()
      },
      (situation) => this.situationTracker.setFromDisplay(situation)
    )
  }

  private vesselName(): string {
    return this.config.vesselName.trim() || 'unnamed vessel'
  }

  private readPath(path: string): SignalKPathValue | undefined {
    return this.app.getSelfPath(path)
  }

  private readNumber(path: string): number | null {
    const entry = this.readPath(path)
    return entry && typeof entry.value === 'number' ? entry.value : null
  }

  private tick(): void {
    if (!this.config.logging) return
    const now = Date.now()

    const snapshot: SituationSnapshot = {
      speedOverGround: this.readNumber(PATHS.speedOverGround),
      engineRevolutions: this.readNumber(PATHS.engineRevolutions),
      anchorDown: this.readPath(PATHS.anchorPosition) !== undefined,
      shoreConnected: this.readNumber(PATHS.shoreConnected)
    }
    const situation = this.situationTracker.inferFrom(snapshot)

    if (situation !== this.lastLoggedSituation) {
      this.lastLoggedSituation = situation
      void this.logWriter.rotateAsync().catch((err) => this.app.setPluginError(String(err)))
    } else if (this.logWriter.shouldRotateForHour(new Date(now))) {
      void this.logWriter.rotateAsync().catch((err) => this.app.setPluginError(String(err)))
    }

    const interval = intervalForSituation(situation, this.config)
    if (now - this.lastSampleAt < interval) return
    this.lastSampleAt = now

    const sample = buildSample((path) => this.readPath(path), now, situation)
    if (sample) this.logWriter.writeSample(sample)
  }
}

export default function lcarsHelm(app: ServerApi): PluginDefinition {
  const plugin = new LcarsHelmPlugin(app)
  return {
    id: 'lcars-helm',
    name: 'LCARS Helm',
    schema: () => plugin.schema(),
    start: (options) => plugin.start(options),
    stop: () => plugin.stop(),
    registerWithRouter: (router) => plugin.registerWithRouter(router)
  }
}

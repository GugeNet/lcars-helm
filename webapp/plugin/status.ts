import type { LogWriter } from './logWriter.js'
import type { PluginRouter } from './serverTypes.js'
import type { SituationTracker } from './situation.js'
import type { Uploader } from './uploader.js'
import type { VesselKey } from './vesselKey.js'
import { isSituationId, type SituationId } from '../src/situations/types.js'

export interface StatusDeps {
  logWriter: LogWriter
  uploader: Uploader
  vesselKey: VesselKey
  situationTracker: SituationTracker
  loggingEnabled: () => boolean
  intervalMs: () => number
  getVesselName: () => string
}

/**
 * What `GET /plugins/lcars-helm/status` reports. Polled by the display (see
 * webapp/src/store/logStatus.ts) rather than pushed as a Signal K delta — a
 * heartbeat delta would make vesselStore.ts's "instruments have gone quiet"
 * detection see the plugin instead of the boat, defeating the "Data stopped"
 * banner the moment the gateway actually dies.
 */
export function buildStatus(deps: StatusDeps) {
  return {
    logging: {
      enabled: deps.loggingEnabled(),
      situation: deps.situationTracker.current(),
      intervalMs: deps.intervalMs(),
      currentFile: deps.logWriter.currentFileName,
      currentLines: deps.logWriter.currentLineCount
    },
    vessel: {
      id: deps.vesselKey.id,
      name: deps.getVesselName(),
      state: deps.uploader.vesselApprovalState
    },
    upload: deps.uploader.status()
  }
}

export function registerStatusRoutes(
  router: PluginRouter,
  deps: StatusDeps,
  onSituationFromDisplay: (situation: SituationId) => void
): void {
  router.get('/status', (_req, res) => {
    res.json(buildStatus(deps))
  })

  router.put('/situation', (req, res) => {
    const situation = (req.body as { situation?: unknown } | undefined)?.situation
    if (!isSituationId(situation)) {
      res.status(400).json({ error: 'situation must be one of the known situation ids' })
      return
    }
    onSituationFromDisplay(situation)
    res.json({ ok: true })
  })
}

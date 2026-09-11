import { useEffect, useState } from 'react'

export type VesselApprovalState = 'unconfigured' | 'unregistered' | 'pending' | 'approved' | 'revoked'

export interface LogStatus {
  logging: {
    enabled: boolean
    situation: string | null
    intervalMs: number
    currentFile: string | null
    currentLines: number
  }
  vessel: {
    id: string | null
    name: string
    state: VesselApprovalState
  }
  upload: {
    pendingFiles: number
    pendingBytes: number
    lastSuccessAt: number | null
    lastAttemptAt: number | null
    lastError: string | null
    nextAttemptAt: number | null
  }
}

const POLL_INTERVAL_MS = 30_000
const STATUS_URL = '/plugins/lcars-helm/status'

/**
 * Polls the plugin's own status endpoint rather than reading it from Signal K
 * deltas. The plugin is not a source of boat data, so its health has no business
 * mixed into vesselStore.ts's "are the instruments still reporting" judgement — a
 * plugin heartbeat delta would keep that logic looking alive with the gateway
 * dead, which is exactly the failure mode the "Data stopped" banner exists to
 * catch.
 */
export function useLogStatus(): LogStatus | null {
  const [status, setStatus] = useState<LogStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll(): Promise<void> {
      try {
        const response = await fetch(STATUS_URL)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = (await response.json()) as LogStatus
        if (!cancelled) setStatus(body)
      } catch {
        // No plugin installed, still starting up, or the server is between
        // requests during an update — all indistinguishable from here, and all
        // mean "we don't currently know", not "logging is broken".
        if (!cancelled) setStatus(null)
      }
    }

    void poll()
    const timer = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return status
}

export interface LogStatusDisplay {
  label: string
  fault: boolean
}

/**
 * Reduces the plugin's status to one footer label. "Synced" means the outbox is
 * empty and nothing is currently stuck — the hour presently being written is by
 * definition not yet uploaded and does not count against that.
 */
export function describeLogStatus(status: LogStatus | null): LogStatusDisplay {
  if (!status || !status.logging.enabled) {
    return { label: 'LOG OFF', fault: false }
  }

  const { vessel, upload } = status

  if (vessel.state === 'pending' || vessel.state === 'unregistered') {
    return { label: 'LOG AWAITING APPROVAL', fault: false }
  }
  if (vessel.state === 'revoked') {
    return { label: 'LOG ACCESS REVOKED', fault: true }
  }
  if (vessel.state === 'unconfigured') {
    // No cloud URL set — a deliberate bench/dev state, not a failure. Logging
    // still runs; only upload has nothing to talk to.
    return upload.pendingFiles > 0
      ? { label: `LOG LOCAL ${upload.pendingFiles}`, fault: false }
      : { label: 'LOG LOCAL', fault: false }
  }

  // Approved.
  if (upload.pendingFiles === 0) {
    return { label: 'LOG SYNCED', fault: false }
  }

  const stalled = upload.lastError !== null && (upload.nextAttemptAt ?? 0) > Date.now()
  return stalled
    ? { label: `LOG OFFLINE ${upload.pendingFiles} PENDING`, fault: true }
    : { label: `LOG ${upload.pendingFiles} PENDING`, fault: false }
}

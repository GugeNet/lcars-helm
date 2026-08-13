export type ConnectionState = 'connecting' | 'open' | 'closed'

export interface SignalKValue {
  value: unknown
  /** Milliseconds since epoch, taken from the delta. */
  timestamp: number
  /** Which instrument the value came from, e.g. `ydwg-02.4`. */
  source: string
}

interface DeltaMessage {
  context?: string
  updates?: {
    $source?: string
    timestamp?: string
    values?: { path: string; value: unknown }[]
  }[]
}

export interface SignalKClientOptions {
  /** Full WebSocket URL. Defaults to the Signal K stream on the serving origin. */
  url?: string
  /** Called with a batch of changed paths. */
  onValues: (values: Map<string, SignalKValue>) => void
  onState: (state: ConnectionState) => void
  /**
   * How often to hand batched values to the application. Instruments update far
   * faster than the screen needs to, and coalescing keeps the Pi's rendering
   * cost down.
   */
  flushIntervalMs?: number
}

function defaultUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/signalk/v1/stream?subscribe=none`
}

/**
 * Streams Signal K deltas for our own vessel.
 *
 * The kiosk has to survive the server restarting under it — during an automatic
 * update, for instance — so a dropped connection is retried indefinitely with a
 * backoff rather than being treated as an error.
 */
export class SignalKClient {
  private readonly options: Required<Omit<SignalKClientOptions, 'url'>> & { url: string }
  private socket: WebSocket | null = null
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly pending = new Map<string, SignalKValue>()
  private reconnectAttempts = 0
  private closedByUs = false

  constructor(options: SignalKClientOptions) {
    this.options = {
      url: options.url ?? defaultUrl(),
      onValues: options.onValues,
      onState: options.onState,
      flushIntervalMs: options.flushIntervalMs ?? 200
    }
  }

  connect(): void {
    this.closedByUs = false
    this.openSocket()
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => this.flush(), this.options.flushIntervalMs)
    }
  }

  close(): void {
    this.closedByUs = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.flushTimer) clearInterval(this.flushTimer)
    this.reconnectTimer = null
    this.flushTimer = null
    this.socket?.close()
    this.socket = null
    this.options.onState('closed')
  }

  private openSocket(): void {
    this.options.onState('connecting')

    let socket: WebSocket
    try {
      socket = new WebSocket(this.options.url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.socket = socket

    socket.onopen = () => {
      this.reconnectAttempts = 0
      this.options.onState('open')
      // `subscribe=none` in the URL suppresses the server's default firehose so
      // that this is the only subscription in effect.
      socket.send(
        JSON.stringify({
          context: 'vessels.self',
          subscribe: [{ path: '*', period: 500, format: 'delta', policy: 'instant' }]
        })
      )
    }

    socket.onmessage = (event: MessageEvent<string>) => this.handleMessage(event.data)

    socket.onerror = () => socket.close()

    socket.onclose = () => {
      this.socket = null
      this.options.onState('closed')
      this.scheduleReconnect()
    }
  }

  private handleMessage(raw: string): void {
    let message: DeltaMessage
    try {
      message = JSON.parse(raw) as DeltaMessage
    } catch {
      return // the hello message and any malformed frame are simply ignored
    }
    if (!message.updates) return

    for (const update of message.updates) {
      const timestamp = update.timestamp ? Date.parse(update.timestamp) : Date.now()
      const source = update.$source ?? 'unknown'
      for (const entry of update.values ?? []) {
        this.pending.set(entry.path, { value: entry.value, timestamp, source })
      }
    }
  }

  private flush(): void {
    if (this.pending.size === 0) return
    const batch = new Map(this.pending)
    this.pending.clear()
    this.options.onValues(batch)
  }

  private scheduleReconnect(): void {
    if (this.closedByUs || this.reconnectTimer) return
    // 500 ms, doubling up to 10 s; the display reconnects quickly after a blip
    // but does not hammer a server that is still booting.
    const delay = Math.min(500 * 2 ** this.reconnectAttempts, 10_000)
    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delay)
  }
}

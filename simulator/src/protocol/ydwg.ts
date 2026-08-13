import net from 'node:net'
import dgram from 'node:dgram'
import canboat from '@canboat/canboatjs'
import type { PGN } from '@canboat/ts-pgns'

const { pgnToYdgwRawFormat } = canboat as {
  pgnToYdgwRawFormat: (pgn: PGN) => string[]
}

export interface YdwgOptions {
  /** TCP port for the RAW server. Must match the gateway's own configuration. */
  tcpPort: number
  /** When set, RAW frames are also broadcast over UDP, as the real gateway does. */
  udpPort?: number
  /** Broadcast address for the UDP server. */
  udpAddress?: string
  /** Interface to bind the TCP server to. */
  host?: string
  onLog?: (message: string) => void
}

/**
 * The RAW timestamp a real gateway prefixes to every frame: `HH:MM:SS.mmm` on a
 * 24-hour clock. canboatjs has its own full-format helper but it formats on a
 * 12-hour clock, so the prefix is built here to match the hardware.
 */
function rawTimestamp(now = new Date()): string {
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const millis = String(now.getMilliseconds()).padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${millis}`
}

/**
 * Encode PGNs as Yacht Devices RAW lines, exactly as a YDWG-02 puts them on the
 * wire: `HH:MM:SS.mmm R <canId> <b0> .. <b7>`. Messages longer than eight bytes
 * come back as several fast-packet frames, which canboatjs reassembles at the
 * Signal K end.
 */
export function encodeRawFrames(pgns: PGN[], now = new Date()): string[] {
  const stamp = rawTimestamp(now)
  const lines: string[] = []
  for (const pgn of pgns) {
    for (const frame of pgnToYdgwRawFormat(pgn)) {
      lines.push(`${stamp} R ${frame.toUpperCase()}`)
    }
  }
  return lines
}

/**
 * Stands in for the Yacht Devices YDWG-02 on the boat's network. Signal K
 * connects to it with the stock "Yacht Devices RAW TCP (canboatjs)" data
 * connection, so the server configuration on the development Pi is byte for
 * byte the one used on the boat.
 */
export class YdwgGateway {
  private readonly options: YdwgOptions
  private readonly clients = new Set<net.Socket>()
  private server: net.Server | null = null
  private udpSocket: dgram.Socket | null = null
  private framesSent = 0

  constructor(options: YdwgOptions) {
    this.options = options
  }

  get clientCount(): number {
    return this.clients.size
  }

  get framesTransmitted(): number {
    return this.framesSent
  }

  private log(message: string): void {
    this.options.onLog?.(message)
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        socket.setNoDelay(true)
        this.clients.add(socket)
        this.log(`client connected from ${socket.remoteAddress}:${socket.remotePort}`)

        // Signal K may write frames back for transmission onto the bus. There is
        // no simulated bus to put them on, but accepting them keeps the server
        // behaving like the real gateway rather than stalling the writer.
        socket.on('data', () => {})
        socket.on('error', (error) => this.log(`client error: ${error.message}`))
        socket.on('close', () => {
          this.clients.delete(socket)
          this.log('client disconnected')
        })
      })

      server.on('error', reject)
      server.listen(this.options.tcpPort, this.options.host ?? '0.0.0.0', () => {
        this.server = server
        this.log(`YDWG RAW TCP server listening on port ${this.options.tcpPort}`)
        this.startUdp().then(resolve).catch(reject)
      })
    })
  }

  private startUdp(): Promise<void> {
    if (!this.options.udpPort) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      socket.on('error', reject)
      socket.bind(() => {
        socket.setBroadcast(true)
        this.udpSocket = socket
        this.log(`YDWG RAW UDP broadcasting on port ${this.options.udpPort}`)
        resolve()
      })
    })
  }

  /** Encode and send a batch of PGNs to every connected listener. */
  send(pgns: PGN[]): void {
    if (pgns.length === 0) return
    if (this.clients.size === 0 && !this.udpSocket) return

    const frames = encodeRawFrames(pgns)
    if (frames.length === 0) return
    const payload = `${frames.join('\r\n')}\r\n`
    this.framesSent += frames.length

    for (const client of this.clients) {
      // Drop the batch for any client that cannot keep up rather than buffering
      // stale instrument data it will never catch up on.
      if (client.writableLength > 1_000_000) continue
      client.write(payload)
    }

    if (this.udpSocket && this.options.udpPort) {
      this.udpSocket.send(payload, this.options.udpPort, this.options.udpAddress ?? '255.255.255.255')
    }
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.clients) client.destroy()
      this.clients.clear()
      this.udpSocket?.close()
      this.udpSocket = null
      if (!this.server) return resolve()
      this.server.close(() => {
        this.server = null
        resolve()
      })
    })
  }
}

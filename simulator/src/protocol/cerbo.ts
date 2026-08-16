import { createServer, type Server } from 'node:net'
import aedes from 'aedes'
import type { AedesPublishPacket, Client, Subscription } from 'aedes'
import { KELVIN_OFFSET } from '../model/units.js'
import type { VesselState } from '../model/types.js'

/**
 * aedes ships a class as its default export type but assigns a factory at
 * runtime, so the broker is created through `createBroker` and its type is
 * taken from that call rather than from the default export.
 */
type Broker = ReturnType<typeof aedes.createBroker>

export interface CerboOptions {
  /** MQTT port; a real Cerbo GX serves plain MQTT on 1883. */
  port: number
  /** Portal id the installation publishes under. */
  portalId: string
  /** Battery monitor instance, as it appears in the topic tree. Defaults to
   *  Cinderella's real instance (a BMV-712 Smart), confirmed live on the boat. */
  batteryInstance?: number
  /** Solar charger instance. */
  solarInstance?: number
  /** Multiplus/Quattro instance. */
  vebusInstance?: number
  host?: string
  onLog?: (message: string) => void
}

/**
 * A Venus device stops publishing unless something keeps asking. The plugin
 * sends a keepalive every 50 s; this is the window after which the emulator
 * falls silent, exactly as the hardware does.
 */
const KEEPALIVE_TIMEOUT_MS = 90_000

export interface VictronValue {
  /** Topic below `N/<portalId>/`, e.g. `battery/279/Soc`. */
  topic: string
  value: number | string | null
}

export interface VictronInstances {
  portalId: string
  batteryInstance: number
  solarInstance: number
  vebusInstance: number
}

/**
 * The electrical picture as a Venus device would publish it.
 *
 * Kept separate from the broker so the topic tree — which is the part that has
 * to match what `signalk-venus-plugin` expects — can be checked without
 * standing up MQTT.
 */
export function buildVictronValues(
  state: VesselState,
  instances: VictronInstances
): VictronValue[] {
  const { batteryInstance: battery, solarInstance: solar, vebusInstance: vebus } = instances
  const power = state.electrical

  const batteryPower = power.batteryVoltage * power.batteryCurrent
  // Venus reports time to go in seconds, and only while discharging.
  const remainingAmpHours = power.capacityAmpHours - power.consumedAmpHours
  const timeToGo =
    power.batteryCurrent < -0.1
      ? Math.round((remainingAmpHours / Math.abs(power.batteryCurrent)) * 3600)
      : null

  return [
    { topic: 'system/0/Serial', value: instances.portalId },

    { topic: `battery/${battery}/Dc/0/Voltage`, value: round(power.batteryVoltage, 2) },
    { topic: `battery/${battery}/Dc/0/Current`, value: round(power.batteryCurrent, 2) },
    { topic: `battery/${battery}/Dc/0/Power`, value: round(batteryPower, 1) },
    {
      topic: `battery/${battery}/Dc/0/Temperature`,
      value: round(power.batteryTemperature - KELVIN_OFFSET, 1)
    },
    // Venus carries state of charge as a percentage; the plugin converts it.
    { topic: `battery/${battery}/Soc`, value: round(power.stateOfCharge * 100, 1) },
    { topic: `battery/${battery}/ConsumedAmphours`, value: round(-power.consumedAmpHours, 2) },
    { topic: `battery/${battery}/TimeToGo`, value: timeToGo },

    { topic: `solarcharger/${solar}/Yield/Power`, value: round(power.solarPower, 1) },
    { topic: `solarcharger/${solar}/Pv/V`, value: round(power.solarPower > 0 ? 68.4 : 0, 1) },
    {
      topic: `solarcharger/${solar}/Pv/I`,
      value: round(power.solarPower > 0 ? power.solarPower / 68.4 : 0, 2)
    },
    { topic: `solarcharger/${solar}/State`, value: power.solarPower > 5 ? 3 : 0 },

    { topic: `vebus/${vebus}/Ac/ActiveIn/L1/P`, value: round(power.shorePower, 1) },
    { topic: `vebus/${vebus}/Ac/ActiveIn/Connected`, value: power.shoreConnected ? 1 : 0 },
    { topic: `vebus/${vebus}/Ac/Out/L1/P`, value: round(power.dcLoad * 0.2, 1) },

    { topic: 'system/0/Dc/Battery/Soc', value: round(power.stateOfCharge * 100, 1) },
    { topic: 'system/0/Dc/Battery/Voltage', value: round(power.batteryVoltage, 2) },
    { topic: 'system/0/Dc/Battery/Current', value: round(power.batteryCurrent, 2) },
    { topic: 'system/0/Dc/Battery/Power', value: round(batteryPower, 1) },
    { topic: 'system/0/Dc/Pv/Power', value: round(power.solarPower, 1) },
    // 1 = shore, 240 = running on the inverter with nothing plugged in.
    { topic: 'system/0/Ac/ActiveIn/Source', value: power.shoreConnected ? 1 : 240 }
  ]
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * Stands in for the Victron Cerbo GX on the boat's network.
 *
 * It runs an MQTT broker and publishes the Venus topic tree that
 * `signalk-venus-plugin` expects: values arrive as `N/<portalId>/<service>/
 * <instance>/<path>` carrying `{"value": …}`, the plugin discovers the portal
 * id from `system/0/Serial`, and publishing continues only while keepalives
 * keep arriving on the `R/` tree.
 */
export class CerboGateway {
  private readonly options: Required<Omit<CerboOptions, 'onLog' | 'host'>> &
    Pick<CerboOptions, 'onLog' | 'host'>
  private readonly broker: Broker = aedes.createBroker()
  private server: Server | null = null
  private lastKeepaliveAt = 0
  private connectedClients = 0
  private publishing = false

  constructor(options: CerboOptions) {
    this.options = {
      port: options.port,
      portalId: options.portalId,
      batteryInstance: options.batteryInstance ?? 279,
      solarInstance: options.solarInstance ?? 0,
      vebusInstance: options.vebusInstance ?? 276,
      host: options.host,
      onLog: options.onLog
    }
  }

  get clientCount(): number {
    return this.connectedClients
  }

  /** True while a keepalive has been seen recently enough to keep publishing. */
  get isPublishing(): boolean {
    return this.publishing
  }

  private log(message: string): void {
    this.options.onLog?.(message)
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.broker.on('client', () => {
        this.connectedClients += 1
        this.log(`Cerbo MQTT client connected (${this.connectedClients} total)`)
      })

      this.broker.on('clientDisconnect', () => {
        this.connectedClients = Math.max(0, this.connectedClients - 1)
      })

      // The plugin subscribes to `N/+/+/#` and then waits for a serial number
      // before it knows which portal id to talk to, so announce it right away.
      this.broker.on('subscribe', (subscriptions: Subscription[], client: Client) => {
        const wantsValues = subscriptions.some((subscription) =>
          subscription.topic.startsWith('N/')
        )
        if (!wantsValues || !client) return
        this.log(`Cerbo subscription from ${client.id}; announcing portal id`)
        this.publishOne({
          topic: `system/0/Serial`,
          value: this.options.portalId
        })
      })

      // Any read request refreshes the keepalive; that is how the real device
      // decides someone is still listening.
      this.broker.on('publish', (packet: AedesPublishPacket, client: Client | null) => {
        if (!client) return // our own publishes come back through here
        if (!packet.topic.startsWith(`R/`)) return
        const wasPublishing = this.publishing
        this.lastKeepaliveAt = Date.now()
        this.publishing = true
        if (!wasPublishing) this.log('Cerbo keepalive received, publishing resumed')
        // A request for the serial is answered immediately so a reconnecting
        // client does not have to wait for the next update tick.
        if (packet.topic.endsWith('/system/0/Serial')) {
          this.publishOne({ topic: 'system/0/Serial', value: this.options.portalId })
        }
      })

      const server = createServer(this.broker.handle)
      server.on('error', reject)
      server.listen(this.options.port, this.options.host ?? '0.0.0.0', () => {
        this.server = server
        this.log(
          `Cerbo GX MQTT broker listening on port ${this.options.port} ` +
            `as portal ${this.options.portalId}`
        )
        resolve()
      })
    })
  }

  private publishOne({ topic, value }: VictronValue): void {
    this.broker.publish(
      {
        cmd: 'publish',
        qos: 0,
        dup: false,
        retain: false,
        topic: `N/${this.options.portalId}/${topic}`,
        payload: Buffer.from(JSON.stringify({ value }))
      },
      () => {}
    )
  }

  /** Publish the whole electrical picture, as the GX does on every change. */
  publish(state: VesselState): void {
    if (this.connectedClients === 0) return

    if (this.publishing && Date.now() - this.lastKeepaliveAt > KEEPALIVE_TIMEOUT_MS) {
      this.publishing = false
      this.log('Cerbo keepalive lapsed, publishing suspended')
    }
    if (!this.publishing) return

    const values = buildVictronValues(state, {
      portalId: this.options.portalId,
      batteryInstance: this.options.batteryInstance,
      solarInstance: this.options.solarInstance,
      vebusInstance: this.options.vebusInstance
    })
    for (const value of values) this.publishOne(value)
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => {
        this.server = null
        resolve()
      }
      this.broker.close(() => {
        if (!this.server) return done()
        this.server.close(done)
      })
    })
  }
}


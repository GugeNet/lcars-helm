import { Simulation } from './model/simulation.js'
import { CerboGateway } from './protocol/cerbo.js'
import { createEmitters, describeState, type PgnEmitter } from './protocol/pgns.js'
import { YdwgGateway } from './protocol/ydwg.js'
import { createScenario, type SituationId } from './scenarios/index.js'
import type { SimulatorConfig } from './config.js'
import type { PGN } from '@canboat/ts-pgns'

/** How often the emulated Cerbo publishes its electrical values. */
const CERBO_INTERVAL_MS = 1000

export interface RunnerEvents {
  onLog?: (message: string) => void
  onStatus?: (line: string) => void
}

/**
 * Owns the clock. Every tick advances the simulation, then asks each emitter
 * whether enough time has passed for the instrument it stands for to transmit
 * again, and sends whatever comes back to the gateway.
 */
export class SimulatorRunner {
  private readonly config: SimulatorConfig
  private readonly events: RunnerEvents
  private readonly emitters: PgnEmitter[] = createEmitters()
  private readonly lastEmitted = new Map<string, number>()
  private readonly gateway: YdwgGateway
  private readonly cerbo: CerboGateway | null
  private simulation: Simulation
  private timer: NodeJS.Timeout | null = null
  private sid = 0
  private simulatedClock = 0
  private lastStatusAt = 0
  private lastCerboPublishAt = 0

  constructor(config: SimulatorConfig, events: RunnerEvents = {}) {
    this.config = config
    this.events = events
    this.simulation = new Simulation(createScenario(config.scenario), {
      onAnnounce: (message) => this.log(`[${this.simulation.activeScenario.id}] ${message}`)
    })
    this.gateway = new YdwgGateway({
      tcpPort: config.tcpPort > 0 ? config.tcpPort : undefined,
      udpPort: config.udpPort > 0 ? config.udpPort : undefined,
      host: config.host,
      onLog: (message) => this.log(message)
    })
    this.cerbo =
      config.mqttPort > 0
        ? new CerboGateway({
            port: config.mqttPort,
            portalId: config.portalId,
            host: config.host,
            onLog: (message) => this.log(message)
          })
        : null
  }

  private log(message: string): void {
    this.events.onLog?.(message)
  }

  get state() {
    return this.simulation.current
  }

  get scenarioId(): SituationId {
    return this.simulation.activeScenario.id
  }

  get connectedClients(): number {
    return this.gateway.clientCount
  }

  async start(): Promise<void> {
    await this.gateway.start()
    await this.cerbo?.start()
    const tickMs = 1000 / this.config.rate
    const dt = (tickMs / 1000) * this.config.speed

    this.log(
      `simulation running: scenario "${this.simulation.activeScenario.name}", ` +
        `${this.config.rate} Hz, ${this.config.speed}x real time`
    )

    this.timer = setInterval(() => this.tick(dt, tickMs * this.config.speed), tickMs)
  }

  private tick(dt: number, simulatedMs: number): void {
    const state = this.simulation.tick(dt)
    this.simulatedClock += simulatedMs
    this.sid = (this.sid + 1) % 253

    const batch: PGN[] = []
    for (const emitter of this.emitters) {
      const last = this.lastEmitted.get(emitter.id) ?? -Infinity
      if (this.simulatedClock - last < emitter.intervalMs) continue
      this.lastEmitted.set(emitter.id, this.simulatedClock)
      batch.push(...emitter.build(state, this.sid))
    }

    if (batch.length > 0) this.gateway.send(batch)

    // Victron equipment reports far more slowly than the instrument bus; once a
    // second is already generous for a battery monitor.
    if (this.cerbo && this.simulatedClock - this.lastCerboPublishAt >= CERBO_INTERVAL_MS) {
      this.lastCerboPublishAt = this.simulatedClock
      this.cerbo.publish(state)
    }

    if (
      this.config.statusInterval > 0 &&
      this.simulatedClock - this.lastStatusAt >= this.config.statusInterval * 1000
    ) {
      this.lastStatusAt = this.simulatedClock
      this.events.onStatus?.(
        `${describeState(state)}  |  ${this.gateway.clientCount} client(s), ` +
          `${this.gateway.framesTransmitted} frames`
      )
    }
  }

  /** Load a different situation without dropping the gateway connection. */
  switchScenario(id: SituationId): void {
    this.simulation.load(createScenario(id))
    this.lastEmitted.clear()
    this.log(`switched to scenario "${this.simulation.activeScenario.name}"`)
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await Promise.all([this.gateway.stop(), this.cerbo?.stop() ?? Promise.resolve()])
  }
}

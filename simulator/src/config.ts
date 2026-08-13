import { parseArgs } from 'node:util'
import { isSituationId, type SituationId } from './scenarios/index.js'

export interface SimulatorConfig {
  scenario: SituationId
  /** TCP port the emulated YDWG-02 listens on. */
  tcpPort: number
  /** UDP broadcast port, or 0 to disable. */
  udpPort: number
  /** Interface to bind to. */
  host: string
  /** Simulation ticks per second. */
  rate: number
  /** Simulated seconds per real second. */
  speed: number
  /** Port for the emulated Cerbo GX MQTT broker, or 0 to disable. */
  mqttPort: number
  /** Victron portal id the emulated Cerbo publishes under. */
  portalId: string
  /** Seconds between console status lines, or 0 for silence. */
  statusInterval: number
}

export const DEFAULTS: SimulatorConfig = {
  scenario: 'cruising',
  // The YDWG-02's RAW server port. Configurable on the real gateway's web page,
  // and the same value must be set in the Signal K connection.
  tcpPort: 1457,
  udpPort: 0,
  host: '0.0.0.0',
  rate: 10,
  speed: 1,
  mqttPort: 1883,
  portalId: 'lcarssim0001',
  statusInterval: 10
}

export const USAGE = `
lcars-sim — sailboat simulator for lcars-helm

  --scenario <id>     cruising | motoring | racing | anchored | marina
  --tcp-port <port>   YDWG-02 RAW TCP port (default ${DEFAULTS.tcpPort})
  --udp-port <port>   also broadcast RAW over UDP (0 = off)
  --host <address>    interface to bind to (default ${DEFAULTS.host})
  --rate <hz>         simulation ticks per second (default ${DEFAULTS.rate})
  --speed <factor>    simulated seconds per real second (default ${DEFAULTS.speed})
  --mqtt-port <port>  emulated Cerbo GX MQTT broker port (0 = off)
  --portal-id <id>    Victron portal id (default ${DEFAULTS.portalId})
  --status <seconds>  console status interval (0 = off)
  --list              list the available scenarios and exit
  --help              show this message

While running, type a scenario name and press Enter to switch to it.
`

export interface ParsedArgs {
  config: SimulatorConfig
  showHelp: boolean
  listScenarios: boolean
  errors: string[]
}

function positiveNumber(raw: string | undefined, fallback: number, name: string, errors: string[]): number {
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) {
    errors.push(`--${name} must be a non-negative number, got "${raw}"`)
    return fallback
  }
  return value
}

export function parseSimulatorArgs(argv: string[]): ParsedArgs {
  const errors: string[] = []
  const { values } = parseArgs({
    args: argv,
    options: {
      scenario: { type: 'string' },
      'tcp-port': { type: 'string' },
      'udp-port': { type: 'string' },
      host: { type: 'string' },
      rate: { type: 'string' },
      speed: { type: 'string' },
      'mqtt-port': { type: 'string' },
      'portal-id': { type: 'string' },
      status: { type: 'string' },
      list: { type: 'boolean' },
      help: { type: 'boolean' }
    },
    allowPositionals: false,
    strict: false
  })

  let scenario = DEFAULTS.scenario
  if (typeof values.scenario === 'string') {
    if (isSituationId(values.scenario)) {
      scenario = values.scenario
    } else {
      errors.push(`unknown scenario "${values.scenario}"`)
    }
  }

  const asString = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined

  const rate = positiveNumber(asString(values.rate), DEFAULTS.rate, 'rate', errors)

  return {
    config: {
      scenario,
      tcpPort: positiveNumber(asString(values['tcp-port']), DEFAULTS.tcpPort, 'tcp-port', errors),
      udpPort: positiveNumber(asString(values['udp-port']), DEFAULTS.udpPort, 'udp-port', errors),
      host: asString(values.host) ?? DEFAULTS.host,
      rate: rate > 0 ? rate : DEFAULTS.rate,
      speed: positiveNumber(asString(values.speed), DEFAULTS.speed, 'speed', errors),
      mqttPort: positiveNumber(asString(values['mqtt-port']), DEFAULTS.mqttPort, 'mqtt-port', errors),
      portalId: asString(values['portal-id']) ?? DEFAULTS.portalId,
      statusInterval: positiveNumber(asString(values.status), DEFAULTS.statusInterval, 'status', errors)
    },
    showHelp: values.help === true,
    listScenarios: values.list === true,
    errors
  }
}

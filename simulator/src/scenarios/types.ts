import type { AisTargetSpec } from '../model/ais.js'
import type { BoatConfig, CurrentSet } from '../model/boat.js'
import type { AtmosphereConfig, DepthModelConfig } from '../model/environment.js'
import type { ElectricalConfig } from '../model/electrical.js'
import type { LatLon } from '../model/geo.js'
import type { WindModelConfig } from '../model/wind.js'
import type { AnchorState, Controls, VesselState, Waypoint } from '../model/types.js'
import type { AtmosphereModel } from '../model/environment.js'
import type { ElectricalModel } from '../model/electrical.js'
import type { WindModel } from '../model/wind.js'

/** The five situations the boat — and the LCARS front end — has to handle. */
export type SituationId = 'cruising' | 'motoring' | 'racing' | 'anchored' | 'marina'

export interface ScenarioSetup {
  origin: LatLon
  /** Initial heading, radians true. */
  heading: number
  /** Hour of day the scenario starts at, 0..24. Drives solar and lighting. */
  timeOfDay: number
  wind: Partial<WindModelConfig>
  atmosphere?: Partial<AtmosphereConfig>
  depth?: Partial<DepthModelConfig>
  electrical?: Partial<ElectricalConfig>
  boat?: Partial<BoatConfig>
  current?: CurrentSet
  aisTargets?: AisTargetSpec[]
  anchor?: Partial<AnchorState>
  destination?: Waypoint | null
  /** Non-baseline DC load, Watt — autopilot, radar, cabin lights. */
  extraLoad?: number
  shoreConnected?: boolean
}

/**
 * What a scenario can see and change while it runs. Everything mutable here is
 * fair game for scripted events: dragging an anchor, a front coming through,
 * the fridge cycling on.
 */
export interface ScenarioRuntime {
  /** Seconds of simulated time since the scenario was loaded. */
  readonly elapsed: number
  /** The vessel state produced by the previous tick. */
  readonly state: VesselState
  readonly wind: WindModel
  readonly atmosphere: AtmosphereModel
  readonly electrical: ElectricalModel
  /** Mutable: move the anchor to simulate dragging. */
  anchor: AnchorState
  /** Mutable: set and drift of the tidal stream. */
  current: CurrentSet
  /** Mutable: the waypoint the boat is navigating to. */
  destination: Waypoint | null
  /** Emit a line to the simulator console — used to announce scripted events. */
  announce(message: string): void
}

export interface Scenario {
  id: SituationId
  name: string
  description: string
  setup: ScenarioSetup
  /**
   * Called once per tick. Returns what the crew is asking of the boat; may also
   * mutate the runtime to script events.
   */
  step(runtime: ScenarioRuntime, dt: number): Controls
}

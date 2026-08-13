import { AisModel } from './ais.js'
import { BoatModel, DEFAULT_BOAT, type BoatConfig, type BoatMotion, type CurrentSet } from './boat.js'
import {
  AtmosphereModel,
  DEFAULT_ATMOSPHERE,
  DEFAULT_DEPTH,
  DepthModel,
  type AtmosphereConfig
} from './environment.js'
import { DEFAULT_ELECTRICAL, ElectricalModel } from './electrical.js'
import { DEFAULT_ENGINE, EngineModel } from './engine.js'
import { DEFAULT_WIND, WindModel } from './wind.js'
import { degrees, nauticalMiles } from './units.js'
import type { LatLon } from './geo.js'
import type { AnchorState, Controls, VesselState, Waypoint } from './types.js'
import type { Scenario, ScenarioRuntime } from '../scenarios/types.js'

/**
 * Magnetic variation for the sailing area. A proper WMM lookup would be more
 * correct, but a constant is honest for a simulator confined to one fjord and
 * keeps the heading maths readable.
 */
const AREA_VARIATION = degrees(3.2)

/**
 * Where the lifetime log starts, so the total distance readout shows a boat
 * with some history behind it while the trip log still starts from zero.
 */
const LIFETIME_LOG_START = nauticalMiles(12480)

const NO_ANCHOR: AnchorState = {
  deployed: false,
  position: null,
  rodeLength: 0,
  alarmRadius: 0
}

const NO_CURRENT: CurrentSet = { set: 0, drift: 0 }

export interface SimulationOptions {
  /** Called with scenario announcements such as "anchor is dragging". */
  onAnnounce?: (message: string) => void
}

/**
 * Drives every subsystem from a scenario and produces the vessel state that the
 * protocol emulators turn into NMEA 2000 and Victron MQTT traffic.
 */
export class Simulation {
  private scenario!: Scenario
  private wind!: WindModel
  private depthModel!: DepthModel
  private atmosphere!: AtmosphereModel
  private electrical!: ElectricalModel
  private engine!: EngineModel
  private boat!: BoatModel
  private ais!: AisModel
  private boatConfig!: BoatConfig

  private anchorState: AnchorState = { ...NO_ANCHOR }
  private currentSet: CurrentSet = { ...NO_CURRENT }
  private destinationWaypoint: Waypoint | null = null
  private legOrigin: LatLon | null = null
  private startOfDayHours = 12
  private elapsedSeconds = 0
  private vessel!: VesselState
  private readonly options: SimulationOptions

  constructor(scenario: Scenario, options: SimulationOptions = {}) {
    this.options = options
    this.load(scenario)
  }

  /** Swap in a different situation, rebuilding every model from its setup. */
  load(scenario: Scenario): void {
    const setup = scenario.setup
    this.scenario = scenario
    this.elapsedSeconds = 0
    this.startOfDayHours = setup.timeOfDay

    this.wind = new WindModel({ ...DEFAULT_WIND, ...setup.wind })
    this.atmosphere = new AtmosphereModel({ ...DEFAULT_ATMOSPHERE, ...setup.atmosphere })
    this.depthModel = new DepthModel(setup.origin, { ...DEFAULT_DEPTH, ...setup.depth })
    this.electrical = new ElectricalModel({ ...DEFAULT_ELECTRICAL, ...setup.electrical })
    this.engine = new EngineModel(DEFAULT_ENGINE)
    this.boatConfig = { ...DEFAULT_BOAT, ...setup.boat }
    this.boat = new BoatModel(this.boatConfig, setup.origin, setup.heading, LIFETIME_LOG_START)
    this.ais = new AisModel(setup.origin, setup.aisTargets ?? [])

    this.anchorState = { ...NO_ANCHOR, ...setup.anchor }
    this.currentSet = setup.current ? { ...setup.current } : { ...NO_CURRENT }
    this.destinationWaypoint = setup.destination ?? null
    this.legOrigin = this.destinationWaypoint ? { ...setup.origin } : null

    this.electrical.setShoreConnected(setup.shoreConnected ?? false)
    this.electrical.setExtraLoad(setup.extraLoad ?? 0)
    this.electrical.setTimeOfDay(setup.timeOfDay)

    this.vessel = this.buildState(
      this.boat.state,
      this.atmosphere.update(0),
      this.engine.current,
      this.electrical.update(0, 0)
    )
  }

  get current(): VesselState {
    return this.vessel
  }

  get activeScenario(): Scenario {
    return this.scenario
  }

  /** Simulated hour of day, wrapping past midnight. */
  get hourOfDay(): number {
    return (this.startOfDayHours + this.elapsedSeconds / 3600) % 24
  }

  private runtime(): ScenarioRuntime {
    const self = this
    return {
      get elapsed() {
        return self.elapsedSeconds
      },
      get state() {
        return self.vessel
      },
      get wind() {
        return self.wind
      },
      get atmosphere() {
        return self.atmosphere
      },
      get electrical() {
        return self.electrical
      },
      get anchor() {
        return self.anchorState
      },
      set anchor(value: AnchorState) {
        self.anchorState = value
      },
      get current() {
        return self.currentSet
      },
      set current(value: CurrentSet) {
        self.currentSet = value
      },
      get destination() {
        return self.destinationWaypoint
      },
      set destination(value: Waypoint | null) {
        self.setDestination(value)
      },
      announce: (message: string) => this.options.onAnnounce?.(message)
    }
  }

  /**
   * Switching waypoint also starts a new leg: cross-track error is measured
   * from where the boat was when the mark was set, not from the old leg.
   */
  private setDestination(value: Waypoint | null): void {
    if (value === this.destinationWaypoint) return
    this.destinationWaypoint = value
    this.legOrigin = value ? { ...this.boat.state.position } : null
  }

  /** Advance the whole model by `dt` seconds and return the new vessel state. */
  tick(dt: number): VesselState {
    this.elapsedSeconds += dt

    const controls: Controls = this.scenario.step(this.runtime(), dt)
    const trueWind = this.wind.update(dt)
    const atmosphere = this.atmosphere.update(dt)

    // Depth is sampled where the boat currently is, before it moves; over one
    // tick the difference is centimetres.
    const waterDepth = this.depthModel.depthAt(this.boat.state.position)

    const engineSpeed = this.engine.update(dt, controls.throttle, atmosphere.airTemperature)
    const motion = this.boat.update(
      dt,
      trueWind,
      controls,
      engineSpeed,
      this.currentSet,
      this.anchorState,
      waterDepth
    )

    this.ais.update(dt)
    this.electrical.setTimeOfDay(this.hourOfDay)
    const electrical = this.electrical.update(dt, this.engine.alternatorPower())

    this.vessel = this.buildState(motion, atmosphere, this.engine.current, electrical, waterDepth)
    return this.vessel
  }

  private buildState(
    motion: BoatMotion,
    atmosphere: AtmosphereConfig,
    engine: VesselState['engine'],
    electrical: VesselState['electrical'],
    waterDepth?: number
  ): VesselState {
    const depth = waterDepth ?? this.depthModel.depthAt(motion.position)

    return {
      time: Date.now(),
      elapsed: this.elapsedSeconds,
      position: motion.position,
      heading: motion.heading,
      variation: AREA_VARIATION,
      cog: motion.cog,
      sog: motion.sog,
      stw: motion.stw,
      rateOfTurn: motion.rateOfTurn,
      heel: motion.heel,
      pitch: motion.pitch,
      rudderAngle: motion.rudderAngle,
      leeway: motion.leeway,
      wind: motion.wind,
      // The sounder reads from the transducer down, not from the waterline.
      depth: Math.max(0.2, depth - this.boatConfig.transducerOffset),
      depthTransducerOffset: this.boatConfig.transducerOffset,
      waterTemperature: atmosphere.waterTemperature,
      airTemperature: atmosphere.airTemperature,
      pressure: atmosphere.pressure,
      humidity: atmosphere.humidity,
      engine,
      electrical,
      anchor: this.anchorState,
      aisTargets: this.ais.current,
      log: motion.log,
      tripLog: motion.log - LIFETIME_LOG_START,
      destination: this.destinationWaypoint,
      legOrigin: this.legOrigin
    }
  }
}

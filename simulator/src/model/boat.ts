import { DEFAULT_POLAR, IRONS_ANGLE, polarSpeed, type PolarTable } from './polars.js'
import { apparentWind, type TrueWind } from './wind.js'
import { moveAlong, type LatLon } from './geo.js'
import {
  angleDifference,
  approach,
  clamp,
  degrees,
  knots,
  normalizeAngle,
  normalizeSigned,
  TWO_PI
} from './units.js'
import type { AnchorState, Controls, WindState } from './types.js'

export interface CurrentSet {
  /** Direction the current flows *towards*, radians true. */
  set: number
  /** Current speed, m/s. */
  drift: number
}

export interface BoatConfig {
  polar: PolarTable
  /** Length overall, metres. */
  length: number
  beam: number
  draft: number
  /** Theoretical hull speed, m/s. */
  hullSpeed: number
  /** Fastest the boat will turn, radians per second. */
  maxRateOfTurn: number
  /** Hard-over rudder angle, radians. */
  maxRudderAngle: number
  /** Largest heel the boat will reach before the crew reefs, radians. */
  maxHeel: number
  /** Scales heel against sin(TWA) x TWS². */
  heelCoefficient: number
  /** Scales leeway against heel / STW². */
  leewayCoefficient: number
  /** Depth transducer below the waterline, metres. */
  transducerOffset: number
  /** Longitudinal acceleration limit, m/s². */
  surgeAcceleration: number
}

export const DEFAULT_BOAT: BoatConfig = {
  polar: DEFAULT_POLAR,
  length: 11.2,
  beam: 3.7,
  draft: 1.95,
  hullSpeed: knots(7.7),
  maxRateOfTurn: degrees(7),
  maxRudderAngle: degrees(35),
  maxHeel: degrees(32),
  heelCoefficient: 0.0065,
  leewayCoefficient: 2.0,
  transducerOffset: 0.55,
  surgeAcceleration: 0.15
}

export interface BoatMotion {
  position: LatLon
  heading: number
  cog: number
  sog: number
  stw: number
  rateOfTurn: number
  heel: number
  pitch: number
  rudderAngle: number
  leeway: number
  wind: WindState
  log: number
}

/**
 * The vessel itself: how it steers, how fast the sails or the engine drive it,
 * and where that puts it on the chart. Environmental inputs (wind, current,
 * engine thrust) are passed in each tick so that scenarios stay in control.
 */
export class BoatModel {
  private readonly config: BoatConfig
  private position: LatLon
  private heading: number
  private cog: number
  private sog = 0
  private stw = 0
  private rateOfTurn = 0
  private heel = 0
  private pitch = 0
  private rudderAngle = 0
  private leeway = 0
  private log: number
  private wavePhase = 0
  /** Slow oscillation of the bow while lying to an anchor. */
  private anchorYawPhase = 0

  constructor(config: BoatConfig, start: LatLon, heading: number, initialLog = 0) {
    this.config = config
    this.position = { ...start }
    this.heading = normalizeAngle(heading)
    this.cog = this.heading
    this.log = initialLog
  }

  get state(): BoatMotion {
    return {
      position: { ...this.position },
      heading: this.heading,
      cog: this.cog,
      sog: this.sog,
      stw: this.stw,
      rateOfTurn: this.rateOfTurn,
      heel: this.heel,
      pitch: this.pitch,
      rudderAngle: this.rudderAngle,
      leeway: this.leeway,
      wind: this.windState,
      log: this.log
    }
  }

  private windState: WindState = {
    directionTrue: 0,
    speedTrue: 0,
    angleTrue: 0,
    angleApparent: 0,
    speedApparent: 0
  }

  /** Teleport the boat, e.g. when a scenario is loaded. */
  reset(position: LatLon, heading: number): void {
    this.position = { ...position }
    this.heading = normalizeAngle(heading)
    this.cog = this.heading
    this.sog = 0
    this.stw = 0
    this.rateOfTurn = 0
    this.heel = 0
    this.leeway = 0
  }

  update(
    dt: number,
    trueWind: TrueWind,
    controls: Controls,
    engineSpeed: number,
    current: CurrentSet,
    anchor: AnchorState,
    depth: number
  ): BoatMotion {
    this.wavePhase = (this.wavePhase + dt * 0.9) % TWO_PI

    if (controls.anchored && anchor.deployed && anchor.position) {
      this.updateAtAnchor(dt, trueWind, anchor, depth)
      return this.state
    }

    if (controls.moored) {
      this.updateAlongside(dt, trueWind)
      return this.state
    }

    this.updateSteering(dt, controls.targetHeading)

    const trueWindAngle = normalizeSigned(trueWind.direction - this.heading)
    const sailSpeed = this.sailSpeed(controls.sailsUp, trueWindAngle, trueWind.speed)
    const targetSpeed = this.combineThrust(sailSpeed, engineSpeed)

    this.stw = Math.max(0, approach(this.stw, targetSpeed, this.config.surgeAcceleration * dt))
    this.updateAttitude(dt, controls.sailsUp, trueWindAngle, trueWind.speed)
    this.updateLeeway(controls.sailsUp)
    this.integratePosition(dt, current)
    this.updateWind(trueWind, trueWindAngle)

    return this.state
  }

  /** Turn towards the ordered heading, rate-limited like a real hull. */
  private updateSteering(dt: number, targetHeading: number): void {
    const error = angleDifference(this.heading, targetHeading)
    const desiredRate = clamp(error * 0.6, -this.config.maxRateOfTurn, this.config.maxRateOfTurn)
    // Rudder authority falls away at low speed, which is why the boat handles
    // badly under bare poles in a marina.
    const authority = clamp(this.stw / knots(2.5), 0.15, 1)
    this.rateOfTurn = approach(this.rateOfTurn, desiredRate * authority, this.config.maxRateOfTurn * dt)
    this.heading = normalizeAngle(this.heading + this.rateOfTurn * dt)
    this.rudderAngle =
      clamp(this.rateOfTurn / this.config.maxRateOfTurn, -1, 1) * this.config.maxRudderAngle
  }

  private sailSpeed(sailsUp: boolean, trueWindAngle: number, trueWindSpeed: number): number {
    if (!sailsUp) return 0
    const magnitude = Math.abs(trueWindAngle)
    const speed = polarSpeed(this.config.polar, trueWindAngle, trueWindSpeed)
    if (magnitude >= IRONS_ANGLE) return speed
    // Pinched too close: the sails stall and the boat stops. The polar already
    // tapers towards zero, this makes the last few degrees decisive.
    return speed * (magnitude / IRONS_ANGLE) ** 2
  }

  /**
   * Sails and propeller do not simply add — motorsailing gains less than the
   * sum of its parts, and the hull still limits the result.
   */
  private combineThrust(sailSpeed: number, engineSpeed: number): number {
    const dominant = Math.max(sailSpeed, engineSpeed)
    const secondary = Math.min(sailSpeed, engineSpeed)
    const combined = dominant + secondary * 0.35
    return Math.min(combined, Math.max(dominant, this.config.hullSpeed) * 1.15)
  }

  private updateAttitude(
    dt: number,
    sailsUp: boolean,
    trueWindAngle: number,
    trueWindSpeed: number
  ): void {
    // Wind from starboard lays the boat over to port, and roll is positive to
    // starboard, hence the negative sign.
    const targetHeel = sailsUp
      ? clamp(
          -Math.sin(trueWindAngle) * trueWindSpeed ** 2 * this.config.heelCoefficient,
          -this.config.maxHeel,
          this.config.maxHeel
        )
      : 0
    this.heel = approach(this.heel, targetHeel, degrees(12) * dt)

    // Waves: the boat pitches most going to windward and rolls most on a run.
    const seaState = clamp(trueWindSpeed / knots(25), 0, 1)
    const upwindness = Math.cos(trueWindAngle) * 0.5 + 0.5
    this.pitch = Math.sin(this.wavePhase) * degrees(4) * seaState * upwindness
    this.heel += Math.sin(this.wavePhase * 0.7) * degrees(3) * seaState * (1 - upwindness * 0.6)
  }

  private updateLeeway(sailsUp: boolean): void {
    if (!sailsUp || this.stw < knots(1)) {
      this.leeway = approach(this.leeway, 0, degrees(2))
      return
    }
    const target = clamp(
      (this.config.leewayCoefficient * this.heel) / this.stw ** 2,
      -degrees(10),
      degrees(10)
    )
    this.leeway = approach(this.leeway, target, degrees(3))
  }

  private integratePosition(dt: number, current: CurrentSet): void {
    // Track through the water differs from heading by the leeway angle.
    const waterTrack = normalizeAngle(this.heading + this.leeway)
    const east = this.stw * Math.sin(waterTrack) + current.drift * Math.sin(current.set)
    const north = this.stw * Math.cos(waterTrack) + current.drift * Math.cos(current.set)

    this.sog = Math.hypot(east, north)
    if (this.sog > 1e-4) this.cog = normalizeAngle(Math.atan2(east, north))

    this.position = moveAlong(this.position, this.cog, this.sog * dt)
    this.log += this.stw * dt
  }

  private updateWind(trueWind: TrueWind, trueWindAngle: number): void {
    const apparent = apparentWind(trueWindAngle, trueWind.speed, this.stw)
    this.windState = {
      directionTrue: trueWind.direction,
      speedTrue: trueWind.speed,
      angleTrue: trueWindAngle,
      angleApparent: apparent.angle,
      speedApparent: apparent.speed
    }
  }

  /**
   * Lying to the anchor. The boat sits downwind of it at the horizontal scope
   * allowed by the rode, sheering from side to side the way a sailboat does.
   */
  private updateAtAnchor(dt: number, trueWind: TrueWind, anchor: AnchorState, depth: number): void {
    this.anchorYawPhase = (this.anchorYawPhase + dt * 0.07) % TWO_PI

    const horizontalScope = Math.sqrt(Math.max(0, anchor.rodeLength ** 2 - depth ** 2))
    // Stronger wind pulls the rode straighter and damps the sheering.
    const windFactor = clamp(trueWind.speed / knots(20), 0.55, 1)
    const radius = horizontalScope * windFactor

    const sheer = Math.sin(this.anchorYawPhase) * degrees(28) * (1.2 - windFactor)
    const downwind = normalizeAngle(trueWind.direction + Math.PI)
    const bearingFromAnchor = normalizeAngle(downwind + sheer)

    const previous = this.position
    this.position = moveAlong(anchor.position!, bearingFromAnchor, radius)

    // Bow points back up the rode, into the wind, plus the sheer angle.
    const target = normalizeAngle(bearingFromAnchor + Math.PI)
    const error = angleDifference(this.heading, target)
    this.rateOfTurn = clamp(error * 0.25, -degrees(8), degrees(8))
    this.heading = normalizeAngle(this.heading + this.rateOfTurn * dt)

    // The boat is not moving through the water, but it does move over the ground
    // as it sheers, and that is what the anchor watch sees.
    const travelled = Math.hypot(
      (this.position.latitude - previous.latitude) * 111320,
      (this.position.longitude - previous.longitude) *
        111320 *
        Math.cos((this.position.latitude * Math.PI) / 180)
    )
    this.sog = dt > 0 ? travelled / dt : 0
    this.stw = 0
    this.heel = Math.sin(this.wavePhase * 0.5) * degrees(2)
    this.pitch = Math.sin(this.wavePhase) * degrees(1.5)
    this.leeway = 0
    this.rudderAngle = 0

    this.updateWind(trueWind, normalizeSigned(trueWind.direction - this.heading))
  }

  /** Tied up in a berth: held in place, moving only with the fenders. */
  private updateAlongside(dt: number, trueWind: TrueWind): void {
    this.stw = 0
    this.sog = 0
    this.rateOfTurn = 0
    this.rudderAngle = 0
    this.leeway = 0
    this.heel = Math.sin(this.wavePhase * 0.6) * degrees(1.2)
    this.pitch = Math.sin(this.wavePhase * 1.3) * degrees(0.6)
    this.updateWind(trueWind, normalizeSigned(trueWind.direction - this.heading))
  }
}

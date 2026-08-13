import { createRng, OrnsteinUhlenbeck, type Rng } from './rng.js'
import { clamp, normalizeAngle, normalizeSigned, TWO_PI } from './units.js'

export interface WindModelConfig {
  /** Mean direction the wind blows from, radians true. */
  baseDirection: number
  /** Mean true wind speed, m/s. */
  baseSpeed: number
  /** Amplitude of the regular oscillation, radians. */
  oscillationAmplitude: number
  /** Period of the regular oscillation, seconds. */
  oscillationPeriod: number
  /** Gust strength as a fraction of base speed. */
  gustiness: number
  /** Standard deviation of the slow directional wander, radians. */
  wanderAmplitude: number
  seed: number
}

export const DEFAULT_WIND: WindModelConfig = {
  baseDirection: 0,
  baseSpeed: 0,
  oscillationAmplitude: 0.087, // 5°
  oscillationPeriod: 240,
  gustiness: 0.18,
  wanderAmplitude: 0.14, // 8°
  seed: 1
}

export interface TrueWind {
  /** Direction the wind blows from, radians true. */
  direction: number
  /** Speed, m/s. */
  speed: number
}

/**
 * Wind as three superimposed effects, which is roughly how it reads on the
 * instruments: a repeating oscillation you can time your tacks to, a slow
 * wander of the mean direction over tens of minutes, and gusts.
 */
export class WindModel {
  private readonly rng: Rng
  private readonly wander: OrnsteinUhlenbeck
  private readonly gust: OrnsteinUhlenbeck
  private readonly phase: number
  private elapsed = 0
  private config: WindModelConfig

  constructor(config: WindModelConfig) {
    this.config = config
    this.rng = createRng(config.seed)
    this.phase = this.rng.next() * TWO_PI
    this.wander = new OrnsteinUhlenbeck(this.rng, 0, config.wanderAmplitude, 420)
    this.gust = new OrnsteinUhlenbeck(this.rng, 0, config.gustiness, 25)
  }

  /** Change the weather mid-run; used by scenario events such as a front passing. */
  reconfigure(patch: Partial<WindModelConfig>): void {
    this.config = { ...this.config, ...patch }
  }

  get settings(): Readonly<WindModelConfig> {
    return this.config
  }

  update(dt: number): TrueWind {
    this.elapsed += dt
    const { baseDirection, baseSpeed, oscillationAmplitude, oscillationPeriod } = this.config

    // Two incommensurate periods so the oscillation never looks perfectly regular.
    const fast = Math.sin((TWO_PI * this.elapsed) / oscillationPeriod + this.phase)
    const slow = Math.sin((TWO_PI * this.elapsed) / (oscillationPeriod * 2.7) + this.phase * 1.7)
    const oscillation = oscillationAmplitude * (fast * 0.75 + slow * 0.35)

    const wander = this.wander.update(dt)
    const gustFraction = this.gust.update(dt)

    // Gusts are asymmetric — they reach further above the mean than lulls reach
    // below it — but bounded. Left unbounded, a windy scenario's tail produces
    // gusts at twice the mean, which no anemometer on a real boat ever sees.
    const gustFactor = clamp(1 + gustFraction + Math.max(0, gustFraction) * 0.5, 0.5, 1.6)

    return {
      direction: normalizeAngle(baseDirection + oscillation + wander),
      speed: Math.max(0, baseSpeed * gustFactor)
    }
  }
}

export interface ApparentWind {
  /** Apparent wind angle relative to the bow, (-π, π], positive to starboard. */
  angle: number
  /** Apparent wind speed, m/s. */
  speed: number
}

/**
 * Combine the true wind with the boat's own motion.
 *
 * @param trueWindAngle true wind angle relative to the bow, radians
 * @param trueWindSpeed m/s
 * @param boatSpeed speed through the water, m/s
 */
export function apparentWind(
  trueWindAngle: number,
  trueWindSpeed: number,
  boatSpeed: number
): ApparentWind {
  // Components in boat coordinates: x forward, y to starboard. The true wind
  // vector points from the bow towards where the wind comes from; adding the
  // boat's forward motion gives the apparent wind.
  const x = trueWindSpeed * Math.cos(trueWindAngle) + boatSpeed
  const y = trueWindSpeed * Math.sin(trueWindAngle)
  return {
    angle: normalizeSigned(Math.atan2(y, x)),
    speed: Math.hypot(x, y)
  }
}

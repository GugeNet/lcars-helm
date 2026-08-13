import { createRng } from './rng.js'
import { offsetMetres, type LatLon } from './geo.js'
import { celsius, clamp } from './units.js'

export interface DepthModelConfig {
  /** Depth at the scenario origin, metres. */
  baseDepth: number
  /** Peak-to-peak variation of the seabed, metres. */
  variation: number
  /** Horizontal scale of seabed features, metres. */
  featureSize: number
  /** Never report less than this — keeps scenarios off the rocks. */
  minimumDepth: number
  seed: number
}

export const DEFAULT_DEPTH: DepthModelConfig = {
  baseDepth: 24,
  variation: 14,
  featureSize: 450,
  minimumDepth: 2.5,
  seed: 7
}

const smoothstep = (t: number): number => t * t * (3 - 2 * t)

/**
 * A synthetic seabed. Value noise on a grid gives a bottom that is smooth,
 * repeatable, and varies as the boat moves — enough to make the depth readout
 * and the shallow alarm behave believably without needing chart data.
 */
export class DepthModel {
  private readonly origin: LatLon
  private readonly config: DepthModelConfig
  private readonly gradients = new Map<string, number>()

  constructor(origin: LatLon, config: DepthModelConfig = DEFAULT_DEPTH) {
    this.origin = origin
    this.config = config
  }

  private latticeValue(ix: number, iy: number): number {
    const key = `${ix},${iy}`
    const cached = this.gradients.get(key)
    if (cached !== undefined) return cached
    // Hash the coordinates into the seed so the field is stable in space,
    // regardless of the order cells are visited in.
    const rng = createRng(this.config.seed + ix * 73856093 + iy * 19349663)
    const value = rng.next()
    this.gradients.set(key, value)
    return value
  }

  private noiseAt(east: number, north: number): number {
    const x = east / this.config.featureSize
    const y = north / this.config.featureSize
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const tx = smoothstep(x - x0)
    const ty = smoothstep(y - y0)

    const v00 = this.latticeValue(x0, y0)
    const v10 = this.latticeValue(x0 + 1, y0)
    const v01 = this.latticeValue(x0, y0 + 1)
    const v11 = this.latticeValue(x0 + 1, y0 + 1)

    const bottom = v00 + (v10 - v00) * tx
    const top = v01 + (v11 - v01) * tx
    return bottom + (top - bottom) * ty
  }

  /** Depth of water below the surface at a position, metres. */
  depthAt(position: LatLon): number {
    const { east, north } = offsetMetres(this.origin, position)
    // Two octaves: broad banks plus finer texture.
    const coarse = this.noiseAt(east, north)
    const fine = this.noiseAt(east * 3.7 + 1000, north * 3.7 - 1000)
    const combined = coarse * 0.75 + fine * 0.25
    const depth = this.config.baseDepth + (combined - 0.5) * this.config.variation
    return Math.max(this.config.minimumDepth, depth)
  }
}

export interface AtmosphereConfig {
  airTemperature: number
  waterTemperature: number
  pressure: number
  humidity: number
}

export const DEFAULT_ATMOSPHERE: AtmosphereConfig = {
  airTemperature: celsius(17),
  waterTemperature: celsius(14),
  pressure: 101500,
  humidity: 0.72
}

/**
 * Slowly varying air, water and pressure. Pressure in particular is worth
 * having: a falling barometer is one of the cues the anchored dashboard shows.
 */
export class AtmosphereModel {
  private elapsed = 0
  private config: AtmosphereConfig
  /** Pascal per second; negative for a falling glass. */
  private pressureTrend = 0

  constructor(config: AtmosphereConfig = DEFAULT_ATMOSPHERE) {
    this.config = { ...config }
  }

  reconfigure(patch: Partial<AtmosphereConfig>): void {
    this.config = { ...this.config, ...patch }
  }

  /** Set a barometric trend, in hectopascal per hour. */
  setPressureTrend(hPaPerHour: number): void {
    this.pressureTrend = (hPaPerHour * 100) / 3600
  }

  update(dt: number): AtmosphereConfig {
    this.elapsed += dt
    this.config.pressure = clamp(this.config.pressure + this.pressureTrend * dt, 94000, 106000)
    // A gentle diurnal swing on the air temperature.
    const diurnal = Math.sin((this.elapsed / 43200) * Math.PI) * 1.5
    return {
      airTemperature: this.config.airTemperature + diurnal,
      waterTemperature: this.config.waterTemperature,
      pressure: this.config.pressure,
      humidity: this.config.humidity
    }
  }
}

import { approach, celsius, clamp, knots } from './units.js'
import type { EngineState } from './types.js'

export interface EngineConfig {
  /** Engine speed when idling, rpm. */
  idleRpm: number
  /** Engine speed at full throttle, rpm. */
  maxRpm: number
  /** Boat speed at full throttle in flat water, m/s. */
  maxSpeed: number
  /** Fuel burn at full throttle, litres per hour. */
  maxFuelRate: number
  /** Normal operating coolant temperature, Kelvin. */
  operatingTemperature: number
  /** Charging output at cruising revs, Watt. */
  alternatorOutput: number
}

export const DEFAULT_ENGINE: EngineConfig = {
  idleRpm: 800,
  maxRpm: 3000,
  maxSpeed: knots(7.2),
  maxFuelRate: 6.5,
  operatingTemperature: celsius(82),
  alternatorOutput: 900
}

/**
 * A small marine diesel. Revs follow the throttle with a lag, temperature
 * climbs to its operating point after a cold start, and thrust rises roughly
 * with the square of the propeller speed.
 */
export class EngineModel {
  private state: EngineState
  private readonly config: EngineConfig

  constructor(config: EngineConfig = DEFAULT_ENGINE, initialHours = 1420 * 3600) {
    this.config = config
    this.state = {
      running: false,
      rpm: 0,
      coolantTemperature: celsius(15),
      oilPressure: 0,
      alternatorVoltage: 0,
      fuelRate: 0,
      totalHours: initialHours
    }
  }

  get current(): EngineState {
    return { ...this.state }
  }

  /**
   * Advance the engine and return the thrust it produces.
   *
   * @param throttle 0..1; anything above zero implies the engine is running
   * @returns the boat speed the propeller alone would drive, m/s
   */
  update(dt: number, throttle: number, ambientTemperature: number): number {
    const demand = clamp(throttle, 0, 1)
    const running = demand > 0
    this.state.running = running

    const targetRpm = running
      ? this.config.idleRpm + (this.config.maxRpm - this.config.idleRpm) * demand
      : 0
    // Roughly two seconds to swing between idle and full revs.
    this.state.rpm = approach(this.state.rpm, targetRpm, ((this.config.maxRpm - this.config.idleRpm) / 2) * dt)

    if (running) {
      this.state.totalHours += dt
      this.state.coolantTemperature = approach(
        this.state.coolantTemperature,
        this.config.operatingTemperature,
        0.35 * dt
      )
      this.state.oilPressure = 350000 + (this.state.rpm / this.config.maxRpm) * 150000
      this.state.alternatorVoltage = 14.2
      this.state.fuelRate = this.config.maxFuelRate * (0.12 + 0.88 * demand ** 2)
    } else {
      this.state.coolantTemperature = approach(this.state.coolantTemperature, ambientTemperature, 0.08 * dt)
      this.state.oilPressure = 0
      this.state.alternatorVoltage = 0
      this.state.fuelRate = 0
    }

    // Thrust: propeller power scales with rpm cubed, hull resistance with speed
    // cubed, so speed ends up close to linear in rpm above idle.
    const rpmFraction = clamp(
      (this.state.rpm - this.config.idleRpm * 0.5) / (this.config.maxRpm - this.config.idleRpm * 0.5),
      0,
      1
    )
    return this.config.maxSpeed * rpmFraction
  }

  /** Charging power available to the house bank right now, Watt. */
  alternatorPower(): number {
    if (!this.state.running) return 0
    const fraction = clamp((this.state.rpm - 900) / (this.config.maxRpm - 900), 0, 1)
    return this.config.alternatorOutput * (0.3 + 0.7 * fraction)
  }
}

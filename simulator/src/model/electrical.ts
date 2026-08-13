import { celsius, clamp } from './units.js'
import type { ElectricalState } from './types.js'

export interface ElectricalConfig {
  /** House bank capacity, amp-hours. */
  capacityAh: number
  /** Nominal system voltage. */
  nominalVoltage: number
  /** Baseline house load with everything normal, Watt. */
  baseLoadWatts: number
  /** Peak solar output in full sun, Watt. */
  solarPeakWatts: number
  /** Maximum draw when connected to shore, Watt. */
  shoreChargerWatts: number
  /** Starting state of charge, 0..1. */
  initialStateOfCharge: number
  /** True for lithium: a much flatter voltage curve than lead-acid. */
  lithium: boolean
}

export const DEFAULT_ELECTRICAL: ElectricalConfig = {
  capacityAh: 400,
  nominalVoltage: 12.8,
  baseLoadWatts: 55,
  solarPeakWatts: 480,
  shoreChargerWatts: 700,
  initialStateOfCharge: 0.86,
  lithium: true
}

/**
 * House bank, solar, alternator and shore charger. Good enough to drive the
 * power widgets and, more importantly, to make the anchored dashboard's
 * "will the batteries last the night" question have a real answer.
 */
export class ElectricalModel {
  private readonly config: ElectricalConfig
  private stateOfCharge: number
  private consumedAh: number
  private extraLoad = 0
  private shoreConnected = false
  /** Hour of day, 0..24, used for the solar curve. */
  private hourOfDay = 12

  constructor(config: ElectricalConfig = DEFAULT_ELECTRICAL) {
    this.config = config
    this.stateOfCharge = clamp(config.initialStateOfCharge, 0, 1)
    this.consumedAh = config.capacityAh * (1 - this.stateOfCharge)
  }

  setShoreConnected(connected: boolean): void {
    this.shoreConnected = connected
  }

  /** Additional load in Watt — autopilot, fridge cycling, nav lights at night. */
  setExtraLoad(watts: number): void {
    this.extraLoad = Math.max(0, watts)
  }

  setTimeOfDay(hourOfDay: number): void {
    this.hourOfDay = ((hourOfDay % 24) + 24) % 24
  }

  /** Solar output following a simple sunrise-to-sunset curve, Watt. */
  private solarOutput(): number {
    const dayFraction = (this.hourOfDay - 6) / 12 // 0 at 06:00, 1 at 18:00
    if (dayFraction <= 0 || dayFraction >= 1) return 0
    return this.config.solarPeakWatts * Math.sin(dayFraction * Math.PI) ** 1.5
  }

  /**
   * Terminal voltage for the current state of charge. Lithium sits near
   * nominal across most of its range; lead-acid sags steadily.
   */
  private terminalVoltage(current: number): number {
    const nominal = this.config.nominalVoltage
    const restingVoltage = this.config.lithium
      ? nominal + 0.9 * (this.stateOfCharge - 0.5) * 0.6
      : nominal - 1.1 + this.stateOfCharge * 1.4
    // Internal resistance: the bank sags under load and rises while charging.
    return restingVoltage + current * 0.006
  }

  update(dt: number, alternatorPower: number): ElectricalState {
    const solarPower = this.solarOutput()
    const shorePower = this.shoreConnected
      ? this.config.shoreChargerWatts * clamp(1.05 - this.stateOfCharge, 0, 1)
      : 0
    const dcLoad = this.config.baseLoadWatts + this.extraLoad

    const netWatts = solarPower + shorePower + alternatorPower - dcLoad
    const voltageEstimate = this.terminalVoltage(0)
    const netAmps = netWatts / voltageEstimate

    this.consumedAh = clamp(
      this.consumedAh - (netAmps * dt) / 3600,
      0,
      this.config.capacityAh
    )
    this.stateOfCharge = clamp(1 - this.consumedAh / this.config.capacityAh, 0, 1)

    return {
      batteryVoltage: this.terminalVoltage(netAmps),
      batteryCurrent: netAmps,
      batteryTemperature: celsius(19),
      stateOfCharge: this.stateOfCharge,
      consumedAmpHours: this.consumedAh,
      solarPower,
      alternatorPower,
      shorePower,
      shoreConnected: this.shoreConnected,
      dcLoad
    }
  }
}

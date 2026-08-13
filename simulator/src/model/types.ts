import type { LatLon } from './geo.js'

/** Everything here is SI: radians, m/s, metres, Kelvin, Pascal, seconds. */

export interface WindState {
  /** Direction the true wind blows *from*, radians true, [0, 2π). */
  directionTrue: number
  /** True wind speed over ground, m/s. */
  speedTrue: number
  /** True wind angle relative to the bow, (-π, π], positive to starboard. */
  angleTrue: number
  /** Apparent wind angle relative to the bow, (-π, π], positive to starboard. */
  angleApparent: number
  /** Apparent wind speed, m/s. */
  speedApparent: number
}

export interface EngineState {
  running: boolean
  /** Revolutions per minute. */
  rpm: number
  /** Coolant temperature, Kelvin. */
  coolantTemperature: number
  /** Oil pressure, Pascal. */
  oilPressure: number
  /** Alternator output, Volt. */
  alternatorVoltage: number
  /** Fuel consumption, litres per hour. */
  fuelRate: number
  /** Cumulative running time, seconds. */
  totalHours: number
}

export interface ElectricalState {
  /** House bank terminal voltage, Volt. */
  batteryVoltage: number
  /** House bank current, Ampere; positive charging, negative discharging. */
  batteryCurrent: number
  /** House bank temperature, Kelvin. */
  batteryTemperature: number
  /** State of charge, 0..1. */
  stateOfCharge: number
  /** Amp-hours drawn since full. */
  consumedAmpHours: number
  /** Solar array output, Watt. */
  solarPower: number
  /** Alternator output, Watt. */
  alternatorPower: number
  /** Shore power drawn, Watt; zero when not connected. */
  shorePower: number
  /** Whether the shore lead is plugged in. */
  shoreConnected: boolean
  /** Total DC load, Watt. */
  dcLoad: number
}

export interface AnchorState {
  deployed: boolean
  /** Where the anchor lies on the bottom. */
  position: LatLon | null
  /** Rode paid out, metres. */
  rodeLength: number
  /** Alarm radius set by the crew, metres. */
  alarmRadius: number
}

export interface AisTargetState {
  mmsi: string
  name: string
  callsign: string
  /** 0 = Class A, 1 = Class B. */
  classB: boolean
  position: LatLon
  /** Course over ground, radians true. */
  cog: number
  /** Speed over ground, m/s. */
  sog: number
  /** Heading, radians true. */
  heading: number
  rateOfTurn: number
  /** NMEA 2000 ship type code, e.g. 70 = cargo, 36 = sailing. */
  shipType: number
  length: number
  beam: number
  destination: string
}

export interface VesselState {
  /** Wall-clock time of this sample, milliseconds since epoch. */
  time: number
  /** Seconds of simulated time since the scenario started. */
  elapsed: number
  position: LatLon
  /** Heading through the water, radians true. */
  heading: number
  /** Magnetic variation at the current position, radians; east positive. */
  variation: number
  /** Course over ground, radians true. */
  cog: number
  /** Speed over ground, m/s. */
  sog: number
  /** Speed through the water, m/s. */
  stw: number
  /** Rate of turn, radians per second; positive to starboard. */
  rateOfTurn: number
  /** Heel, radians; positive to starboard. */
  heel: number
  /** Pitch, radians; positive bow up. */
  pitch: number
  /** Rudder angle, radians; positive to starboard. */
  rudderAngle: number
  /** Leeway, radians; the difference between heading and track through water. */
  leeway: number
  wind: WindState
  /** Water depth below the transducer, metres. */
  depth: number
  /** Distance from the transducer to the waterline, metres. */
  depthTransducerOffset: number
  waterTemperature: number
  airTemperature: number
  /** Barometric pressure, Pascal. */
  pressure: number
  /** Relative humidity, 0..1. */
  humidity: number
  engine: EngineState
  electrical: ElectricalState
  anchor: AnchorState
  aisTargets: AisTargetState[]
  /** Cumulative distance through the water, metres. */
  log: number
  /** Distance since the trip counter was reset, metres. */
  tripLog: number
  /** Active waypoint the boat is navigating to, if any. */
  destination: Waypoint | null
  /**
   * Where the boat was when the current destination was set. Cross-track error
   * is measured from the line between this point and the destination.
   */
  legOrigin: LatLon | null
}

export interface Waypoint {
  name: string
  position: LatLon
  /** Radius at which the waypoint counts as reached, metres. */
  arrivalRadius: number
}

/**
 * What the crew (or the autopilot) is asking the boat to do. Scenarios drive
 * these; the boat model turns them into motion.
 */
export interface Controls {
  /** Heading the helm is steering, radians true. */
  targetHeading: number
  /** Engine throttle, 0..1. */
  throttle: number
  /** Whether sails are drawing. */
  sailsUp: boolean
  /** True when lying to the anchor — the boat model then swings instead of sailing. */
  anchored: boolean
  /** True when tied up — no motion at all beyond a gentle surge. */
  moored: boolean
}

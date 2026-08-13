/**
 * The Signal K paths the display reads. Keeping them in one place means a path
 * that changes name upstream — or a value that turns out to come from a
 * different PGN than expected — is a one-line fix rather than a search.
 */
export const PATHS = {
  // Position and motion
  position: 'navigation.position',
  headingTrue: 'navigation.headingTrue',
  headingMagnetic: 'navigation.headingMagnetic',
  magneticVariation: 'navigation.magneticVariation',
  courseOverGround: 'navigation.courseOverGroundTrue',
  speedOverGround: 'navigation.speedOverGround',
  speedThroughWater: 'navigation.speedThroughWater',
  rateOfTurn: 'navigation.rateOfTurn',
  attitude: 'navigation.attitude',
  rudderAngle: 'steering.rudderAngle',
  log: 'navigation.log',
  tripLog: 'navigation.trip.log',
  datetime: 'navigation.datetime',

  // Wind
  windAngleApparent: 'environment.wind.angleApparent',
  windSpeedApparent: 'environment.wind.speedApparent',
  windAngleTrue: 'environment.wind.angleTrueWater',
  windSpeedTrue: 'environment.wind.speedTrue',
  windDirectionTrue: 'environment.wind.directionTrue',

  // Water and weather
  depthBelowTransducer: 'environment.depth.belowTransducer',
  depthBelowSurface: 'environment.depth.belowSurface',
  depthBelowKeel: 'environment.depth.belowKeel',
  waterTemperature: 'environment.water.temperature',
  airTemperature: 'environment.outside.temperature',
  pressure: 'environment.outside.pressure',
  humidity: 'environment.outside.humidity',

  // Navigation to a mark
  nextPointDistance: 'navigation.courseGreatCircle.nextPoint.distance',
  nextPointBearing: 'navigation.courseGreatCircle.nextPoint.bearingTrue',
  nextPointVmg: 'navigation.courseGreatCircle.nextPoint.velocityMadeGood',
  nextPointTimeToGo: 'navigation.courseGreatCircle.nextPoint.timeToGo',
  nextPointPosition: 'navigation.courseGreatCircle.nextPoint.position',
  crossTrackError: 'navigation.courseGreatCircle.crossTrackError',

  // Engine
  engineRevolutions: 'propulsion.port.revolutions',
  engineTemperature: 'propulsion.port.temperature',
  engineOilPressure: 'propulsion.port.oilPressure',
  engineRunTime: 'propulsion.port.runTime',
  engineAlternatorVoltage: 'propulsion.port.alternatorVoltage',
  engineFuelRate: 'propulsion.port.fuel.rate',

  // Electrical — these arrive from the Victron plugin rather than the N2K bus
  batteryStateOfCharge: 'electrical.batteries.house.capacity.stateOfCharge',
  batteryVoltage: 'electrical.batteries.house.voltage',
  batteryCurrent: 'electrical.batteries.house.current',
  batteryPower: 'electrical.batteries.house.power',
  solarPower: 'electrical.solar.main.panelPower',
  shorePower: 'electrical.chargers.shore.acin.power',

  // Anchor, published by the anchor alarm plugin
  anchorPosition: 'navigation.anchor.position',
  anchorRode: 'navigation.anchor.rodeLength',
  anchorMaxRadius: 'navigation.anchor.maxRadius',
  anchorDistance: 'navigation.anchor.currentRadius'
} as const

export type PathKey = keyof typeof PATHS

export interface PositionValue {
  latitude: number
  longitude: number
}

export interface AttitudeValue {
  roll: number
  pitch: number
  yaw: number
}

export function isPosition(value: unknown): value is PositionValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PositionValue).latitude === 'number' &&
    typeof (value as PositionValue).longitude === 'number'
  )
}

export function isAttitude(value: unknown): value is AttitudeValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AttitudeValue).roll === 'number'
  )
}

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

  // Electrical. These arrive from signalk-venus-plugin talking to the Cerbo GX,
  // not from the NMEA 2000 bus. The `house` and `main` instance names come from
  // the instanceMappings in deploy/signalk/plugin-config-data/venus.json; without
  // those the paths would carry raw Victron instance numbers.
  batteryStateOfCharge: 'electrical.batteries.house.capacity.stateOfCharge',
  batteryVoltage: 'electrical.batteries.house.voltage',
  batteryCurrent: 'electrical.batteries.house.current',
  batteryPower: 'electrical.batteries.house.power',
  batteryTimeRemaining: 'electrical.batteries.house.capacity.timeRemaining',
  solarPower: 'electrical.solar.main.panelPower',
  // Shore power is what the Multiplus draws on its AC input. This is a
  // magnitude for display only — it is not a reliable connection signal, since
  // it drops to near zero once the charger reaches float and stays there for
  // as long as the batteries stay topped up.
  shorePower: 'electrical.inverters.main.acin.power',
  // The Multiplus's own "mains" LED — exactly the same boolean the physical
  // panel lights, and independent of how much current it happens to be
  // drawing. Found the hard way: at 96% state of charge in float, acin.power
  // reads a couple of watts, which a wattage threshold reads as unplugged
  // while the panel's mains LED (and the mains) stayed on the whole time.
  shoreConnected: 'electrical.chargers.main.leds.mains',

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

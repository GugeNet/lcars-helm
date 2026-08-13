import {
  PGN,
  PGN_126992,
  PGN_127245,
  PGN_127250,
  PGN_127251,
  PGN_127257,
  PGN_127258,
  PGN_127488,
  PGN_127489,
  PGN_128259,
  PGN_128267,
  PGN_128275,
  PGN_129025,
  PGN_129026,
  PGN_129029,
  PGN_129038,
  PGN_129039,
  PGN_129283,
  PGN_129284,
  PGN_129794,
  PGN_129809,
  PGN_129810,
  PGN_130306,
  PGN_130310,
  PGN_130311,
  DirectionReference,
  Gns,
  GnsIntegrity,
  GnsMethod,
  MagneticVariation,
  ResidualMode,
  SystemTime,
  TemperatureSource,
  WaterReference,
  WindReference,
  YesNo,
  BearingMode,
  EngineInstance
} from '@canboat/ts-pgns'
import { bearingTo, crossTrackError, distanceBetween } from '../model/geo.js'
import { normalizeAngle, normalizeSigned, toDegrees } from '../model/units.js'
import type { AisTargetState, VesselState } from '../model/types.js'

/**
 * Source addresses on the simulated NMEA 2000 bus. Real instruments each claim
 * their own address, and Signal K keys its `$source` on them, so spreading the
 * PGNs across plausible addresses makes the simulated bus look like the boat's.
 */
export const SOURCE_ADDRESSES = {
  /** GPS antenna. */
  gps: 3,
  /** B&G Precision 9 compass. */
  compass: 4,
  /** Garmin masthead wind instrument. */
  wind: 5,
  /** Airmar depth and speed triducer. */
  triducer: 6,
  /** Engine gateway. */
  engine: 7,
  /** AIS transponder. */
  ais: 8,
  /** Chartplotter publishing navigation data. */
  plotter: 9,
  /** Rudder reference / autopilot computer. */
  autopilot: 10
} as const

/** `YYYY.MM.DD` as canboat's DATE writer expects. */
function n2kDate(epochMs: number): string {
  const d = new Date(epochMs)
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}.${month}.${day}`
}

/** `HH:MM:SS.mmm` as canboat's TIME writer expects. */
function n2kTime(epochMs: number): string {
  const d = new Date(epochMs)
  const hours = String(d.getUTCHours()).padStart(2, '0')
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  const seconds = String(d.getUTCSeconds()).padStart(2, '0')
  const millis = String(d.getUTCMilliseconds()).padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${millis}`
}

function withSource<T extends PGN>(pgn: T, src: number): T {
  pgn.src = src
  return pgn
}

/**
 * One group of PGNs sent together at a fixed rate, the way a real instrument
 * transmits. Rates are taken from what the corresponding devices actually put
 * on the bus.
 */
export interface PgnEmitter {
  id: string
  intervalMs: number
  build(state: VesselState, sid: number): PGN[]
}

const positionEmitter: PgnEmitter = {
  id: 'position',
  intervalMs: 250,
  build: (state) => [
    withSource(
      new PGN_129025({ latitude: state.position.latitude, longitude: state.position.longitude }),
      SOURCE_ADDRESSES.gps
    )
  ]
}

const cogSogEmitter: PgnEmitter = {
  id: 'cog-sog',
  intervalMs: 250,
  build: (state, sid) => [
    withSource(
      new PGN_129026({
        sid,
        cogReference: DirectionReference.True,
        cog: state.cog,
        sog: state.sog
      }),
      SOURCE_ADDRESSES.gps
    )
  ]
}

const gnssEmitter: PgnEmitter = {
  id: 'gnss',
  intervalMs: 1000,
  build: (state, sid) => [
    withSource(
      new PGN_129029({
        sid,
        date: n2kDate(state.time),
        time: n2kTime(state.time),
        latitude: state.position.latitude,
        longitude: state.position.longitude,
        altitude: 1.4,
        gnssType: Gns.GpsPlussbaswaasPlusglonass,
        method: GnsMethod.DgnssFix,
        integrity: GnsIntegrity.NoIntegrityChecking,
        numberOfSvs: 14,
        hdop: 0.8,
        pdop: 1.4,
        geoidalSeparation: 40.2,
        referenceStations: 0,
        list: []
      }),
      SOURCE_ADDRESSES.gps
    )
  ]
}

const systemTimeEmitter: PgnEmitter = {
  id: 'system-time',
  intervalMs: 1000,
  build: (state, sid) => [
    withSource(
      new PGN_126992({
        sid,
        source: SystemTime.Gps,
        date: n2kDate(state.time),
        time: n2kTime(state.time)
      }),
      SOURCE_ADDRESSES.gps
    )
  ]
}

const headingEmitter: PgnEmitter = {
  id: 'heading',
  intervalMs: 100,
  build: (state, sid) => [
    withSource(
      new PGN_127250({
        sid,
        heading: state.heading,
        deviation: 0,
        variation: state.variation,
        reference: DirectionReference.True
      }),
      SOURCE_ADDRESSES.compass
    ),
    withSource(new PGN_127251({ sid, rate: state.rateOfTurn }), SOURCE_ADDRESSES.compass)
  ]
}

const attitudeEmitter: PgnEmitter = {
  id: 'attitude',
  intervalMs: 200,
  build: (state, sid) => [
    withSource(
      new PGN_127257({ sid, yaw: state.heading, pitch: state.pitch, roll: state.heel }),
      SOURCE_ADDRESSES.compass
    )
  ]
}

const variationEmitter: PgnEmitter = {
  id: 'variation',
  intervalMs: 2000,
  build: (state, sid) => [
    withSource(
      new PGN_127258({
        sid,
        source: MagneticVariation.Wmm2025,
        ageOfService: n2kDate(state.time),
        variation: state.variation
      }),
      SOURCE_ADDRESSES.compass
    )
  ]
}

const windEmitter: PgnEmitter = {
  id: 'wind',
  intervalMs: 250,
  build: (state, sid) => [
    withSource(
      new PGN_130306({
        sid,
        windSpeed: state.wind.speedApparent,
        // NMEA 2000 carries wind angle as 0..2π, not the signed form.
        windAngle: normalizeAngle(state.wind.angleApparent),
        reference: WindReference.Apparent
      }),
      SOURCE_ADDRESSES.wind
    ),
    withSource(
      new PGN_130306({
        sid,
        windSpeed: state.wind.speedTrue,
        windAngle: normalizeAngle(state.wind.angleTrue),
        reference: WindReference.TrueboatReferenced
      }),
      SOURCE_ADDRESSES.wind
    ),
    // Ground-referenced true wind. Not every masthead unit computes this, but
    // the ones that do give Signal K `environment.wind.directionTrue` directly,
    // which is what the anchored dashboard plots the wind shift from.
    withSource(
      new PGN_130306({
        sid,
        windSpeed: state.wind.speedTrue,
        windAngle: normalizeAngle(state.wind.directionTrue),
        reference: WindReference.TruegroundReferencedToNorth
      }),
      SOURCE_ADDRESSES.wind
    )
  ]
}

const depthEmitter: PgnEmitter = {
  id: 'depth',
  intervalMs: 1000,
  build: (state, sid) => [
    withSource(
      new PGN_128267({
        sid,
        depth: state.depth,
        offset: state.depthTransducerOffset,
        range: 200
      }),
      SOURCE_ADDRESSES.triducer
    )
  ]
}

const speedEmitter: PgnEmitter = {
  id: 'speed',
  intervalMs: 250,
  build: (state, sid) => [
    withSource(
      new PGN_128259({
        sid,
        speedWaterReferenced: state.stw,
        speedGroundReferenced: state.sog,
        speedWaterReferencedType: WaterReference.PaddleWheel
      }),
      SOURCE_ADDRESSES.triducer
    )
  ]
}

const logEmitter: PgnEmitter = {
  id: 'log',
  intervalMs: 1000,
  build: (state) => [
    withSource(
      new PGN_128275({
        date: n2kDate(state.time),
        time: n2kTime(state.time),
        log: Math.round(state.log),
        tripLog: Math.round(Math.max(0, state.tripLog))
      }),
      SOURCE_ADDRESSES.triducer
    )
  ]
}

const environmentEmitter: PgnEmitter = {
  id: 'environment',
  intervalMs: 2000,
  build: (state, sid) => [
    withSource(
      new PGN_130310({
        sid,
        waterTemperature: state.waterTemperature,
        outsideAmbientAirTemperature: state.airTemperature,
        atmosphericPressure: state.pressure
      }),
      SOURCE_ADDRESSES.triducer
    ),
    withSource(
      new PGN_130311({
        sid,
        temperatureSource: TemperatureSource.OutsideTemperature,
        humiditySource: 1, // outside humidity
        temperature: state.airTemperature,
        // NMEA 2000 carries humidity as a percentage, not a ratio.
        humidity: state.humidity * 100,
        atmosphericPressure: state.pressure
      }),
      SOURCE_ADDRESSES.triducer
    )
  ]
}

const rudderEmitter: PgnEmitter = {
  id: 'rudder',
  intervalMs: 200,
  build: (state) => [
    withSource(
      new PGN_127245({ instance: 0, position: state.rudderAngle }),
      SOURCE_ADDRESSES.autopilot
    )
  ]
}

const engineRapidEmitter: PgnEmitter = {
  id: 'engine-rapid',
  intervalMs: 250,
  build: (state) => [
    withSource(
      new PGN_127488({
        instance: EngineInstance.SingleEngineOrDualEnginePort,
        speed: state.engine.rpm
      }),
      SOURCE_ADDRESSES.engine
    )
  ]
}

const engineDynamicEmitter: PgnEmitter = {
  id: 'engine-dynamic',
  intervalMs: 1000,
  build: (state) => [
    withSource(
      new PGN_127489({
        instance: EngineInstance.SingleEngineOrDualEnginePort,
        oilPressure: state.engine.oilPressure,
        temperature: state.engine.coolantTemperature,
        alternatorPotential: state.engine.alternatorVoltage,
        fuelRate: state.engine.fuelRate,
        totalEngineHours: Math.round(state.engine.totalHours)
      }),
      SOURCE_ADDRESSES.engine
    )
  ]
}

const navigationEmitter: PgnEmitter = {
  id: 'navigation',
  intervalMs: 1000,
  build: (state, sid) => {
    if (!state.destination) return []
    const mark = state.destination.position
    const distance = distanceBetween(state.position, mark)
    const bearing = bearingTo(state.position, mark)
    const closingVelocity = state.sog * Math.cos(normalizeSigned(bearing - state.cog))
    // Only project an ETA while actually closing the mark.
    const etaMs = closingVelocity > 0.05 ? state.time + (distance / closingVelocity) * 1000 : state.time

    return [
      withSource(
        new PGN_129284({
          sid,
          distanceToWaypoint: distance,
          courseBearingReference: DirectionReference.True,
          perpendicularCrossed: YesNo.No,
          arrivalCircleEntered: distance < state.destination.arrivalRadius ? YesNo.Yes : YesNo.No,
          calculationType: BearingMode.GreatCircle,
          etaTime: n2kTime(etaMs),
          etaDate: n2kDate(etaMs),
          bearingOriginToDestinationWaypoint: bearing,
          bearingPositionToDestinationWaypoint: bearing,
          originWaypointNumber: 0,
          destinationWaypointNumber: 1,
          destinationLatitude: mark.latitude,
          destinationLongitude: mark.longitude,
          waypointClosingVelocity: closingVelocity
        }),
        SOURCE_ADDRESSES.plotter
      ),
      withSource(
        new PGN_129283({
          sid,
          xteMode: ResidualMode.Autonomous,
          navigationTerminated: YesNo.No,
          // Distance off the rhumb line from where this leg started to the mark.
          // Without a leg origin there is no track to be off, so report zero.
          xte: state.legOrigin ? crossTrackError(state.legOrigin, mark, state.position) : 0
        }),
        SOURCE_ADDRESSES.plotter
      )
    ]
  }
}

function aisPositionPgns(target: AisTargetState): PGN[] {
  if (target.classB) {
    return [
      withSource(
        new PGN_129039({
          messageId: 18, // Standard Class B position report
          repeatIndicator: 0,
          userId: target.mmsi,
          longitude: target.position.longitude,
          latitude: target.position.latitude,
          positionAccuracy: 1,
          raim: 0,
          timeStamp: 0,
          cog: target.cog,
          sog: target.sog,
          aisTransceiverInformation: 0,
          heading: target.heading,
          unitType: 1,
          integratedDisplay: YesNo.No,
          dsc: YesNo.Yes,
          band: 1,
          canHandleMsg22: YesNo.Yes,
          aisMode: 0,
          aisCommunicationState: 0
        }),
        SOURCE_ADDRESSES.ais
      )
    ]
  }

  return [
    withSource(
      new PGN_129038({
        messageId: 1, // Scheduled Class A position report
        repeatIndicator: 0,
        userId: target.mmsi,
        longitude: target.position.longitude,
        latitude: target.position.latitude,
        positionAccuracy: 1,
        raim: 0,
        timeStamp: 0,
        cog: target.cog,
        sog: target.sog,
        aisTransceiverInformation: 0,
        heading: target.heading,
        rateOfTurn: target.rateOfTurn,
        navStatus: 0, // under way using engine
        specialManeuverIndicator: 0
      }),
      SOURCE_ADDRESSES.ais
    )
  ]
}

function aisStaticPgns(target: AisTargetState): PGN[] {
  if (target.classB) {
    return [
      withSource(
        new PGN_129809({
          messageId: 24,
          repeatIndicator: 0,
          userId: target.mmsi,
          name: target.name,
          aisTransceiverInformation: 0
        }),
        SOURCE_ADDRESSES.ais
      ),
      withSource(
        new PGN_129810({
          messageId: 24,
          repeatIndicator: 0,
          userId: target.mmsi,
          typeOfShip: target.shipType,
          vendorId: 'LCARS',
          callsign: target.callsign,
          length: target.length,
          beam: target.beam,
          positionReferenceFromStarboard: target.beam / 2,
          positionReferenceFromBow: target.length / 2,
          mothershipUserId: '0',
          gnssType: 1,
          aisTransceiverInformation: 0
        }),
        SOURCE_ADDRESSES.ais
      )
    ]
  }

  return [
    withSource(
      new PGN_129794({
        messageId: 5,
        repeatIndicator: 0,
        userId: target.mmsi,
        imoNumber: 0,
        callsign: target.callsign,
        name: target.name,
        typeOfShip: target.shipType,
        length: target.length,
        beam: target.beam,
        positionReferenceFromStarboard: target.beam / 2,
        positionReferenceFromBow: target.length / 2,
        draft: 4.5,
        destination: target.destination,
        aisVersionIndicator: 1,
        gnssType: 1,
        dte: 0,
        aisTransceiverInformation: 0
      }),
      SOURCE_ADDRESSES.ais
    )
  ]
}

/**
 * AIS position reports. Real transponders vary the rate with the target's
 * speed; slowing the reports for stationary targets is close enough and keeps
 * a crowded anchorage from flooding the bus.
 */
const aisPositionEmitter: PgnEmitter = {
  id: 'ais-position',
  intervalMs: 2000,
  build: (state) => state.aisTargets.flatMap((target) => (target.sog > 0.5 ? aisPositionPgns(target) : []))
}

const aisSlowPositionEmitter: PgnEmitter = {
  id: 'ais-position-slow',
  intervalMs: 10000,
  build: (state) => state.aisTargets.flatMap((target) => (target.sog > 0.5 ? [] : aisPositionPgns(target)))
}

const aisStaticEmitter: PgnEmitter = {
  id: 'ais-static',
  intervalMs: 30000,
  build: (state) => state.aisTargets.flatMap(aisStaticPgns)
}

export function createEmitters(): PgnEmitter[] {
  return [
    positionEmitter,
    cogSogEmitter,
    gnssEmitter,
    systemTimeEmitter,
    headingEmitter,
    attitudeEmitter,
    variationEmitter,
    windEmitter,
    depthEmitter,
    speedEmitter,
    logEmitter,
    environmentEmitter,
    rudderEmitter,
    engineRapidEmitter,
    engineDynamicEmitter,
    navigationEmitter,
    aisPositionEmitter,
    aisSlowPositionEmitter,
    aisStaticEmitter
  ]
}

/** Human-readable one-line summary, used by the simulator console. */
export function describeState(state: VesselState): string {
  const fmt = (value: number, digits = 1) => value.toFixed(digits)
  return [
    `HDG ${fmt(toDegrees(state.heading), 0)}°`,
    `COG ${fmt(toDegrees(state.cog), 0)}°`,
    `SOG ${fmt(state.sog / 0.5144, 1)} kt`,
    `STW ${fmt(state.stw / 0.5144, 1)} kt`,
    `AWA ${fmt(toDegrees(state.wind.angleApparent), 0)}°`,
    `AWS ${fmt(state.wind.speedApparent / 0.5144, 1)} kt`,
    `TWS ${fmt(state.wind.speedTrue / 0.5144, 1)} kt`,
    `DPT ${fmt(state.depth, 1)} m`,
    `SOC ${fmt(state.electrical.stateOfCharge * 100, 0)}%`
  ].join('  ')
}

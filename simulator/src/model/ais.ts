import { moveAlong, type LatLon } from './geo.js'
import { createRng, type Rng } from './rng.js'
import { degrees, knots, normalizeAngle } from './units.js'
import type { AisTargetState } from './types.js'

export interface AisTargetSpec {
  mmsi: string
  name: string
  callsign: string
  classB: boolean
  /** NMEA 2000 ship type: 30 fishing, 36 sailing, 37 pleasure, 60 passenger, 70 cargo, 80 tanker. */
  shipType: number
  length: number
  beam: number
  destination: string
  /** Bearing from the scenario origin at which the target starts, radians true. */
  bearing: number
  /** Distance from the scenario origin at which the target starts, metres. */
  distance: number
  /** Course over ground, radians true. */
  cog: number
  /** Speed over ground, m/s. */
  sog: number
}

/**
 * Traffic around the boat. Targets hold their course with a little wander, so
 * the AIS list and any CPA calculation have something to chew on. Anchored and
 * moored vessels are simply specified with zero speed.
 */
export class AisModel {
  private readonly targets: AisTargetState[]
  private readonly rng: Rng
  private readonly wanderPhase: number[]
  private elapsed = 0

  constructor(origin: LatLon, specs: AisTargetSpec[], seed = 42) {
    this.rng = createRng(seed)
    this.wanderPhase = specs.map(() => this.rng.next() * Math.PI * 2)
    this.targets = specs.map((spec) => ({
      mmsi: spec.mmsi,
      name: spec.name,
      callsign: spec.callsign,
      classB: spec.classB,
      position: moveAlong(origin, spec.bearing, spec.distance),
      cog: spec.cog,
      sog: spec.sog,
      heading: spec.cog,
      rateOfTurn: 0,
      shipType: spec.shipType,
      length: spec.length,
      beam: spec.beam,
      destination: spec.destination
    }))
  }

  get current(): AisTargetState[] {
    return this.targets.map((target) => ({ ...target, position: { ...target.position } }))
  }

  update(dt: number): void {
    this.elapsed += dt
    this.targets.forEach((target, index) => {
      if (target.sog <= 0) return
      // A slow weave so headings are not perfectly rigid.
      const phase = this.wanderPhase[index] ?? 0
      const wander = Math.sin(this.elapsed / 90 + phase) * degrees(4)
      const previousCog = target.cog
      target.cog = normalizeAngle(target.cog + wander * dt * 0.05)
      target.rateOfTurn = dt > 0 ? (target.cog - previousCog) / dt : 0
      target.heading = target.cog
      target.position = moveAlong(target.position, target.cog, target.sog * dt)
    })
  }
}

/** A handful of plausible neighbours for an open-water scenario. */
export function coastalTraffic(): AisTargetSpec[] {
  return [
    {
      mmsi: '257845000',
      name: 'NORDLYS',
      callsign: 'LDGN',
      classB: false,
      shipType: 60,
      length: 121,
      beam: 19,
      destination: 'BERGEN',
      bearing: degrees(35),
      distance: 5200,
      cog: degrees(215),
      sog: knots(15.5)
    },
    {
      mmsi: '259112000',
      name: 'HAVSTRAUM',
      callsign: 'LAQR',
      classB: false,
      shipType: 70,
      length: 88,
      beam: 13,
      destination: 'STAVANGER',
      bearing: degrees(300),
      distance: 7400,
      cog: degrees(95),
      sog: knots(11)
    },
    {
      mmsi: '257009870',
      name: 'SOLVIND',
      callsign: 'LK5432',
      classB: true,
      shipType: 36,
      length: 12,
      beam: 4,
      destination: '',
      bearing: degrees(160),
      distance: 1900,
      cog: degrees(310),
      sog: knots(5.4)
    },
    {
      mmsi: '257443210',
      name: 'MARIA II',
      callsign: 'LM8765',
      classB: true,
      shipType: 37,
      length: 9,
      beam: 3,
      destination: '',
      bearing: degrees(255),
      distance: 3100,
      cog: degrees(20),
      sog: knots(6.2)
    }
  ]
}

/** Neighbours that are not going anywhere — for anchorage and marina scenarios. */
export function stationaryNeighbours(): AisTargetSpec[] {
  return [
    {
      mmsi: '257556677',
      name: 'VINDSPEIL',
      callsign: 'LN2244',
      classB: true,
      shipType: 36,
      length: 13,
      beam: 4,
      destination: '',
      bearing: degrees(75),
      distance: 130,
      cog: 0,
      sog: 0
    },
    {
      mmsi: '257998811',
      name: 'BLAAFJELL',
      callsign: 'LP7781',
      classB: true,
      shipType: 37,
      length: 11,
      beam: 3.6,
      destination: '',
      bearing: degrees(200),
      distance: 95,
      cog: 0,
      sog: 0
    }
  ]
}

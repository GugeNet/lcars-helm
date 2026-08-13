import { describe, expect, it } from 'vitest'
import canboat from '@canboat/canboatjs'
import type { PGN } from '@canboat/ts-pgns'
import { Simulation } from '../src/model/simulation.js'
import { createEmitters } from '../src/protocol/pgns.js'
import { encodeRawFrames } from '../src/protocol/ydwg.js'
import { createScenario, SCENARIO_IDS } from '../src/scenarios/index.js'
import { toDegrees } from '../src/model/units.js'

const { FromPgn } = canboat as { FromPgn: new (options: unknown) => Parser }

interface Parser {
  parseString(line: string): PGN | undefined
}

/**
 * Feed the frames back through the same parser Signal K uses. Fast packets need
 * every frame in order before the parser yields a result, so this returns only
 * the messages that reassembled successfully.
 */
function parseFrames(frames: string[]): PGN[] {
  const parser = new FromPgn({ returnNulls: true, checkForInvalidFields: true })
  const parsed: PGN[] = []
  for (const frame of frames) {
    const result = parser.parseString(frame)
    if (result) parsed.push(result)
  }
  return parsed
}

/** Run a scenario forward and collect one sample of every emitter's output. */
function collectPgns(scenarioId: (typeof SCENARIO_IDS)[number], seconds: number): PGN[] {
  const simulation = new Simulation(createScenario(scenarioId))
  for (let t = 0; t < seconds * 10; t += 1) simulation.tick(0.1)
  const state = simulation.current
  return createEmitters().flatMap((emitter) => emitter.build(state, 7))
}

describe('NMEA 2000 encoding', () => {
  it.each(SCENARIO_IDS)('every PGN in the %s scenario encodes and decodes', (scenarioId) => {
    const pgns = collectPgns(scenarioId, 30)
    expect(pgns.length).toBeGreaterThan(0)

    for (const pgn of pgns) {
      const frames = encodeRawFrames([pgn])
      expect(frames.length, `PGN ${pgn.pgn} produced no frames`).toBeGreaterThan(0)

      const decoded = parseFrames(frames)
      expect(decoded.length, `PGN ${pgn.pgn} did not decode`).toBe(1)
      expect(decoded[0]!.pgn).toBe(pgn.pgn)
      expect(decoded[0]!.src).toBe(pgn.src)
    }
  })

  it('frames use the Yacht Devices RAW line format', () => {
    const pgns = collectPgns('cruising', 5)
    const frames = encodeRawFrames(pgns, new Date(Date.UTC(2026, 0, 2, 15, 4, 5, 678)))

    for (const frame of frames) {
      // `HH:MM:SS.mmm R <canId> <bytes>` — the shape canboatjs sniffs for.
      expect(frame).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} R [0-9A-F]{1,8}( [0-9A-F]{2})+$/)
      expect(frame.substring(12, 15)).toBe(' R ')
    }
  })

  it('preserves navigation values through a full encode and decode', () => {
    const simulation = new Simulation(createScenario('cruising'))
    for (let t = 0; t < 600; t += 1) simulation.tick(0.1)
    const state = simulation.current

    const emitters = createEmitters()
    const decoded = new Map<number, PGN>()
    for (const emitter of emitters) {
      for (const pgn of emitter.build(state, 3)) {
        for (const result of parseFrames(encodeRawFrames([pgn]))) {
          // Wind is sent twice with different references; keep the apparent one.
          if (decoded.has(result.pgn) && result.pgn === 130306) continue
          decoded.set(result.pgn, result)
        }
      }
    }

    const position = decoded.get(129025)?.fields as { latitude: number; longitude: number }
    expect(position.latitude).toBeCloseTo(state.position.latitude, 5)
    expect(position.longitude).toBeCloseTo(state.position.longitude, 5)

    const heading = decoded.get(127250)?.fields as { heading: number; variation: number }
    expect(toDegrees(heading.heading)).toBeCloseTo(toDegrees(state.heading), 1)
    expect(toDegrees(heading.variation)).toBeCloseTo(toDegrees(state.variation), 1)

    const cogSog = decoded.get(129026)?.fields as { cog: number; sog: number }
    expect(cogSog.sog).toBeCloseTo(state.sog, 2)
    expect(toDegrees(cogSog.cog)).toBeCloseTo(toDegrees(state.cog), 1)

    const depth = decoded.get(128267)?.fields as { depth: number; offset: number }
    expect(depth.depth).toBeCloseTo(state.depth, 2)
    expect(depth.offset).toBeCloseTo(state.depthTransducerOffset, 2)

    const speed = decoded.get(128259)?.fields as { speedWaterReferenced: number }
    expect(speed.speedWaterReferenced).toBeCloseTo(state.stw, 2)

    const wind = decoded.get(130306)?.fields as { windSpeed: number; windAngle: number }
    expect(wind.windSpeed).toBeCloseTo(state.wind.speedApparent, 2)

    const environment = decoded.get(130310)?.fields as {
      waterTemperature: number
      atmosphericPressure: number
    }
    expect(environment.waterTemperature).toBeCloseTo(state.waterTemperature, 1)
    expect(environment.atmosphericPressure).toBeCloseTo(state.pressure, -2)
  })

  it('reassembles fast-packet PGNs from multiple frames', () => {
    const simulation = new Simulation(createScenario('cruising'))
    simulation.tick(0.1)
    const gnss = createEmitters()
      .find((emitter) => emitter.id === 'gnss')!
      .build(simulation.current, 1)

    const frames = encodeRawFrames(gnss)
    // A GNSS position report does not fit in one 8-byte CAN frame.
    expect(frames.length).toBeGreaterThan(1)
    expect(parseFrames(frames)).toHaveLength(1)
  })
})

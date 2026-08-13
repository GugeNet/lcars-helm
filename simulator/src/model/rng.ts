/**
 * Deterministic pseudo-random numbers. Every stochastic part of the simulator
 * draws from a seeded generator so that a scenario replays identically, which
 * matters when a UI bug only shows up during a particular gust or wind shift.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform in [min, max). */
  range(min: number, max: number): number
  /** Standard normal, mean 0 and standard deviation 1. */
  normal(): number
}

/** mulberry32 — small, fast, and good enough for environmental noise. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0
  let spareNormal: number | null = null

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    normal: () => {
      // Marsaglia polar method; it produces two values per pass, so keep the spare.
      if (spareNormal !== null) {
        const value = spareNormal
        spareNormal = null
        return value
      }
      let u: number
      let v: number
      let s: number
      do {
        u = next() * 2 - 1
        v = next() * 2 - 1
        s = u * u + v * v
      } while (s >= 1 || s === 0)
      const factor = Math.sqrt((-2 * Math.log(s)) / s)
      spareNormal = v * factor
      return u * factor
    }
  }
}

/**
 * Ornstein–Uhlenbeck process: noise that wanders but is pulled back towards a
 * mean, which is how real wind speed and direction behave over minutes.
 */
export class OrnsteinUhlenbeck {
  private value: number

  constructor(
    private readonly rng: Rng,
    /** Mean the process reverts to. */
    private readonly mean: number,
    /** Standard deviation of the stationary distribution. */
    private readonly sigma: number,
    /** Seconds for a disturbance to decay by roughly 63%. */
    private readonly timeConstant: number,
    initial = mean
  ) {
    this.value = initial
  }

  update(dt: number): number {
    const theta = 1 / Math.max(this.timeConstant, 1e-3)
    const drift = theta * (this.mean - this.value) * dt
    const diffusion = this.sigma * Math.sqrt(2 * theta * dt) * this.rng.normal()
    this.value += drift + diffusion
    return this.value
  }

  get current(): number {
    return this.value
  }
}

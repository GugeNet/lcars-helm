import { useEffect, useRef } from 'react'
import { useAnchorStore, useAnchorWatch } from './situations/anchorStore.js'
import { useNumbers, type DataHealth } from './store/vesselStore.js'
import { DEPTH_ALARM } from './dashboards/tones.js'
import { STOPPED_SPEED } from './situations/detect.js'

export interface Alert {
  key: string
  message: string
  alarm: boolean
  actions?: { label: string; onClick: () => void }[]
}

/**
 * What to say when the display cannot see the boat.
 *
 * The wording distinguishes losing Signal K from Signal K losing the
 * instruments, because those send you to different places: one is the server or
 * the network, the other is the gateway or the bus. An empty dashboard on its
 * own tells the crew neither.
 */
export function describeDataHealth(
  health: DataHealth,
  silentForMs: number | null
): { key: string; message: string } | null {
  switch (health) {
    case 'live':
      return null
    case 'disconnected':
      return {
        key: 'link-down',
        message: 'No link to Signal K — reconnecting'
      }
    case 'no-data':
      return {
        key: 'no-data',
        message: 'No instrument data — Signal K is running but the NMEA 2000 gateway is not reporting'
      }
    case 'stale': {
      const seconds = silentForMs === null ? null : Math.round(silentForMs / 1000)
      const since = seconds === null ? '' : ` for ${seconds < 90 ? `${seconds}s` : `${Math.round(seconds / 60)} min`}`
      return {
        key: 'stale-data',
        message: `Instrument data has stopped${since} — last values shown are old`
      }
    }
  }
}

export interface AlertInput {
  /** Whether an anchor fix has been set. */
  anchorSet: boolean
  /** Distance from the anchor in metres. */
  distanceFromAnchor: number | null
  alarmRadius: number
  /** Whether the boat is outside the alarm circle. */
  breached: boolean
  /** Whether the crew has silenced the anchor alarm. */
  acknowledged: boolean
  depthBelowTransducer: number | null
  /** Speed over ground, m/s. */
  speedOverGround: number | null
}

/**
 * The single most important thing the display has to say right now, or null.
 *
 * Only one banner is ever shown. A dragging anchor outranks everything; running
 * out of water outranks a suggestion to change situation. Anything less than
 * that belongs on the dashboard, not in an interruption.
 */
export function chooseAlert(input: AlertInput): Omit<Alert, 'actions'> | null {
  if (input.anchorSet && input.breached && !input.acknowledged) {
    const distance =
      input.distanceFromAnchor === null ? '' : `${input.distanceFromAnchor.toFixed(0)} m `
    return {
      key: 'anchor-drag',
      message: `Anchor drag — ${distance}from a ${input.alarmRadius} m circle`,
      alarm: true
    }
  }

  // Shallow water is only alarming when the boat is going somewhere. Tied up in
  // a shallow berth, or lying quietly at anchor, the depth is simply the depth —
  // and a standing alarm there would both cry wolf and, since alarms outrank
  // everything else on the banner, hide the suggestion to switch to the
  // situation that explains it.
  const makingWay = input.speedOverGround !== null && input.speedOverGround > STOPPED_SPEED
  if (
    makingWay &&
    input.depthBelowTransducer !== null &&
    input.depthBelowTransducer < DEPTH_ALARM
  ) {
    return {
      key: 'shallow',
      message: `Shallow water — ${input.depthBelowTransducer.toFixed(1)} m below the transducer`,
      alarm: true
    }
  }

  return null
}

/** The current alert, with whatever the crew can do about it attached. */
export function useTopAlert(): Alert | null {
  const { anchor, distance, breached, alarmRadius } = useAnchorWatch()
  const acknowledged = useAnchorStore((state) => state.acknowledged)
  const acknowledge = useAnchorStore((state) => state.acknowledge)
  const { depthBelowTransducer, speedOverGround } = useNumbers([
    'depthBelowTransducer',
    'speedOverGround'
  ])

  const alert = chooseAlert({
    anchorSet: anchor !== null,
    distanceFromAnchor: distance,
    alarmRadius,
    breached,
    acknowledged,
    depthBelowTransducer,
    speedOverGround
  })

  if (!alert) return null
  if (alert.key === 'anchor-drag') {
    return { ...alert, actions: [{ label: 'Silence', onClick: acknowledge }] }
  }
  return alert
}

/**
 * Sounds the alarm. A visual-only alert is no use to a crew asleep below, which
 * is exactly when an anchor drags.
 *
 * Browsers block audio until the page has been interacted with; the kiosk is
 * launched with that policy relaxed, and on a desktop the first touch anywhere
 * unlocks it.
 */
export function useAlarmSound(active: boolean): void {
  const contextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!active) return

    const beep = (): void => {
      try {
        contextRef.current ??= new AudioContext()
        const context = contextRef.current
        if (context.state === 'suspended') void context.resume()

        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = 'square'
        oscillator.frequency.value = 880
        // Shaped rather than switched, so it does not click.
        gain.gain.setValueAtTime(0.0001, context.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35)
        oscillator.connect(gain).connect(context.destination)
        oscillator.start()
        oscillator.stop(context.currentTime + 0.36)
      } catch {
        // No audio device, or autoplay still blocked: the banner still flashes.
      }
    }

    beep()
    const timer = setInterval(beep, 2000)
    return () => clearInterval(timer)
  }, [active])
}

import { useEffect, useRef } from 'react'
import { useAnchorStore, useAnchorWatch } from './situations/anchorStore.js'
import { useNumbers } from './store/vesselStore.js'
import { DEPTH_ALARM } from './dashboards/tones.js'
import type { SituationId } from './situations/types.js'

export interface Alert {
  key: string
  message: string
  alarm: boolean
  actions?: { label: string; onClick: () => void }[]
}

/**
 * The single most important thing the display has to say right now, or null.
 *
 * Only one banner is ever shown. A dragging anchor outranks everything; running
 * out of water outranks a suggestion to change situation. Anything less than
 * that belongs on the dashboard, not in an interruption.
 */
export function useTopAlert(situation: SituationId): Alert | null {
  const { anchor, distance, breached, alarmRadius } = useAnchorWatch()
  const acknowledged = useAnchorStore((state) => state.acknowledged)
  const acknowledge = useAnchorStore((state) => state.acknowledge)
  const { depthBelowTransducer } = useNumbers(['depthBelowTransducer'])

  if (anchor && breached && !acknowledged) {
    return {
      key: 'anchor-drag',
      message: `Anchor drag — ${distance === null ? '' : `${distance.toFixed(0)} m`} from a ${alarmRadius} m circle`,
      alarm: true,
      actions: [{ label: 'Silence', onClick: acknowledge }]
    }
  }

  // In a marina the boat is tied up and the depth is what it is; the shallow
  // alarm there would cry wolf at every low tide.
  if (
    situation !== 'marina' &&
    depthBelowTransducer !== null &&
    depthBelowTransducer < DEPTH_ALARM
  ) {
    return {
      key: 'shallow',
      message: `Shallow water — ${depthBelowTransducer.toFixed(1)} m below the transducer`,
      alarm: true
    }
  }

  return null
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

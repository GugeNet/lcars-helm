import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { useNumbers, usePosition } from '../store/vesselStore.js'
import {
  detectSituation,
  SUGGESTION_STABILITY_MS,
  type SituationSnapshot,
  type SituationSuggestion
} from './detect.js'
import { isSituationId, type SituationId } from './types.js'

const STORAGE_KEY = 'lcars-helm.situation'

function loadSituation(): SituationId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isSituationId(stored)) return stored
  } catch {
    // Private browsing or a locked-down kiosk profile; the default is fine.
  }
  return 'cruising'
}

function saveSituation(situation: SituationId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, situation)
  } catch {
    // Not being able to remember the situation is not worth failing over.
  }
}

interface SituationState {
  active: SituationId
  /** A pending offer to change situation, awaiting a tap. */
  suggestion: SituationSuggestion | null
  /** Suggestions the crew has waved away, so they are not offered again. */
  dismissed: SituationId | null
  setActive: (situation: SituationId) => void
  offer: (suggestion: SituationSuggestion | null) => void
  accept: () => void
  dismiss: () => void
}

export const useSituationStore = create<SituationState>((set, get) => ({
  active: loadSituation(),
  suggestion: null,
  dismissed: null,
  setActive: (active) => {
    saveSituation(active)
    // Choosing by hand clears anything pending, including a past dismissal.
    set({ active, suggestion: null, dismissed: null })
  },
  offer: (suggestion) => {
    if (suggestion && suggestion.situation === get().dismissed) return
    set({ suggestion })
  },
  accept: () => {
    const { suggestion } = get()
    if (!suggestion) return
    saveSituation(suggestion.situation)
    set({ active: suggestion.situation, suggestion: null, dismissed: null })
  },
  dismiss: () => {
    const { suggestion } = get()
    set({ suggestion: null, dismissed: suggestion?.situation ?? null })
  }
}))

const WATCHED = ['speedOverGround', 'engineRevolutions', 'shorePower'] as const

/**
 * Watches the instruments and offers a change of situation once the evidence
 * has been consistent for long enough. It never switches on its own — the
 * suggestion sits in a banner until the crew accepts or dismisses it.
 *
 * Call once, from the app shell.
 */
export function useSituationWatcher(): void {
  const values = useNumbers(WATCHED)
  const anchorPosition = usePosition('anchorPosition')
  const active = useSituationStore((state) => state.active)
  const offer = useSituationStore((state) => state.offer)

  const snapshot: SituationSnapshot = {
    speedOverGround: values.speedOverGround,
    engineRevolutions: values.engineRevolutions,
    anchorDown: anchorPosition !== null,
    shorePower: values.shorePower
  }

  const detected = detectSituation(snapshot)
  const detectedSituation = detected?.situation ?? null
  // The effect below deliberately keys off the detected situation alone. Its
  // timer must survive the re-renders caused by every incoming delta, and only
  // restart when the conclusion itself changes.
  const latest = useRef(detected)
  latest.current = detected

  useEffect(() => {
    if (detectedSituation === null || detectedSituation === active) {
      offer(null)
      return
    }

    // Start the clock. Any change of conclusion tears this down and starts over,
    // so only a situation that persists for the full period is ever offered.
    const timer = setTimeout(() => offer(latest.current), SUGGESTION_STABILITY_MS)
    return () => clearTimeout(timer)
  }, [detectedSituation, active, offer])
}

export function useActiveSituation(): SituationId {
  return useSituationStore((state) => state.active)
}

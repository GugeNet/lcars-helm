import { useEffect, useState, type ReactNode } from 'react'
import { AlertBanner, LcarsFrame, PillButton } from './lcars/index.js'
import { Dashboard } from './dashboards/index.js'
import { clockTime } from './format.js'
import { useAlarmSound, useTopAlert } from './alerts.js'
import { useAnchorTrackRecorder } from './situations/anchorStore.js'
import { useActiveSituation, useSituationStore, useSituationWatcher } from './situations/store.js'
import { SITUATIONS, situationDefinition } from './situations/types.js'
import { useConnection } from './store/vesselStore.js'

/** Ticks once a minute so the footer clock stays honest. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function StatusLine({ situationFocus }: { situationFocus: string }): ReactNode {
  const connection = useConnection()
  const now = useMinuteClock()

  return (
    <span className="status-line">
      {connection !== 'open' ? (
        <span className="status-line__item status-line__item--fault">
          {connection === 'connecting' ? 'Linking' : 'No data'}
        </span>
      ) : (
        <span className="status-line__item">{situationFocus}</span>
      )}
      <span className="status-line__item">{clockTime(now)}</span>
    </span>
  )
}

export function App(): ReactNode {
  useSituationWatcher()
  useAnchorTrackRecorder()

  const active = useActiveSituation()
  const definition = situationDefinition(active)
  const setActive = useSituationStore((state) => state.setActive)
  const suggestion = useSituationStore((state) => state.suggestion)
  const acceptSuggestion = useSituationStore((state) => state.accept)
  const dismissSuggestion = useSituationStore((state) => state.dismiss)

  const alert = useTopAlert(active)
  useAlarmSound(alert?.alarm === true)

  // An alarm always wins the banner; a suggestion only appears when nothing is
  // wrong, because being asked a question during an emergency is no help.
  const banner: ReactNode = alert ? (
    <AlertBanner key={alert.key} message={alert.message} alarm={alert.alarm} actions={alert.actions} />
  ) : suggestion ? (
    <AlertBanner
      key="suggestion"
      message={`Looks like ${situationDefinition(suggestion.situation).short.toLowerCase()} — ${suggestion.reason}`}
      actions={[
        { label: 'Switch', onClick: acceptSuggestion },
        { label: 'Stay', onClick: dismissSuggestion }
      ]}
    />
  ) : null

  return (
    <LcarsFrame
      situation={active}
      title={definition.title}
      rail={SITUATIONS.map((entry) => (
        <PillButton
          key={entry.id}
          rail
          selected={entry.id === active}
          onClick={() => setActive(entry.id)}
        >
          {entry.short}
        </PillButton>
      ))}
      footer={<StatusLine situationFocus={definition.focus} />}
    >
      <div className="dash-wrap">
        {banner}
        <Dashboard situation={active} />
      </div>
    </LcarsFrame>
  )
}

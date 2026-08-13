import { useEffect, useState, type ReactNode } from 'react'
import { AlertBanner, LcarsFrame, PillButton } from './lcars/index.js'
import { Dashboard } from './dashboards/index.js'
import { clockTime } from './format.js'
import { describeDataHealth, useAlarmSound, useTopAlert } from './alerts.js'
import { useAnchorTrackRecorder } from './situations/anchorStore.js'
import { useActiveSituation, useSituationStore, useSituationWatcher } from './situations/store.js'
import { SITUATIONS, situationDefinition } from './situations/types.js'
import { useDataHealth, type DataHealth } from './store/vesselStore.js'

/** Ticks once a minute so the footer clock stays honest. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

const HEALTH_LABEL: Record<Exclude<DataHealth, 'live'>, string> = {
  disconnected: 'No link',
  'no-data': 'No data',
  stale: 'Data stopped'
}

function StatusLine({
  situationFocus,
  health
}: {
  situationFocus: string
  health: DataHealth
}): ReactNode {
  const now = useMinuteClock()

  return (
    <span className="status-line">
      {health === 'live' ? (
        <span className="status-line__item">{situationFocus}</span>
      ) : (
        <span className="status-line__item status-line__item--fault">{HEALTH_LABEL[health]}</span>
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

  const alert = useTopAlert()
  const { health, silentForMs } = useDataHealth()
  const fault = describeDataHealth(health, silentForMs)
  useAlarmSound(alert?.alarm === true)

  // Precedence: something wrong with the boat, then something wrong with the
  // display, then a suggestion. A live alarm outranks a lost link because the
  // alarm is about the boat; a lost link outranks a suggestion because there is
  // no point asking the crew to change situation using data we do not have.
  const banner: ReactNode = alert ? (
    <AlertBanner
      key={alert.key}
      message={alert.message}
      variant={alert.alarm ? 'alarm' : 'suggestion'}
      actions={alert.actions}
    />
  ) : fault ? (
    <AlertBanner key={fault.key} message={fault.message} variant="fault" />
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
      footer={<StatusLine situationFocus={definition.focus} health={health} />}
    >
      <div className="dash-wrap">
        {banner}
        <Dashboard situation={active} />
      </div>
    </LcarsFrame>
  )
}

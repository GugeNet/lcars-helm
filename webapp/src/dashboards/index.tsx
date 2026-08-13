import type { ReactNode } from 'react'
import './dashboards.css'
import { useAttitude } from '../store/vesselStore.js'
import type { SituationId } from '../situations/types.js'
import { AnchoredDashboard } from './AnchoredDashboard.js'
import { CruisingDashboard } from './CruisingDashboard.js'
import { MarinaDashboard } from './MarinaDashboard.js'
import { MotoringDashboard } from './MotoringDashboard.js'
import { RacingDashboard } from './RacingDashboard.js'

/** Renders the dashboard for the situation the boat is in. */
export function Dashboard({ situation }: { situation: SituationId }): ReactNode {
  // Attitude arrives as one object, so it is read once here and handed to the
  // dashboards that want a part of it.
  const attitude = useAttitude()

  switch (situation) {
    case 'cruising':
      return <CruisingDashboard heel={attitude?.roll ?? null} />
    case 'motoring':
      return <MotoringDashboard pitch={attitude?.pitch ?? null} />
    case 'racing':
      return <RacingDashboard />
    case 'anchored':
      return <AnchoredDashboard />
    case 'marina':
      return <MarinaDashboard />
  }
}

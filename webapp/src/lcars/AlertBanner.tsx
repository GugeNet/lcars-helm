import type { ReactNode } from 'react'
import { PillButton } from './controls.js'

export interface AlertAction {
  label: string
  onClick: () => void
}

export interface AlertBannerProps {
  message: string
  /** Alarms pulse and are coloured red; suggestions are drawn in the accent. */
  alarm?: boolean
  actions?: AlertAction[]
}

/**
 * The one place the interface interrupts. Used for a dragging anchor or a
 * shallow-water alarm, and for the suggestion that the boat has changed
 * situation — which asks rather than acts.
 */
export function AlertBanner({ message, alarm = false, actions = [] }: AlertBannerProps): ReactNode {
  return (
    <div
      className={['lcars-alert', alarm ? 'lcars-alert--alarm' : ''].filter(Boolean).join(' ')}
      role={alarm ? 'alert' : 'status'}
    >
      <span className="lcars-alert__message">{message}</span>
      {actions.length > 0 ? (
        <span className="lcars-alert__actions">
          {actions.map((action) => (
            <PillButton key={action.label} onClick={action.onClick}>
              {action.label}
            </PillButton>
          ))}
        </span>
      ) : null}
    </div>
  )
}

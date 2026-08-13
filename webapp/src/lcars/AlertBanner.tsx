import type { ReactNode } from 'react'
import { PillButton } from './controls.js'

export interface AlertAction {
  label: string
  onClick: () => void
}

export type AlertVariant =
  /** An offer the crew can take or leave; drawn in the situation accent. */
  | 'suggestion'
  /** Something is wrong with the display itself — red, but silent. */
  | 'fault'
  /** Something is wrong with the boat — red and pulsing. */
  | 'alarm'

export interface AlertBannerProps {
  message: string
  variant?: AlertVariant
  actions?: AlertAction[]
}

/**
 * The one place the interface interrupts. Used for a dragging anchor or a
 * shallow-water alarm, for losing the instruments, and for the suggestion that
 * the boat has changed situation — which asks rather than acts.
 */
export function AlertBanner({
  message,
  variant = 'suggestion',
  actions = []
}: AlertBannerProps): ReactNode {
  const className = [
    'lcars-alert',
    variant === 'alarm' ? 'lcars-alert--alarm' : '',
    variant === 'fault' ? 'lcars-alert--fault' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className} role={variant === 'suggestion' ? 'status' : 'alert'}>
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

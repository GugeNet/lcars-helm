import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  /** Styles the button as an alarm acknowledgement. */
  alarm?: boolean
  /** Stretches the button to fill a rail slot. */
  rail?: boolean
  children: ReactNode
}

/** The LCARS button: a rounded block with right-aligned text. */
export function PillButton({
  selected = false,
  alarm = false,
  rail = false,
  className,
  children,
  ...rest
}: PillButtonProps): ReactNode {
  const classes = [
    'lcars-button',
    selected ? 'lcars-button--selected' : '',
    alarm ? 'lcars-button--alarm' : '',
    rail ? 'lcars-button--rail' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} aria-pressed={selected} {...rest}>
      {children}
    </button>
  )
}

import type { ReactNode } from 'react'
import { NO_DATA } from '../format.js'

export type ReadoutTone = 'normal' | 'warn' | 'alarm'

export interface ReadoutProps {
  label: string
  /** Already formatted for display; pass `NO_DATA` when the instrument is silent. */
  value: string
  unit?: string
  /** Renders at the larger hero size, for the one number that matters most. */
  hero?: boolean
  tone?: ReadoutTone
}

/**
 * A labelled number. Missing values are drawn in grey rather than hidden, so a
 * dead instrument is visibly dead instead of silently absent from the panel.
 */
export function Readout({
  label,
  value,
  unit,
  hero = false,
  tone = 'normal'
}: ReadoutProps): ReactNode {
  const stale = value === NO_DATA
  const classes = [
    'lcars-readout',
    hero ? 'lcars-readout--hero' : '',
    stale ? 'lcars-readout--stale' : tone === 'warn' ? 'lcars-readout--warn' : '',
    !stale && tone === 'alarm' ? 'lcars-readout--alarm' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <span className="lcars-readout__label">{label}</span>
      <span className="lcars-readout__value">
        {value}
        {unit && !stale ? <span className="lcars-readout__unit">{unit}</span> : null}
      </span>
    </div>
  )
}

export interface GaugeProps {
  label?: string
  /** 0..1; values outside are clamped. */
  fraction: number | null
  tone?: ReadoutTone
}

/** A horizontal bar meter, for anything with a natural full scale. */
export function Gauge({ label, fraction, tone = 'normal' }: GaugeProps): ReactNode {
  const clamped = fraction === null ? 0 : Math.min(1, Math.max(0, fraction))
  const classes = [
    'lcars-gauge',
    tone === 'warn' ? 'lcars-gauge--warn' : '',
    tone === 'alarm' ? 'lcars-gauge--alarm' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {label ? <span className="lcars-readout__label">{label}</span> : null}
      <div
        className="lcars-gauge__track"
        role="meter"
        aria-valuenow={fraction === null ? undefined : Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="lcars-gauge__fill" style={{ width: `${clamped * 100}%` }} />
      </div>
    </div>
  )
}

export interface PanelProps {
  title?: string
  children: ReactNode
  /** Grid placement, when the dashboard positions panels explicitly. */
  style?: React.CSSProperties
  className?: string
}

/** A titled block of content within a dashboard. */
export function Panel({ title, children, style, className }: PanelProps): ReactNode {
  return (
    <section className={['lcars-panel', className ?? ''].filter(Boolean).join(' ')} style={style}>
      {title ? <h2 className="lcars-panel__title">{title}</h2> : null}
      <div className="lcars-panel__body">{children}</div>
    </section>
  )
}

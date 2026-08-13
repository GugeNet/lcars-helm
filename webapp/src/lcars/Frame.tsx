import type { ReactNode } from 'react'
import type { SituationId } from '../situations/types.js'

export interface LcarsFrameProps {
  /** Drives the accent colour for everything inside the frame. */
  situation: SituationId
  /** Shown in the cap at the right-hand end of the header bar. */
  title: string
  /** Situation buttons, rendered down the left rail between the two elbows. */
  rail: ReactNode
  /** Status line in the footer bar. */
  footer: ReactNode
  children: ReactNode
}

/** Fixed-width colour blocks that head an LCARS bar before its rounded cap. */
function BarSegments({ widths }: { widths: number[] }): ReactNode {
  return widths.map((width, index) => (
    <div
      key={index}
      className="lcars-bar-segment"
      style={{
        width,
        // Alternating the dimmer accent gives the bar the banded look without
        // needing a colour per segment.
        background: index % 2 === 1 ? 'var(--lcars-accent-dim)' : 'var(--lcars-accent)'
      }}
    />
  ))
}

/**
 * The LCARS chrome: two elbows joined by the left rail, a header bar and a
 * footer bar, wrapped around whichever dashboard is showing.
 */
export function LcarsFrame({
  situation,
  title,
  rail,
  footer,
  children
}: LcarsFrameProps): ReactNode {
  return (
    <div className={`lcars-frame lcars-situation--${situation}`}>
      <div className="lcars-elbow lcars-elbow--top-left" />
      <div className="lcars-elbow lcars-elbow--bottom-left" />

      <header className="lcars-header">
        <BarSegments widths={[48, 22]} />
        <div className="lcars-bar-segment lcars-bar-segment--cap">{title}</div>
      </header>

      <nav className="lcars-rail" aria-label="Situation">
        {rail}
      </nav>

      <div className="lcars-content">{children}</div>

      <footer className="lcars-footer">
        <BarSegments widths={[22, 48]} />
        <div className="lcars-bar-segment lcars-bar-segment--cap">{footer}</div>
      </footer>
    </div>
  )
}

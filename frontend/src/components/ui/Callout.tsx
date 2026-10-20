import { ReactNode } from 'react'
import { cx } from './cx'

interface Props {
  x: number
  y: number
  label: string
  side?: 'left' | 'right'
  dimmed?: boolean
  lineLength?: number
  children?: ReactNode
}

/** Punto + línea + etiqueta. El punto queda exactamente en (x, y) del contenedor relativo. */
export function Callout({ x, y, label, side = 'right', dimmed, lineLength = 44, children }: Props) {
  return (
    <div
      data-testid="callout"
      className={cx(
        'pointer-events-none absolute flex items-center transition-opacity',
        side === 'left' && 'flex-row-reverse',
        dimmed && 'opacity-35',
      )}
      style={{ left: `${x}px`, top: `${y}px`, transform: side === 'left' ? 'translate(calc(-100% + 5px), -50%)' : 'translate(-5px, -50%)' }}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-ink bg-lime" />
      <span className="h-px shrink-0 bg-ink/70" style={{ width: lineLength }} />
      <span className="pointer-events-auto max-w-[220px] rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-ink-fg">
        {label}
        {children}
      </span>
    </div>
  )
}

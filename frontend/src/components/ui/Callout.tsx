import { ReactNode } from 'react'
import { cx } from './cx'

interface Props {
  x: number
  y: number
  label: string
  side?: 'left' | 'right'
  dimmed?: boolean
  lineLength?: number
  /** Si se da, en pantallas chicas el callout se reduce a este número (la leyenda va fuera). */
  index?: number
  title?: string
  children?: ReactNode
}

/** Punto + línea + etiqueta. El punto queda exactamente en (x, y) del contenedor relativo. */
export function Callout({ x, y, label, side = 'right', dimmed, lineLength = 44, index, title, children }: Props) {
  const numbered = index !== undefined
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
      {numbered && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-lime text-[10px] font-bold text-ink sm:hidden">
          {index}
        </span>
      )}
      <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full border-2 border-ink bg-lime', numbered && 'hidden sm:block')} />
      <span className={cx('h-px shrink-0 bg-ink/70', numbered && 'hidden sm:block')} style={{ width: lineLength }} />
      <span
        title={title}
        className={cx(
          'pointer-events-auto max-w-[220px] rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-ink-fg',
          numbered && 'hidden sm:inline-block',
        )}
      >
        {label}
        {children}
      </span>
    </div>
  )
}

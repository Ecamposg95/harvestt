import { ReactNode } from 'react'
import { cx } from './cx'

interface Props {
  x: number
  y: number
  label: string
  side?: 'left' | 'right'
  dimmed?: boolean
  lineLength?: number
  /** Desplazamiento vertical de la etiqueta respecto del punto; la línea se dibuja en diagonal. */
  dy?: number
  /** Si se da, en pantallas chicas el callout se reduce a este número (la leyenda va fuera). */
  index?: number
  title?: string
  children?: ReactNode
}

/** Punto + línea + etiqueta. El punto queda exactamente en (x, y) del contenedor relativo. */
export function Callout({ x, y, label, side = 'right', dimmed, lineLength = 44, dy = 0, index, title, children }: Props) {
  const numbered = index !== undefined
  const dir = side === 'left' ? -1 : 1
  const length = Math.hypot(lineLength, dy)
  const angle = Math.atan2(dy, dir * lineLength)
  return (
    <div
      data-testid="callout"
      data-side={side}
      className={cx('pointer-events-none absolute transition-opacity', dimmed && 'opacity-35')}
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      {numbered && (
        <span className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-ink bg-lime text-[10px] font-bold text-ink sm:hidden">
          {index}
        </span>
      )}
      <span
        className={cx(
          'absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-lime',
          numbered && 'hidden sm:block',
        )}
      />
      <span
        className={cx('absolute left-0 top-0 h-px origin-left bg-ink/70', numbered && 'hidden sm:block')}
        style={{ width: length, transform: `rotate(${angle}rad)` }}
      />
      <span
        title={title}
        className={cx(
          'pointer-events-auto absolute max-w-[220px] truncate rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-ink-fg',
          numbered && 'hidden sm:inline-block',
        )}
        style={{
          top: dy,
          left: dir * lineLength,
          transform: side === 'left' ? 'translate(-100%, -50%)' : 'translate(0, -50%)',
        }}
      >
        {label}
        {children}
      </span>
    </div>
  )
}

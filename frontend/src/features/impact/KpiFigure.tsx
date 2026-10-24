import { useId, useState } from 'react'
import { cx, OriginBadge } from '@/components/ui'
import type { Kpi } from './api'
import { formatKpiValue } from './format'

interface Props {
  kpi: Kpi
  size: 'hero' | 'tile'
}

/** Cifra con su origen y su fórmula; la fórmula se abre al pasar el cursor, enfocar o tocar. */
export function KpiFigure({ kpi, size }: Props) {
  const [open, setOpen] = useState(false)
  const tipId = useId()
  const text = formatKpiValue(kpi)
  const hero = size === 'hero'

  return (
    <div className={cx('glass relative flex min-w-0 flex-col gap-2', hero ? 'p-6 sm:p-8' : 'p-4')}>
      <span className="eyebrow">{kpi.label}</span>
      {text !== null ? (
        <p className={cx('font-bold tracking-tight', hero ? 'display text-[clamp(2.75rem,7vw,4.5rem)]' : 'text-2xl')}>
          {text}
          {kpi.unit && <span className="ml-1 text-sm font-semibold normal-case tracking-normal text-muted">{kpi.unit}</span>}
        </p>
      ) : (
        <p className={cx('font-semibold text-muted', hero ? 'text-lg' : 'text-sm')}>Sin datos suficientes</p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {text !== null && <OriginBadge origin={kpi.origin} className="w-fit" />}
        <span className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={tipId}
            aria-describedby={open ? tipId : undefined}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onClick={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
            className="rounded-full px-2 py-0.5 text-xs font-semibold text-accent underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Cómo se calcula
          </button>
          <span
            id={tipId}
            role="tooltip"
            hidden={!open}
            className="absolute bottom-full left-0 z-20 mb-2 w-[min(18rem,calc(100vw-3rem))] rounded-2xl bg-ink px-3 py-2 text-xs font-medium leading-snug text-ink-fg shadow-glass"
          >
            {kpi.formula}
          </span>
        </span>
      </div>
    </div>
  )
}

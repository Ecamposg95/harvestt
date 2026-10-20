import { ReactNode } from 'react'
import { cx } from './cx'
import { OriginBadge } from './OriginBadge'

interface Props {
  label: string
  value?: string | number | null
  unit?: string
  origin?: string
  emptyText?: string
  highlight?: boolean
  children?: ReactNode
}

export function StatTile({ label, value, unit, origin, emptyText = 'Sin datos', highlight, children }: Props) {
  const hasValue = value !== null && value !== undefined && value !== ''
  return (
    <div className={cx('glass flex min-w-0 flex-col gap-1 p-4', highlight && '!bg-lime/40')}>
      <span className="eyebrow truncate">{label}</span>
      {hasValue ? (
        <p className="text-2xl font-bold tracking-tight">
          {value}
          {unit && <span className="ml-1 text-sm font-semibold text-muted">{unit}</span>}
        </p>
      ) : (
        <p className="text-sm font-semibold text-muted">{emptyText}</p>
      )}
      {origin && hasValue && <OriginBadge origin={origin} className="w-fit" />}
      {children}
    </div>
  )
}

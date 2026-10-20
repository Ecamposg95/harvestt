import { cx } from './ui/cx'

/** Marca V1: punto lime + "HarvestT" [+ "Cortex"]. `compact` deja solo el punto. */
export function Logo({
  className,
  dotClassName = 'h-6 w-6',
  cortexClassName = 'text-muted',
  withCortex = false,
  compact = false,
}: {
  className?: string
  dotClassName?: string
  cortexClassName?: string
  withCortex?: boolean
  compact?: boolean
}) {
  const dot = <span aria-hidden="true" className={cx('shrink-0 rounded-full bg-lime', dotClassName)} />
  if (compact) return dot
  return (
    <span className={cx('inline-flex items-center gap-2 font-extrabold tracking-tight', className)}>
      {dot}
      <span className="truncate">
        HarvestT{withCortex && <> <span className={cx('font-medium', cortexClassName)}>Cortex</span></>}
      </span>
    </span>
  )
}

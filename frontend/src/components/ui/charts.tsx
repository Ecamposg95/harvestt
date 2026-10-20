import { cx } from './cx'

export function BarChart({
  data,
  highlightIndex,
  height = 120,
  ariaLabel,
}: {
  data: Array<{ label: string; value: number | null }>
  highlightIndex?: number
  height?: number
  ariaLabel: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value ?? 0))
  return (
    <div role="img" aria-label={ariaLabel} className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) =>
        d.value === null ? (
          <span key={i} data-gap className="flex-1 self-end border-b-2 border-dashed border-border" title={`${d.label}: sin dato`} />
        ) : (
          <span
            key={i}
            data-bar
            title={`${d.label}: ${d.value}`}
            className={cx('flex-1 rounded-full', i === highlightIndex ? 'bg-lime' : 'bg-fg/15')}
            style={{ height: `${Math.max(6, (d.value / max) * 100)}%` }}
          />
        ),
      )}
    </div>
  )
}

/** Un path SVG por tramo continuo; los null cortan la línea. */
export function linePaths(values: Array<number | null>, width: number, height: number, min: number, max: number): string[] {
  const span = max - min || 1
  const step = values.length > 1 ? width / (values.length - 1) : 0
  const paths: string[] = []
  let current = ''
  values.forEach((v, i) => {
    if (v === null) {
      if (current) paths.push(current)
      current = ''
      return
    }
    const x = (i * step).toFixed(1)
    const y = (height - ((v - min) / span) * height).toFixed(1)
    current += current ? ` L${x} ${y}` : `M${x} ${y}`
  })
  if (current) paths.push(current)
  return paths
}

export function LineChart({
  data,
  height = 140,
  ariaLabel,
  unit,
}: {
  data: Array<{ t: string; value: number | null }>
  height?: number
  ariaLabel: string
  unit?: string
}) {
  const values = data.map((d) => d.value)
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm font-semibold text-muted" style={{ height }}>
        Sin lecturas
      </div>
    )
  }
  const min = Math.min(...present)
  const max = Math.max(...present)
  const W = 600
  const paths = linePaths(values, W, height, min, max)
  return (
    <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgb(var(--c-accent))" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      ))}
      <title>
        {ariaLabel}: {min}–{max}
        {unit ? ` ${unit}` : ''}
      </title>
    </svg>
  )
}

export function Gauge({ value, min, max, label, unit }: { value: number | null; min: number; max: number; label: string; unit?: string }) {
  const clamped = value === null ? min : Math.min(max, Math.max(min, value))
  const frac = (clamped - min) / (max - min || 1)
  const R = 40
  const C = Math.PI * R
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value === null ? undefined : clamped}
      className="flex flex-col items-center"
    >
      <svg viewBox="0 0 100 56" className="w-full max-w-[160px]">
        <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="rgb(var(--c-fg) / 0.1)" strokeWidth={10} strokeLinecap="round" />
        {value !== null && (
          <path
            d="M10 50 A40 40 0 0 1 90 50"
            fill="none"
            stroke="rgb(var(--c-lime))"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${C * frac} ${C}`}
          />
        )}
      </svg>
      {value === null ? (
        <p className="-mt-4 text-sm font-semibold text-muted">Sin señal</p>
      ) : (
        <p className="-mt-5 text-xl font-bold">
          {value}
          {unit && <span className="ml-0.5 text-xs text-muted">{unit}</span>}
        </p>
      )}
      <p className="eyebrow mt-1">{label}</p>
    </div>
  )
}

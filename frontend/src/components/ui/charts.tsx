import { cx } from './cx'

function NoData({ height, children }: { height: number; children: string }) {
  return (
    <div className="flex items-center justify-center text-sm font-semibold text-muted" style={{ height }}>
      {children}
    </div>
  )
}

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
  if (data.every((d) => d.value === null)) return <NoData height={height}>Sin lecturas</NoData>
  const max = Math.max(1, ...data.map((d) => d.value ?? 0))
  return (
    <div role="img" aria-label={ariaLabel} className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) =>
        d.value === null ? (
          <span key={i} className="flex flex-1 items-end justify-center self-end">
            <span data-gap className="w-full max-w-[36px] border-b-2 border-dashed border-border" title={`${d.label}: sin dato`} />
          </span>
        ) : d.value === 0 ? (
          <span key={i} className="flex flex-1 items-end justify-center self-end">
            <span data-zero title={`${d.label}: 0`} className="h-0.5 w-full max-w-[36px] rounded-full bg-fg/25" />
          </span>
        ) : (
          <span key={i} className="flex h-full flex-1 items-end justify-center">
            <span
              data-bar
              title={`${d.label}: ${d.value}`}
              className={cx('w-full max-w-[36px] rounded-full', i === highlightIndex ? 'bg-lime' : 'bg-fg/15')}
              style={{ height: `${Math.max(6, (d.value / max) * 100)}%` }}
            />
          </span>
        ),
      )}
    </div>
  )
}

type Point = [number, number]

/** Tramos continuos de la serie como coordenadas; los null cortan la línea. */
function lineTramos(values: Array<number | null>, width: number, height: number, min: number, max: number): Point[][] {
  const span = max - min
  const n = values.length
  const tramos: Point[][] = []
  let current: Point[] = []
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length) tramos.push(current)
      current = []
      return
    }
    const x = n > 1 ? (i * width) / (n - 1) : width / 2
    const y = span === 0 ? height / 2 : height - ((v - min) / span) * height
    current.push([x, y])
  })
  if (current.length) tramos.push(current)
  return tramos
}

/** Un path SVG por tramo continuo; los null cortan la línea. */
export function linePaths(values: Array<number | null>, width: number, height: number, min: number, max: number): string[] {
  return lineTramos(values, width, height, min, max).map((pts) =>
    pts.map(([x, y], j) => `${j === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '),
  )
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
  if (present.length === 0) return <NoData height={height}>Sin lecturas</NoData>
  const min = Math.min(...present)
  const max = Math.max(...present)
  const W = 600
  const tramos = lineTramos(values, W, height, min, max)
  return (
    <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {tramos.map((pts, i) =>
        pts.length === 1 ? (
          <circle key={i} cx={pts[0][0]} cy={pts[0][1]} r={4} fill="rgb(var(--c-accent))" />
        ) : (
          <path
            key={i}
            d={linePaths(values, W, height, min, max)[i]}
            fill="none"
            stroke="rgb(var(--c-accent))"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
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
      aria-valuetext={value === null ? 'Sin señal' : undefined}
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

import type { ReactNode } from 'react'
import type { VisionSite } from '../vision/api'
import { countryName, formatCount } from './labels'
import outline from './mexico-outline.json'
import { inBBox, mapHeight, project } from './projection'

export interface GbifPayload {
  occurrences_total?: number
  excluded_nc?: number
  top_countries?: { country: string; count: number }[]
  mexico?: { total: number; sampled: number; cell_deg: number; cells: { lat: number; lon: number; count: number }[] }
}

const W = 600
const H = mapHeight(W)
const R_MAX = 9
const R_MIN = 1.6

const SITE_LABELS: Record<VisionSite['kind'], string> = {
  historic: 'Prototipo histórico',
  future: 'Nodo solicitado',
}

const OUTLINE_PATH = (outline.polygons as number[][][])
  .map(
    (ring) =>
      ring
        .map(([lon, lat], i) => {
          const p = project(lon, lat, W)
          return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`
        })
        .join('') + 'Z',
  )
  .join('')

function SiteMark({ kind, x, y, size = 7 }: { kind: VisionSite['kind']; x: number; y: number; size?: number }) {
  if (kind === 'historic') {
    const s = size
    return (
      <path
        d={`M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z`}
        className="fill-lime stroke-ink"
        strokeWidth={1.5}
      />
    )
  }
  return <circle cx={x} cy={y} r={size * 0.75} className="fill-none stroke-fg" strokeWidth={2} strokeDasharray="3 2" />
}

function LegendSwatch({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      {children}
    </svg>
  )
}

/** Presencia GBIF en México: contorno, celdas con área proporcional al conteo y sitios de la Visión. */
export function PresenceMap({
  payload,
  sites,
  attribution,
}: {
  payload: GbifPayload
  sites: VisionSite[]
  attribution?: string | null
}) {
  const mx = payload.mexico ?? { total: 0, sampled: 0, cell_deg: 0.5, cells: [] }
  const maxCount = Math.max(1, ...mx.cells.map((c) => c.count))
  const localSites = sites.filter((s) => inBBox(s.lon, s.lat))
  const kinds = Array.from(new Set(localSites.map((s) => s.kind)))
  const top = (payload.top_countries ?? []).slice(0, 10)
  const topMax = Math.max(1, ...top.map((c) => c.count))
  const total = formatCount(mx.total)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-bg-2/40 p-2">
        <svg
          viewBox={`0 0 ${W} ${H.toFixed(1)}`}
          role="img"
          aria-label={`Mapa de presencia GBIF en México: ${total} registros`}
          className="block h-auto w-full"
        >
          <path d={OUTLINE_PATH} className="fill-surface stroke-muted/60" strokeWidth={0.8} strokeLinejoin="round" />
          <g>
            {mx.cells.map((c) => {
              const p = project(c.lon, c.lat, W)
              const r = Math.max(R_MIN, R_MAX * Math.sqrt(c.count / maxCount))
              return (
                <circle key={`${c.lat},${c.lon}`} cx={p.x} cy={p.y} r={r} className="fill-accent/45 stroke-accent" strokeWidth={0.6}>
                  <title>{`${formatCount(c.count)} registros`}</title>
                </circle>
              )
            })}
          </g>
          <g>
            {localSites.map((s, i) => {
              const p = project(s.lon, s.lat, W)
              return (
                <g key={`${s.kind}-${i}`}>
                  <title>{`${SITE_LABELS[s.kind]}: ${s.label}`}</title>
                  <SiteMark kind={s.kind} x={p.x} y={p.y} />
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        <li className="flex items-center gap-1.5">
          <LegendSwatch>
            <circle cx="9" cy="9" r="6" className="fill-accent/45 stroke-accent" strokeWidth={1} />
          </LegendSwatch>
          Registros GBIF por celda de {mx.cell_deg}°
        </li>
        {kinds.map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <LegendSwatch>
              <SiteMark kind={k} x={9} y={9} size={6} />
            </LegendSwatch>
            {SITE_LABELS[k]}
          </li>
        ))}
      </ul>

      <div className="space-y-1 text-sm">
        <p>
          Presencia GBIF en México: {total} registros con licencia CC0/CC BY ({formatCount(payload.excluded_nc ?? 0)}{' '}
          excluidos por licencia NC en el mundo)
        </p>
        {mx.sampled < mx.total && (
          <p className="text-xs text-muted">
            Mapa con una muestra de {formatCount(mx.sampled)} de {total}
          </p>
        )}
      </div>

      {top.length > 0 && (
        <div className="space-y-2">
          <h4 className="eyebrow">Países con más registros</h4>
          <ol className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
            {top.map((c) => (
              <li key={c.country} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                <span className="truncate">{countryName(c.country)}</span>
                <span className="font-mono tabular-nums text-muted">{formatCount(c.count)}</span>
                <span className="col-span-2 h-1 overflow-hidden rounded-full bg-fg/5">
                  <span className="block h-full rounded-full bg-accent/60" style={{ width: `${(100 * c.count) / topMax}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {attribution && <p className="text-[11px] text-muted">{attribution}</p>}
    </div>
  )
}

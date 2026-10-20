import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { BarChart, Card, ErrorState, Loading, StatTile } from '@/components/ui'
import { formatDate } from '@/features/catalog/labels'
import type { CultivationSystem } from '@/features/projects/api'
import { SYSTEM_LABELS } from '@/features/projects/labels'
import { useAuth } from '@/store/auth'
import { HomeData, homeApi } from './api'

type State = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready'; data: HomeData }

function GreenhouseArt() {
  return (
    <svg viewBox="0 0 200 150" className="h-full w-full" aria-hidden="true">
      <polygon points="20,70 100,20 180,70" fill="rgb(var(--c-surface) / 0.7)" stroke="rgb(var(--c-surface))" strokeWidth="2" />
      <rect x="20" y="70" width="160" height="70" fill="rgb(var(--c-lime) / 0.25)" stroke="rgb(var(--c-surface))" strokeWidth="2" />
      {[60, 100, 140].map((x) => (
        <line key={x} x1={x} y1="70" x2={x} y2="140" stroke="rgb(var(--c-surface))" strokeWidth="1.5" />
      ))}
    </svg>
  )
}

export function HomePage() {
  const user = useAuth((s) => s.user)
  const [state, setState] = useState<State>({ phase: 'loading' })

  const load = useCallback(() => {
    setState({ phase: 'loading' })
    homeApi
      .get()
      .then((data) => setState({ phase: 'ready', data }))
      .catch((err) => setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar el inicio') }))
  }, [])
  useEffect(load, [load])

  if (state.phase === 'loading') return <Loading />
  if (state.phase === 'error') return <ErrorState message={state.message} onRetry={load} />
  const { recent_project: p, counts, activity } = state.data

  return (
    <div className="space-y-3">
      <p className="eyebrow">Hola{user?.full_name ? `, ${user.full_name}` : ''}</p>
      <Card className="relative overflow-hidden p-6 sm:min-h-[220px]">
        <div className="relative z-10 max-w-md">
          <p className="eyebrow">{p ? 'Proyecto activo' : 'Comienza aquí'}</p>
          {p ? (
            <>
              <h1 className="display mt-2 break-words text-4xl sm:text-5xl">{p.name}</h1>
              <p className="mt-3 text-sm text-muted">
                {[p.species.join(', ') || 'Sin especie asignada', SYSTEM_LABELS[p.system as CultivationSystem] ?? p.system, p.area_m2 ? `${p.area_m2} m²` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <Link to={`/app/projects/${p.id}`} className="mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-fg">
                Abrir proyecto
              </Link>
            </>
          ) : (
            <>
              <h1 className="display mt-2 text-4xl sm:text-5xl">Aún no hay proyectos</h1>
              <p className="mt-3 text-sm text-muted">Crea un proyecto de cultivo para ver aquí su estado.</p>
              <Link to="/app/projects" className="mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-fg">
                Crear proyecto
              </Link>
            </>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-0 right-4 hidden h-[180px] w-[240px] sm:block">
          <GreenhouseArt />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Temperatura del aire" value={null} emptyText="Sin lecturas" />
        <StatTile label="Humedad relativa" value={null} emptyText="Sin lecturas" />
        <StatTile label="Observaciones" value={counts.observations} />
        <StatTile label="Fuentes citadas" value={counts.sources_cited} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <p className="font-bold">Espacio de trabajo</p>
          <p className="mb-4 text-xs text-muted">Registros reales de esta organización</p>
          <BarChart
            ariaLabel="Proyectos, ciclos y observaciones"
            highlightIndex={2}
            data={[
              { label: 'Proyectos', value: counts.projects },
              { label: 'Ciclos', value: counts.crop_cycles },
              { label: 'Observaciones', value: counts.observations },
            ]}
          />
          <div className="mt-2 grid grid-cols-3 text-center text-[11px] text-muted">
            <span>Proyectos · {counts.projects}</span>
            <span>Ciclos · {counts.crop_cycles}</span>
            <span>Observaciones · {counts.observations}</span>
          </div>
        </Card>
        <Card className="p-5">
          <p className="mb-2 font-bold">Actividad reciente</p>
          {activity.length === 0 ? (
            <p className="text-sm text-muted">Sin actividad todavía.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{a.text}</span>
                  <span className="shrink-0 text-[11px] text-muted">{formatDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

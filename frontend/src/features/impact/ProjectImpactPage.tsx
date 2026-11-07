import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import { Empty, ErrorState, Loading } from '@/components/ui'
import { getProject, ProjectDetail } from '@/features/projects/api'
import { formatDateTime } from '@/features/projects/labels'
import { ProjectTabs } from '@/features/projects/ProjectTabs'
import { impactApi, Kpi, ProjectImpact } from './api'
import { KpiFigure } from './KpiFigure'

const GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'Cultivo', keys: ['active_cycles', 'days_since_oldest_active_cycle', 'observations_30d'] },
  { title: 'Evidencia', keys: ['evidence_coverage', 'sources_cited'] },
  {
    title: 'Operación simulada',
    keys: ['simulation_runs', 'incidents_open', 'incidents_acknowledged', 'mean_minutes_to_acknowledge'],
  },
]

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string; code: number | undefined }
  | { phase: 'ready'; project: ProjectDetail; impact: ProjectImpact }

export function ProjectImpactPage() {
  const { id = '' } = useParams()
  const [state, setState] = useState<State>({ phase: 'loading' })

  const load = useCallback(() => {
    setState({ phase: 'loading' })
    Promise.all([getProject(id), impactApi.project(id)])
      .then(([project, impact]) => setState({ phase: 'ready', project, impact }))
      .catch((err) =>
        setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar el impacto'), code: errorStatus(err) }),
      )
  }, [id])

  useEffect(load, [load])

  const back = (
    <Link to={`/app/projects/${encodeURIComponent(id)}`} className="mb-4 inline-block text-sm text-muted hover:text-fg">
      ← {state.phase === 'ready' ? state.project.name : 'Proyecto'}
    </Link>
  )

  if (state.phase === 'loading') return <>{back}<Loading label="Cargando impacto…" /></>
  if (state.phase === 'error') {
    return (
      <>
        {back}
        {state.code === 404 ? (
          <Empty title="Proyecto no encontrado" description="No existe o no pertenece a tu organización activa." />
        ) : (
          <ErrorState message={state.message} onRetry={load} />
        )}
      </>
    )
  }

  const byKey = new Map<string, Kpi>(state.impact.kpis.map((k) => [k.key, k]))

  return (
    <>
      {back}
      <ProjectTabs projectId={id} active="impacto" />
      <div className="mb-4 min-w-0">
        <p className="eyebrow">Impacto</p>
        <h1 className="display mt-1 break-words text-3xl">{state.project.name}</h1>
      </div>
      <p role="note" className="glass mb-6 px-4 py-2.5 text-sm text-muted">
        Cifras calculadas en vivo con los datos del proyecto. Las de telemetría provienen de la simulación didáctica.
      </p>
      <div className="space-y-8">
        {GROUPS.map((group) => {
          const items = group.keys.map((k) => byKey.get(k)).filter((k): k is Kpi => k !== undefined)
          if (items.length === 0) return null
          const headingId = `impact-${group.keys[0]}`
          return (
            <section key={group.title} aria-labelledby={headingId}>
              <h2 id={headingId} className="eyebrow mb-3">
                {group.title}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((k) => (
                  <KpiFigure key={k.key} kpi={k} size="tile" />
                ))}
              </div>
            </section>
          )
        })}
      </div>
      <p className="mt-8 text-xs text-muted">Actualizado: {formatDateTime(state.impact.as_of)}</p>
    </>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import { Badge, Button, Card, Empty, ErrorState, Forbidden, Loading } from '@/components/ui'
import { useHasRole } from '@/store/auth'
import { getProject, ProjectDetail, ProjectInput, updateProject } from './api'
import { CYCLE_STATUS_LABELS, fieldErrors, formatArea, formatDateTime, STAGE_LABELS, SYSTEM_LABELS } from './labels'
import { ObservationLog } from './ObservationLog'
import { ProjectForm, ProjectFormValues } from './ProjectForm'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; code?: number }
  | { status: 'ready'; data: ProjectDetail }

function toFormValues(p: ProjectDetail): ProjectFormValues {
  return {
    name: p.name,
    objectives: p.objectives ?? '',
    area_m2: p.area_m2 != null ? String(p.area_m2) : '',
    system: p.system,
    location: p.location ?? '',
  }
}

function formatDay(iso: string | null): string {
  if (!iso) return 'Sin fecha'
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-MX', { dateStyle: 'medium' })
}

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const canEdit = useHasRole('editor')
  const [state, setState] = useState<State>({ status: 'loading' })
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})

  const load = useCallback(
    (quiet = false) => {
      if (!quiet) setState({ status: 'loading' })
      return getProject(id)
        .then((data) => setState({ status: 'ready', data }))
        .catch((err) =>
          setState({ status: 'error', message: errorMessage(err, 'No se pudo cargar el proyecto'), code: errorStatus(err) }),
        )
    },
    [id],
  )

  useEffect(() => {
    load()
  }, [load])

  const back = (
    <Link to="/app/projects" className="mb-4 inline-block text-sm text-muted hover:text-fg">
      ← Proyectos
    </Link>
  )

  if (state.status === 'loading') return <>{back}<Loading label="Cargando proyecto…" /></>
  if (state.status === 'error') {
    return (
      <>
        {back}
        {state.code === 404 ? (
          <Empty title="Proyecto no encontrado" description="No existe o no pertenece a tu organización activa." />
        ) : state.code === 403 ? (
          <Forbidden />
        ) : (
          <ErrorState message={state.message} onRetry={() => load()} />
        )}
      </>
    )
  }

  const p = state.data

  const save = async (data: ProjectInput) => {
    setSaving(true)
    setConflict(false)
    setSaveError(null)
    setServerErrors({})
    try {
      const updated = await updateProject(p.id, { ...data, version: p.version })
      setState({ status: 'ready', data: updated })
      setEditing(false)
    } catch (err) {
      const status = errorStatus(err)
      if (status === 409) setConflict(true)
      else {
        const fields = fieldErrors(err)
        setServerErrors(fields)
        if (Object.keys(fields).length === 0) setSaveError(errorMessage(err, 'No se pudieron guardar los cambios'))
      }
    } finally {
      setSaving(false)
    }
  }

  const reloadAfterConflict = async () => {
    await load(true)
    setConflict(false)
  }

  const cancelEdit = () => {
    setEditing(false)
    setConflict(false)
    setSaveError(null)
    setServerErrors({})
  }

  return (
    <>
      {back}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <p className="mt-1 text-xs text-muted">
            Versión <span className="font-mono">{p.version}</span> · Actualizado {formatDateTime(p.updated_at)}
          </p>
        </div>
        {canEdit && !editing && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card className="p-5">
            {editing ? (
              <>
                <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-muted">Editar proyecto</h2>
                <ProjectForm
                  key={p.version}
                  initial={toFormValues(p)}
                  submitLabel="Guardar cambios"
                  saving={saving}
                  serverErrors={serverErrors}
                  notice={
                    conflict ? (
                      <div role="alert" className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                        <p>Otra persona modificó este proyecto mientras editabas. Tus cambios no se guardaron.</p>
                        <Button type="button" variant="secondary" onClick={reloadAfterConflict}>
                          Cargar versión actual
                        </Button>
                      </div>
                    ) : saveError ? (
                      <p role="alert" className="text-sm text-danger">
                        {saveError}
                      </p>
                    ) : null
                  }
                  onSubmit={save}
                  onCancel={cancelEdit}
                />
              </>
            ) : (
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="font-mono text-xs uppercase tracking-wider text-muted">Objetivos</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{p.objectives || <span className="text-muted">Sin objetivos registrados</span>}</dd>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="font-mono text-xs uppercase tracking-wider text-muted">Sistema</dt>
                    <dd className="mt-1">{SYSTEM_LABELS[p.system] ?? p.system}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-xs uppercase tracking-wider text-muted">Área</dt>
                    <dd className="mt-1 font-mono">{formatArea(p.area_m2)}</dd>
                  </div>
                </div>
                <div>
                  <dt className="font-mono text-xs uppercase tracking-wider text-muted">Ubicación</dt>
                  <dd className="mt-1">{p.location || <span className="text-muted">Sin especificar</span>}</dd>
                </div>
              </dl>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-mono text-xs uppercase tracking-wider text-muted">Cultivos</h2>
              {canEdit && (
                <Link to="/app/plants" className="text-sm font-medium text-accent hover:underline">
                  Añadir desde el catálogo
                </Link>
              )}
            </div>
            {p.crop_cycles.length === 0 ? (
              <p className="text-sm text-muted">
                Sin ciclos de cultivo. {canEdit && 'Abre una especie en el explorador vegetal y usa «Añadir a proyecto».'}
              </p>
            ) : (
              <ul className="space-y-3">
                {p.crop_cycles.map((c) => (
                  <li key={c.id} className="text-sm">
                    <Link to={`/app/plants/${c.species_id}`} className="italic hover:text-accent">
                      {c.species_name}
                    </Link>
                    {c.cultivar_name && <span> ‘{c.cultivar_name}’</span>}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Badge tone={c.status === 'active' ? 'accent' : 'neutral'}>{CYCLE_STATUS_LABELS[c.status] ?? c.status}</Badge>
                      <span>Inicio: {formatDay(c.started_on)}</span>
                      <span>· Etapa: {STAGE_LABELS[c.stage] ?? c.stage}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-muted">Bitácora</h2>
          <ObservationLog projectId={p.id} cycles={p.crop_cycles} canEdit={canEdit} />
        </Card>
      </div>
    </>
  )
}

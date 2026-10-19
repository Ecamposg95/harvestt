import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import { Badge, Button, Card, Empty, ErrorState, Forbidden, Loading, PageHeader } from '@/components/ui'
import { Pagination } from '@/features/catalog/Pagination'
import { useHasRole } from '@/store/auth'
import { createProject, listProjects, Page, Project, ProjectInput } from './api'
import { fieldErrors, formatArea, formatDateTime, SYSTEM_LABELS } from './labels'
import { EMPTY_PROJECT, ProjectForm } from './ProjectForm'

const PAGE_SIZE = 20

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; forbidden: boolean }
  | { status: 'ready'; data: Page<Project> }

export function ProjectsPage() {
  const canEdit = useHasRole('editor')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const formOpen = canEdit && params.get('nuevo') === '1'

  const [state, setState] = useState<State>({ status: 'loading' })
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setState({ status: 'loading' })
    listProjects({ page, page_size: PAGE_SIZE })
      .then((data) => setState({ status: 'ready', data }))
      .catch((err) =>
        setState({
          status: 'error',
          message: errorMessage(err, 'No se pudieron cargar los proyectos'),
          forbidden: errorStatus(err) === 403,
        }),
      )
  }, [page])

  useEffect(load, [load])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  const openForm = (open: boolean) => {
    setCreateError(null)
    setServerErrors({})
    setParam('nuevo', open ? '1' : null)
  }

  const create = async (data: ProjectInput) => {
    setSaving(true)
    setCreateError(null)
    setServerErrors({})
    try {
      const project = await createProject(data)
      navigate(`/app/projects/${project.id}`)
    } catch (err) {
      const fields = fieldErrors(err)
      setServerErrors(fields)
      if (errorStatus(err) === 403) setCreateError('Tu rol no permite crear proyectos.')
      else if (Object.keys(fields).length === 0) setCreateError(errorMessage(err, 'No se pudo crear el proyecto'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Proyectos"
        description="Proyectos de cultivo de tu organización: objetivos, ciclos y bitácora."
        actions={
          canEdit && !formOpen ? <Button onClick={() => openForm(true)}>Nuevo proyecto</Button> : undefined
        }
      />

      {formOpen && (
        <Card className="mb-8 p-5">
          <h2 className="mb-4 text-lg font-semibold">Nuevo proyecto</h2>
          <ProjectForm
            initial={EMPTY_PROJECT}
            submitLabel="Crear proyecto"
            saving={saving}
            serverErrors={serverErrors}
            notice={createError && <p role="alert" className="text-sm text-danger">{createError}</p>}
            onSubmit={create}
            onCancel={() => openForm(false)}
          />
        </Card>
      )}

      {state.status === 'loading' && <Loading label="Cargando proyectos…" />}
      {state.status === 'error' &&
        (state.forbidden ? <Forbidden /> : <ErrorState message={state.message} onRetry={load} />)}
      {state.status === 'ready' &&
        (state.data.items.length === 0 ? (
          <Empty
            title="Aún no hay proyectos"
            description={
              canEdit
                ? 'Crea el primero para registrar objetivos, cultivos y observaciones.'
                : 'Cuando alguien con permiso de edición cree un proyecto aparecerá aquí.'
            }
            action={canEdit && !formOpen ? <Button onClick={() => openForm(true)}>Nuevo proyecto</Button> : undefined}
          />
        ) : (
          <>
            <ul className="grid gap-3">
              {state.data.items.map((p) => (
                <li key={p.id}>
                  <Link to={`/app/projects/${p.id}`} className="block rounded-lg">
                    <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-accent/50 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="truncate font-medium">{p.name}</h2>
                        <p className="truncate text-sm text-muted">{p.objectives || 'Sin objetivos registrados'}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted">
                        <Badge>{SYSTEM_LABELS[p.system] ?? p.system}</Badge>
                        <span className="font-mono">{formatArea(p.area_m2)}</span>
                        <span>· Actualizado {formatDateTime(p.updated_at)}</span>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination
              page={state.data.page}
              pageSize={state.data.page_size}
              total={state.data.total}
              onChange={(p) => setParam('page', String(p))}
            />
          </>
        ))}
    </>
  )
}

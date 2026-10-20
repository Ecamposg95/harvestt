import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import { Button, Card, Empty, ErrorState, Forbidden, Loading, OriginBadge } from '@/components/ui'
import { getProject, ProjectDetail } from '@/features/projects/api'
import { ProjectTabs } from '@/features/projects/ProjectTabs'
import { ILLUSTRATIVE_NOTICE } from '@/features/three/plants/types'
import { webglAvailable } from '@/features/three/webgl'
import { useHasRole } from '@/store/auth'
import { getLayout, Layout, LayoutZone, saveLayout } from './api'
import { StudioScene } from './LazyStudioScene'
import { floorFor, movePlantToFloor, Selection } from './layout'
import type { StudioSceneProps } from './sceneTypes'
import { SidePanel } from './SidePanel'
import { StudioTopView } from './StudioTopView'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; code?: number }
  | { status: 'ready'; project: ProjectDetail; layout: Layout }

type Notice = { kind: 'saved' | 'conflict' | 'error'; message: string }

export function StudioPage() {
  const { id = '' } = useParams()
  const canEdit = useHasRole('editor')
  const webgl = useMemo(() => webglAvailable(), [])
  const [state, setState] = useState<State>({ status: 'loading' })
  const [zones, setZones] = useState<LayoutZone[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    setNotice(null)
    return Promise.all([getProject(id), getLayout(id)])
      .then(([project, layout]) => {
        setState({ status: 'ready', project, layout })
        setZones(layout.zones)
        setSelection(null)
        setDirty(false)
      })
      .catch((err) =>
        setState({ status: 'error', message: errorMessage(err, 'No se pudo cargar el Studio'), code: errorStatus(err) }),
      )
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const back = (
    <Link to={`/app/projects/${id}`} className="mb-4 inline-block text-sm text-muted hover:text-fg">
      ← Proyecto
    </Link>
  )

  if (state.status === 'loading') return <>{back}<Loading label="Cargando Studio…" /></>
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

  const { project, layout } = state
  const floor = floorFor(layout, zones)

  const change = (next: LayoutZone[]) => {
    setZones(next)
    setDirty(true)
    setNotice(null)
  }

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const saved = await saveLayout(id, layout.version, zones)
      setState({ status: 'ready', project, layout: saved })
      setZones(saved.zones)
      setDirty(false)
      setNotice({ kind: 'saved', message: `Layout guardado (versión ${saved.version}).` })
    } catch (err) {
      if (errorStatus(err) === 409) {
        setNotice({ kind: 'conflict', message: 'Otra persona guardó el layout mientras editabas. Tus cambios no se guardaron.' })
      } else {
        setNotice({ kind: 'error', message: errorMessage(err, 'No se pudo guardar el layout') })
      }
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    setZones(layout.zones)
    setSelection(null)
    setDirty(false)
    setNotice(null)
  }

  const sceneProps: StudioSceneProps = {
    floor,
    zones,
    selection,
    editing,
    onSelect: setSelection,
    onFloorClick: (x, y) => {
      if (selection?.plant != null) change(movePlantToFloor(zones, selection, x, y))
    },
    label: `Studio de ${project.name}`,
    className: 'h-full w-full',
  }

  const pill = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${active ? 'bg-ink text-ink-fg' : 'text-muted hover:text-fg'}`

  return (
    <>
      {back}
      <ProjectTabs projectId={id} active="studio" />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Studio</p>
          <h1 className="display text-3xl">{project.name}</h1>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Modo" className="glass inline-flex !rounded-full p-1">
              <button type="button" aria-pressed={!editing} className={pill(!editing)} onClick={() => setEditing(false)}>
                Ver
              </button>
              <button type="button" aria-pressed={editing} className={pill(editing)} onClick={() => setEditing(true)}>
                Editar
              </button>
            </div>
            {dirty && (
              <>
                <Button variant="ghost" onClick={discard}>
                  Descartar
                </Button>
                <Button onClick={save} loading={saving}>
                  Guardar layout
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div role="note" className="mb-4 flex flex-wrap items-center gap-3 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-ink-fg">
        <OriginBadge origin="illustrative" />
        {ILLUSTRATIVE_NOTICE}
      </div>

      {notice && (
        <div
          role={notice.kind === 'saved' ? 'status' : 'alert'}
          className={`mb-4 flex flex-wrap items-center gap-3 rounded-2xl p-3 text-sm ${
            notice.kind === 'saved' ? 'bg-accent/15 text-accent' : 'border border-warning/40 bg-warning/10'
          }`}
        >
          <span>{notice.message}</span>
          {notice.kind === 'conflict' && (
            <Button variant="secondary" onClick={() => load()}>
              Cargar versión actual
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="relative h-[60vh] min-h-[360px] overflow-hidden p-0">
          {webgl ? <StudioScene {...sceneProps} /> : <StudioTopView {...sceneProps} />}
          {!webgl && (
            <p className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-muted">
              Vista superior 2D: tu navegador no admite WebGL.
            </p>
          )}
          {zones.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
              {canEdit ? 'Sin zonas todavía. Entra a «Editar» y agrega la primera.' : 'Este proyecto aún no tiene layout.'}
            </div>
          )}
        </Card>
        <SidePanel
          zones={zones}
          floor={floor}
          selection={selection}
          editing={editing && canEdit}
          cycles={project.crop_cycles}
          onZones={change}
          onSelect={setSelection}
        />
      </div>
    </>
  )
}

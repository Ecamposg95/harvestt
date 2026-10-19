import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorState,
  Field,
  Forbidden,
  Input,
  Loading,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui'
import { useHasRole } from '@/store/auth'
import {
  Asset,
  AssetKind,
  formatBytes,
  internalFilePath,
  kindFromFilename,
  MAX_BYTES,
  PrototypeDetail,
  PrototypeStatus,
  prototypesApi,
  Spec,
} from './api'
import { StlViewer } from './LazyStlViewer'
import { AuthedImage, StatusBadge } from './shared'
import { STATUS_ORDER, statusLabel } from './status'

type State =
  | { phase: 'loading' }
  | { phase: 'notfound' }
  | { phase: 'forbidden' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: PrototypeDetail }

export function PrototypeAdminDetailPage() {
  const { id = '' } = useParams()
  const [state, setState] = useState<State>({ phase: 'loading' })

  const fetchDetail = useCallback(
    (silent = false) => {
      if (!silent) setState({ phase: 'loading' })
      return prototypesApi
        .get(id)
        .then((data) => setState({ phase: 'ready', data }))
        .catch((err) => {
          const status = errorStatus(err)
          setState(
            status === 404
              ? { phase: 'notfound' }
              : status === 403
                ? { phase: 'forbidden' }
                : { phase: 'error', message: errorMessage(err, 'No se pudo cargar el prototipo') },
          )
        })
    },
    [id],
  )

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  if (state.phase === 'loading') return <Loading />
  if (state.phase === 'forbidden') return <Forbidden />
  if (state.phase === 'error') return <ErrorState message={state.message} onRetry={() => fetchDetail()} />
  if (state.phase === 'notfound') {
    return (
      <Empty
        title="Prototipo no encontrado"
        description="No existe, fue eliminado o pertenece a otra organización."
        action={
          <Link to="/app/prototypes" className="text-sm text-accent hover:underline">
            Volver a prototipos
          </Link>
        }
      />
    )
  }
  return (
    <Editor
      key={state.data.id}
      data={state.data}
      onChange={(data) => setState({ phase: 'ready', data })}
      refresh={() => fetchDetail(true)}
    />
  )
}

// ---- Formulario ----

interface SpecRow extends Spec {
  key: number
}

interface FormState {
  name: string
  codename: string
  purpose: string
  summary: string
  description: string
  status: PrototypeStatus
  sort_order: string
  is_public: boolean
  specs: SpecRow[]
}

let rowKey = 0
const toForm = (p: PrototypeDetail): FormState => ({
  name: p.name,
  codename: p.codename ?? '',
  purpose: p.purpose,
  summary: p.summary,
  description: p.description,
  status: p.status,
  sort_order: String(p.sort_order),
  is_public: p.is_public,
  specs: p.specs.map((s) => ({ ...s, unit: s.unit ?? '', key: ++rowKey })),
})

const comparable = (f: FormState) => JSON.stringify({ ...f, specs: f.specs.map(({ key: _k, ...s }) => s) })

function Editor({
  data,
  onChange,
  refresh,
}: {
  data: PrototypeDetail
  onChange: (d: PrototypeDetail) => void
  refresh: () => Promise<void>
}) {
  const canEdit = useHasRole('editor')
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(() => toForm(data))
  const [baseline, setBaseline] = useState(() => comparable(toForm(data)))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const dirty = comparable(form) !== baseline
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setSaved(false)
    setForm((f) => ({ ...f, [k]: v }))
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaveError(null)
    setConflict(false)
    if (!form.name.trim()) {
      setSaveError('El nombre es obligatorio')
      return
    }
    const rows = form.specs.filter((s) => s.label.trim() || s.value.trim() || (s.unit ?? '').trim())
    if (rows.some((s) => !s.label.trim() || !s.value.trim())) {
      setSaveError('Cada especificación necesita etiqueta y valor')
      return
    }
    const sortOrder = Number.parseInt(form.sort_order, 10)
    if (Number.isNaN(sortOrder)) {
      setSaveError('El orden debe ser un número entero')
      return
    }
    setSaving(true)
    try {
      const updated = await prototypesApi.update(data.id, {
        version: data.version,
        name: form.name.trim(),
        codename: form.codename.trim() || null,
        purpose: form.purpose.trim(),
        summary: form.summary,
        description: form.description,
        status: form.status,
        sort_order: sortOrder,
        is_public: form.is_public,
        specs: rows.map((s) => ({ label: s.label.trim(), value: s.value.trim(), unit: (s.unit ?? '').trim() || null })),
      })
      const next = toForm(updated)
      setForm(next)
      setBaseline(comparable(next))
      onChange(updated)
      setSaved(true)
    } catch (err) {
      if (errorStatus(err) === 409) setConflict(true)
      else setSaveError(errorMessage(err, 'No se pudieron guardar los cambios'))
    } finally {
      setSaving(false)
    }
  }

  const reloadDiscarding = async () => {
    const fresh = await prototypesApi.get(data.id).catch(() => null)
    if (!fresh) return
    const next = toForm(fresh)
    setForm(next)
    setBaseline(comparable(next))
    setConflict(false)
    onChange(fresh)
  }

  const remove = async () => {
    setDeleting(true)
    try {
      await prototypesApi.remove(data.id)
      navigate('/app/prototypes')
    } catch (err) {
      setSaveError(errorMessage(err, 'No se pudo eliminar el prototipo'))
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <Link to="/app/prototypes" className="mb-4 inline-block text-sm text-muted hover:text-fg">
        ← Prototipos
      </Link>
      <PageHeader
        title={data.name}
        description={data.codename ? `Nombre clave: ${data.codename}` : `/${data.slug}`}
        actions={
          data.is_public ? (
            <a
              href={`/prototipos/${data.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm hover:bg-raised"
            >
              Ver en vitrina ↗
            </a>
          ) : undefined
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <StatusBadge status={data.status} />
        {data.is_public ? <Badge tone="accent">Público</Badge> : <Badge>Privado</Badge>}
        <Badge>v{data.version}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <form onSubmit={save} className="min-w-0 space-y-6 lg:col-span-3" noValidate>
          <fieldset disabled={!canEdit || saving} className="space-y-6">
            <Card className="space-y-4 p-5">
              <h2 className="font-mono text-xs uppercase tracking-wider text-muted">Ficha</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre">
                  {(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />}
                </Field>
                <Field label="Nombre clave">
                  {(id) => <Input id={id} value={form.codename} onChange={(e) => set('codename', e.target.value)} maxLength={80} />}
                </Field>
              </div>
              <Field label="Propósito" hint="Una línea">
                {(id, d) => (
                  <Input id={id} aria-describedby={d} value={form.purpose} onChange={(e) => set('purpose', e.target.value)} maxLength={300} />
                )}
              </Field>
              <Field label="Resumen">
                {(id) => <Textarea id={id} value={form.summary} onChange={(e) => set('summary', e.target.value)} maxLength={5000} rows={3} />}
              </Field>
              <Field label="Descripción" hint="Texto con párrafos; admite títulos con # y listas con -">
                {(id, d) => (
                  <Textarea
                    id={id}
                    aria-describedby={d}
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    maxLength={50000}
                    rows={8}
                  />
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Estado">
                  {(id) => (
                    <Select id={id} value={form.status} onChange={(e) => set('status', e.target.value as PrototypeStatus)}>
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Orden en la vitrina" hint="Menor aparece primero">
                  {(id, d) => (
                    <Input
                      id={id}
                      aria-describedby={d}
                      type="number"
                      inputMode="numeric"
                      value={form.sort_order}
                      onChange={(e) => set('sort_order', e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <label className="flex items-start gap-3 rounded-md border border-border p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-accent))]"
                  checked={form.is_public}
                  onChange={(e) => set('is_public', e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium">Publicar en la vitrina</span>
                  <span className="block text-xs text-muted">Solo se muestran los archivos marcados como públicos.</span>
                </span>
              </label>
            </Card>

            <SpecsEditor rows={form.specs} onChange={(rows) => set('specs', rows)} />
          </fieldset>

          {conflict && (
            <div role="alert" className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-warning">Alguien más modificó este prototipo. Recarga para ver la versión actual (perderás tus cambios sin guardar).</p>
              <Button type="button" variant="secondary" onClick={reloadDiscarding}>
                Recargar
              </Button>
            </div>
          )}
          {saveError && (
            <p role="alert" className="text-sm text-danger">
              {saveError}
            </p>
          )}

          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={saving} disabled={!dirty}>
                Guardar cambios
              </Button>
              {dirty && (
                <Button type="button" variant="ghost" onClick={() => setForm(toForm(data))} disabled={saving}>
                  Descartar
                </Button>
              )}
              {saved && !dirty && (
                <span role="status" className="text-sm text-accent">
                  Cambios guardados
                </span>
              )}
            </div>
          )}

          {canEdit && (
            <Card className="flex flex-col gap-3 border-danger/30 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-medium">Eliminar prototipo</h2>
                <p className="text-xs text-muted">Se oculta de la plataforma y de la vitrina junto con sus archivos.</p>
              </div>
              {confirmDelete ? (
                <div className="flex gap-2">
                  <Button type="button" variant="danger" loading={deleting} onClick={remove}>
                    Confirmar
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="secondary" onClick={() => setConfirmDelete(true)}>
                  Eliminar
                </Button>
              )}
            </Card>
          )}
        </form>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          <AssetsPanel data={data} canEdit={canEdit} refresh={refresh} />
        </div>
      </div>
    </>
  )
}

function SpecsEditor({ rows, onChange }: { rows: SpecRow[]; onChange: (rows: SpecRow[]) => void }) {
  const update = (key: number, patch: Partial<Spec>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted">Especificaciones</h2>
        <Button type="button" variant="secondary" onClick={() => onChange([...rows, { key: ++rowKey, label: '', value: '', unit: '' }])}>
          Añadir fila
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Sin especificaciones. Añade filas como “Bandejas · 4” o “Consumo · 35 W”.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1.2fr_1fr_0.6fr_auto]">
              <Input
                aria-label={`Etiqueta de la fila ${i + 1}`}
                placeholder="Etiqueta"
                value={r.label}
                maxLength={80}
                onChange={(e) => update(r.key, { label: e.target.value })}
                className="col-span-1"
              />
              <Button
                type="button"
                variant="ghost"
                aria-label={`Quitar fila ${i + 1}`}
                onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                className="sm:order-last"
              >
                Quitar
              </Button>
              <Input
                aria-label={`Valor de la fila ${i + 1}`}
                placeholder="Valor"
                value={r.value}
                maxLength={200}
                onChange={(e) => update(r.key, { value: e.target.value })}
              />
              <Input
                aria-label={`Unidad de la fila ${i + 1}`}
                placeholder="Unidad"
                value={r.unit ?? ''}
                maxLength={30}
                onChange={(e) => update(r.key, { unit: e.target.value })}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ---- Archivos ----

function AssetsPanel({ data, canEdit, refresh }: { data: PrototypeDetail; canEdit: boolean; refresh: () => Promise<void> }) {
  const stls = useMemo(() => data.assets.filter((a) => a.kind === 'model_stl'), [data.assets])
  const [previewId, setPreviewId] = useState<string | null>(stls[0]?.id ?? null)
  const preview = stls.find((a) => a.id === previewId) ?? stls[0]
  const [actionError, setActionError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setActionError(null)
    try {
      await fn()
      await refresh()
    } catch (err) {
      if (errorStatus(err) === 409) {
        setActionError('El prototipo cambió mientras tanto; se recargaron los datos. Intenta de nuevo.')
        await refresh()
      } else setActionError(errorMessage(err, fallback))
    }
  }

  return (
    <>
      {canEdit && <UploadCard prototypeId={data.id} onUploaded={refresh} />}

      {preview && (
        <Card className="space-y-3 p-4">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted">Vista previa 3D</h2>
          <StlViewer
            key={preview.id}
            url={internalFilePath(data.id, preview.id)}
            authed
            label={`Modelo 3D ${preview.filename}`}
            className="h-72 w-full"
          />
          <p className="truncate text-xs text-muted">{preview.caption || preview.filename}</p>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-muted">Archivos ({data.assets.length})</h2>
        {actionError && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {actionError}
          </p>
        )}
        {data.assets.length === 0 ? (
          <p className="text-sm text-muted">Sin archivos. {canEdit ? 'Sube imágenes (PNG, JPG, WEBP) o modelos STL.' : ''}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.assets.map((a) => (
              <AssetRow
                key={a.id}
                asset={a}
                prototype={data}
                canEdit={canEdit}
                previewing={a.id === preview?.id}
                onPreview={() => setPreviewId(a.id)}
                run={run}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function AssetRow({
  asset: a,
  prototype,
  canEdit,
  previewing,
  onPreview,
  run,
}: {
  asset: Asset
  prototype: PrototypeDetail
  canEdit: boolean
  previewing: boolean
  onPreview: () => void
  run: (fn: () => Promise<unknown>, fallback: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const isHero = prototype.hero_asset_id === a.id
  const act = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true)
    await run(fn, fallback)
    setBusy(false)
  }

  return (
    <li className="flex gap-3 py-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded border border-border">
        {a.kind === 'image' ? (
          <AuthedImage path={internalFilePath(prototype.id, a.id)} alt={a.caption || a.filename} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-raised font-mono text-[10px] uppercase tracking-wider text-accent">
            STL
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-sm font-medium" title={a.filename}>
          {a.filename}
        </p>
        <p className="truncate text-xs text-muted">
          {formatBytes(a.size_bytes)}
          {a.caption && ` · ${a.caption}`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {isHero && <Badge tone="accent">Principal</Badge>}
          {a.is_public ? <Badge tone="accent">Público</Badge> : <Badge>Privado</Badge>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs">
          {a.kind === 'model_stl' && !previewing && (
            <button type="button" onClick={onPreview} className="text-accent hover:underline">
              Ver en 3D
            </button>
          )}
          {canEdit && a.kind === 'image' && !isHero && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                act(() => prototypesApi.update(prototype.id, { version: prototype.version, hero_asset_id: a.id }), 'No se pudo marcar como principal')
              }
              className="text-accent hover:underline disabled:opacity-50"
            >
              Usar como principal
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => prototypesApi.updateAsset(prototype.id, a.id, { is_public: !a.is_public }), 'No se pudo cambiar la visibilidad')}
              className="text-muted hover:text-fg disabled:opacity-50"
            >
              {a.is_public ? 'Hacer privado' : 'Hacer público'}
            </button>
          )}
          {canEdit &&
            (confirming ? (
              <span className="inline-flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => prototypesApi.removeAsset(prototype.id, a.id), 'No se pudo eliminar el archivo')}
                  className="font-medium text-danger hover:underline disabled:opacity-50"
                >
                  Confirmar borrado
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="text-muted hover:text-fg">
                  Cancelar
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="text-danger hover:underline">
                Eliminar
              </button>
            ))}
        </div>
      </div>
    </li>
  )
}

function UploadCard({ prototypeId, onUploaded }: { prototypeId: string; onUploaded: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<AssetKind | null>(null)
  const [caption, setCaption] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setDone(false)
    setError(null)
    setFile(f)
    if (!f) {
      setKind(null)
      return
    }
    const k = kindFromFilename(f.name)
    setKind(k)
    if (!k) setError('Formato no permitido: usa PNG, JPG, WEBP o STL')
    else if (f.size > MAX_BYTES[k]) setError(`El archivo excede ${formatBytes(MAX_BYTES[k])}`)
  }

  const reset = () => {
    setFile(null)
    setKind(null)
    setCaption('')
    setProgress(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file || !kind || error) return
    setProgress(0)
    try {
      await prototypesApi.uploadAsset(prototypeId, { file, kind, caption, is_public: isPublic }, setProgress)
      reset()
      setDone(true)
      await onUploaded()
    } catch (err) {
      setProgress(null)
      setError(errorMessage(err, 'No se pudo subir el archivo'))
    }
  }

  const uploading = progress !== null
  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted">Subir archivo</h2>
        <Field label="Archivo" hint="Imágenes PNG/JPG/WEBP hasta 15 MB · STL hasta 100 MB">
          {(id, d) => (
            <input
              ref={inputRef}
              id={id}
              aria-describedby={d}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.stl"
              onChange={pick}
              disabled={uploading}
              className="block w-full min-w-0 text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-fg hover:file:bg-raised"
            />
          )}
        </Field>
        {file && kind && (
          <p className="text-xs text-muted">
            Tipo detectado: <span className="text-fg">{kind === 'image' ? 'Imagen' : 'Modelo STL'}</span> · {formatBytes(file.size)}
          </p>
        )}
        <Field label="Pie de foto / descripción">
          {(id) => <Input id={id} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} disabled={uploading} />}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[rgb(var(--c-accent))]"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            disabled={uploading}
          />
          Mostrar en la vitrina pública
        </label>
        {uploading && (
          <div role="progressbar" aria-label="Progreso de subida" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-1.5 w-full overflow-hidden rounded bg-raised">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">{progress < 1 ? `Subiendo… ${Math.round(progress * 100)}%` : 'Validando archivo…'}</p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {done && !file && (
          <p role="status" className="text-sm text-accent">
            Archivo subido
          </p>
        )}
        <Button type="submit" disabled={!file || !kind || !!error} loading={uploading}>
          Subir
        </Button>
      </form>
    </Card>
  )
}

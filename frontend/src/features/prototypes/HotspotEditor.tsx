import { FormEvent, useCallback, useEffect, useState } from 'react'
import { errorMessage } from '@/api/client'
import { Badge, Button, Card, Field, Input, Textarea } from '@/components/ui'
import type { ModelPoint } from '@/features/three/types'
import { Asset, Hotspot, internalFilePath, MAX_HOTSPOTS, prototypesApi } from './api'
import { StlViewer } from './LazyStlViewer'

type Mode = { kind: 'idle' } | { kind: 'picking' } | { kind: 'new'; point: ModelPoint } | { kind: 'edit'; id: string }

interface FormValues {
  label: string
  description: string
}

/** Vista previa 3D del STL con el editor de puntos (hotspots) del prototipo. */
export function ModelPreview({ prototypeId, asset, canEdit }: { prototypeId: string; asset: Asset; canEdit: boolean }) {
  const [hotspots, setHotspots] = useState<Hotspot[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      setHotspots(await prototypesApi.listHotspots(prototypeId))
    } catch (err) {
      setLoadError(errorMessage(err, 'No se pudieron cargar los puntos'))
    }
  }, [prototypeId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setMode({ kind: 'idle' })
  }, [asset.id])

  const all = hotspots ?? []
  const own = all.filter((h) => h.asset_id === asset.id)
  const atLimit = all.length >= MAX_HOTSPOTS

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      setMode({ kind: 'idle' })
      setConfirming(null)
      await load()
    } catch (err) {
      setActionError(errorMessage(err, fallback))
    } finally {
      setBusy(false)
    }
  }

  const move = (index: number, dir: -1 | 1) => {
    const a = own[index]
    const b = own[index + dir]
    if (!a || !b) return
    const aSort = a.sort_order === b.sort_order ? b.sort_order + dir : b.sort_order
    void run(async () => {
      await prototypesApi.updateHotspot(prototypeId, a.id, { sort_order: aSort })
      if (b.sort_order !== a.sort_order) await prototypesApi.updateHotspot(prototypeId, b.id, { sort_order: a.sort_order })
    }, 'No se pudo reordenar')
  }

  const viewerHotspots = [
    ...own.map((h) => ({ key: h.id, label: h.label, description: h.description, x: h.x, y: h.y, z: h.z })),
    ...(mode.kind === 'new' ? [{ key: 'nuevo', label: 'Nuevo punto', ...mode.point }] : []),
  ]

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="eyebrow">Vista previa 3D</h2>
        {hotspots && (
          <Badge tone={atLimit ? 'warning' : 'neutral'}>
            {all.length} / {MAX_HOTSPOTS} puntos
          </Badge>
        )}
      </div>
      <StlViewer
        key={asset.id}
        url={internalFilePath(prototypeId, asset.id)}
        authed
        label={`Modelo 3D ${asset.filename}`}
        hotspots={viewerHotspots}
        onPick={mode.kind === 'picking' ? (point) => setMode({ kind: 'new', point }) : undefined}
        className="h-72 w-full"
      />
      <p className="truncate text-xs text-muted">{asset.caption || asset.filename}</p>

      {canEdit && hotspots && mode.kind !== 'new' && (
        <div className="flex flex-wrap items-center gap-2">
          {mode.kind === 'picking' ? (
            <>
              <p role="status" className="text-sm text-fg">
                Haz clic sobre el modelo para colocar el punto.
              </p>
              <Button variant="ghost" onClick={() => setMode({ kind: 'idle' })}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" disabled={atLimit || busy} onClick={() => setMode({ kind: 'picking' })}>
                Agregar punto
              </Button>
              {atLimit && <p className="text-xs text-muted">Máximo {MAX_HOTSPOTS} puntos por prototipo.</p>}
            </>
          )}
        </div>
      )}

      {mode.kind === 'new' && (
        <HotspotForm
          initial={{ label: '', description: '' }}
          submitLabel="Guardar punto"
          busy={busy}
          onCancel={() => setMode({ kind: 'idle' })}
          onSubmit={(v) =>
            run(
              () => prototypesApi.createHotspot(prototypeId, { asset_id: asset.id, ...v, ...mode.point }),
              'No se pudo guardar el punto',
            )
          }
        />
      )}

      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      {loadError ? (
        <div role="alert" className="flex items-center gap-3 text-sm text-danger">
          {loadError}
          <Button variant="ghost" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      ) : hotspots === null ? (
        <p className="text-xs text-muted">Cargando puntos…</p>
      ) : own.length === 0 ? (
        <p className="text-sm text-muted">Sin puntos en este modelo.</p>
      ) : (
        <ol aria-label="Puntos del modelo" className="divide-y divide-border/60">
          {own.map((h, i) =>
            mode.kind === 'edit' && mode.id === h.id ? (
              <li key={h.id} className="py-3">
                <HotspotForm
                  initial={{ label: h.label, description: h.description }}
                  submitLabel="Guardar cambios"
                  busy={busy}
                  onCancel={() => setMode({ kind: 'idle' })}
                  onSubmit={(v) => run(() => prototypesApi.updateHotspot(prototypeId, h.id, v), 'No se pudo actualizar el punto')}
                />
              </li>
            ) : (
              <li key={h.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-ink-fg">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{h.label}</p>
                  {h.description && <p className="text-xs text-muted">{h.description}</p>}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" className="!px-2 !py-1" aria-label={`Subir ${h.label}`} disabled={i === 0 || busy} onClick={() => move(i, -1)}>
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1"
                      aria-label={`Bajar ${h.label}`}
                      disabled={i === own.length - 1 || busy}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </Button>
                    <Button variant="ghost" className="!px-3 !py-1 text-xs" disabled={busy} onClick={() => setMode({ kind: 'edit', id: h.id })}>
                      Editar
                    </Button>
                    {confirming === h.id ? (
                      <Button
                        variant="danger"
                        className="!px-3 !py-1 text-xs"
                        aria-label={`Confirmar eliminación de ${h.label}`}
                        loading={busy}
                        onClick={() => run(() => prototypesApi.removeHotspot(prototypeId, h.id), 'No se pudo eliminar el punto')}
                      >
                        Confirmar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        className="!px-3 !py-1 text-xs text-danger"
                        aria-label={`Eliminar ${h.label}`}
                        disabled={busy}
                        onClick={() => setConfirming(h.id)}
                      >
                        Eliminar
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ),
          )}
        </ol>
      )}
    </Card>
  )
}

function HotspotForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: FormValues
  submitLabel: string
  busy: boolean
  onSubmit: (values: FormValues) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(initial.label)
  const [description, setDescription] = useState(initial.description)
  const trimmed = label.trim()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (trimmed) onSubmit({ label: trimmed, description: description.trim() })
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border/60 p-3">
      <Field label="Etiqueta" hint="Máximo 60 caracteres">
        {(id, describedBy) => (
          <Input id={id} aria-describedby={describedBy} value={label} maxLength={60} required autoFocus onChange={(e) => setLabel(e.target.value)} />
        )}
      </Field>
      <Field label="Descripción (opcional)">
        {(id) => <Textarea id={id} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={!trimmed}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

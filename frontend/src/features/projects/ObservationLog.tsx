import { FormEvent, useCallback, useEffect, useState } from 'react'
import { errorMessage } from '@/api/client'
import { Badge, Button, Empty, ErrorState, Field, Input, Loading, Select, Textarea } from '@/components/ui'
import { createObservation, CropCycle, listObservations, Observation, ObservationKind } from './api'
import { fieldErrors, formatDateTime, OBSERVATION_KIND_LABELS } from './labels'

const PAGE_SIZE = 20

interface Props {
  projectId: string
  cycles: CropCycle[]
  canEdit: boolean
}

export function ObservationLog({ projectId, cycles, canEdit }: Props) {
  const [items, setItems] = useState<Observation[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [kind, setKind] = useState<ObservationKind>('note')
  const [content, setContent] = useState('')
  const [cycleId, setCycleId] = useState('')
  const [observedAt, setObservedAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  const fetchPage = useCallback(
    (p: number) => {
      setLoading(true)
      setLoadError(null)
      listObservations(projectId, { page: p, page_size: PAGE_SIZE })
        .then((res) => {
          setItems((prev) => (p === 1 ? res.items : [...prev, ...res.items.filter((o) => !prev.some((x) => x.id === o.id))]))
          setTotal(res.total)
          setPage(p)
        })
        .catch((err) => setLoadError(errorMessage(err, 'No se pudo cargar la bitácora')))
        .finally(() => setLoading(false))
    },
    [projectId],
  )

  useEffect(() => fetchPage(1), [fetchPage])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!content.trim()) {
      setErrors({ content: 'Escribe la observación' })
      return
    }
    setSaving(true)
    setErrors({})
    setSaveError(null)
    try {
      await createObservation(projectId, {
        kind,
        content: content.trim(),
        crop_cycle_id: cycleId || null,
        observed_at: observedAt ? new Date(observedAt).toISOString() : null,
      })
      setContent('')
      setObservedAt('')
      fetchPage(1)
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(fields)
      if (Object.keys(fields).length === 0) setSaveError(errorMessage(err, 'No se pudo guardar la observación'))
    } finally {
      setSaving(false)
    }
  }

  const cycleName = (id: string | null) => cycles.find((c) => c.id === id)?.species_name

  return (
    <div className="space-y-6">
      {canEdit && (
        <form onSubmit={submit} className="space-y-4 glass p-4" noValidate>
          <Field label="Observación" error={errors.content}>
            {(id, d) => (
              <Textarea
                id={id}
                aria-describedby={d}
                aria-invalid={Boolean(errors.content)}
                placeholder="Qué observaste, mediste o decidiste"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tipo" error={errors.kind}>
              {(id) => (
                <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as ObservationKind)}>
                  {(Object.keys(OBSERVATION_KIND_LABELS) as ObservationKind[]).map((k) => (
                    <option key={k} value={k}>
                      {OBSERVATION_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Ciclo (opcional)" error={errors.crop_cycle_id}>
              {(id) => (
                <Select id={id} value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                  <option value="">Todo el proyecto</option>
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.species_name}
                      {c.cultivar_name ? ` ‘${c.cultivar_name}’` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Fecha (opcional)" error={errors.observed_at} hint="Por defecto, ahora.">
              {(id, d) => (
                <Input id={id} aria-describedby={d} type="datetime-local" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} />
              )}
            </Field>
          </div>
          {saveError && (
            <p role="alert" className="text-sm text-danger">
              {saveError}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Guardar en bitácora
            </Button>
          </div>
        </form>
      )}

      {loadError ? (
        <ErrorState message={loadError} onRetry={() => fetchPage(1)} />
      ) : loading && items.length === 0 ? (
        <Loading label="Cargando bitácora…" />
      ) : items.length === 0 ? (
        <Empty
          title="Bitácora vacía"
          description={canEdit ? 'Registra la primera observación con el formulario.' : 'Aún no hay observaciones registradas.'}
        />
      ) : (
        <>
          <ol className="space-y-3" aria-label="Observaciones">
            {items.map((o) => (
              <li key={o.id} className="glass p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone={o.kind === 'incident' ? 'warning' : 'neutral'}>{OBSERVATION_KIND_LABELS[o.kind] ?? o.kind}</Badge>
                  <time dateTime={o.observed_at} className="font-mono">
                    {formatDateTime(o.observed_at)}
                  </time>
                  <span>· {o.author_name}</span>
                  {o.crop_cycle_id && cycleName(o.crop_cycle_id) && (
                    <span>
                      · <em>{cycleName(o.crop_cycle_id)}</em>
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm">{o.content}</p>
              </li>
            ))}
          </ol>
          {items.length < total && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={loading} onClick={() => fetchPage(page + 1)}>
                Cargar más
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

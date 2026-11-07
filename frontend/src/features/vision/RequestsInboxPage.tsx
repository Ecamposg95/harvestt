import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { errorMessage } from '@/api/client'
import { Badge, Button, Card, Empty, ErrorState, Field, Loading, PageHeader, Textarea } from '@/components/ui'
import { useAuth } from '@/store/auth'
import { visionAdminApi, type InboundRequest, type RequestStatus } from './api'

type Filter = RequestStatus | 'all'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'approved', label: 'Aprobadas' },
  { key: 'rejected', label: 'Rechazadas' },
  { key: 'all', label: 'Todas' },
]

const STATUS_LABEL: Record<RequestStatus, string> = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' }

/** Mensaje del primer error 422 (formato propio o FastAPI); si no, el genérico. */
function reviewError(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.status === 422) {
    const data = err.response.data as {
      detail?: { msg?: string }[]
      error?: { details?: { errors?: { msg?: string }[] } }
    }
    const list = data?.error?.details?.errors ?? data?.detail
    const msg = Array.isArray(list) ? list[0]?.msg : undefined
    if (msg) return msg
  }
  return errorMessage(err, 'No se pudo guardar la revisión')
}

function RequestCard({ item, onChanged }: { item: InboundRequest; onChanged: (r: InboundRequest) => void }) {
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const review = async (status: 'approved' | 'rejected', text?: string) => {
    setBusy(true)
    setError(undefined)
    try {
      onChanged(await visionAdminApi.review(item.id, status, text))
    } catch (err) {
      setError(reviewError(err))
      setBusy(false)
    }
  }

  const confirmReject = () => {
    const text = note.trim()
    if (!text) return setNoteError('Escribe el motivo del rechazo.')
    setNoteError(undefined)
    void review('rejected', text)
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={item.kind === 'node' ? 'accent' : 'neutral'}>{item.kind === 'node' ? 'Nodo' : 'Contacto'}</Badge>
        <Badge tone={item.status === 'approved' ? 'lime' : item.status === 'rejected' ? 'danger' : 'warning'}>
          {STATUS_LABEL[item.status]}
        </Badge>
        <span className="text-xs text-muted">{new Date(item.created_at).toLocaleDateString('es-MX')}</span>
      </div>
      <div className="min-w-0">
        <h3 className="break-words text-base font-semibold text-fg">{item.name}</h3>
        <p className="break-words text-sm text-muted">
          {[item.organization, item.email, item.city].filter(Boolean).join(' · ')}
        </p>
      </div>
      <p className="whitespace-pre-line break-words text-sm text-fg">{item.message}</p>
      {item.review_note && <p className="break-words text-xs text-muted">Nota: {item.review_note}</p>}

      {item.status === 'pending' && (
        <div className="space-y-3">
          {rejecting ? (
            <>
              <Field label="Motivo del rechazo" error={noteError}>
                {(id, describedBy) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                )}
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" loading={busy} onClick={confirmReject}>
                  Confirmar rechazo
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={() => void review('approved')}>
                Aprobar
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>
                Rechazar
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

export function RequestsInboxPage() {
  const isSuper = useAuth((s) => s.user?.is_superadmin)
  const [filter, setFilter] = useState<Filter>('pending')
  const [state, setState] = useState<
    { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready'; items: InboundRequest[] }
  >({ phase: 'loading' })

  const load = useCallback(() => {
    setState({ phase: 'loading' })
    visionAdminApi
      .list(filter === 'all' ? undefined : filter)
      .then((items) => setState({ phase: 'ready', items }))
      .catch((err) => setState({ phase: 'error', message: errorMessage(err, 'No se pudieron cargar las solicitudes') }))
  }, [filter])

  useEffect(() => {
    if (isSuper) load()
  }, [isSuper, load])

  if (!isSuper) return <Empty title="Solo superadmin." />

  const changed = (updated: InboundRequest) =>
    setState((s) =>
      s.phase !== 'ready'
        ? s
        : {
            phase: 'ready',
            items:
              filter === 'all'
                ? s.items.map((i) => (i.id === updated.id ? updated : i))
                : s.items.filter((i) => i.id !== updated.id),
          },
    )

  return (
    <>
      <PageHeader
        eyebrow="Visión"
        title="Solicitudes"
        description="Aprobar una solicitud de nodo con ubicación la muestra en el globo público, redondeada a nivel ciudad."
      />
      <div role="group" aria-label="Filtrar por estado" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'primary' : 'secondary'}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      {state.phase === 'loading' && <Loading />}
      {state.phase === 'error' && <ErrorState message={state.message} onRetry={load} />}
      {state.phase === 'ready' &&
        (state.items.length === 0 ? (
          <Empty title="No hay solicitudes en esta vista" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {state.items.map((item) => (
              <RequestCard key={item.id} item={item} onChanged={changed} />
            ))}
          </div>
        ))}
    </>
  )
}

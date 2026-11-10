import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { errorMessage, type ApiErrorBody } from '@/api/client'
import { Badge, Button, Card, Empty, ErrorState, Field, Loading, Select, Textarea } from '@/components/ui'
import { Dialog } from '@/features/catalog/Dialog'
import { DOMAINS, ontologyApi, type ReviewInput, type TermDetail, type TermSummary } from './api'
import { DOMAIN_LABELS, labelOf, MATCH_LABELS, SCHEME_LABELS, STATUS_LABELS, STATUS_TONES } from './labels'

/** La nota de revisión es obligatoria: de 3 a 500 caracteres sin contar espacios de los extremos. */
export const NOTE_MIN = 3
export const NOTE_MAX = 500
const noteOk = (note: string) => note.trim().length >= NOTE_MIN

/** Mensaje de un error de revisión: el del servidor (409 ya revisado / conflicto) o el primero de validación. */
function reviewError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.status === 422) {
    const body = err.response.data as ApiErrorBody | undefined
    const errors = (body?.error?.details as { errors?: { msg?: string }[] } | undefined)?.errors
    if (!(body?.error?.details as { field?: string } | undefined)?.field && errors?.[0]?.msg) return errors[0].msg
  }
  return errorMessage(err, fallback)
}

function NoteField({ value, onChange, label = 'Nota de revisión' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const short = value.length > 0 && !noteOk(value)
  return (
    <Field
      label={label}
      error={short ? `Escribe al menos ${NOTE_MIN} caracteres.` : undefined}
      hint="Obligatoria. Se muestra en la ficha del término."
    >
      {(id, describedBy) => (
        <Textarea
          id={id}
          aria-describedby={describedBy}
          maxLength={NOTE_MAX}
          className="!min-h-20"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

const ACTION_DONE: Record<ReviewInput['action'], (t: TermDetail) => string> = {
  approve: (t) => `Publicado como ${t.hvt_id ?? '—'}${t.published_in_version != null ? ` · versión ${t.published_in_version}` : ''}`,
  request_changes: (t) => `Se pidieron cambios a ${t.proposed_by_name}`,
  reject: () => 'Propuesta rechazada',
}

function ReviewCard({
  term,
  onReviewed,
  onOpen,
}: {
  term: TermDetail
  onReviewed: (t: TermDetail) => void
  onOpen: (t: TermSummary) => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<ReviewInput['action'] | null>(null)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<{ action: ReviewInput['action']; term: TermDetail } | null>(null)

  const act = async (action: ReviewInput['action']) => {
    if (!noteOk(note)) return
    setBusy(action)
    setError(undefined)
    try {
      const updated = await ontologyApi.review(term.id, { action, note: note.trim() })
      setDone({ action, term: updated })
      onReviewed(updated)
    } catch (err) {
      setError(reviewError(err, 'No se pudo guardar la revisión'))
    } finally {
      setBusy(null)
    }
  }

  const disabled = !noteOk(note) || busy !== null
  const shown = done?.term ?? term

  return (
    <Card role="article" aria-label={term.label} className="flex min-w-0 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[shown.status] ?? 'neutral'}>{labelOf(STATUS_LABELS, shown.status)}</Badge>
        <span className="text-xs text-muted">{labelOf(DOMAIN_LABELS, term.domain)}</span>
        {term.unit && <span className="font-mono text-xs text-muted">· {term.unit}</span>}
      </div>
      <div className="min-w-0">
        <h3 className="break-words text-lg font-semibold text-fg">{term.label}</h3>
        <p className="text-xs text-muted">
          Propuesto por {term.proposed_by_name}
          {term.parent && (
            <>
              {' · '}hijo de <span className="text-fg">{term.parent.label}</span>
              {term.parent.hvt_id && <span className="font-mono"> ({term.parent.hvt_id})</span>}
            </>
          )}
        </p>
      </div>
      <p className="whitespace-pre-line break-words text-sm leading-relaxed text-fg">{term.definition}</p>

      {term.aliases.length > 0 && (
        <ul aria-label="Alias" className="flex flex-wrap gap-1.5">
          {term.aliases.map((a) => (
            <li key={a} className="rounded-full border border-border/70 px-2.5 py-0.5 text-xs text-muted">
              {a}
            </li>
          ))}
        </ul>
      )}

      {term.equivalences.length > 0 && (
        <ul aria-label="Equivalencias" className="space-y-1">
          {term.equivalences.map((e) => (
            <li key={`${e.scheme}:${e.external_id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <Badge tone={e.match === 'exact' ? 'accent' : 'neutral'}>{labelOf(MATCH_LABELS, e.match)}</Badge>
              <a
                href={e.url}
                target="_blank"
                rel="noreferrer noopener"
                className="break-all font-mono font-semibold text-accent underline-offset-2 hover:underline"
              >
                {labelOf(SCHEME_LABELS, e.scheme)} {e.external_id}
              </a>
              {e.external_label && <span className="min-w-0 break-words text-muted">{e.external_label}</span>}
            </li>
          ))}
        </ul>
      )}

      {term.review_note && !done && (
        <p className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">Nota anterior: {term.review_note}</p>
      )}

      <div className="mt-auto space-y-3 border-t border-border/60 pt-3">
        {done ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-fg">{ACTION_DONE[done.action](done.term)}</p>
            {done.action === 'approve' && (
              <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => onOpen(done.term)}>
                Ver ficha
              </Button>
            )}
          </div>
        ) : (
          <>
            <NoteField value={note} onChange={setNote} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={disabled} loading={busy === 'approve'} onClick={() => void act('approve')}>
                Aprobar
              </Button>
              <Button
                variant="secondary"
                disabled={disabled}
                loading={busy === 'request_changes'}
                onClick={() => void act('request_changes')}
              >
                Pedir cambios
              </Button>
              <Button variant="danger" disabled={disabled} loading={busy === 'reject'} onClick={() => void act('reject')}>
                Rechazar
              </Button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </Card>
  )
}

type State = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready'; items: TermDetail[] }

/** Bandeja de revisión (superadmin): propuestas nuevas y con cambios pedidos, con la propuesta completa. */
export function ReviewQueue({ onChanged, onOpen }: { onChanged: () => void; onOpen: (t: TermSummary) => void }) {
  const [state, setState] = useState<State>({ phase: 'loading' })

  const load = useCallback(() => {
    let alive = true
    setState({ phase: 'loading' })
    ontologyApi
      .reviewQueue()
      .then((queue) => Promise.all(queue.map((t) => ontologyApi.get(t.id))))
      .then((items) => alive && setState({ phase: 'ready', items }))
      .catch((err) => alive && setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar la bandeja') }))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => load(), [load])

  if (state.phase === 'loading') return <Loading label="Cargando bandeja de revisión…" />
  if (state.phase === 'error') return <ErrorState message={state.message} onRetry={load} />
  if (state.items.length === 0)
    return <Empty title="Bandeja al día" description="No hay propuestas pendientes de revisión." />

  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted">
        {state.items.length === 1 ? '1 propuesta pendiente' : `${state.items.length} propuestas pendientes`}. Aprobar
        asigna el siguiente ID HVT y sube la versión de la ontología.
      </p>
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        {state.items.map((t) => (
          <ReviewCard key={t.id} term={t} onReviewed={onChanged} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

/** Marca un término publicado como obsoleto, con reemplazo (otro publicado) y nota. Solo superadmin. */
export function ObsoleteDialog({
  term,
  onClose,
  onDone,
}: {
  term: TermDetail
  onClose: () => void
  onDone: (t: TermDetail) => void
}) {
  const [candidates, setCandidates] = useState<TermSummary[] | null>(null)
  const [replacement, setReplacement] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ field?: 'replaced_by_id'; message: string }>()

  useEffect(() => {
    let alive = true
    ontologyApi
      .list({ status: 'published' })
      .then((items) => alive && setCandidates(items.filter((t) => t.id !== term.id)))
      .catch((err) => alive && (setCandidates([]), setError({ message: errorMessage(err, 'No se pudieron cargar los términos') })))
    return () => {
      alive = false
    }
  }, [term.id])

  // El mismo dominio primero; dentro de cada grupo, orden alfabético.
  const groups = useMemo(() => {
    const order = [term.domain, ...DOMAINS.filter((d) => d !== term.domain)]
    const collator = new Intl.Collator('es')
    return order
      .map((d) => ({
        domain: d,
        items: (candidates ?? []).filter((t) => t.domain === d).sort((a, b) => collator.compare(a.label, b.label)),
      }))
      .filter((g) => g.items.length > 0)
  }, [candidates, term.domain])

  const submit = async () => {
    if (!replacement || !noteOk(note)) return
    setBusy(true)
    setError(undefined)
    try {
      onDone(await ontologyApi.obsolete(term.id, { replaced_by_id: replacement, note: note.trim() }))
    } catch (err) {
      const body = axios.isAxiosError(err) ? (err.response?.data as ApiErrorBody | undefined) : undefined
      const field = (body?.error?.details as { field?: string } | undefined)?.field
      setError({
        field: field === 'replaced_by_id' ? 'replaced_by_id' : undefined,
        message: reviewError(err, 'No se pudo marcar como obsoleto'),
      })
      setBusy(false)
    }
  }

  return (
    <Dialog title="Marcar obsoleto" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          <span className="font-semibold text-fg">{term.label}</span>
          {term.hvt_id && <span className="font-mono"> ({term.hvt_id})</span>} conserva su ID, pero se marca como
          obsoleto y apunta a su reemplazo. Sube la versión de la ontología.
        </p>
        <Field
          label="Reemplazado por"
          error={error?.field === 'replaced_by_id' ? error.message : undefined}
          hint="Otro término publicado."
        >
          {(id, describedBy) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              aria-invalid={error?.field === 'replaced_by_id' ? true : undefined}
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            >
              <option value="">{candidates === null ? 'Cargando…' : 'Elige el reemplazo'}</option>
              {groups.map((g) => (
                <optgroup key={g.domain} label={labelOf(DOMAIN_LABELS, g.domain)}>
                  {g.items.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                      {t.hvt_id ? ` · ${t.hvt_id}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          )}
        </Field>
        <NoteField label="Nota" value={note} onChange={setNote} />
        {error && !error.field && (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" loading={busy} disabled={!replacement || !noteOk(note)} onClick={() => void submit()}>
            Marcar obsoleto
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

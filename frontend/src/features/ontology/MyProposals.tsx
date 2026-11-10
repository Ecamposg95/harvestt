import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '@/api/client'
import { Badge, Button, Card, cx, Empty, ErrorState, Loading } from '@/components/ui'
import { ontologyApi, type Domain, type TermDetail, type TermSummary } from './api'
import { DOMAIN_LABELS, labelOf, STATUS_LABELS, STATUS_TONES } from './labels'
import { ProposeTermDialog } from './ProposeTermDialog'

/** Primero lo que pide acción (cambios pedidos), luego lo pendiente y al final lo resuelto. */
const STATUS_ORDER: Record<string, number> = { in_review: 0, proposed: 1, rejected: 2, published: 3, obsolete: 4 }
const EDITABLE = new Set(['proposed', 'in_review'])

const NOTE_TITLE: Record<string, string> = {
  in_review: 'Cambios pedidos',
  rejected: 'Razón del rechazo',
  published: 'Nota de la revisión',
  obsolete: 'Nota de la revisión',
}

type State = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready'; items: TermDetail[] }

function ProposalCard({
  term,
  onEdit,
  onOpen,
}: {
  term: TermDetail
  onEdit: (t: TermDetail) => void
  onOpen: (t: TermSummary) => void
}) {
  const note = term.review_note && term.status !== 'proposed' ? term.review_note : null
  return (
    <Card role="article" aria-label={term.label} className="flex min-w-0 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[term.status] ?? 'neutral'}>{labelOf(STATUS_LABELS, term.status)}</Badge>
        <span className="text-xs text-muted">{labelOf(DOMAIN_LABELS, term.domain)}</span>
        {term.hvt_id && <span className="ml-auto font-mono text-xs font-semibold text-fg">{term.hvt_id}</span>}
      </div>
      <h3 className="break-words text-base font-semibold text-fg">{term.label}</h3>
      <p className="line-clamp-3 break-words text-sm text-muted">{term.definition}</p>
      {note && (
        <p
          className={cx(
            'rounded-xl px-3 py-2 text-xs',
            term.status === 'in_review' ? 'bg-warning/10 text-warning' : term.status === 'rejected' ? 'bg-danger/10 text-danger' : 'bg-fg/5 text-muted',
          )}
        >
          <span className="font-semibold">{NOTE_TITLE[term.status] ?? 'Nota'}:</span> {note}
        </p>
      )}
      {term.status === 'proposed' && <p className="text-xs text-muted">Esperando revisión.</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {EDITABLE.has(term.status) && (
          <Button className="!px-4 !py-1.5 text-xs" onClick={() => onEdit(term)}>
            Editar
          </Button>
        )}
        <Button variant="secondary" className="!px-4 !py-1.5 text-xs" onClick={() => onOpen(term)}>
          Ver ficha
        </Button>
      </div>
    </Card>
  )
}

/** «Mis propuestas»: todo lo que la persona propuso, con estado y razón de la revisión. */
export function MyProposals({
  onOpen,
  onPropose,
  onChanged,
}: {
  onOpen: (t: TermSummary) => void
  onPropose: () => void
  onChanged: () => void
}) {
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [editing, setEditing] = useState<TermDetail | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const load = useCallback((quiet = false) => {
    let alive = true
    if (!quiet) setState({ phase: 'loading' })
    ontologyApi
      .list({ mine: true })
      .then((mine) => Promise.all(mine.map((t) => ontologyApi.get(t.id))))
      .then((items) => {
        if (!alive) return
        items.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
        setState({ phase: 'ready', items })
      })
      .catch((err) => alive && setState({ phase: 'error', message: errorMessage(err, 'No se pudieron cargar tus propuestas') }))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => load(), [load])

  const done = (t: TermDetail) => {
    setEditing(null)
    setSaved(`Guardaste «${t.label}»; volvió a la bandeja de revisión.`)
    load(true)
    onChanged()
  }

  return (
    <div className="min-w-0 space-y-4">
      {saved && (
        <p role="status" className="rounded-2xl bg-accent/10 px-4 py-3 text-sm text-fg">
          {saved}
        </p>
      )}
      {state.phase === 'loading' && <Loading label="Cargando tus propuestas…" />}
      {state.phase === 'error' && <ErrorState message={state.message} onRetry={() => load()} />}
      {state.phase === 'ready' &&
        (state.items.length === 0 ? (
          <Empty
            title="Aún no has propuesto términos"
            description="¿Falta un término en la ontología? Propónlo: al publicarse recibe un ID HVT y tu nombre como autor."
            action={<Button onClick={onPropose}>Proponer término</Button>}
          />
        ) : (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {state.items.map((t) => (
              <ProposalCard key={t.id} term={t} onEdit={setEditing} onOpen={onOpen} />
            ))}
          </div>
        ))}
      {editing && (
        <ProposeTermDialog
          initialDomain={editing.domain as Domain}
          term={editing}
          onDone={done}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

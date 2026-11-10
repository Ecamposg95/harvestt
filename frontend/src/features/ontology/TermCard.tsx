import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { Badge, ErrorState, Loading } from '@/components/ui'
import { ontologyApi, type TermDetail, type TermSummary, type TermUsage } from './api'
import { DOMAIN_LABELS, labelOf, MATCH_LABELS, SCHEME_LABELS, STATUS_LABELS, STATUS_TONES } from './labels'
import { TermNeighbors } from './TermNeighbors'

/** Enlace interno a la ficha de un término: por su ID HVT si lo tiene, si no por su id interno. */
export function termHref(t: Pick<TermSummary, 'id' | 'hvt_id'>): string {
  return `/app/ontologia?term=${t.hvt_id ?? t.id}`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function usageText(u: TermUsage): string {
  if (u.species + u.assertions + u.projects + u.cycles === 0) return 'Aún sin datos enlazados'
  return `Usado en: ${plural(u.species, 'especie', 'especies')} · ${plural(u.assertions, 'afirmación', 'afirmaciones')} · ${plural(
    u.projects,
    'proyecto',
    'proyectos',
  )} · ${plural(u.cycles, 'ciclo', 'ciclos')}`
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; term: TermDetail; usage: TermUsage | null }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="eyebrow mb-2">{title}</h3>
      {children}
    </section>
  )
}

export function TermCard({ termId, onOpen }: { termId: string; onOpen: (t: TermSummary) => void }) {
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setState({ phase: 'loading' })
    ontologyApi
      .get(termId)
      .then(async (term) => {
        // El uso solo existe para términos publicados u obsoletos; si falla, la ficha sigue.
        const usage =
          term.status === 'published' || term.status === 'obsolete'
            ? await ontologyApi.usage(term.id).catch(() => null)
            : null
        if (alive) setState({ phase: 'ready', term, usage })
      })
      .catch((err) => alive && setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar el término') }))
    return () => {
      alive = false
    }
  }, [termId, attempt])

  return (
    <section aria-label="Ficha del término" className="glass min-w-0 p-5 sm:p-7">
      {state.phase === 'loading' && <Loading label="Cargando término…" />}
      {state.phase === 'error' && <ErrorState message={state.message} onRetry={() => setAttempt((a) => a + 1)} />}
      {state.phase === 'ready' && <TermBody term={state.term} usage={state.usage} onOpen={onOpen} />}
    </section>
  )
}

function TermBody({ term, usage, onOpen }: { term: TermDetail; usage: TermUsage | null; onOpen: (t: TermSummary) => void }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-fg/5 px-3 py-1 font-mono text-xs font-semibold text-fg">
          {term.hvt_id ?? 'Sin ID: propuesta'}
        </span>
        <Badge tone={STATUS_TONES[term.status] ?? 'neutral'}>{labelOf(STATUS_LABELS, term.status)}</Badge>
        <span className="text-xs text-muted">{labelOf(DOMAIN_LABELS, term.domain)}</span>
      </div>
      <h2 className="display mt-3 break-words text-2xl sm:text-3xl">{term.label}</h2>
      {term.unit && (
        <p className="mt-1 text-sm text-muted">
          Unidad: <span className="font-mono text-fg">{term.unit}</span>
        </p>
      )}

      {term.status === 'obsolete' && (
        <p role="note" className="mt-4 rounded-2xl bg-warning/10 px-4 py-3 text-sm text-warning">
          Obsoleto · reemplazado por{' '}
          {term.replaced_by ? (
            <Link to={termHref(term.replaced_by)} className="font-semibold underline underline-offset-2">
              {term.replaced_by.label}
            </Link>
          ) : (
            '—'
          )}
        </p>
      )}

      <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-fg">{term.definition}</p>

      {term.aliases.length > 0 && (
        <Section title="Alias">
          <ul className="flex flex-wrap gap-1.5">
            {term.aliases.map((a) => (
              <li key={a} className="rounded-full border border-border/70 px-2.5 py-0.5 text-xs text-muted">
                {a}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Uso">
        <p className="text-sm text-fg">{usage ? usageText(usage) : 'Aún sin datos enlazados'}</p>
      </Section>

      <Section title="Vecindario">
        <TermNeighbors term={term} onOpen={onOpen} />
      </Section>

      <Section title="Equivalencias">
        {term.equivalences.length === 0 ? (
          <p className="text-sm text-muted">Sin equivalencias verificadas en otras ontologías.</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Equivalencias" className="w-full min-w-0 text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.08em] text-muted">
                  <th className="pb-2 pr-3 font-semibold">Esquema</th>
                  <th className="pb-2 pr-3 font-semibold">Identificador</th>
                  <th className="pb-2 font-semibold">Correspondencia</th>
                </tr>
              </thead>
              <tbody>
                {term.equivalences.map((e) => (
                  <tr key={`${e.scheme}:${e.external_id}`} className="border-t border-border/60 align-top">
                    <td className="py-2 pr-3 text-fg">{labelOf(SCHEME_LABELS, e.scheme)}</td>
                    <td className="py-2 pr-3">
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="break-all font-mono text-xs font-semibold text-accent underline-offset-2 hover:underline"
                      >
                        {e.external_id}
                      </a>
                      {e.external_label && <span className="block text-xs text-muted">{e.external_label}</span>}
                    </td>
                    <td className="py-2">
                      <Badge tone={e.match === 'exact' ? 'accent' : 'neutral'}>{labelOf(MATCH_LABELS, e.match)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Autoría y revisión">
        <p className="text-sm text-fg">Propuesto por {term.proposed_by_name}</p>
        {term.review_note && <p className="mt-1 text-sm text-muted">Razón de la revisión: {term.review_note}</p>}
        {term.published_in_version != null && (
          <p className="mt-1 text-xs text-muted">
            Publicado en la versión {term.published_in_version}
            {term.obsoleted_in_version != null && ` · obsoleto desde la versión ${term.obsoleted_in_version}`}
          </p>
        )}
      </Section>

      {term.hvt_id && (
        <div className="mt-6">
          <Link
            to={`/app/graph?focus=term:${term.hvt_id}`}
            className="inline-flex rounded-full bg-ink px-4 py-2 text-xs font-semibold text-ink-fg"
          >
            Ver en el grafo
          </Link>
        </div>
      )}
    </>
  )
}

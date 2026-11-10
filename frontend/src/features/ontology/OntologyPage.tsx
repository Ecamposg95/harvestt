import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { Button, cx, Empty, ErrorState, Input, Loading, PageHeader } from '@/components/ui'
import { useAuth } from '@/store/auth'
import { DOMAINS, EXPORT_JSON_URL, EXPORT_TURTLE_URL, ontologyApi, type Domain, type TermDetail, type TermSummary } from './api'
import { DOMAIN_LABELS } from './labels'
import { MyProposals } from './MyProposals'
import { ProposeTermDialog } from './ProposeTermDialog'
import { ReviewQueue } from './ReviewQueue'
import { TermCard } from './TermCard'
import { TermRow, TermTree } from './TermTree'
import { buildTree } from './tree'

const DEBOUNCE_MS = 250

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; terms: TermSummary[]; version: number | null }

type Search = { q: string; results: TermSummary[] | null; error: string | null }

type View = 'explorar' | 'propuestas' | 'revision'
const VIEWS: { key: View; label: string; superOnly?: boolean }[] = [
  { key: 'explorar', label: 'Explorar' },
  { key: 'propuestas', label: 'Mis propuestas' },
  { key: 'revision', label: 'Revisión', superOnly: true },
]

/** Términos y versión vigente (la mayor de las publicaciones). */
async function fetchOntology(): Promise<{ terms: TermSummary[]; version: number | null }> {
  const [terms, releases] = await Promise.all([ontologyApi.list(), ontologyApi.releases().catch(() => [])])
  const version = releases.length ? Math.max(...releases.map((r) => r.version)) : null
  return { terms, version }
}

function isPublic(t: TermSummary): boolean {
  return t.status === 'published' || t.status === 'obsolete'
}

function isDomain(d: string): d is Domain {
  return (DOMAINS as readonly string[]).includes(d)
}

export default function OntologyPage() {
  const [params, setParams] = useSearchParams()
  const termParam = params.get('term')
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [domain, setDomain] = useState<Domain>('organism')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<Search>({ q: '', results: null, error: null })
  const cardRef = useRef<HTMLDivElement>(null)
  const isSuper = useAuth((s) => !!s.user?.is_superadmin)
  const [proposing, setProposing] = useState<{ domain: Domain; parent: TermSummary | null } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const viewParam = params.get('vista')
  const view: View = viewParam === 'propuestas' || (viewParam === 'revision' && isSuper) ? viewParam : 'explorar'

  useEffect(() => {
    let alive = true
    setState({ phase: 'loading' })
    fetchOntology()
      .then((data) => alive && setState({ phase: 'ready', ...data }))
      .catch((err) => alive && setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar la ontología') }))
    return () => {
      alive = false
    }
  }, [attempt])

  // Refresco silencioso tras proponer, aprobar u obsoletar: árbol y «Versión N» sin desmontar la vista.
  const refresh = useCallback(() => {
    fetchOntology()
      .then((data) => setState({ phase: 'ready', ...data }))
      .catch(() => undefined)
  }, [])

  const setView = useCallback(
    (v: View) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (v === 'explorar') next.delete('vista')
        else next.set('vista', v)
        return next
      }),
    [setParams],
  )

  // Búsqueda con debounce: el servidor compara contra etiqueta y alias normalizados.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setSearch({ q: '', results: null, error: null })
      return
    }
    let alive = true
    const timer = setTimeout(() => {
      ontologyApi
        .list({ q })
        .then((all) => alive && setSearch({ q, results: all.filter(isPublic), error: null }))
        .catch((err) => alive && setSearch({ q, results: [], error: errorMessage(err, 'No se pudo buscar') }))
    }, DEBOUNCE_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query])

  const terms = state.phase === 'ready' ? state.terms : null
  // Explorar muestra solo el vocabulario vigente; las propuestas viven en «Mis propuestas» y «Revisión».
  const explorable = useMemo(() => (terms ? terms.filter(isPublic) : null), [terms])
  const tree = useMemo(() => (explorable ? buildTree(explorable) : null), [explorable])
  const counts = useMemo(() => {
    const out = Object.fromEntries(DOMAINS.map((d) => [d, 0])) as Record<Domain, number>
    for (const t of explorable ?? []) if (isDomain(t.domain)) out[t.domain] += 1
    return out
  }, [explorable])

  // ?term= acepta el ID HVT (lo permanente) o, para propuestas sin ID, el id interno.
  const selected = useMemo(
    () => (termParam && terms ? terms.find((t) => t.hvt_id === termParam || t.id === termParam) ?? null : null),
    [termParam, terms],
  )

  // La pestaña sigue al término abierto.
  useEffect(() => {
    if (selected && isDomain(selected.domain)) setDomain(selected.domain)
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback(
    (t: TermSummary) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('term', t.hvt_id ?? t.id)
        next.delete('vista')
        return next
      })
      // En pantallas angostas la ficha queda debajo del árbol: la traemos a la vista.
      const narrow = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches
      if (narrow) requestAnimationFrame(() => cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
    },
    [setParams],
  )

  const version = state.phase === 'ready' ? state.version : null

  const proposed = (t: TermDetail) => {
    setProposing(null)
    setNotice(`Propuesta enviada: «${t.label}». Un superadministrador la revisará; síguela aquí, en «Mis propuestas».`)
    refresh()
    setView('propuestas')
  }

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow="Vocabulario controlado"
        title="Ontología HarvestT"
        description="Términos con ID permanente HVT, jerarquía por dominio y equivalencias verificadas con ontologías abiertas. Licencia CC-BY 4.0."
        actions={
          <>
            <Button className="!px-4 !py-2 text-xs" onClick={() => setProposing({ domain, parent: null })}>
              Proponer término
            </Button>
            {version != null && (
              <span className="inline-flex items-center rounded-full bg-lime px-4 py-2 text-xs font-bold text-ink">
                Versión {version}
              </span>
            )}
            <a
              href={EXPORT_TURTLE_URL}
              target="_blank"
              rel="noreferrer"
              className="glass inline-flex items-center !rounded-full px-4 py-2 text-xs font-semibold text-fg hover:bg-surface/80"
            >
              Exportar Turtle
            </a>
            <a
              href={EXPORT_JSON_URL}
              target="_blank"
              rel="noreferrer"
              className="glass inline-flex items-center !rounded-full px-4 py-2 text-xs font-semibold text-fg hover:bg-surface/80"
            >
              Exportar JSON
            </a>
          </>
        }
      />

      <div
        role="tablist"
        aria-label="Secciones de la ontología"
        className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-full bg-fg/5 p-1 sm:inline-flex"
      >
        {VIEWS.filter((v) => !v.superOnly || isSuper).map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            onClick={() => setView(v.key)}
            className={cx(
              'shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors',
              view === v.key ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {notice && (
        <div role="status" className="mb-5 flex items-start justify-between gap-3 rounded-2xl bg-accent/10 px-4 py-3 text-sm text-fg">
          <p className="min-w-0 break-words">{notice}</p>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setNotice(null)}
            className="shrink-0 rounded-md px-1.5 text-lg leading-none text-muted hover:text-fg"
          >
            ×
          </button>
        </div>
      )}

      {proposing && (
        <ProposeTermDialog
          initialDomain={proposing.domain}
          parent={proposing.parent}
          onDone={proposed}
          onClose={() => setProposing(null)}
        />
      )}

      {view === 'propuestas' && (
        <MyProposals onOpen={open} onPropose={() => setProposing({ domain, parent: null })} onChanged={refresh} />
      )}
      {view === 'revision' && <ReviewQueue onOpen={open} onChanged={refresh} />}

      {view === 'explorar' && state.phase === 'loading' && <Loading label="Cargando ontología…" />}
      {view === 'explorar' && state.phase === 'error' && (
        <ErrorState message={state.message} onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {view === 'explorar' && state.phase === 'ready' && tree && (
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="glass flex min-w-0 flex-col p-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start">
            <Input
              type="search"
              aria-label="Buscar término"
              placeholder="Buscar por nombre o alias…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            {search.results === null ? (
              <>
                <div role="tablist" aria-label="Dominios" className="-mx-1 mt-4 flex flex-wrap gap-1.5 px-1">
                  {DOMAINS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="tab"
                      id={`tab-${d}`}
                      aria-selected={d === domain}
                      aria-controls="ontology-domain-panel"
                      onClick={() => setDomain(d)}
                      className={cx(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                        d === domain ? 'bg-ink text-ink-fg' : 'bg-fg/5 text-muted hover:text-fg',
                      )}
                    >
                      {DOMAIN_LABELS[d]}
                      <span className={cx('text-[10px]', d === domain ? 'text-ink-fg/70' : 'text-muted/80')}>{counts[d]}</span>
                    </button>
                  ))}
                </div>
                <div
                  role="tabpanel"
                  id="ontology-domain-panel"
                  aria-labelledby={`tab-${domain}`}
                  className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1"
                >
                  <TermTree
                    nodes={tree[domain]}
                    label={`Términos de ${DOMAIN_LABELS[domain]}`}
                    selectedId={selected?.id ?? null}
                    onSelect={open}
                  />
                </div>
              </>
            ) : (
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                <p className="eyebrow mb-2" aria-live="polite">
                  {search.results.length === 1 ? '1 resultado' : `${search.results.length} resultados`} para «{search.q}»
                </p>
                {search.error && <p className="mb-2 text-sm text-danger">{search.error}</p>}
                {search.results.length === 0 && !search.error ? (
                  <p className="py-4 text-sm text-muted">Ningún término coincide. Prueba con un alias o sin acentos.</p>
                ) : (
                  <ul aria-label="Resultados de búsqueda" className="space-y-0.5">
                    {search.results.map((t) => (
                      <li key={t.id}>
                        <TermRow
                          term={t}
                          selected={t.id === selected?.id}
                          onSelect={open}
                          showDomain={isDomain(t.domain) ? DOMAIN_LABELS[t.domain] : t.domain}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div ref={cardRef} className="min-w-0 scroll-mt-4">
            {selected ? (
              <TermCard
                key={selected.id}
                termId={selected.id}
                onOpen={open}
                onProposeChild={(t) => isDomain(t.domain) && setProposing({ domain: t.domain, parent: t })}
                onChanged={refresh}
              />
            ) : termParam ? (
              <Empty title="No encontramos ese término" description={`«${termParam}» no existe o no tienes acceso a él.`} />
            ) : (
              <Empty
                title="Elige un término"
                description={`Explora ${explorable?.length ?? 0} términos por dominio o búscalos por nombre. Cada ficha muestra su ID permanente, sus equivalencias y dónde se usa.`}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

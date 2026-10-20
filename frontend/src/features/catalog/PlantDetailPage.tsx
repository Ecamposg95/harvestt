import { ReactNode, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import { Button, Card, Empty, ErrorState, Forbidden, Loading, OriginBadge } from '@/components/ui'
import { useHasRole } from '@/store/auth'
import { ExternalId, getPlant, Source, SpeciesDetail, TraitAssertion } from './api'
import { AddToProjectDialog } from './AddToProjectDialog'
import {
  CONTEXT_LABELS,
  formatDate,
  label,
  LANG_LABELS,
  REVIEW_LABELS,
  UNIT_LABELS,
  VARIABLE_LABELS,
} from './labels'
import { ScientificName } from './ScientificName'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; code?: number }
  | { status: 'ready'; data: SpeciesDetail }

const EXTERNAL_LABELS: Record<string, string> = { gbif: 'GBIF' }

function formatValue(a: TraitAssertion): string | null {
  const { value_min: min, value_max: max } = a
  if (min == null && max == null) return null
  const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 })
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`
  return min != null ? `≥ ${fmt(min)}` : `≤ ${fmt(max as number)}`
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-xs uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  )
}

function SourceLine({ source }: { source: Source }) {
  return (
    <div className="text-sm">
      <p className="font-medium">
        {source.url ? (
          <a href={source.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
            {source.title}
          </a>
        ) : (
          source.title
        )}
      </p>
      <p className="text-xs text-muted">
        {[source.publisher, source.license && `Licencia ${source.license}`, source.accessed_at && `Consultado ${formatDate(source.accessed_at)}`]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  )
}

export function PlantDetailPage() {
  const { id = '' } = useParams()
  const canEdit = useHasRole('editor')
  const [state, setState] = useState<State>({ status: 'loading' })
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    getPlant(id)
      .then((data) => setState({ status: 'ready', data }))
      .catch((err) =>
        setState({ status: 'error', message: errorMessage(err, 'No se pudo cargar la ficha'), code: errorStatus(err) }),
      )
  }, [id])

  useEffect(load, [load])

  const back = (
    <Link to="/app/plants" className="mb-4 inline-block text-sm text-muted hover:text-fg">
      ← Explorador vegetal
    </Link>
  )

  if (state.status === 'loading') return <>{back}<Loading label="Cargando ficha…" /></>
  if (state.status === 'error') {
    return (
      <>
        {back}
        {state.code === 404 ? (
          <Empty title="Especie no encontrada" description="Puede que el enlace sea incorrecto o que la especie ya no esté en el catálogo." />
        ) : state.code === 403 ? (
          <Forbidden />
        ) : (
          <ErrorState message={state.message} onRetry={load} />
        )}
      </>
    )
  }

  const s = state.data
  const sourcesById = Object.fromEntries(s.sources.map((src) => [src.id, src]))
  const externalIds = Object.entries(s.external_ids ?? {})
  const langs = Array.from(new Set(s.common_names.map((n) => n.lang)))

  return (
    <>
      {back}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            <ScientificName name={s.scientific_name} authorship={s.authorship} />
          </h1>
          <p className="mt-1 text-sm text-muted">
            {s.common_names.filter((n) => n.lang === 'es').map((n) => n.name).join(', ') || 'Sin nombre común registrado'}
            {s.family && <> · Familia {s.family}</>}
          </p>
        </div>
        {canEdit && <Button onClick={() => setAdding(true)}>Añadir a proyecto</Button>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-6 p-5 lg:col-span-1">
          <Section title="Identidad">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted">Familia</dt>
                <dd>{s.family ?? 'Desconocida'}</dd>
              </div>
              {langs.map((lang) => (
                <div key={lang}>
                  <dt className="text-xs text-muted">Nombres comunes · {label(LANG_LABELS, lang)}</dt>
                  <dd lang={lang}>
                    {s.common_names.filter((n) => n.lang === lang).map((n) => n.name).join(', ')}
                  </dd>
                </div>
              ))}
            </dl>
            {s.summary && <p className="text-sm">{s.summary}</p>}
          </Section>

          <Section title="Identificadores externos">
            {externalIds.length === 0 ? (
              <p className="text-sm text-muted">Sin identificadores verificados.</p>
            ) : (
              <ul className="space-y-3">
                {externalIds.map(([key, raw]) => {
                  const ext: ExternalId = typeof raw === 'string' ? { id: raw } : raw
                  const src = ext.source_id ? sourcesById[ext.source_id] : undefined
                  return (
                    <li key={key} className="text-sm">
                      <p>
                        <span className="font-mono text-xs text-muted">{EXTERNAL_LABELS[key] ?? key}</span>{' '}
                        {ext.url ? (
                          <a href={ext.url} target="_blank" rel="noreferrer noopener" className="font-mono text-accent hover:underline">
                            {ext.id}
                          </a>
                        ) : (
                          <span className="font-mono">{ext.id}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {[
                          src && `Fuente: ${src.title}`,
                          ext.match_type && `Coincidencia ${ext.match_type.toLowerCase()}`,
                          ext.verified_at && `Verificado ${formatDate(ext.verified_at)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          <Section title="Variedades">
            {s.cultivars.length === 0 ? (
              <p className="text-sm text-muted">Sin variedades registradas.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {s.cultivars.map((c) => (
                  <li key={c.id}>
                    ‘{c.name}’{c.provenance && <span className="text-muted"> · {c.provenance}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <Section title="Afirmaciones y evidencia">
              <p className="text-xs text-muted">
                Los valores sin evidencia trazable se muestran como «Desconocido». No se usan cifras supuestas.
              </p>
              {s.trait_assertions.length === 0 ? (
                <p className="text-sm text-muted">Sin afirmaciones registradas.</p>
              ) : (
                <div className="-mx-5 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border font-mono text-[11px] uppercase tracking-wider text-muted">
                        <th scope="col" className="px-5 py-2 font-normal">Variable</th>
                        <th scope="col" className="px-2 py-2 font-normal">Valor</th>
                        <th scope="col" className="px-2 py-2 font-normal">Contexto</th>
                        <th scope="col" className="px-2 py-2 font-normal">Origen</th>
                        <th scope="col" className="px-2 py-2 font-normal">Revisión</th>
                        <th scope="col" className="px-5 py-2 font-normal">Fuentes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.trait_assertions.map((a) => {
                        const value = formatValue(a)
                        return (
                          <tr key={a.id} className="border-b border-border/60 align-top last:border-0">
                            <td className="px-5 py-3 font-medium">{label(VARIABLE_LABELS, a.variable)}</td>
                            <td className="px-2 py-3">
                              {value ? (
                                <span className="font-mono">
                                  {value} {a.unit && label(UNIT_LABELS, a.unit)}
                                </span>
                              ) : (
                                <span className="italic text-muted">Desconocido</span>
                              )}
                            </td>
                            <td className="px-2 py-3 text-xs text-muted">
                              Etapa: {label(CONTEXT_LABELS, a.growth_stage)}
                              <br />
                              Sistema: {label(CONTEXT_LABELS, a.cultivation_system)}
                            </td>
                            <td className="px-2 py-3">
                              <OriginBadge origin={a.origin} />
                            </td>
                            <td className="px-2 py-3 text-xs">{label(REVIEW_LABELS, a.review_status)}</td>
                            <td className="px-5 py-3 text-xs">
                              {a.sources.length === 0 ? (
                                <span className="text-muted">Ninguna</span>
                              ) : (
                                a.sources.map((src) => <div key={src.id}>{src.title}</div>)
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </Card>

          <Card className="p-5">
            <Section title="Fuentes">
              {s.sources.length === 0 ? (
                <p className="text-sm text-muted">Sin fuentes vinculadas.</p>
              ) : (
                <ul className="space-y-3">
                  {s.sources.map((src) => (
                    <li key={src.id}>
                      <SourceLine source={src} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </Card>
        </div>
      </div>

      {adding && <AddToProjectDialog species={s} onClose={() => setAdding(false)} />}
    </>
  )
}

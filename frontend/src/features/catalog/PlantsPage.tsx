import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import { Badge, Button, Card, Empty, ErrorState, Forbidden, Input, Loading, PageHeader, Select } from '@/components/ui'
import { listFamilies, listPlants, Page, SpeciesSummary } from './api'
import { namesFor } from './labels'
import { Pagination } from './Pagination'
import { PlantThumb } from './PlantThumb'
import { ScientificName } from './ScientificName'

const PAGE_SIZE = 24

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; forbidden: boolean }
  | { status: 'ready'; data: Page<SpeciesSummary> }

export function PlantsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const family = params.get('family') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [draft, setDraft] = useState(q)
  const [families, setFamilies] = useState<string[]>([])
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => setDraft(q), [q])

  useEffect(() => {
    listFamilies()
      .then(setFamilies)
      .catch(() => setFamilies([]))
  }, [])

  const load = useCallback(() => {
    setState({ status: 'loading' })
    listPlants({ q: q || undefined, family: family || undefined, page, page_size: PAGE_SIZE })
      .then((data) => setState({ status: 'ready', data }))
      .catch((err) =>
        setState({
          status: 'error',
          message: errorMessage(err, 'No se pudo cargar el catálogo'),
          forbidden: errorStatus(err) === 403,
        }),
      )
  }, [q, family, page])

  useEffect(load, [load])

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    update({ q: draft.trim() })
  }

  const hasFilters = Boolean(q || family)

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Explorador vegetal"
        description="Especies del catálogo global con identidad taxonómica trazable y evidencia con procedencia."
      />

      <form onSubmit={submit} role="search" className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="plant-q" className="mb-1.5 block text-sm font-medium">
            Buscar
          </label>
          <Input
            id="plant-q"
            type="search"
            placeholder="Nombre científico o común (p. ej. lechuga, Solanum)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <div className="sm:w-56">
          <label htmlFor="plant-family" className="mb-1.5 block text-sm font-medium">
            Familia
          </label>
          <Select id="plant-family" value={family} onChange={(e) => update({ family: e.target.value })}>
            <option value="">Todas</option>
            {families.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            {family && !families.includes(family) && <option value={family}>{family}</option>}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit">Buscar</Button>
          {hasFilters && (
            <Button type="button" variant="ghost" onClick={() => setParams(new URLSearchParams())}>
              Limpiar
            </Button>
          )}
        </div>
      </form>

      {state.status === 'loading' && <Loading label="Cargando especies…" />}
      {state.status === 'error' &&
        (state.forbidden ? <Forbidden /> : <ErrorState message={state.message} onRetry={load} />)}
      {state.status === 'ready' && (
        <>
          <p className="mb-3 font-mono text-xs text-muted" aria-live="polite">
            {state.data.total} {state.data.total === 1 ? 'especie' : 'especies'}
          </p>
          {state.data.items.length === 0 ? (
            <Empty
              title={hasFilters ? 'Sin coincidencias' : 'Catálogo vacío'}
              description={
                hasFilters
                  ? 'Prueba con otro nombre o quita el filtro de familia.'
                  : 'Aún no hay especies cargadas en el catálogo.'
              }
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {state.data.items.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/app/plants/${s.id}`}
                    className="block h-full rounded-lg focus-visible:outline-offset-4"
                  >
                    <Card className="flex h-full flex-col gap-3 p-5 transition-transform hover:-translate-y-0.5">
                      <PlantThumb speciesId={s.id} scientificName={s.scientific_name} />
                      <h2 className="text-base font-medium">
                        <ScientificName name={s.scientific_name} authorship={s.authorship} />
                      </h2>
                      <div className="space-y-0.5 text-sm text-muted">
                        {namesFor(s.common_names, 'es').length > 0 && (
                          <p>{namesFor(s.common_names, 'es').join(', ')}</p>
                        )}
                        {namesFor(s.common_names, 'en').length > 0 && (
                          <p lang="en" className="text-xs">
                            {namesFor(s.common_names, 'en').join(', ')}
                          </p>
                        )}
                      </div>
                      {s.family && (
                        <div className="mt-auto">
                          <Badge>{s.family}</Badge>
                        </div>
                      )}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={state.data.page}
            pageSize={state.data.page_size}
            total={state.data.total}
            onChange={(p) => update({ page: String(p) })}
          />
        </>
      )}
    </>
  )
}

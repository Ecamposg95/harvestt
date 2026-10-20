import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import { ErrorState } from '@/components/ui'
import { cx } from '@/components/ui/cx'
import { prototypesApi, PublicPrototypeDetail } from './api'
import { Gallery } from './Gallery'
import { StlViewer } from './LazyStlViewer'
import { HeroPlaceholder, RichText, StatusBadge } from './shared'

type State =
  | { phase: 'loading' }
  | { phase: 'notfound' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: PublicPrototypeDetail }

export function PrototypePublicPage() {
  const { slug = '' } = useParams()
  const [state, setState] = useState<State>({ phase: 'loading' })

  const load = useCallback(() => {
    setState({ phase: 'loading' })
    prototypesApi
      .publicDetail(slug)
      .then((data) => setState({ phase: 'ready', data }))
      .catch((err) =>
        setState(
          errorStatus(err) === 404
            ? { phase: 'notfound' }
            : { phase: 'error', message: errorMessage(err, 'No se pudo cargar el prototipo') },
        ),
      )
  }, [slug])

  useEffect(load, [load])

  useEffect(() => {
    if (state.phase === 'ready') document.title = `${state.data.name} · HarvestT`
    return () => {
      document.title = 'HarvestT Cortex'
    }
  }, [state])

  if (state.phase === 'loading') {
    return (
      <div role="status" aria-label="Cargando prototipo" className="mx-auto max-w-7xl space-y-6 px-4 py-16 sm:px-6">
        <div className="h-4 w-40 animate-pulse rounded-full bg-surface" />
        <div className="h-16 w-2/3 animate-pulse rounded-full bg-surface" />
        <div className="glass aspect-[16/9] w-full animate-pulse" />
      </div>
    )
  }
  if (state.phase === 'notfound') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="eyebrow">404</p>
        <h1 className="display text-3xl">Prototipo no encontrado</h1>
        <p className="text-muted">No existe o todavía no se ha publicado.</p>
        <Link to="/" className="eyebrow mt-2 !text-accent hover:underline">
          ← Volver a la vitrina
        </Link>
      </div>
    )
  }
  if (state.phase === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24">
        <ErrorState message={state.message} onRetry={load} />
      </div>
    )
  }
  return <Detail data={state.data} />
}

function Detail({ data }: { data: PublicPrototypeDetail }) {
  const models = data.assets.filter((a) => a.kind === 'model_stl')
  const images = data.assets.filter((a) => a.kind === 'image')
  const [modelId, setModelId] = useState(models[0]?.id ?? null)
  const model = models.find((m) => m.id === modelId) ?? models[0]
  // Los puntos públicos pertenecen al STL principal (el primero); otros modelos se ven sin callouts.
  const showHotspots = model !== undefined && model.id === models[0]?.id && data.hotspots.length > 0
  const viewerHotspots = showHotspots
    ? data.hotspots.map((h, i) => ({ key: `h${i}`, label: h.label, description: h.description, x: h.x, y: h.y, z: h.z }))
    : undefined

  const [first, ...restName] = data.name.trim().split(/\s+/)
  const chips = data.specs.slice(0, 4)

  return (
    <article className="overflow-x-hidden">
      <header className="mx-auto grid max-w-7xl gap-8 px-4 pb-8 pt-6 sm:px-6 lg:grid-cols-12 lg:items-center">
        <div className="min-w-0 lg:col-span-5">
          <Link to="/" className="eyebrow hover:text-accent">
            ← Prototipos
          </Link>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {data.codename && <span className="eyebrow text-accent">{data.codename}</span>}
            <StatusBadge status={data.status} />
          </div>
          <h1 className="display mt-4 break-words text-[clamp(2.75rem,8vw,5.5rem)] lg:text-[clamp(2.75rem,4.6vw,4.25rem)]">
            {first}
            {restName.length > 0 && (
              <>
                {' '}
                <br />
                <span className="text-accent">{restName.join(' ')}</span>
              </>
            )}
          </h1>
          {data.purpose && <p className="mt-5 max-w-md text-base text-muted sm:text-lg">{data.purpose}</p>}
          {images.length > 0 && (
            <a href="#galeria" className="mt-6 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-fg">
              Ver galería
            </a>
          )}
        </div>

        <section aria-label="Vista principal" className="min-w-0 lg:col-span-7">
          {model ? (
            <div>
              <div className="glass overflow-hidden p-2">
                <StlViewer
                  key={model.id}
                  url={model.url}
                  label={`Modelo 3D de ${data.name}${model.caption ? `: ${model.caption}` : ''}`}
                  hotspots={viewerHotspots}
                  className="h-[52vh] min-h-[320px] w-full rounded-[22px]"
                />
              </div>
              {showHotspots && (
                <ol aria-label="Puntos del modelo" className="mt-4 space-y-2 sm:sr-only">
                  {data.hotspots.map((h, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-lime text-[10px] font-bold text-ink">
                        {i + 1}
                      </span>
                      <span>
                        <span className="font-semibold">{h.label}</span>
                        {h.description && <span className="text-muted"> — {h.description}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {models.length > 1 && (
                <div role="group" aria-label="Modelos 3D" className="mt-4 flex flex-wrap gap-2">
                  {models.map((m, i) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={m.id === model.id}
                      onClick={() => setModelId(m.id)}
                      className={cx(
                        'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                        m.id === model.id ? 'bg-ink text-ink-fg' : 'glass !rounded-full text-muted hover:text-fg',
                      )}
                    >
                      {m.caption || `Modelo ${i + 1}`}
                    </button>
                  ))}
                </div>
              )}
              {models.length === 1 && model.caption && <p className="eyebrow mt-3">{model.caption}</p>}
            </div>
          ) : (
            <div className="glass aspect-[4/3] overflow-hidden p-2">
              <div className="h-full w-full overflow-hidden rounded-[22px]">
                {data.hero ? (
                  <img src={data.hero.url} alt={data.hero.caption || data.name} className="h-full w-full object-cover" />
                ) : (
                  <HeroPlaceholder name={data.name} codename={data.codename} />
                )}
              </div>
            </div>
          )}
        </section>
      </header>

      {chips.length > 0 && (
        <div data-testid="spec-chips" className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 sm:px-6 lg:grid-cols-4">
          {chips.map((s, i) => (
            <div key={i} className={`glass p-4 ${i === 1 ? '!bg-lime text-ink' : ''}`}>
              <p className={`eyebrow truncate ${i === 1 ? '!text-ink/70' : ''}`}>{s.label}</p>
              <p className="mt-1 break-words text-lg font-bold">
                {s.value}
                {s.unit && <span className={`ml-1 text-sm ${i === 1 ? 'text-ink/70' : 'text-muted'}`}>{s.unit}</span>}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-12">
        <section className="min-w-0 lg:col-span-7" aria-labelledby="descripcion">
          <h2 id="descripcion" className="eyebrow">
            Descripción
          </h2>
          {data.summary && <p className="mt-6 text-xl font-light leading-relaxed">{data.summary}</p>}
          {data.description ? (
            <RichText text={data.description} className="mt-6 text-muted" />
          ) : (
            !data.summary && <p className="mt-6 text-muted">Descripción en preparación.</p>
          )}
        </section>

        <section className="min-w-0 lg:col-span-5" aria-labelledby="especificaciones">
          <h2 id="especificaciones" className="eyebrow">
            Especificaciones
          </h2>
          {data.specs.length === 0 ? (
            <p className="mt-6 text-sm text-muted">Especificaciones por definir.</p>
          ) : (
            <table className="glass mt-6 w-full border-collapse overflow-hidden text-sm">
              <tbody>
                {data.specs.map((s, i) => (
                  <tr key={i} className="border-t border-border/50 first:border-t-0">
                    <th scope="row" className="eyebrow px-5 py-4 text-left font-normal">
                      {s.label}
                    </th>
                    <td className="break-words px-5 py-4 text-right text-fg">
                      {s.value}
                      {s.unit && <span className="ml-1 text-muted">{s.unit}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {images.length > 0 && (
        <section aria-labelledby="galeria" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <h2 id="galeria" className="eyebrow mb-6">
            Galería
          </h2>
          <Gallery title={data.name} images={images.map((a) => ({ id: a.id, src: a.url, caption: a.caption }))} />
        </section>
      )}
    </article>
  )
}

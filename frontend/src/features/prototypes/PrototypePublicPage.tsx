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
        <div className="h-4 w-40 animate-pulse rounded bg-surface" />
        <div className="h-16 w-2/3 animate-pulse rounded bg-surface" />
        <div className="aspect-[16/9] w-full animate-pulse rounded-lg bg-surface" />
      </div>
    )
  }
  if (state.phase === 'notfound') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">404</p>
        <h1 className="text-3xl font-semibold">Prototipo no encontrado</h1>
        <p className="text-muted">No existe o todavía no se ha publicado.</p>
        <Link to="/" className="mt-2 font-mono text-xs uppercase tracking-[0.25em] text-accent hover:underline">
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

  return (
    <article className="overflow-x-hidden">
      <header className="mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 sm:pt-20">
        <Link to="/" className="font-mono text-xs uppercase tracking-[0.25em] text-muted hover:text-accent">
          ← Prototipos
        </Link>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          {data.codename && (
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-accent">{data.codename}</span>
          )}
          <StatusBadge status={data.status} />
        </div>
        <h1 className="mt-4 break-words text-5xl font-semibold tracking-tight sm:text-7xl lg:text-8xl">{data.name}</h1>
        {data.purpose && <p className="mt-6 max-w-3xl text-lg font-light text-muted sm:text-2xl">{data.purpose}</p>}
      </header>

      <section aria-label="Vista principal" className="mx-auto max-w-7xl px-4 sm:px-6">
        {model ? (
          <div>
            <StlViewer
              key={model.id}
              url={model.url}
              label={`Modelo 3D de ${data.name}${model.caption ? `: ${model.caption}` : ''}`}
              className="h-[60vh] min-h-[320px] w-full"
            />
            {models.length > 1 && (
              <div role="group" aria-label="Modelos 3D" className="mt-4 flex flex-wrap gap-2">
                {models.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={m.id === model.id}
                    onClick={() => setModelId(m.id)}
                    className={cx(
                      'rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors',
                      m.id === model.id ? 'border-accent text-accent' : 'border-border text-muted hover:text-fg',
                    )}
                  >
                    {m.caption || `Modelo ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
            {models.length === 1 && model.caption && (
              <p className="mt-3 font-mono text-xs uppercase tracking-wider text-muted">{model.caption}</p>
            )}
          </div>
        ) : (
          <div className="aspect-[16/9] overflow-hidden rounded-lg border border-border">
            {data.hero ? (
              <img src={data.hero.url} alt={data.hero.caption || data.name} className="h-full w-full object-cover" />
            ) : (
              <HeroPlaceholder name={data.name} codename={data.codename} />
            )}
          </div>
        )}
      </section>

      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-12">
        <section className="min-w-0 lg:col-span-7" aria-labelledby="descripcion">
          <h2 id="descripcion" className="font-mono text-xs uppercase tracking-[0.3em] text-muted">
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
          <h2 id="especificaciones" className="font-mono text-xs uppercase tracking-[0.3em] text-muted">
            Especificaciones
          </h2>
          {data.specs.length === 0 ? (
            <p className="mt-6 text-sm text-muted">Especificaciones por definir.</p>
          ) : (
            <table className="mt-6 w-full border-collapse text-sm">
              <tbody>
                {data.specs.map((s, i) => (
                  <tr key={i} className="border-t border-border last:border-b">
                    <th scope="row" className="py-4 pr-4 text-left font-mono text-xs font-normal uppercase tracking-wider text-muted">
                      {s.label}
                    </th>
                    <td className="break-words py-4 text-right text-fg">
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
          <h2 id="galeria" className="mb-6 font-mono text-xs uppercase tracking-[0.3em] text-muted">
            Galería
          </h2>
          <Gallery title={data.name} images={images.map((a) => ({ id: a.id, src: a.url, caption: a.caption }))} />
        </section>
      )}
    </article>
  )
}

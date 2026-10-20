import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { ErrorState } from '@/components/ui'
import { prototypesApi, PublicPrototypeSummary } from './api'
import { StlViewer } from './LazyStlViewer'
import { HeroPlaceholder, StatusBadge } from './shared'

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; items: PublicPrototypeSummary[] }

export function ShowcasePage() {
  const [state, setState] = useState<State>({ phase: 'loading' })

  const load = useCallback(() => {
    setState({ phase: 'loading' })
    prototypesApi
      .publicList()
      .then((items) => setState({ phase: 'ready', items }))
      .catch((err) => setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar la vitrina') }))
  }, [])

  useEffect(load, [load])

  const featured = state.phase === 'ready' ? state.items.find((p) => p.model) : undefined

  return (
    <div className="overflow-x-hidden">
      <section>
        <div className="mx-auto grid min-h-[60vh] max-w-7xl items-end gap-10 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-12 lg:items-center">
          <div className={featured ? 'min-w-0 lg:col-span-6' : 'min-w-0 lg:col-span-12'}>
            <p className="eyebrow">Laboratorio de hardware · General Systech</p>
            <h1 className="display mt-4 text-[clamp(3rem,11vw,8rem)] lg:text-[clamp(3rem,8vw,7rem)]">HarvestT</h1>
            <p className="mt-6 max-w-2xl text-lg text-muted sm:text-xl">
              Invernaderos y germinadores inteligentes con IA que reproducen de forma autónoma las condiciones óptimas de cultivo.
            </p>
            <a href="#prototipos" className="mt-8 inline-flex w-fit rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-fg">
              Ver prototipos <span aria-hidden="true">↓</span>
            </a>
          </div>
          {featured?.model && (
            <section aria-label="Prototipo destacado" className="min-w-0 lg:col-span-6">
              <div className="glass overflow-hidden p-2">
                <StlViewer
                  url={featured.model.url}
                  label={`Modelo 3D de ${featured.name}`}
                  className="h-[44vh] min-h-[300px] w-full rounded-[22px] lg:h-[56vh]"
                />
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="eyebrow truncate">
                  Destacado{featured.codename && <span className="text-accent"> · {featured.codename}</span>}
                </p>
                <Link
                  to={`/prototipos/${featured.slug}`}
                  aria-label={`Explorar ${featured.name}`}
                  className="shrink-0 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-ink-fg"
                >
                  Explorar {featured.name} <span aria-hidden="true">→</span>
                </Link>
              </div>
            </section>
          )}
        </div>
      </section>

      <section id="prototipos" className="mx-auto max-w-7xl scroll-mt-16 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mb-12 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="eyebrow">Prototipos</h2>
          {state.phase === 'ready' && state.items.length > 0 && (
            <p className="eyebrow">
              {String(state.items.length).padStart(2, '0')} {state.items.length === 1 ? 'prototipo publicado' : 'prototipos publicados'}
            </p>
          )}
        </div>

        {state.phase === 'loading' && (
          <div role="status" aria-label="Cargando prototipos" className="space-y-10">
            {[0, 1].map((i) => (
              <div key={i} className="glass aspect-[16/9] w-full animate-pulse" />
            ))}
          </div>
        )}

        {state.phase === 'error' && <ErrorState message={state.message} onRetry={load} />}

        {state.phase === 'ready' && state.items.length === 0 && (
          <div className="glass flex flex-col items-center gap-4 px-6 py-24 text-center">
            <span className="h-2 w-2 animate-pulse rounded-full bg-lime" aria-hidden="true" />
            <p className="text-2xl font-light">Prototipos en construcción</p>
            <p className="max-w-md text-sm text-muted">Pronto publicaremos aquí los modelos 3D y las fotos de cada equipo.</p>
          </div>
        )}

        {state.phase === 'ready' && state.items.length > 0 && (
          <ul className="space-y-16 sm:space-y-24">
            {state.items.map((p, i) => (
              <li key={p.slug}>
                <PrototypeCard prototype={p} index={i} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function PrototypeCard({ prototype: p, index }: { prototype: PublicPrototypeSummary; index: number }) {
  return (
    <Link to={`/prototipos/${p.slug}`} className="group block focus-visible:outline-offset-8">
      <article className="glass grid items-center gap-6 p-4 sm:p-6 lg:grid-cols-12 lg:gap-10">
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl lg:col-span-7">
          {p.hero ? (
            <img
              src={p.hero.url}
              alt={p.hero.caption || p.name}
              loading={index === 0 ? 'eager' : 'lazy'}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
            />
          ) : p.model ? (
            // Sin foto: el modelo girando. No interactivo, para que toda la tarjeta siga siendo un enlace.
            <div className="pointer-events-none h-full w-full">
              <StlViewer url={p.model.url} label={`Modelo 3D de ${p.name}`} chrome={false} className="h-full w-full" />
            </div>
          ) : (
            <HeroPlaceholder name={p.name} codename={p.codename} />
          )}
        </div>
        <div className="min-w-0 lg:col-span-5">
          <p className="eyebrow">
            {String(index + 1).padStart(2, '0')}
            {p.codename && <span className="text-accent"> · {p.codename}</span>}
          </p>
          <h3 className="display mt-3 break-words text-4xl sm:text-5xl">{p.name}</h3>
          {p.purpose && <p className="mt-4 text-base text-muted sm:text-lg">{p.purpose}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <StatusBadge status={p.status} />
            <span className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-ink-fg">
              Explorar <span aria-hidden="true">→</span>
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { ErrorState } from '@/components/ui'
import { prototypesApi, PublicPrototypeSummary } from './api'
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

  return (
    <div className="overflow-x-hidden">
      <section className="relative isolate border-b border-border/60">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-50"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 60% 50% at 70% 40%, rgb(var(--c-accent) / 0.12), transparent 70%), linear-gradient(rgb(var(--c-border) / 0.35) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--c-border) / 0.35) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 64px 64px, 64px 64px',
          }}
        />
        <div className="mx-auto flex min-h-[70vh] max-w-7xl flex-col justify-end px-4 pb-16 pt-24 sm:px-6 sm:pb-24">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Laboratorio de hardware · General Systech</p>
          <h1 className="mt-6 text-6xl font-semibold tracking-tight sm:text-8xl lg:text-9xl">HarvestT</h1>
          <p className="mt-6 max-w-2xl text-lg font-light text-muted sm:text-2xl">
            Invernaderos y germinadores inteligentes con IA que reproducen de forma autónoma las condiciones óptimas de cultivo.
          </p>
          <a
            href="#prototipos"
            className="mt-10 inline-flex w-fit items-center gap-3 border-b border-accent/60 pb-1 font-mono text-xs uppercase tracking-[0.25em] text-fg hover:border-accent hover:text-accent"
          >
            Ver prototipos <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      <section id="prototipos" className="mx-auto max-w-7xl scroll-mt-16 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mb-12 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-muted">Prototipos</h2>
          {state.phase === 'ready' && state.items.length > 0 && (
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
              {String(state.items.length).padStart(2, '0')} {state.items.length === 1 ? 'prototipo publicado' : 'prototipos publicados'}
            </p>
          )}
        </div>

        {state.phase === 'loading' && (
          <div role="status" aria-label="Cargando prototipos" className="space-y-10">
            {[0, 1].map((i) => (
              <div key={i} className="aspect-[16/9] w-full animate-pulse rounded-lg bg-surface" />
            ))}
          </div>
        )}

        {state.phase === 'error' && <ErrorState message={state.message} onRetry={load} />}

        {state.phase === 'ready' && state.items.length === 0 && (
          <div className="flex flex-col items-center gap-4 border border-dashed border-border px-6 py-24 text-center">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
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
      <article className="grid items-end gap-6 lg:grid-cols-12 lg:gap-10">
        <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-border lg:col-span-8">
          {p.hero ? (
            <img
              src={p.hero.url}
              alt={p.hero.caption || p.name}
              loading={index === 0 ? 'eager' : 'lazy'}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
            />
          ) : (
            <HeroPlaceholder name={p.name} codename={p.codename} />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg/60 via-transparent to-transparent" />
        </div>
        <div className="min-w-0 lg:col-span-4 lg:pb-2">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">
            {String(index + 1).padStart(2, '0')}
            {p.codename && <span className="text-accent"> · {p.codename}</span>}
          </p>
          <h3 className="mt-3 break-words text-4xl font-semibold tracking-tight sm:text-5xl">{p.name}</h3>
          {p.purpose && <p className="mt-4 text-base text-muted sm:text-lg">{p.purpose}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <StatusBadge status={p.status} />
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-fg transition-colors group-hover:text-accent">
              Explorar <span aria-hidden="true">→</span>
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}

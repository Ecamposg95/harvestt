import { useEffect, useState } from 'react'
import { impactApi, Kpi } from './api'
import { KpiFigure } from './KpiFigure'

type State = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; kpis: Kpi[] }

/** Sección pública "Impacto": cifras en vivo del catálogo y la vitrina, cada una con su fórmula y origen. */
export function ImpactSection() {
  const [state, setState] = useState<State>({ phase: 'loading' })

  useEffect(() => {
    let alive = true
    impactApi
      .public()
      .then((data) => alive && setState({ phase: 'ready', kpis: data.kpis }))
      .catch((err) => {
        // Un KPI no debe romper la vitrina: sin datos, la sección no se muestra.
        console.warn('No se pudo cargar el impacto público', err)
        if (alive) setState({ phase: 'error' })
      })
    return () => {
      alive = false
    }
  }, [])

  // Al llegar con /#impacto la sección aún no existía cuando el navegador buscó el ancla.
  useEffect(() => {
    if (state.phase === 'ready' && window.location.hash === '#impacto') {
      document.getElementById('impacto')?.scrollIntoView?.()
    }
  }, [state.phase])

  if (state.phase === 'error') return null

  return (
    <section id="impacto" aria-labelledby="impacto-titulo" className="mx-auto max-w-7xl scroll-mt-16 px-4 py-16 sm:px-6 sm:py-24">
      <h2 id="impacto-titulo" className="eyebrow">
        Impacto
      </h2>
      <p className="display mt-4 max-w-4xl text-[clamp(2.25rem,6vw,4rem)]">Lo que la plataforma ya sostiene con datos</p>
      <p className="mt-6 max-w-2xl text-muted">
        Cada cifra se calcula en vivo a partir del catálogo y de la vitrina. Toca «Cómo se calcula» para ver su fórmula y
        su origen. No mostramos estimaciones de rendimiento, agua, carbono ni dinero sin una metodología documentada.
      </p>
      {state.phase === 'loading' ? (
        <div role="status" aria-label="Cargando impacto" className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="glass h-48 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {state.kpis.map((k) => (
            <KpiFigure key={k.key} kpi={k} size="hero" />
          ))}
        </div>
      )}
    </section>
  )
}

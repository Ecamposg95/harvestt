import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '@/api/client'
import { Button, cx, ErrorState, Loading } from '@/components/ui'
import { KpiFigure } from '@/features/impact/KpiFigure'
import type { Kpi } from '@/features/impact/api'
import { prototypesApi } from '@/features/prototypes/api'
import { StlViewer } from '@/features/prototypes/LazyStlViewer'
import { LAYER_LABEL, visionApi, type LayerStatus, type Vision, type VisionFigure } from './api'
import { webglAvailable } from '@/features/three/webgl'
import { EcosystemDiagram } from './EcosystemDiagram'
import { prefersReducedMotion } from './geo'
import { GlobeFallback } from './GlobeFallback'
import { LazyGlobe } from './LazyGlobe'
import { Dialog } from '@/features/catalog/Dialog'
import { RequestForm } from './RequestForm'

const CHAPTERS: Record<string, { title: string; text: string }> = {
  history: {
    title: '2017–2018 · Prototipos físicos',
    text: 'Invernadero Geodésico, Cultivador Delta y Germinador ECOS. Medallas en INTARG (Polonia, 2017) e ICAN (Canadá, 2018).',
  },
  cortex: {
    title: 'Hoy · HarvestT Cortex',
    text: 'Catálogo con evidencia, proyectos, invernadero virtual, Studio 3D, grafo de conocimiento e impacto.',
  },
  knowledge: {
    title: 'Capa 1 · Ontología, bancos de plantas y mapa',
    text: 'Cortex habla el idioma científico mundial y sabe dónde y cómo crece cada especie.',
  },
  trust: {
    title: 'Capa 2 · Red de confianza',
    text: 'Cada lectura firmada por su nodo y encadenada: nadie puede alterar un dato sin que se note.',
  },
  commons: {
    title: 'Capa 3 · harvestt.org',
    text: 'Datos abiertos, mapa, ontología y verificación, libres para investigar y citar.',
  },
}

const STATUS_MARK: Record<LayerStatus, string> = { done: '●', operating: '●', in_construction: '◐', vision: '○' }

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; vision: Vision; model: { url: string; name: string } | null }

export function VisionPage() {
  const [state, setState] = useState<State>({ phase: 'loading' })
  // Crear un contexto WebGL es caro y está limitado: se decide una sola vez.
  const [hasWebgl] = useState(webglAvailable)
  const [form, setForm] = useState<'node' | 'contact' | null>(null)

  const load = useCallback(() => {
    setState({ phase: 'loading' })
    Promise.all([
      visionApi.summary(),
      // La vitrina es accesorio: si falla, la página sigue sin visor.
      prototypesApi.publicList().catch(() => []),
    ])
      .then(([vision, protos]) => {
        const p = protos.find((x) => x.model)
        setState({ phase: 'ready', vision, model: p?.model ? { url: p.model.url, name: p.name } : null })
      })
      .catch((err) => setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar la visión') }))
  }, [])

  useEffect(load, [load])

  return (
    <div className="overflow-x-hidden">
      <header className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-10 pt-10 sm:px-6 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="eyebrow">HARVESTT · MOONSHOT</p>
          <h1 className="display mt-4 max-w-4xl text-[clamp(2.25rem,7vw,5rem)]">
            Una red abierta de datos de cultivo en la que el mundo pueda confiar.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted sm:text-xl">
            Hardware que mide, una red que no deja alterar los datos, IA que los interpreta y un portal abierto para todos.
          </p>
          <p className="mt-6 text-sm font-semibold text-muted">● Operando · ◐ En construcción · ○ Visión</p>
        </div>
        <div data-testid="globe-slot" className="min-w-0">
          {state.phase === 'ready' &&
            (hasWebgl ? (
              <LazyGlobe sites={state.vision.sites} animate={!prefersReducedMotion()} className="mx-auto" />
            ) : (
              <GlobeFallback sites={state.vision.sites} />
            ))}
        </div>
      </header>

      {state.phase === 'loading' && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Loading label="Cargando la visión…" />
        </div>
      )}
      {state.phase === 'error' && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <ErrorState message={state.message} onRetry={load} />
        </div>
      )}

      {state.phase === 'ready' && (
        <>
          <section aria-label="Cifras" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
            <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
              {state.vision.figures.map((f) => (
                <li key={f.key} className="flex min-w-0 [&>div]:w-full">
                  <FigureTile figure={f} />
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Ecosistema" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
            <EcosystemDiagram />
          </section>

          <section aria-label="Recorrido" className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <h2 className="eyebrow mb-8">Recorrido</h2>
            <ol className="space-y-6">
              {state.vision.layers.map((layer) => {
                const chapter = CHAPTERS[layer.key]
                if (!chapter) return null
                return (
                  <li key={layer.key}>
                    <article className="glass min-w-0 p-5 sm:p-8">
                      <p className={cx('eyebrow', layer.status === 'vision' ? 'text-muted' : 'text-accent')}>
                        <span aria-hidden="true">{STATUS_MARK[layer.status]} </span>
                        {LAYER_LABEL[layer.status]}
                      </p>
                      <h3 className="display mt-3 break-words text-2xl sm:text-4xl">{chapter.title}</h3>
                      <p className="mt-4 max-w-2xl text-base text-muted sm:text-lg">{chapter.text}</p>
                      {layer.key === 'history' && state.model && (
                        <div className="mt-6 overflow-hidden rounded-[22px]">
                          <StlViewer
                            url={state.model.url}
                            label={`Modelo 3D de ${state.model.name}`}
                            className="h-[40vh] min-h-[260px] w-full rounded-[22px]"
                          />
                        </div>
                      )}
                    </article>
                  </li>
                )
              })}
            </ol>
          </section>

          <section aria-label="Participa" className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6">
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setForm('node')}>Únete como nodo</Button>
              <Button variant="secondary" onClick={() => setForm('contact')}>
                Habla con el equipo
              </Button>
            </div>
          </section>
        </>
      )}

      {form && (
        <Dialog title={form === 'node' ? 'Únete como nodo' : 'Habla con el equipo'} onClose={() => setForm(null)}>
          <RequestForm kind={form} onDone={() => setForm(null)} />
        </Dialog>
      )}
    </div>
  )
}

function FigureTile({ figure: f }: { figure: VisionFigure }) {
  if (f.status === 'soon') {
    return (
      <div className="glass relative flex min-w-0 flex-col gap-2 p-4">
        <span className="eyebrow">{f.label}</span>
        <p className="text-2xl font-bold tracking-tight text-muted">pronto</p>
      </div>
    )
  }
  const kpi: Kpi = {
    key: f.key,
    label: f.label,
    value: f.value,
    unit: null,
    origin: f.origin as Kpi['origin'],
    formula: f.formula,
    inputs_count: 0,
    as_of: '',
  }
  return <KpiFigure kpi={kpi} size="tile" />
}

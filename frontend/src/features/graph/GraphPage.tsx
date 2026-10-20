import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { Button, cx, Empty, ErrorState, Field, Input, Loading, OriginBadge, PageHeader, Select } from '@/components/ui'
import { useTheme } from '@/store/theme'
import { GraphData, GraphNode, graphApi, NODE_TYPES, NodeType } from './api'
import { GraphCanvas } from './GraphCanvas'
import { connectionsOf, countByType, describeProvenance, nodeLink, relationLabel, searchNodes, TYPE_META } from './model'
import { GraphPalette, graphPalette } from './palette'

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: GraphData; refreshing: boolean }

const DEPTHS = [1, 2, 3]

function parseDepth(raw: string | null): number {
  const n = Number(raw)
  return DEPTHS.includes(n) ? n : 2
}

const hops = (d: number) => `${d} ${d === 1 ? 'salto' : 'saltos'}`

function Dot({ color, glow = false }: { color: string; glow?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: color, boxShadow: glow ? `0 0 10px ${color}` : undefined }}
    />
  )
}

interface PanelProps {
  node: GraphNode | null
  data: GraphData
  byId: Map<string, GraphNode>
  palette: GraphPalette
  depth: number
  onDepth: (depth: number) => void
  onExplore: (id: string) => void
  onSelect: (id: string) => void
}

function NodePanel({ node, data, byId, palette, depth, onDepth, onExplore, onSelect }: PanelProps) {
  if (!node) {
    return (
      <aside aria-label="Detalle del nodo" className="glass p-5">
        <p className="eyebrow">Detalle</p>
        <h2 className="mt-2 text-lg font-bold">Explora el grafo</h2>
        <p className="mt-2 text-sm text-muted">
          Haz clic en un punto o búscalo por nombre para ver de dónde viene y con qué se conecta. Arrastra para moverte; usa la
          rueda o los botones para acercar. Las etiquetas aparecen al acercarte.
        </p>
      </aside>
    )
  }
  const link = nodeLink(node)
  const connections = connectionsOf(node.id, data)
  const scientific = node.meta?.scientific_name
  return (
    <aside aria-label="Detalle del nodo" className="glass flex min-h-0 flex-col p-5 lg:max-h-[calc(100vh-17rem)]">
      <p className="eyebrow flex items-center gap-2">
        <Dot color={palette.node[node.type]} glow />
        {TYPE_META[node.type].label}
      </p>
      <h2 className="mt-2 break-words text-xl font-extrabold">{node.label}</h2>
      {scientific && scientific !== node.label && <p className="mt-1 text-sm italic text-muted">{scientific}</p>}
      {node.origin && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          Mejor evidencia registrada <OriginBadge origin={node.origin} />
        </p>
      )}
      {link && (
        <div className="mt-4">
          {link.kind === 'internal' ? (
            <Link to={link.to} className="inline-flex rounded-full bg-ink px-4 py-2 text-xs font-semibold text-ink-fg">
              {link.label}
            </Link>
          ) : (
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex rounded-full bg-ink px-4 py-2 text-xs font-semibold text-ink-fg"
            >
              {link.label}
            </a>
          )}
        </div>
      )}
      <div className="mt-4 flex items-end gap-2">
        <div className="w-32">
          <Field label="Profundidad">
            {(id) => (
              <Select id={id} value={depth} onChange={(e) => onDepth(Number(e.target.value))} className="!py-1.5">
                {DEPTHS.map((d) => (
                  <option key={d} value={d}>
                    {hops(d)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Button variant="secondary" className="!px-4 !py-2" onClick={() => onExplore(node.id)}>
          Explorar vecindario
        </Button>
      </div>
      <h3 className="mt-5 text-sm font-bold">Conexiones ({connections.length})</h3>
      {connections.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Sin relaciones registradas en esta vista.</p>
      ) : (
        <ul aria-label="Conexiones" className="mt-2 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {connections.map((c) => (
            <li key={`${c.edge.src}|${c.edge.dst}|${c.edge.relation}`} className="rounded-2xl bg-fg/5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                {relationLabel(c.edge.relation, c.outgoing)}
              </p>
              <button
                type="button"
                onClick={() => onSelect(c.other.id)}
                className="mt-1 flex items-center gap-2 text-left text-sm font-semibold hover:text-accent"
              >
                <Dot color={palette.node[c.other.type]} />
                {c.other.label}
              </button>
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {c.edge.provenance.map((p, i) => (
                  <li key={i}>{describeProvenance(p, byId)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

export default function GraphPage() {
  const [params, setParams] = useSearchParams()
  const focus = params.get('focus')
  const depth = parseDepth(params.get('depth'))
  const [types, setTypes] = useState<NodeType[]>([...NODE_TYPES])
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(focus)
  const [query, setQuery] = useState('')
  const [panelDepth, setPanelDepth] = useState(depth)
  const dark = useTheme((s) => s.theme === 'dark')
  const palette = useMemo(() => graphPalette(dark), [dark])
  const request = useRef(0)

  const load = useCallback(() => {
    const id = ++request.current
    setState((prev) => (prev.phase === 'ready' ? { ...prev, refreshing: true } : { phase: 'loading' }))
    graphApi
      .get({ focus, depth, types })
      .then((data) => {
        if (id === request.current) setState({ phase: 'ready', data, refreshing: false })
      })
      .catch((err) => {
        if (id === request.current) setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar el grafo') })
      })
  }, [focus, depth, types])
  useEffect(load, [load])

  const data = state.phase === 'ready' ? state.data : null
  const byId = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data])
  const results = useMemo(() => (data ? searchNodes(data.nodes, query) : []), [data, query])
  const counts = useMemo(() => countByType(data?.nodes ?? []), [data])

  // Si el nodo seleccionado ya no está (filtro o vecindario nuevo), se limpia la selección.
  useEffect(() => {
    if (data && selectedId && !byId.has(selectedId)) setSelectedId(null)
  }, [data, byId, selectedId])

  const toggleType = (t: NodeType) =>
    setTypes((prev) => NODE_TYPES.filter((x) => (x === t ? !prev.includes(t) : prev.includes(x))))
  const pick = (id: string) => {
    setSelectedId(id)
    setQuery('')
  }
  const explore = (id: string) => {
    setSelectedId(id)
    setParams({ focus: id, depth: String(panelDepth) })
  }

  if (state.phase === 'loading') return <Loading label="Cargando grafo…" />
  if (state.phase === 'error') return <ErrorState message={state.message} onRetry={load} />
  const graph = state.data
  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const focusNode = focus ? byId.get(focus) : undefined
  const present = NODE_TYPES.filter((t) => counts[t] > 0)

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Conocimiento"
        title="Grafo de conocimiento"
        description="Especies, rasgos, fuentes, proyectos, ciclos y prototipos conectados solo por datos registrados: vínculos del sistema, afirmaciones con su evidencia y relaciones con procedencia."
      />

      <div className="glass relative z-20 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Input
            type="search"
            aria-label="Buscar en el grafo"
            placeholder="Buscar especie, rasgo, fuente, proyecto…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) pick(results[0].id)
              if (e.key === 'Escape') setQuery('')
            }}
          />
          {query.trim() && (
            <ul aria-label="Resultados de búsqueda" className="glass absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-auto p-1.5">
              {results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted">Sin coincidencias</li>
              ) : (
                results.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => pick(n.id)}
                      className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm hover:bg-fg/5"
                    >
                      <Dot color={palette.node[n.type]} />
                      <span className="min-w-0 flex-1 truncate font-medium">{n.label}</span>
                      <span className="text-xs text-muted">{TYPE_META[n.type].label}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <div role="group" aria-label="Leyenda y filtros por tipo" className="flex flex-wrap gap-1.5">
          {NODE_TYPES.map((t) => {
            const active = types.includes(t)
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                disabled={active && types.length === 1}
                onClick={() => toggleType(t)}
                className={cx(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed',
                  active ? 'border-border bg-surface/80 text-fg' : 'border-dashed border-border text-muted opacity-60',
                )}
              >
                <Dot color={palette.node[t]} glow={active} />
                {TYPE_META[t].plural}
                {active && <span className="font-mono text-muted"> {counts[t]}</span>}
              </button>
            )
          })}
        </div>
        {state.refreshing && (
          <span role="status" className="text-xs text-muted lg:ml-auto">
            Actualizando…
          </span>
        )}
      </div>

      {graph.truncated && (
        <p role="status" className="glass px-4 py-3 text-sm">
          Se muestran los primeros 300 nodos (los más conectados o los más cercanos al foco). Selecciona uno y usa «Explorar
          vecindario» para ver el resto.
        </p>
      )}
      {focus && (
        <div className="glass flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <span>
            Vecindario de <strong>{focusNode?.label ?? 'nodo'}</strong> a {hops(depth)}
          </span>
          <Button variant="secondary" className="!px-4 !py-1.5" onClick={() => setParams({})}>
            Ver grafo completo
          </Button>
        </div>
      )}

      {graph.nodes.length === 0 ? (
        <Empty
          title="Aún no hay nodos"
          description="El grafo se arma con el catálogo, tus proyectos y tus prototipos. Cuando existan, aparecerán aquí con sus relaciones reales."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="graph-stage relative h-[60vh] min-h-[420px] overflow-hidden rounded-3xl border border-border/60 shadow-glass lg:h-[calc(100vh-17rem)]">
            <GraphCanvas data={graph} selectedId={selectedId} onSelect={setSelectedId} fitKey={focus ?? 'all'} />
            <p className="pointer-events-none absolute left-4 top-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              {graph.nodes.length} nodos · {graph.edges.length} relaciones
            </p>
            <ul
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 left-3 hidden flex-wrap gap-x-3 gap-y-1 rounded-2xl bg-surface/60 px-3 py-2 text-[11px] font-semibold text-muted backdrop-blur sm:flex"
            >
              {present.map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Dot color={palette.node[t]} glow />
                  {TYPE_META[t].plural}
                </li>
              ))}
            </ul>
          </div>
          <NodePanel
            node={selected}
            data={graph}
            byId={byId}
            palette={palette}
            depth={panelDepth}
            onDepth={setPanelDepth}
            onExplore={explore}
            onSelect={setSelectedId}
          />
        </div>
      )}

      <p className="text-xs text-muted">
        Solo exploración: los nodos y relaciones salen de datos registrados y nada se edita desde aquí.
      </p>
    </div>
  )
}

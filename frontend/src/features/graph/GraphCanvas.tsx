import { KeyboardEvent, PointerEvent, ReactNode, useEffect, useRef } from 'react'
import type { Simulation } from 'd3-force'
import { isClick } from '@/features/prototypes/pick'
import { useTheme } from '@/store/theme'
import type { GraphData } from './api'
import { centerOn, easeOutCubic, fitView, lerpView, pan, Point, screenRadius, toWorld, View, zoomAround } from './camera'
import { Ctx2D, drawGraph } from './draw'
import { buildSimGraph, createSimulation, hitTest, Positions, positionsOf, settle, SimLink, SimNode, warmAlpha } from './layout'
import { neighborIds } from './model'
import { graphPalette } from './palette'

export interface GraphCanvasProps {
  data: GraphData
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Cambia cuando lo mostrado cambia de naturaleza (grafo completo ↔ vecindario): reencuadra. */
  fitKey: string
}

const FOCUS_ZOOM = 1.6
const ANIM_MS = 650
const WARMUP_TICKS = 80
const HIT_SLOP_PX = 6
const AUTO_FIT_ALPHA = 0.06

interface Drag {
  pointerId: number
  start: Point
  last: Point
  node: SimNode | null
  moved: boolean
}

interface Stage {
  nodes: SimNode[]
  links: SimLink[]
  sim: Simulation<SimNode, SimLink> | null
  positions: Positions
  view: View
  width: number
  height: number
  dpr: number
  anim: { from: View; to: View; start: number } | null
  selected: string | null
  hover: string | null
  highlight: Set<string> | null
  dark: boolean
  dirty: boolean
  fitKey: string | null
  needsFit: boolean
  /** Reencuadre único cuando la simulación se enfría, salvo que el usuario ya haya movido la vista. */
  autoFit: boolean
  /** Encuadre final al terminar la simulación, si el usuario no movió la vista. */
  fitOnEnd: boolean
  drag: Drag | null
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/80 text-lg font-semibold text-ink-fg shadow-glass backdrop-blur hover:bg-ink"
    >
      {children}
    </button>
  )
}

export function GraphCanvas({ data, selectedId, onSelect, fitKey }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dark = useTheme((s) => s.theme === 'dark')
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const stage = useRef<Stage>({
    nodes: [],
    links: [],
    sim: null,
    positions: new Map(),
    view: { k: 1, x: 0, y: 0 },
    width: 0,
    height: 0,
    dpr: 1,
    anim: null,
    selected: null,
    hover: null,
    highlight: null,
    dark,
    dirty: true,
    fitKey: null,
    needsFit: false,
    autoFit: false,
    fitOnEnd: false,
    drag: null,
  })

  const animateTo = (to: View) => {
    const s = stage.current
    s.anim = { from: s.view, to, start: performance.now() }
    s.dirty = true
  }

  const fit = (animate: boolean) => {
    const s = stage.current
    if (!s.width || !s.height || s.nodes.length === 0) {
      s.needsFit = true
      return
    }
    s.needsFit = false
    const to = fitView(s.nodes, s.width, s.height)
    if (animate) animateTo(to)
    else {
      s.view = to
      s.dirty = true
    }
  }

  const zoomBy = (factor: number) => {
    const s = stage.current
    s.autoFit = false
    s.fitOnEnd = false
    animateTo(zoomAround(s.view, factor, s.width / 2, s.height / 2))
  }

  // Datos nuevos: reconstruir la simulación conservando posiciones previas.
  useEffect(() => {
    const s = stage.current
    s.sim?.stop()
    const { nodes, links } = buildSimGraph(data, s.positions)
    const sim = createSimulation(nodes, links, { seed: 7, alpha: warmAlpha(data, s.positions) })
    const refit = s.fitKey !== fitKey
    if (refit) settle(sim, WARMUP_TICKS) // el primer cuadro ya tiene forma; el resto se anima
    s.nodes = nodes
    s.links = links
    s.sim = sim
    s.highlight = s.selected ? neighborIds(s.selected, data.edges) : null
    s.dirty = true
    if (refit) {
      s.fitKey = fitKey
      s.autoFit = true
      s.fitOnEnd = true
      fit(false)
    }
    return () => {
      s.positions = positionsOf(s.nodes)
      s.sim?.stop()
    }
  }, [data, fitKey])

  // Selección: resaltar vecinos y viajar al nodo.
  useEffect(() => {
    const s = stage.current
    s.selected = selectedId
    s.highlight = selectedId ? neighborIds(selectedId, data.edges) : null
    s.dirty = true
    const node = selectedId ? s.nodes.find((n) => n.id === selectedId) : undefined
    if (node && s.width) {
      s.autoFit = false
      s.fitOnEnd = false
      animateTo(centerOn(node.x, node.y, s.width, s.height, Math.max(s.view.k, FOCUS_ZOOM)))
    }
  }, [selectedId, data])

  useEffect(() => {
    stage.current.dark = dark
    stage.current.dirty = true
  }, [dark])

  // Tamaño, rueda y bucle de animación (una vez).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = stage.current
    const ctx = (canvas.getContext?.('2d') ?? null) as Ctx2D | null

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      s.dpr = Math.min(window.devicePixelRatio || 1, 2)
      s.width = rect.width
      s.height = rect.height
      canvas.width = Math.round(rect.width * s.dpr)
      canvas.height = Math.round(rect.height * s.dpr)
      s.dirty = true
      if (s.needsFit) fit(false)
    }
    resize()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(canvas)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      s.anim = null
      s.autoFit = false
      s.fitOnEnd = false
      s.view = zoomAround(s.view, Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top)
      s.dirty = true
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    let raf = 0
    const frame = (time: number) => {
      const sim = s.sim
      if (sim && sim.alpha() > sim.alphaMin()) {
        sim.tick()
        s.dirty = true
        if (s.autoFit && sim.alpha() < AUTO_FIT_ALPHA) {
          s.autoFit = false
          fit(true)
        }
      } else if (s.fitOnEnd && !s.anim) {
        s.fitOnEnd = false
        fit(true)
      }
      if (s.anim) {
        const t = Math.min(1, (time - s.anim.start) / ANIM_MS)
        s.view = lerpView(s.anim.from, s.anim.to, easeOutCubic(Math.max(0, t)), s.width, s.height)
        if (t >= 1) s.anim = null
        s.dirty = true
      }
      // Con un nodo enfocado se redibuja siempre: el brillo pulsa.
      if (ctx && (s.dirty || s.selected)) {
        drawGraph(ctx, s.nodes, s.links, {
          view: s.view,
          width: s.width,
          height: s.height,
          dpr: s.dpr,
          palette: graphPalette(s.dark),
          selectedId: s.selected,
          hoverId: s.hover,
          highlight: s.highlight,
          time,
        })
        s.dirty = false
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [])

  const local = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const pick = (p: Point): SimNode | null => {
    const s = stage.current
    const w = toWorld(s.view, p.x, p.y)
    return hitTest(s.nodes, w.x, w.y, screenRadius(1, s.view.k) / s.view.k, HIT_SLOP_PX / s.view.k)
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const s = stage.current
    const p = local(e)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    s.anim = null
    s.drag = { pointerId: e.pointerId, start: p, last: p, node: pick(p), moved: false }
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = stage.current
    const p = local(e)
    const d = s.drag
    if (!d || d.pointerId !== e.pointerId) {
      const id = pick(p)?.id ?? null
      if (id !== s.hover) {
        s.hover = id
        // Sin selección, el cursor previsualiza el vecindario del nodo.
        if (!s.selected) s.highlight = id ? neighborIds(id, s.links.map((l) => ({ src: l.source.id, dst: l.target.id }))) : null
        s.dirty = true
        e.currentTarget.style.cursor = id ? 'pointer' : 'grab'
      }
      return
    }
    if (!isClick(d.start, p)) d.moved = true
    if (d.moved) {
      s.autoFit = false
      s.fitOnEnd = false
      if (d.node) {
        const w = toWorld(s.view, p.x, p.y)
        d.node.fx = w.x
        d.node.fy = w.y
        if (s.sim) {
          s.sim.alphaTarget(0.25)
          if (s.sim.alpha() < 0.3) s.sim.alpha(0.3)
        }
      } else {
        s.view = pan(s.view, p.x - d.last.x, p.y - d.last.y)
      }
      s.dirty = true
    }
    d.last = p
  }

  const endDrag = (e: PointerEvent<HTMLCanvasElement>, select: boolean) => {
    const s = stage.current
    const d = s.drag
    if (!d || d.pointerId !== e.pointerId) return
    s.drag = null
    if (d.node) {
      d.node.fx = null
      d.node.fy = null
      s.sim?.alphaTarget(0)
    }
    if (select && !d.moved) onSelectRef.current(d.node?.id ?? null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === '+' || e.key === '=') zoomBy(1.4)
    else if (e.key === '-') zoomBy(1 / 1.4)
    else if (e.key === '0') fit(true)
    else if (e.key === 'Escape') onSelectRef.current(null)
    else return
    e.preventDefault()
  }

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`Grafo con ${data.nodes.length} nodos y ${data.edges.length} relaciones. Usa la búsqueda o la lista de conexiones para navegar con el teclado.`}
        className="h-full w-full cursor-grab touch-none rounded-3xl focus-visible:outline-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, true)}
        onPointerCancel={(e) => endDrag(e, false)}
        onPointerLeave={() => {
          if (stage.current.hover) {
            stage.current.hover = null
            if (!stage.current.selected) stage.current.highlight = null
            stage.current.dirty = true
          }
        }}
        onKeyDown={onKeyDown}
      />
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <ZoomButton label="Acercar" onClick={() => zoomBy(1.4)}>
          +
        </ZoomButton>
        <ZoomButton label="Alejar" onClick={() => zoomBy(1 / 1.4)}>
          −
        </ZoomButton>
        <ZoomButton label="Encuadrar todo" onClick={() => fit(true)}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </ZoomButton>
      </div>
    </div>
  )
}

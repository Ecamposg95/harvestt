import { screenRadius, toScreen, View } from './camera'
import type { SimLink, SimNode } from './layout'
import type { GraphPalette } from './palette'

/** Zoom a partir del cual todas las etiquetas son visibles (con fundido de LABEL_FADE antes). */
export const LABEL_ZOOM = 1.2
const LABEL_FADE = 0.25
/** Grado desde el que un nodo se rotula aunque la vista esté alejada. */
export const HUB_DEGREE = 6
export const DIM_ALPHA = 0.14
const TAU = Math.PI * 2
const MAX_LABEL = 32

/** Lo que el dibujo usa de CanvasRenderingContext2D (permite probar con un contexto falso). */
export interface Ctx2D {
  globalAlpha: number
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  shadowBlur: number
  shadowColor: string
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  lineJoin: CanvasLineJoin
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, start: number, end: number): void
  fill(): void
  stroke(): void
  fillText(text: string, x: number, y: number): void
  strokeText(text: string, x: number, y: number): void
}

export interface DrawState {
  view: View
  /** Tamaño en píxeles CSS. */
  width: number
  height: number
  dpr: number
  palette: GraphPalette
  selectedId: string | null
  hoverId: string | null
  /** Nodo enfocado + vecinos; null = sin foco. */
  highlight: Set<string> | null
  /** ms, para el pulso del brillo. */
  time: number
}

export function labelAlpha(n: SimNode, s: Pick<DrawState, 'view' | 'highlight' | 'hoverId' | 'selectedId'>): number {
  if (n.id === s.hoverId || n.id === s.selectedId) return 1
  if (s.highlight) return s.highlight.has(n.id) ? 1 : 0
  if (n.degree >= HUB_DEGREE) return 1
  return Math.max(0, Math.min(1, (s.view.k - (LABEL_ZOOM - LABEL_FADE)) / LABEL_FADE))
}

function segment(ctx: Ctx2D, view: View, l: SimLink): void {
  const a = toScreen(view, l.source.x, l.source.y)
  const b = toScreen(view, l.target.x, l.target.y)
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
}

/** Dibuja en coordenadas de pantalla (CSS px); el DPR se aplica con setTransform. */
export function drawGraph(ctx: Ctx2D, nodes: SimNode[], links: SimLink[], s: DrawState): void {
  const { view, palette } = s
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
  ctx.clearRect(0, 0, s.width, s.height)
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1

  // 1. Aristas: las del nodo enfocado van aparte, encima y con el color activo.
  const active: SimLink[] = []
  ctx.strokeStyle = palette.edge
  ctx.lineWidth = 1
  ctx.globalAlpha = s.highlight ? DIM_ALPHA : 1
  ctx.beginPath()
  // Con selección, sus aristas; sin ella, las del nodo bajo el cursor (vista previa estilo Obsidian).
  const focusId = s.selectedId ?? (s.highlight ? s.hoverId : null)
  for (const l of links) {
    if (focusId && (l.source.id === focusId || l.target.id === focusId)) active.push(l)
    else segment(ctx, view, l)
  }
  ctx.stroke()
  if (active.length > 0) {
    ctx.globalAlpha = 1
    ctx.strokeStyle = palette.edgeActive
    ctx.lineWidth = 1.6
    ctx.beginPath()
    for (const l of active) segment(ctx, view, l)
    ctx.stroke()
  }

  // 2. Nodos: puntos de color por tipo; el enfocado lleva halo con brillo pulsante.
  const pulse = 0.5 + 0.5 * Math.sin(s.time / 320)
  for (const n of nodes) {
    const p = toScreen(view, n.x, n.y)
    const r = screenRadius(n.radius, view.k)
    if (p.x < -r || p.y < -r || p.x > s.width + r || p.y > s.height + r) continue
    const color = palette.node[n.node.type]
    const selected = n.id === s.selectedId
    if (selected) {
      ctx.shadowColor = color
      ctx.shadowBlur = 16 + 16 * pulse
      ctx.globalAlpha = 0.25
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(p.x, p.y, r + 6 + 3 * pulse, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = s.highlight && !s.highlight.has(n.id) ? DIM_ALPHA : 1
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, TAU)
    ctx.fill()
    ctx.shadowBlur = 0
    // Contorno fino del color del escenario: separa los puntos de las aristas que pasan por debajo.
    ctx.strokeStyle = palette.labelHalo
    ctx.lineWidth = 1.25
    ctx.stroke()
    if (selected || n.id === s.hoverId) {
      ctx.globalAlpha = 1
      ctx.strokeStyle = palette.ring
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(p.x, p.y, r + 3, 0, TAU)
      ctx.stroke()
    }
  }

  // 3. Etiquetas encima de todo, con contorno del color del escenario.
  ctx.font = '600 11px Manrope, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  for (const n of nodes) {
    const alpha = labelAlpha(n, s)
    if (alpha <= 0) continue
    const p = toScreen(view, n.x, n.y)
    if (p.x < -200 || p.y < -40 || p.x > s.width + 200 || p.y > s.height + 40) continue
    const text = n.node.label.length > MAX_LABEL ? `${n.node.label.slice(0, MAX_LABEL - 1)}…` : n.node.label
    const y = p.y + screenRadius(n.radius, view.k) + 4
    ctx.globalAlpha = alpha
    ctx.lineWidth = 3
    ctx.strokeStyle = palette.labelHalo
    ctx.strokeText(text, p.x, y)
    ctx.fillStyle = palette.label
    ctx.fillText(text, p.x, y)
  }
  ctx.globalAlpha = 1
}

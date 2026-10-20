import { describe, expect, it } from 'vitest'
import type { GraphData } from './api'
import { toScreen } from './camera'
import { Ctx2D, DIM_ALPHA, drawGraph, DrawState, labelAlpha } from './draw'
import { buildSimGraph } from './layout'
import { neighborIds } from './model'
import { graphPalette } from './palette'

/** Contexto falso que graba lo que se pinta (jsdom no implementa canvas). */
class Recorder implements Ctx2D {
  globalAlpha = 1
  fillStyle = ''
  strokeStyle = ''
  lineWidth = 1
  shadowBlur = 0
  shadowColor = ''
  font = ''
  textAlign: CanvasTextAlign = 'start'
  textBaseline: CanvasTextBaseline = 'alphabetic'
  lineJoin: CanvasLineJoin = 'miter'
  fills: Array<{ x: number; y: number; color: string; alpha: number; blur: number }> = []
  texts: Array<{ text: string; alpha: number }> = []
  private arcAt: { x: number; y: number } | null = null
  setTransform() {}
  clearRect() {}
  beginPath() {
    this.arcAt = null
  }
  moveTo() {}
  lineTo() {}
  stroke() {}
  strokeText() {}
  arc(x: number, y: number) {
    this.arcAt = { x, y }
  }
  fill() {
    if (this.arcAt) this.fills.push({ ...this.arcAt, color: this.fillStyle, alpha: this.globalAlpha, blur: this.shadowBlur })
  }
  fillText(text: string) {
    this.texts.push({ text, alpha: this.globalAlpha })
  }
}

// Un concentrador (grado 6) con seis rasgos alrededor y una fuente aislada.
const traits = ['a', 'b', 'c', 'd', 'e', 'f']
const DATA: GraphData = {
  truncated: false,
  nodes: [
    { id: 'species:hub', type: 'species', label: 'Lechuga', origin: null, meta: {} },
    ...traits.map((t) => ({ id: `trait:${t}`, type: 'trait' as const, label: `Rasgo ${t}`, origin: 'missing', meta: {} })),
    { id: 'source:s', type: 'source', label: 'Fuente suelta', origin: null, meta: {} },
  ],
  edges: traits.map((t) => ({ src: 'species:hub', dst: `trait:${t}`, relation: 'has_trait', provenance: [] })),
}

function scene() {
  const { nodes, links } = buildSimGraph(DATA)
  for (const n of nodes) {
    const i = traits.indexOf(n.id.replace('trait:', ''))
    if (n.id === 'species:hub') Object.assign(n, { x: 0, y: 0 })
    else if (n.id === 'source:s') Object.assign(n, { x: 200, y: 0 })
    else Object.assign(n, { x: 60 * Math.cos(i), y: 60 * Math.sin(i) })
  }
  return { nodes, links }
}

function state(over: Partial<DrawState> = {}): DrawState {
  return {
    view: { k: 0.8, x: 400, y: 300 },
    width: 800,
    height: 600,
    dpr: 1,
    palette: graphPalette(true),
    selectedId: null,
    hoverId: null,
    highlight: null,
    time: 0,
    ...over,
  }
}

function draw(over: Partial<DrawState> = {}) {
  const { nodes, links } = scene()
  const ctx = new Recorder()
  drawGraph(ctx, nodes, links, state(over))
  return { ctx, nodes }
}

describe('drawGraph', () => {
  it('alejado solo rotula los concentradores', () => {
    const { ctx } = draw()
    expect(ctx.texts.map((t) => t.text)).toEqual(['Lechuga'])
  })

  it('al acercar rotula todo, con fundido intermedio', () => {
    const { ctx } = draw({ view: { k: 1.5, x: 400, y: 300 } })
    expect(ctx.texts).toHaveLength(8)
    expect(ctx.texts.every((t) => t.alpha === 1)).toBe(true)
    const { nodes } = scene()
    const leaf = nodes.find((n) => n.id === 'trait:a')!
    const mid = labelAlpha(leaf, state({ view: { k: 1.075, x: 0, y: 0 } }))
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('con foco atenúa lo ajeno, rotula al nodo y sus vecinos y solo el enfocado brilla', () => {
    const highlight = neighborIds('trait:a', DATA.edges)
    const view = { k: 0.8, x: 400, y: 300 }
    const { ctx, nodes } = draw({ selectedId: 'trait:a', highlight, view })
    expect(ctx.texts.map((t) => t.text).sort()).toEqual(['Lechuga', 'Rasgo a'])

    const at = (id: string) => {
      const n = nodes.find((x) => x.id === id)!
      return toScreen(view, n.x, n.y)
    }
    const near = (f: { x: number; y: number }, p: { x: number; y: number }) => Math.abs(f.x - p.x) < 1e-6 && Math.abs(f.y - p.y) < 1e-6

    const loose = ctx.fills.filter((f) => near(f, at('source:s')))
    expect(loose.length).toBeGreaterThan(0)
    expect(loose.every((f) => f.alpha === DIM_ALPHA)).toBe(true)
    expect(ctx.fills.filter((f) => near(f, at('trait:b'))).every((f) => f.alpha === DIM_ALPHA)).toBe(true)
    expect(ctx.fills.filter((f) => near(f, at('species:hub'))).every((f) => f.alpha === 1)).toBe(true)

    const glowing = ctx.fills.filter((f) => f.blur > 0)
    expect(glowing.length).toBeGreaterThan(0)
    expect(glowing.every((f) => near(f, at('trait:a')) && f.color === graphPalette(true).node.trait)).toBe(true)
  })

  it('sin foco nada brilla ni se atenúa', () => {
    const { ctx } = draw()
    expect(ctx.fills.every((f) => f.blur === 0 && f.alpha === 1)).toBe(true)
  })

  it('pinta con los colores de la paleta recibida', () => {
    const dark = draw({ palette: graphPalette(true) }).ctx.fills.map((f) => f.color)
    const light = draw({ palette: graphPalette(false) }).ctx.fills.map((f) => f.color)
    expect(dark).toContain(graphPalette(true).node.species)
    expect(light).toContain(graphPalette(false).node.species)
    expect(light).not.toContain(graphPalette(true).node.species)
  })

  it('al pasar el cursor sin selección resalta al nodo y sus vecinos, sin brillo', () => {
    const highlight = neighborIds('trait:a', DATA.edges)
    const { ctx } = draw({ hoverId: 'trait:a', highlight })
    expect(ctx.texts.map((t) => t.text).sort()).toEqual(['Lechuga', 'Rasgo a'])
    expect(ctx.fills.every((f) => f.blur === 0)).toBe(true)
    expect(ctx.fills.some((f) => f.alpha === DIM_ALPHA)).toBe(true)
  })
})

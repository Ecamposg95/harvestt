import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  Simulation,
  SimulationLinkDatum,
  SimulationNodeDatum,
} from 'd3-force'
import type { GraphData, GraphNode } from './api'

export interface SimNode extends SimulationNodeDatum {
  id: string
  node: GraphNode
  degree: number
  radius: number
  x: number
  y: number
}

export interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode
  target: SimNode
  relation: string
  key: string
}

export type Positions = Map<string, { x: number; y: number }>

/** FNV-1a de 32 bits: semilla estable a partir de un texto. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** PRNG pequeño y determinista en [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function nodeRadius(degree: number): number {
  return 4 + Math.min(10, Math.sqrt(degree) * 2.2)
}

/** Posición inicial dentro de un disco, derivada solo del id (independiente del orden de llegada). */
export function initialPosition(id: string, spread: number): { x: number; y: number } {
  const rnd = mulberry32(hashSeed(id))
  const angle = rnd() * Math.PI * 2
  const r = spread * Math.sqrt(rnd())
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
}

export function buildSimGraph(data: GraphData, previous?: Positions): { nodes: SimNode[]; links: SimLink[] } {
  const spread = 40 * Math.sqrt(Math.max(1, data.nodes.length))
  const nodes: SimNode[] = data.nodes.map((node) => {
    const p = previous?.get(node.id) ?? initialPosition(node.id, spread)
    return { id: node.id, node, degree: 0, radius: nodeRadius(0), x: p.x, y: p.y }
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const links: SimLink[] = []
  for (const e of data.edges) {
    const source = byId.get(e.src)
    const target = byId.get(e.dst)
    if (!source || !target) continue
    links.push({ source, target, relation: e.relation, key: `${e.src}|${e.dst}|${e.relation}` })
    source.degree += 1
    target.degree += 1
  }
  for (const n of nodes) n.radius = nodeRadius(n.degree)
  return { nodes, links }
}

const LINK_DISTANCE: Record<string, number> = {
  cultivar_of: 30,
  has_cycle: 36,
  grows: 46,
  has_trait: 60,
  cites: 72,
}

/** Simulación detenida: el llamador la avanza con tick() (bucle de animación) o settle() (pruebas). */
export function createSimulation(
  nodes: SimNode[],
  links: SimLink[],
  { seed = 7, alpha = 1 }: { seed?: number; alpha?: number } = {},
): Simulation<SimNode, SimLink> {
  return forceSimulation<SimNode, SimLink>(nodes)
    .randomSource(mulberry32(seed))
    .force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((n) => n.id)
        .distance((l) => LINK_DISTANCE[l.relation] ?? 56),
    )
    .force('charge', forceManyBody<SimNode>().strength((n) => -70 - n.degree * 10).distanceMax(420))
    .force('collide', forceCollide<SimNode>((n) => n.radius + 4))
    // Gravedad suave: los nodos aislados (prototipos sin relaciones) no se van del cuadro.
    .force('x', forceX<SimNode>(0).strength(0.045))
    .force('y', forceY<SimNode>(0).strength(0.045))
    .alpha(alpha)
    .stop()
}

export function settle(sim: Simulation<SimNode, SimLink>, ticks: number): void {
  sim.tick(ticks)
}

export function positionsOf(nodes: SimNode[]): Positions {
  return new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]))
}

/** Si la mayoría de los nodos ya tenía posición (p. ej. tras filtrar), reacomodar con poca energía. */
export function warmAlpha(data: GraphData, previous: Positions): number {
  if (data.nodes.length === 0) return 1
  const known = data.nodes.filter((n) => previous.has(n.id)).length
  return known / data.nodes.length >= 0.5 ? 0.35 : 1
}

/** Nodo más cercano a (wx, wy) en coordenadas del mundo; radiusScale convierte el radio a mundo. */
export function hitTest(nodes: SimNode[], wx: number, wy: number, radiusScale: number, slop: number): SimNode | null {
  let best: SimNode | null = null
  let bestDist = Infinity
  for (const n of nodes) {
    const d = Math.hypot(n.x - wx, n.y - wy)
    if (d <= n.radius * radiusScale + slop && d < bestDist) {
      best = n
      bestDist = d
    }
  }
  return best
}

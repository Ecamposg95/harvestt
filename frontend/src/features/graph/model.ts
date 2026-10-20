import { ORIGIN_META, Origin } from '@/components/ui'
import { label, REVIEW_LABELS, VARIABLE_LABELS } from '@/features/catalog/labels'
import { GraphData, GraphEdge, GraphNode, NODE_TYPES, NodeType, Provenance, splitNodeId } from './api'

export const TYPE_META: Record<NodeType, { label: string; plural: string }> = {
  species: { label: 'Especie', plural: 'Especies' },
  cultivar: { label: 'Cultivar', plural: 'Cultivares' },
  trait: { label: 'Rasgo', plural: 'Rasgos' },
  source: { label: 'Fuente', plural: 'Fuentes' },
  project: { label: 'Proyecto', plural: 'Proyectos' },
  crop_cycle: { label: 'Ciclo de cultivo', plural: 'Ciclos' },
  prototype: { label: 'Prototipo', plural: 'Prototipos' },
}

/** [desde el origen, desde el destino] */
const RELATION_LABELS: Record<string, [string, string]> = {
  cultivar_of: ['Cultivar de', 'Cultivar registrado'],
  has_trait: ['Rasgo registrado', 'Especie o cultivar con el rasgo'],
  cites: ['Cita', 'Citada por'],
  grows: ['Cultiva', 'Cultivada en el ciclo'],
  has_cycle: ['Ciclo del proyecto', 'Pertenece al proyecto'],
  designed_for: ['Diseñado para', 'Prototipo diseñado para esta'],
  related_to: ['Relacionado con', 'Relacionado con'],
}

export function relationLabel(relation: string, outgoing: boolean): string {
  const pair = RELATION_LABELS[relation]
  return pair ? pair[outgoing ? 0 : 1] : relation
}

export type NodeLink =
  | { kind: 'internal'; to: string; label: string }
  | { kind: 'external'; href: string; label: string }
  | null

/** Pantalla del recurso. Los rasgos no tienen pantalla propia. */
export function nodeLink(node: GraphNode): NodeLink {
  const { rawId } = splitNodeId(node.id)
  const meta = node.meta ?? {}
  switch (node.type) {
    case 'species':
      return { kind: 'internal', to: `/app/plants/${rawId}`, label: 'Abrir ficha de la especie' }
    case 'cultivar':
      return meta.species_id ? { kind: 'internal', to: `/app/plants/${meta.species_id}`, label: 'Abrir ficha de la especie' } : null
    case 'project':
      return { kind: 'internal', to: `/app/projects/${rawId}`, label: 'Abrir proyecto' }
    case 'crop_cycle':
      return meta.project_id ? { kind: 'internal', to: `/app/projects/${meta.project_id}`, label: 'Abrir proyecto del ciclo' } : null
    case 'prototype':
      return { kind: 'internal', to: `/app/prototypes/${rawId}`, label: 'Abrir prototipo' }
    case 'source':
      return meta.url ? { kind: 'external', href: meta.url, label: 'Abrir fuente original' } : null
    default:
      return null
  }
}

/** Minúsculas y sin acentos. */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function searchNodes(nodes: GraphNode[], query: string, limit = 8): GraphNode[] {
  const q = fold(query.trim())
  if (!q) return []
  const scored: Array<{ node: GraphNode; score: number }> = []
  for (const node of nodes) {
    const haystack = [node.label, node.meta?.scientific_name ?? ''].map(fold)
    if (haystack.some((h) => h.startsWith(q))) scored.push({ node, score: 0 })
    else if (haystack.some((h) => h.includes(q))) scored.push({ node, score: 1 })
  }
  scored.sort((a, b) => a.score - b.score || a.node.label.localeCompare(b.node.label, 'es'))
  return scored.slice(0, limit).map((s) => s.node)
}

export interface Connection {
  edge: GraphEdge
  other: GraphNode
  outgoing: boolean
}

export function connectionsOf(id: string, data: GraphData): Connection[] {
  const byId = new Map(data.nodes.map((n) => [n.id, n]))
  const out: Connection[] = []
  for (const edge of data.edges) {
    if (edge.src === id && byId.has(edge.dst)) out.push({ edge, other: byId.get(edge.dst)!, outgoing: true })
    else if (edge.dst === id && byId.has(edge.src)) out.push({ edge, other: byId.get(edge.src)!, outgoing: false })
  }
  return out.sort(
    (a, b) =>
      relationLabel(a.edge.relation, a.outgoing).localeCompare(relationLabel(b.edge.relation, b.outgoing), 'es') ||
      a.other.label.localeCompare(b.other.label, 'es'),
  )
}

/** El nodo y sus vecinos directos. */
export function neighborIds(id: string, edges: Array<Pick<GraphEdge, 'src' | 'dst'>>): Set<string> {
  const ids = new Set([id])
  for (const e of edges) {
    if (e.src === id) ids.add(e.dst)
    else if (e.dst === id) ids.add(e.src)
  }
  return ids
}

export function countByType(nodes: GraphNode[]): Record<NodeType, number> {
  const counts = Object.fromEntries(NODE_TYPES.map((t) => [t, 0])) as Record<NodeType, number>
  for (const n of nodes) counts[n.type] += 1
  return counts
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

export function describeProvenance(p: Provenance, nodesById?: Map<string, GraphNode>): string {
  switch (p.kind) {
    case 'fk':
      return 'Vínculo registrado en la plataforma'
    case 'assertion': {
      const origin = ORIGIN_META[p.origin as Origin]?.label ?? String(p.origin ?? '—')
      return `Afirmación · ${origin} · ${label(REVIEW_LABELS, text(p.review_status))}`
    }
    case 'evidence':
      return [`Evidencia de ${label(VARIABLE_LABELS, text(p.variable))}`, text(p.locator)].filter(Boolean).join(' · ')
    case 'external_id':
      return `Identificador ${String(p.system ?? '').toUpperCase()} ${text(p.external_id) ?? ''}`.trim()
    case 'edge': {
      const parts = [p.scope === 'global' ? 'Relación global' : 'Relación de la organización']
      const sourceId = text(p.source_id)
      const source = sourceId ? nodesById?.get(`source:${sourceId}`) : undefined
      if (source) parts.push(`Fuente: ${source.label}`)
      const locator = text(p.locator)
      if (locator) parts.push(locator)
      const note = text(p.note)
      if (note) parts.push(note)
      return parts.join(' · ')
    }
    default:
      return 'Procedencia registrada'
  }
}

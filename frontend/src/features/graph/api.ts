import { api } from '@/api/client'

export const NODE_TYPES = ['species', 'cultivar', 'trait', 'source', 'project', 'crop_cycle', 'prototype'] as const
export type NodeType = (typeof NODE_TYPES)[number]

export interface GraphNode {
  /** "<tipo>:<id>"; en rasgos el id es la variable (trait:photoperiod). */
  id: string
  type: NodeType
  label: string
  origin: string | null
  meta: Record<string, string | null>
}

/** Una razón por la que existe la arista: fk | assertion | evidence | external_id | edge. */
export interface Provenance {
  kind: string
  [key: string]: unknown
}

export interface GraphEdge {
  src: string
  dst: string
  relation: string
  provenance: Provenance[]
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  truncated: boolean
}

export interface GraphQuery {
  /** Id de nodo completo ("species:<id>"); null = grafo completo. */
  focus?: string | null
  depth?: number
  types?: NodeType[] | null
}

export function splitNodeId(id: string): { type: NodeType; rawId: string } {
  const i = id.indexOf(':')
  return { type: id.slice(0, i) as NodeType, rawId: id.slice(i + 1) }
}

export function graphParams(q: GraphQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  if (q.focus) {
    const { type, rawId } = splitNodeId(q.focus)
    params.focus_type = type
    params.focus_id = rawId
    params.depth = q.depth ?? 2
  }
  if (q.types && q.types.length > 0 && q.types.length < NODE_TYPES.length) params.types = q.types.join(',')
  return params
}

export const graphApi = {
  get: (q: GraphQuery = {}) => api.get<GraphData>('/graph', { params: graphParams(q) }).then((r) => r.data),
}

import { describe, expect, it } from 'vitest'
import { GraphNode, graphParams, NODE_TYPES, splitNodeId } from './api'
import { FIXTURE } from './fixtures'
import { connectionsOf, countByType, describeProvenance, neighborIds, nodeLink, relationLabel, searchNodes } from './model'

const byId = new Map(FIXTURE.nodes.map((n) => [n.id, n]))
const node = (id: string) => byId.get(id)!

describe('api', () => {
  it('separa el tipo del id crudo en el primer ":"', () => {
    expect(splitNodeId('species:sp1')).toEqual({ type: 'species', rawId: 'sp1' })
    expect(splitNodeId('trait:ph')).toEqual({ type: 'trait', rawId: 'ph' })
  })

  it('arma los parámetros: foco con profundidad y tipos solo si hay filtro', () => {
    expect(graphParams({})).toEqual({})
    expect(graphParams({ focus: 'species:sp1' })).toEqual({ focus_type: 'species', focus_id: 'sp1', depth: 2 })
    expect(graphParams({ focus: 'trait:ph', depth: 3, types: [...NODE_TYPES] })).toEqual({
      focus_type: 'trait',
      focus_id: 'ph',
      depth: 3,
    })
    expect(graphParams({ focus: null, depth: 3, types: ['species', 'trait'] })).toEqual({ types: 'species,trait' })
  })
})

describe('searchNodes', () => {
  it('busca por etiqueta y nombre científico sin acentos ni mayúsculas', () => {
    expect(searchNodes(FIXTURE.nodes, 'lactuca').map((n) => n.id)).toEqual(['species:sp1'])
    expect(searchNodes(FIXTURE.nodes, 'GBIF').map((n) => n.id)).toEqual(['source:gbif'])
    const accented: GraphNode[] = [{ id: 'trait:x', type: 'trait', label: 'Fotoperíodo', origin: null, meta: {} }]
    expect(searchNodes(accented, 'fotoperiodo')).toHaveLength(1)
  })

  it('pone primero las coincidencias al inicio y respeta el límite', () => {
    expect(searchNodes(FIXTURE.nodes, 'lechuga').map((n) => n.label)).toEqual(['Lechuga', 'Ciclo · Lechuga'])
    expect(searchNodes(FIXTURE.nodes, 'e', 2)).toHaveLength(2)
    expect(searchNodes(FIXTURE.nodes, '   ')).toEqual([])
  })
})

describe('nodeLink', () => {
  it('enlaza la pantalla del recurso según el tipo', () => {
    expect(nodeLink(node('species:sp1'))).toEqual({ kind: 'internal', to: '/app/plants/sp1', label: 'Abrir ficha de la especie' })
    expect(nodeLink(node('crop_cycle:c1'))).toEqual({ kind: 'internal', to: '/app/projects/p1', label: 'Abrir proyecto del ciclo' })
    expect(nodeLink(node('project:p1'))).toEqual({ kind: 'internal', to: '/app/projects/p1', label: 'Abrir proyecto' })
    expect(nodeLink(node('prototype:pr1'))).toEqual({ kind: 'internal', to: '/app/prototypes/pr1', label: 'Abrir prototipo' })
    expect(nodeLink(node('source:gbif'))).toEqual({ kind: 'external', href: 'https://www.gbif.org/', label: 'Abrir fuente original' })
    expect(nodeLink(node('trait:photoperiod'))).toBeNull()
    expect(nodeLink({ id: 'cultivar:cv1', type: 'cultivar', label: 'Grand Rapids', origin: null, meta: { species_id: 'sp1' } })).toEqual({
      kind: 'internal',
      to: '/app/plants/sp1',
      label: 'Abrir ficha de la especie',
    })
    expect(nodeLink({ id: 'source:s', type: 'source', label: 'Sin enlace', origin: null, meta: { url: null } })).toBeNull()
  })
})

describe('conexiones y procedencia', () => {
  it('lista conexiones salientes y entrantes con su etiqueta de relación', () => {
    const items = connectionsOf('species:sp1', FIXTURE).map((c) => [relationLabel(c.edge.relation, c.outgoing), c.other.label])
    expect(items).toEqual([
      ['Cita', 'GBIF Backbone Taxonomy'],
      ['Cultivada en el ciclo', 'Ciclo · Lechuga'],
      ['Rasgo registrado', 'Fotoperiodo'],
    ])
  })

  it('calcula vecinos incluyendo al propio nodo', () => {
    expect([...neighborIds('trait:photoperiod', FIXTURE.edges)].sort()).toEqual(['species:sp1', 'trait:photoperiod'])
  })

  it('cuenta nodos por tipo con ceros explícitos', () => {
    expect(countByType(FIXTURE.nodes)).toEqual({ species: 1, cultivar: 0, trait: 1, source: 1, project: 1, crop_cycle: 1, prototype: 1 })
  })

  it('describe cada tipo de procedencia en español', () => {
    expect(describeProvenance(FIXTURE.edges[0].provenance[0])).toBe('Afirmación · Desconocido · Sin revisar')
    expect(describeProvenance(FIXTURE.edges[1].provenance[0])).toBe('Identificador GBIF 7403263')
    expect(describeProvenance({ kind: 'fk', field: 'crop_cycles.species_id' })).toBe('Vínculo registrado en la plataforma')
    expect(describeProvenance({ kind: 'evidence', assertion_id: 'a', variable: 'photoperiod', locator: 'p. 12' })).toBe(
      'Evidencia de Fotoperiodo · p. 12',
    )
    expect(describeProvenance({ kind: 'edge', scope: 'global', source_id: 'gbif', note: 'Guía 2024' }, byId)).toBe(
      'Relación global · Fuente: GBIF Backbone Taxonomy · Guía 2024',
    )
    expect(describeProvenance({ kind: 'edge', scope: 'organization' })).toBe('Relación de la organización')
    expect(describeProvenance({ kind: 'otro' })).toBe('Procedencia registrada')
  })
})

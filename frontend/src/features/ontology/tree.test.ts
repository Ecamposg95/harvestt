import { describe, expect, it } from 'vitest'
import type { TermSummary } from './api'
import { buildTree } from './tree'

function term(id: string, label: string, parent_id: string | null = null, domain = 'plant'): TermSummary {
  return { id, hvt_id: null, domain, parent_id, label, status: 'published', unit: null }
}

describe('buildTree', () => {
  it('arma la jerarquía por dominio', () => {
    const tree = buildTree([
      term('stage', 'Etapa fenológica'),
      term('germ', 'Germinación', 'stage'),
      term('flor', 'Floración', 'stage'),
      term('sp', 'Especie', null, 'organism'),
    ])
    expect(tree.plant).toHaveLength(1)
    expect(tree.plant[0].id).toBe('stage')
    expect(tree.plant[0].children.map((c) => c.label)).toEqual(['Floración', 'Germinación'])
    expect(tree.organism.map((n) => n.id)).toEqual(['sp'])
    expect(tree.trait).toEqual([])
    expect(tree.node).toEqual([])
  })

  it('ordena por etiqueta con reglas del español: «Ácido» antes de «Bano»', () => {
    const tree = buildTree([term('b', 'Bano'), term('z', 'Zinc'), term('a', 'Ácido')])
    expect(tree.plant.map((n) => n.label)).toEqual(['Ácido', 'Bano', 'Zinc'])
  })

  it('un término cuyo padre no está en la lista queda como raíz', () => {
    const tree = buildTree([term('root', 'Raíz'), term('orphan', 'Huérfano', 'missing')])
    expect(tree.plant.map((n) => n.id)).toEqual(['orphan', 'root'])
    expect(tree.plant.every((n) => n.children.length === 0)).toBe(true)
  })

  it('un padre de otro dominio no adopta al término', () => {
    const tree = buildTree([term('p', 'Padre', null, 'organism'), term('c', 'Hijo', 'p', 'plant')])
    expect(tree.plant.map((n) => n.id)).toEqual(['c'])
    expect(tree.organism[0].children).toEqual([])
  })
})

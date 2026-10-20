import { describe, expect, it } from 'vitest'
import type { GraphData } from './api'
import { FIXTURE } from './fixtures'
import {
  buildSimGraph,
  createSimulation,
  hashSeed,
  hitTest,
  initialPosition,
  mulberry32,
  nodeRadius,
  positionsOf,
  settle,
  warmAlpha,
} from './layout'

function settled(data: GraphData, ticks = 200) {
  const { nodes, links } = buildSimGraph(data)
  const sim = createSimulation(nodes, links, { seed: 7 })
  settle(sim, ticks)
  return positionsOf(nodes)
}

describe('layout', () => {
  it('es determinista: mismos datos y semilla dan las mismas posiciones tras N pasos', () => {
    const a = settled(FIXTURE)
    const b = settled(FIXTURE)
    expect([...a.entries()]).toEqual([...b.entries()])
    for (const p of a.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  it('la posición inicial depende del id y no del orden de llegada', () => {
    const a = buildSimGraph(FIXTURE).nodes
    const b = buildSimGraph({ ...FIXTURE, nodes: [...FIXTURE.nodes].reverse() }).nodes
    for (const n of a) {
      const m = b.find((x) => x.id === n.id)!
      expect([m.x, m.y]).toEqual([n.x, n.y])
    }
  })

  it('conserva la posición previa de los nodos que siguen visibles', () => {
    const previous = new Map([['species:sp1', { x: 123, y: -45 }]])
    const sp = buildSimGraph(FIXTURE, previous).nodes.find((n) => n.id === 'species:sp1')!
    expect([sp.x, sp.y]).toEqual([123, -45])
  })

  it('calcula grado y radio con las aristas válidas e ignora las de extremos ausentes', () => {
    const data: GraphData = {
      ...FIXTURE,
      edges: [...FIXTURE.edges, { src: 'species:sp1', dst: 'trait:fantasma', relation: 'has_trait', provenance: [] }],
    }
    const { nodes, links } = buildSimGraph(data)
    expect(links).toHaveLength(4)
    const sp = nodes.find((n) => n.id === 'species:sp1')!
    expect(sp.degree).toBe(3)
    expect(sp.radius).toBe(nodeRadius(3))
    expect(nodes.find((n) => n.id === 'prototype:pr1')!.degree).toBe(0)
    expect(nodeRadius(0)).toBe(4)
    expect(nodeRadius(100)).toBe(14)
  })

  it('warmAlpha arranca en frío salvo que la mayoría ya tenga posición', () => {
    expect(warmAlpha(FIXTURE, new Map())).toBe(1)
    const all = new Map(FIXTURE.nodes.map((n) => [n.id, { x: 0, y: 0 }]))
    expect(warmAlpha(FIXTURE, all)).toBe(0.35)
  })

  it('hitTest elige el nodo más cercano dentro de su radio más la holgura', () => {
    const { nodes } = buildSimGraph(FIXTURE)
    nodes.forEach((n, i) => {
      n.x = i * 100
      n.y = 0
    })
    expect(hitTest(nodes, 102, 1, 1, 0)?.id).toBe(nodes[1].id)
    expect(hitTest(nodes, 50, 0, 1, 0)).toBeNull()
    expect(hitTest(nodes, 50, 0, 1, 50)?.id).toBe(nodes[0].id)
  })

  it('PRNG, hash y posición inicial son deterministas y acotados', () => {
    expect(hashSeed('species:sp1')).toBe(hashSeed('species:sp1'))
    expect(hashSeed('a')).not.toBe(hashSeed('b'))
    const r1 = mulberry32(42)
    const r2 = mulberry32(42)
    const s1 = [r1(), r1(), r1()]
    expect([r2(), r2(), r2()]).toEqual(s1)
    for (const v of s1) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const p = initialPosition('x', 100)
    expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(100)
  })

  it('la simulación se enfría: tras muchos pasos alpha queda bajo el mínimo', () => {
    const { nodes, links } = buildSimGraph(FIXTURE)
    const sim = createSimulation(nodes, links, { seed: 7 })
    settle(sim, 400)
    expect(sim.alpha()).toBeLessThan(sim.alphaMin())
  })
})

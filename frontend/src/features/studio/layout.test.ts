import { describe, expect, it } from 'vitest'
import { groupInstances } from '@/features/three/plants/instances'
import type { LayoutZone } from './api'
import {
  addPlant,
  addZone,
  fillZone,
  floorFor,
  indexFromSelection,
  instancesFor,
  layoutPayload,
  MAX_PLACEMENTS,
  movePlant,
  movePlantToFloor,
  moveZone,
  selectionFromIndex,
} from './layout'

const cycle = { id: 'c1', species_id: 's1', species_name: 'Lactuca sativa L.' }
const floor = { width: 10, depth: 10, illustrative: false }

function zones(): LayoutZone[] {
  return [
    {
      id: 'z1',
      name: 'Mesa A',
      x: 1,
      y: 2,
      width: 4,
      depth: 2,
      placements: [
        { id: 'p1', species_id: 's1', species_name: 'Lactuca sativa L.', crop_cycle_id: 'c1', stage: 'mature', x: 0.5, y: 0.5, rotation: 0 },
        { id: 'p2', species_id: 's2', species_name: 'Ocimum basilicum L.', crop_cycle_id: null, stage: 'seedling', x: 1.5, y: 1, rotation: 90 },
      ],
    },
    { id: 'z2', name: 'Mesa B', x: 6, y: 2, width: 2, depth: 2, placements: [] },
  ]
}

describe('piso', () => {
  it('con área usa el del servidor; sin área crece con las zonas', () => {
    expect(floorFor({ floor }, zones())).toEqual(floor)
    const illustrative = { floor: { width: 10, depth: 10, illustrative: true } }
    expect(floorFor(illustrative, [{ ...zones()[1], x: 12 }])).toEqual({ width: 14, depth: 10, illustrative: true })
  })
})

describe('edición', () => {
  it('addZone apila zonas sin salirse del piso', () => {
    let list: LayoutZone[] = []
    for (let i = 0; i < 6; i++) list = addZone(list, floor)
    expect(list.map((z) => z.name)).toEqual(['Zona 1', 'Zona 2', 'Zona 3', 'Zona 4', 'Zona 5', 'Zona 6'])
    for (const z of list) {
      expect(z.x + z.width).toBeLessThanOrEqual(floor.width)
      expect(z.y + z.depth).toBeLessThanOrEqual(floor.depth)
    }
  })

  it('addPlant coloca la planta del ciclo dentro de la zona; fillZone llena con cuadrícula', () => {
    const added = addPlant(zones(), 1, cycle, 'vegetative')
    expect(added[1].placements[0]).toMatchObject({ species_id: 's1', crop_cycle_id: 'c1', stage: 'vegetative', rotation: 0 })
    const filled = fillZone(zones(), 0, cycle, 'mature')
    expect(filled[0].placements).toHaveLength(13 * 7) // 4 × 2 m cada 0,3 m: 13 columnas × 7 filas
    for (const p of filled[0].placements) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(4)
      expect(p.y).toBeLessThanOrEqual(2)
    }
    const huge = [{ ...zones()[0], width: 1000, depth: 1000, placements: [] }]
    expect(fillZone(huge, 0, cycle, 'mature')[0].placements).toHaveLength(MAX_PLACEMENTS)
  })

  it('mover una planta la mantiene dentro de su zona', () => {
    const sel = { zone: 0, plant: 0 }
    expect(movePlant(zones(), sel, 9, -3)[0].placements[0]).toMatchObject({ x: 4, y: 0 })
    // Coordenadas de piso → relativas a la zona (origen en 1, 2)
    expect(movePlantToFloor(zones(), sel, 2.25, 3.5)[0].placements[0]).toMatchObject({ x: 1.25, y: 1.5 })
  })

  it('mover una zona la mantiene dentro del piso con área', () => {
    expect(moveZone(zones(), 0, 9, 9, floor)[0]).toMatchObject({ x: 6, y: 8 })
    expect(moveZone(zones(), 0, 30, 1, { ...floor, illustrative: true })[0]).toMatchObject({ x: 30, y: 1 })
  })

  it('layoutPayload quita ids y nombres derivados', () => {
    const body = layoutPayload(3, zones())
    expect(body.version).toBe(3)
    expect(body.zones[0]).toEqual({
      name: 'Mesa A',
      x: 1,
      y: 2,
      width: 4,
      depth: 2,
      placements: [
        { species_id: 's1', crop_cycle_id: 'c1', stage: 'mature', x: 0.5, y: 0.5, rotation: 0 },
        { species_id: 's2', crop_cycle_id: null, stage: 'seedling', x: 1.5, y: 1, rotation: 90 },
      ],
    })
  })
})

describe('instancias', () => {
  it('posición en el piso = zona + planta, con especie y etapa', () => {
    const list = instancesFor(zones())
    expect(list[1]).toMatchObject({ index: 1, kind: 'basil', stage: 'seedling', x: 2.5, z: 3, rotationDeg: 90 })
  })

  it('instancesFor: la variante sobrevive a guardar (los ids cambian en cada PUT)', () => {
    const saved = zones().map((z) => ({ ...z, id: `nuevo-${z.id}`, placements: z.placements.map((p) => ({ ...p, id: `n-${p.id}` })) }))
    expect(instancesFor(saved).map((i) => i.variant)).toEqual(instancesFor(zones()).map((i) => i.variant))
  })

  it('una zona llena de lechugas se dibuja con 3 grupos como máximo', () => {
    const filled = fillZone(zones(), 0, cycle, 'mature')
    expect(groupInstances(instancesFor(filled)).length).toBeLessThanOrEqual(3)
  })

  it('índice plano ↔ selección', () => {
    const list = zones()
    expect(selectionFromIndex(list, 1)).toEqual({ zone: 0, plant: 1 })
    expect(selectionFromIndex(list, 2)).toBeNull()
    expect(indexFromSelection(list, { zone: 0, plant: 1 })).toBe(1)
    expect(indexFromSelection(list, { zone: 1, plant: null })).toBeNull()
  })
})

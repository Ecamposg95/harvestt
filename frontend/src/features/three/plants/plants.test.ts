import * as THREE from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { generateBasil } from './generators'
import { buildInstancedPlants } from './instancedPlants'
import { groupInstances, PlantInstance } from './instances'
import { buildPlantModel, clearPlantCache, getPlantModel, plantCacheSize } from './model'
import { hashString, mulberry32, seededRandom } from './random'
import { frameCamera } from './scene'
import { leafTip } from './shapes'
import { PLANT_STAGES, PlantKind, plantKindFor, variantFor } from './types'

const KINDS: PlantKind[] = ['lettuce', 'tomato', 'basil', 'generic']

function values(g: THREE.BufferGeometry | undefined, name: 'position' | 'normal' = 'position'): number[] {
  return Array.from((g!.getAttribute(name) as THREE.BufferAttribute).array)
}

beforeEach(() => clearPlantCache())

describe('azar con semilla', () => {
  it('misma semilla, misma serie; otra semilla, otra serie', () => {
    const a = mulberry32(hashString('lettuce:mature:0'))
    const b = mulberry32(hashString('lettuce:mature:0'))
    const c = mulberry32(hashString('lettuce:mature:1'))
    const serie = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(serie)
    expect([c(), c(), c()]).not.toEqual(serie)
    for (const n of serie) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })
})

describe('especie → generador', () => {
  it.each([
    ['Lactuca sativa L.', 'lettuce'],
    ['Solanum lycopersicum L.', 'tomato'],
    ['Ocimum basilicum L.', 'basil'],
    ['Solanum tuberosum L.', 'generic'],
    ['Capsicum annuum L.', 'generic'],
  ])('%s → %s', (name, kind) => {
    expect(plantKindFor(name)).toBe(kind)
  })

  it('la variante es estable y está en 0..2', () => {
    expect(variantFor('0:1.20:0.40')).toBe(variantFor('0:1.20:0.40'))
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) expect([0, 1, 2]).toContain(variantFor(key))
  })
})

describe('generadores', () => {
  it('son deterministas por (especie, etapa, semilla) y varían con la semilla', () => {
    for (const kind of KINDS) {
      const a = buildPlantModel(kind, 'mature', 0)
      const b = buildPlantModel(kind, 'mature', 0)
      const c = buildPlantModel(kind, 'mature', 1)
      expect(values(a.parts.leaf)).toEqual(values(b.parts.leaf))
      expect(values(a.parts.leaf)).not.toEqual(values(c.parts.leaf))
    }
  })

  it('cada etapa es más alta que la anterior', () => {
    for (const kind of KINDS) {
      const [seedling, vegetative, mature] = PLANT_STAGES.map((stage) => buildPlantModel(kind, stage, 0))
      expect(vegetative.height).toBeGreaterThan(seedling.height)
      expect(mature.height).toBeGreaterThan(vegetative.height)
    }
  })

  it('ninguna geometría tiene valores no finitos', () => {
    for (const kind of KINDS) {
      for (const stage of PLANT_STAGES) {
        const model = buildPlantModel(kind, stage, 7)
        for (const geometry of Object.values(model.parts)) {
          expect(values(geometry).every(Number.isFinite)).toBe(true)
          expect(values(geometry, 'normal').every(Number.isFinite)).toBe(true)
        }
      }
    }
  })

  it('el tomate tiene tallo y solo da frutos en la etapa madura', () => {
    expect(buildPlantModel('tomato', 'seedling', 0).parts.fruit).toBeUndefined()
    expect(buildPlantModel('tomato', 'vegetative', 0).parts.fruit).toBeUndefined()
    const mature = buildPlantModel('tomato', 'mature', 0)
    expect(mature.parts.fruit).toBeDefined()
    expect(mature.parts.stem).toBeDefined()
  })

  it('la lechuga es una roseta: sin tallo y más ancha que alta', () => {
    const model = buildPlantModel('lettuce', 'mature', 0)
    expect(model.parts.stem).toBeUndefined()
    expect(model.radius).toBeGreaterThan(model.height)
  })

  it('la albahaca tiene hojas en pares opuestos y cada par gira 90° respecto al anterior', () => {
    const parts = generateBasil('vegetative', seededRandom('prueba'))
    expect(parts.leaf).toHaveLength(8) // 4 pares
    const tips = parts.leaf.map(leafTip)
    for (let i = 0; i < tips.length; i += 2) {
      expect(tips[i].x).toBeCloseTo(-tips[i + 1].x, 6)
      expect(tips[i].z).toBeCloseTo(-tips[i + 1].z, 6)
      expect(tips[i].y).toBeCloseTo(tips[i + 1].y, 6)
    }
    const angle = (i: number) => Math.atan2(tips[i].z, tips[i].x)
    for (let i = 0; i + 2 < tips.length; i += 2) {
      expect(Math.abs(Math.cos(angle(i) - angle(i + 2)))).toBeLessThan(0.3)
    }
  })

  it('cada modelo expone anclas arriba, en una hoja y en la base', () => {
    for (const kind of KINDS) {
      const model = buildPlantModel(kind, 'mature', 0)
      expect(model.anchors.map((a) => a.key)).toEqual(['top', 'leaf', 'base'])
      expect(model.anchors[0].y).toBeCloseTo(model.height)
    }
  })
})

describe('caché e instancing', () => {
  it('getPlantModel genera una vez por clave y reutiliza el objeto', () => {
    const a = getPlantModel('basil', 'vegetative', 2)
    expect(getPlantModel('basil', 'vegetative', 2)).toBe(a)
    expect(plantCacheSize()).toBe(1)
    getPlantModel('basil', 'vegetative', 1)
    expect(plantCacheSize()).toBe(2)
  })

  it('30 lechugas en 3 variantes se dibujan con 3 InstancedMesh y el pick devuelve el índice', () => {
    const list: PlantInstance[] = Array.from({ length: 30 }, (_, i) => ({
      index: i,
      kind: 'lettuce',
      stage: 'mature',
      variant: i % 3,
      x: i * 0.3,
      z: 0,
      rotationDeg: i * 10,
    }))
    expect(groupInstances(list)).toHaveLength(3)
    const plants = buildInstancedPlants(list)
    const meshes = plants.group.children as THREE.InstancedMesh[]
    expect(meshes).toHaveLength(3)
    expect(meshes.every((m) => m instanceof THREE.InstancedMesh && m.count === 10)).toBe(true)
    // La variante 1 agrupa los índices 1, 4, 7, 10, 13…: la instancia 4 es la planta 13
    expect(plants.pick(meshes[1], 4)).toBe(13)
    expect(plants.pick(new THREE.Mesh(), 0)).toBeNull()
    expect(plants.pick(meshes[0], undefined)).toBeNull()
    // Comparten la geometría de la caché: no se genera una por planta
    expect(meshes[0].geometry).toBe(getPlantModel('lettuce', 'mature', 0).parts.leaf)
    plants.dispose()
  })
})

describe('encuadre', () => {
  it('la planta madura completa queda dentro de la vista', () => {
    for (const kind of KINDS) {
      const model = buildPlantModel(kind, 'mature', 0)
      const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
      frameCamera(camera, model)
      camera.updateMatrixWorld()
      const r = model.radius
      const h = model.height
      const corners: Array<[number, number, number]> = [
        [-r, 0, -r],
        [r, 0, r],
        [-r, h, r],
        [r, h, -r],
      ]
      for (const [x, y, z] of corners) {
        const p = new THREE.Vector3(x, y, z).project(camera)
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1)
      }
    }
  })
})

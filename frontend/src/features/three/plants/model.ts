import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { generateBasil, generateGeneric, generateLettuce, generateTomato, PlantParts, Rand } from './generators'
import { PLANT_COLORS } from './palette'
import { seededRandom } from './random'
import { tintGeometry } from './shapes'
import type { PlantAnchor, PlantKind, PlantStage } from './types'

export const PART_NAMES = ['leaf', 'stem', 'fruit', 'flower'] as const
export type PartName = (typeof PART_NAMES)[number]

export interface PlantModel {
  key: string
  kind: PlantKind
  stage: PlantStage
  seed: number
  /** Una geometría unida por parte (una llamada de dibujo por parte). */
  parts: Partial<Record<PartName, THREE.BufferGeometry>>
  height: number
  /** Radio horizontal máximo desde el eje del tallo. */
  radius: number
  /** top, leaf, base: puntos para callouts. */
  anchors: PlantAnchor[]
}

const GENERATORS: Record<PlantKind, (stage: PlantStage, rand: Rand) => PlantParts> = {
  lettuce: generateLettuce,
  tomato: generateTomato,
  basil: generateBasil,
  generic: generateGeneric,
}

export function plantKey(kind: PlantKind, stage: PlantStage, seed: number): string {
  return `${kind}:${stage}:${seed}`
}

/** Genera y une las piezas. Costoso: fuera de las pruebas se usa getPlantModel (caché). */
export function buildPlantModel(kind: PlantKind, stage: PlantStage, seed: number): PlantModel {
  const key = plantKey(kind, stage, seed)
  const raw = GENERATORS[kind](stage, seededRandom(key))
  const parts: PlantModel['parts'] = {}
  const box = new THREE.Box3()
  for (const name of PART_NAMES) {
    const list = raw[name]
    if (list.length === 0) continue
    // Todas las piezas llevan color por vértice (tinte); las que no lo traen quedan neutras.
    for (const g of list) if (!g.getAttribute('color')) tintGeometry(g)
    const merged = mergeGeometries(list, false)
    list.forEach((g) => g.dispose())
    if (!merged) throw new Error(`No se pudo unir la parte ${name} de ${key}`)
    merged.computeBoundingBox()
    merged.computeBoundingSphere()
    box.union(merged.boundingBox!)
    parts[name] = merged
  }
  const height = box.max.y
  const radius = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)
  const anchors: PlantAnchor[] = [
    { key: 'top', x: 0, y: height, z: 0 },
    ...raw.anchors,
    { key: 'base', x: 0, y: Math.min(0.01, height * 0.1), z: 0 },
  ]
  return { key, kind, stage, seed, parts, height, radius, anchors }
}

const models = new Map<string, PlantModel>()

/** Una sola generación por (especie, etapa, semilla) en toda la sesión. No desechar sus geometrías. */
export function getPlantModel(kind: PlantKind, stage: PlantStage, seed = 0): PlantModel {
  const key = plantKey(kind, stage, seed)
  let model = models.get(key)
  if (!model) {
    model = buildPlantModel(kind, stage, seed)
    models.set(key, model)
  }
  return model
}

export function plantCacheSize(): number {
  return models.size
}

/** Solo para pruebas. */
export function clearPlantCache(): void {
  models.forEach((m) => Object.values(m.parts).forEach((g) => g?.dispose()))
  models.clear()
}

const materials = new Map<string, THREE.MeshStandardMaterial>()

/** Material compartido por especie y parte (caché de sesión; los visores no lo desechan). */
export function getPlantMaterial(kind: PlantKind, part: PartName): THREE.MeshStandardMaterial {
  const key = `${kind}:${part}`
  let material = materials.get(key)
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: PLANT_COLORS[kind][part],
      vertexColors: true, // tinte por vértice: degradados de hoja y maduración del fruto
      roughness: part === 'fruit' ? 0.3 : part === 'leaf' ? (kind === 'basil' ? 0.45 : 0.6) : 0.75,
      metalness: 0,
      side: part === 'leaf' ? THREE.DoubleSide : THREE.FrontSide,
    })
    materials.set(key, material)
  }
  return material
}

/** Un Group con una malla por parte (sin instancing): ficha y miniaturas. Cada malla se llama como su parte. */
export function createPlantObject(model: PlantModel): THREE.Group {
  const group = new THREE.Group()
  for (const name of PART_NAMES) {
    const geometry = model.parts[name]
    if (!geometry) continue
    const mesh = new THREE.Mesh(geometry, getPlantMaterial(model.kind, name))
    mesh.name = name
    group.add(mesh)
  }
  return group
}

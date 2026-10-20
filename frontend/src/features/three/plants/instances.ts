// Sin three: el Studio calcula las instancias en la página y la escena 3D las dibuja.
import type { PlantKind, PlantStage } from './types'

export interface PlantInstance {
  /** Índice plano de la planta en el layout (para traducir un pick a selección). */
  index: number
  kind: PlantKind
  stage: PlantStage
  variant: number
  /** Posición en el piso (m): x → X de three, z → Z de three. */
  x: number
  z: number
  rotationDeg: number
}

export interface InstanceGroup {
  key: string
  kind: PlantKind
  stage: PlantStage
  variant: number
  items: PlantInstance[]
}

/** Agrupa por (especie, etapa, variante): un grupo = una geometría = un InstancedMesh por parte. */
export function groupInstances(list: PlantInstance[]): InstanceGroup[] {
  const groups = new Map<string, InstanceGroup>()
  for (const item of list) {
    const key = `${item.kind}:${item.stage}:${item.variant}`
    let group = groups.get(key)
    if (!group) {
      group = { key, kind: item.kind, stage: item.stage, variant: item.variant, items: [] }
      groups.set(key, group)
    }
    group.items.push(item)
  }
  return [...groups.values()]
}

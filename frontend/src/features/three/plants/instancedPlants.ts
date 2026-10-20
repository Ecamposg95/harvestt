import * as THREE from 'three'
import { groupInstances, PlantInstance } from './instances'
import { getPlantMaterial, getPlantModel, PART_NAMES } from './model'

export interface InstancedPlants {
  group: THREE.Group
  /** Índice plano de la planta bajo el puntero, o null. */
  pick(object: THREE.Object3D, instanceId: number | undefined): number | null
  /** Desecha solo los InstancedMesh: geometrías y materiales son de la caché. */
  dispose(): void
}

export function buildInstancedPlants(list: PlantInstance[]): InstancedPlants {
  const group = new THREE.Group()
  const owners = new Map<THREE.Object3D, number[]>()
  const matrix = new THREE.Matrix4()
  const rotation = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const scale = new THREE.Vector3(1, 1, 1)
  const position = new THREE.Vector3()

  for (const g of groupInstances(list)) {
    const model = getPlantModel(g.kind, g.stage, g.variant)
    for (const part of PART_NAMES) {
      const geometry = model.parts[part]
      if (!geometry) continue
      const mesh = new THREE.InstancedMesh(geometry, getPlantMaterial(g.kind, part), g.items.length)
      g.items.forEach((item, i) => {
        rotation.setFromAxisAngle(up, (item.rotationDeg * Math.PI) / 180)
        position.set(item.x, 0, item.z)
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale))
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere() // necesario para raycast y culling con instancias movidas
      owners.set(mesh, g.items.map((item) => item.index))
      group.add(mesh)
    }
  }

  return {
    group,
    pick(object, instanceId) {
      const ids = owners.get(object)
      if (!ids || instanceId === undefined) return null
      return ids[instanceId] ?? null
    },
    dispose() {
      owners.forEach((_, mesh) => (mesh as THREE.InstancedMesh).dispose())
      owners.clear()
      group.clear()
    },
  }
}

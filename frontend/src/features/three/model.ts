import * as THREE from 'three'
import type { ModelPoint } from './types'

/**
 * Crea la malla con la geometría tal como viene del STL y la gira a Y-arriba y la centra mediante su
 * transformación, sin tocar los vértices. Así los hotspots se guardan en coordenadas crudas y
 * toWorld/toModel convierten entre ambos sistemas.
 */
export function placeModel(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2 // STL suele ser Z-arriba; three usa Y-arriba
  mesh.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(mesh)
  const center = box.getCenter(new THREE.Vector3())
  mesh.position.sub(center)
  mesh.updateMatrixWorld(true)
  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  return { mesh, radius: geometry.boundingSphere?.radius || 1, floorY: box.min.y - center.y }
}

export function toWorld(mesh: THREE.Object3D, p: ModelPoint): THREE.Vector3 {
  mesh.updateMatrixWorld()
  return mesh.localToWorld(new THREE.Vector3(p.x, p.y, p.z))
}

export function toModel(mesh: THREE.Object3D, world: THREE.Vector3): ModelPoint {
  mesh.updateMatrixWorld()
  const v = mesh.worldToLocal(world.clone())
  return { x: v.x, y: v.y, z: v.z }
}

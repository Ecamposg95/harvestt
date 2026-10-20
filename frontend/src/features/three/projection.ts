import * as THREE from 'three'
import type { ModelPoint } from './types'

export interface CalloutPoint extends ModelPoint {
  key: string
  label: string
  index: number
}

export interface ProjectedCallout {
  key: string
  label: string
  index: number
  x: number
  y: number
  side: 'left' | 'right'
  hidden: boolean
  dimmed: boolean
}

/** La oclusión hace raycast contra toda la malla; durante el giro se recalcula como máximo con esta frecuencia. */
export const OCCLUSION_INTERVAL_MS = 200

export function projectToScreen(world: THREE.Vector3, camera: THREE.Camera, width: number, height: number) {
  const v = world.clone().project(camera)
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, behind: v.z > 1 || v.z < -1 }
}

/** true si algo de `occluders` se interpone entre la cámara y el punto (que está sobre la superficie). */
export function isOccluded(
  world: THREE.Vector3,
  camera: THREE.Camera,
  occluders: THREE.Object3D[],
  raycaster = new THREE.Raycaster(),
): boolean {
  const origin = camera.getWorldPosition(new THREE.Vector3())
  const direction = world.clone().sub(origin)
  const distance = direction.length()
  if (distance === 0) return false
  raycaster.set(origin, direction.normalize())
  raycaster.near = 0
  raycaster.far = distance
  const hit = raycaster.intersectObjects(occluders, false)[0]
  return hit !== undefined && hit.distance < distance * 0.99
}

export class CalloutProjector {
  private points: CalloutPoint[] = []
  private signature = ''
  private occlusionDirty = true
  private lastOcclusionAt = -Infinity
  private readonly occluded = new Map<string, boolean>()
  private readonly raycaster = new THREE.Raycaster()
  private emptyPublished = false

  constructor(private readonly publish: (callouts: ProjectedCallout[]) => void) {}

  setPoints(points: CalloutPoint[]) {
    this.points = points
    this.signature = ''
    this.occlusionDirty = true
    this.lastOcclusionAt = -Infinity
    this.emptyPublished = false
  }

  /** Recalcula solo si cambió la cámara, el tamaño o los puntos, o si la oclusión quedó pendiente. */
  update(camera: THREE.Camera, model: THREE.Object3D, width: number, height: number, now: number): boolean {
    // Sin puntos no hay nada que seguir: publica la lista vacía una sola vez, no en cada frame del giro.
    if (this.points.length === 0) {
      if (this.emptyPublished) return false
      this.emptyPublished = true
      this.publish([])
      return true
    }
    camera.updateMatrixWorld()
    model.updateMatrixWorld()
    const signature = [
      width,
      height,
      ...camera.matrixWorld.elements.map((n) => n.toFixed(5)),
      ...camera.projectionMatrix.elements.slice(0, 6).map((n) => n.toFixed(5)),
    ].join(',')
    const moved = signature !== this.signature
    if (moved) {
      this.signature = signature
      this.occlusionDirty = true
    }
    const refreshOcclusion = this.occlusionDirty && now - this.lastOcclusionAt >= OCCLUSION_INTERVAL_MS
    if (!moved && !refreshOcclusion) return false

    const out = this.points.map((p): ProjectedCallout => {
      const world = model.localToWorld(new THREE.Vector3(p.x, p.y, p.z))
      const s = projectToScreen(world, camera, width, height)
      if (refreshOcclusion) this.occluded.set(p.key, !s.behind && isOccluded(world, camera, [model], this.raycaster))
      return {
        key: p.key,
        label: p.label,
        index: p.index,
        x: s.x,
        y: s.y,
        side: s.x < width / 2 ? 'left' : 'right',
        hidden: s.behind || s.x < 0 || s.x > width || s.y < 0 || s.y > height,
        dimmed: this.occluded.get(p.key) ?? false,
      }
    })
    if (refreshOcclusion) {
      this.lastOcclusionAt = now
      this.occlusionDirty = false
    }
    this.publish(out)
    return true
  }
}

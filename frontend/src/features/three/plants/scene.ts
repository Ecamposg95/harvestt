import * as THREE from 'three'
import type { PlantModel } from './model'

/** Luz suave de invernadero: cielo verdoso con rebote cálido, sol tibio, relleno frontal y contraluz lima. */
export function addPlantLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xf4fbe8, 0x9a8f6a, 1.6))
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.9)
  sun.name = 'sun'
  sun.position.set(2, 4, 3)
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0xeaf4ff, 0.6)
  fill.position.set(-3, 1.5, 2)
  scene.add(fill)
  const rim = new THREE.DirectionalLight(0xa6e22e, 0.7)
  rim.position.set(-3, 2, -3)
  scene.add(rim)
}

/**
 * Coloca la cámara para que la caja (radio horizontal × altura) quepa entera: la esfera que la envuelve
 * cabe en el menor de los dos campos de visión. Devuelve el punto al que mira.
 */
export function frameCamera(camera: THREE.PerspectiveCamera, model: Pick<PlantModel, 'height' | 'radius'>): THREE.Vector3 {
  const target = new THREE.Vector3(0, model.height / 2, 0)
  const sphere = Math.max(Math.sqrt(2 * model.radius ** 2 + (model.height / 2) ** 2), 0.02)
  const vfov = (camera.fov * Math.PI) / 180
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect)
  const distance = (sphere / Math.sin(Math.min(vfov, hfov) / 2)) * 1.05
  camera.position.copy(target).add(new THREE.Vector3(0.75, 0.45, 0.9).normalize().multiplyScalar(distance))
  camera.near = distance / 50
  camera.far = distance * 20
  camera.lookAt(target)
  camera.updateProjectionMatrix()
  return target
}

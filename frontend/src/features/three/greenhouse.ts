import * as THREE from 'three'
import type { GreenhouseDims } from '@/features/operations/format'

export interface GreenhouseColors {
  frame: number
  glass: number
  floor: number
}

/** Perfil a dos aguas (x, y) en el plano frontal; se extruye a lo largo de la nave. */
export function gableProfile(dims: GreenhouseDims): Array<[number, number]> {
  const half = dims.width / 2
  return [
    [-half, 0],
    [half, 0],
    [half, dims.wallHeight],
    [0, dims.ridgeHeight],
    [-half, dims.wallHeight],
  ]
}

/** Nave paramétrica: piso, cubierta translúcida a dos aguas y aristas. Centrada en el origen, Y arriba. */
export function buildGreenhouse(dims: GreenhouseDims, colors: GreenhouseColors): THREE.Group {
  const group = new THREE.Group()
  group.name = 'greenhouse'

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.width, dims.length),
    new THREE.MeshStandardMaterial({ color: colors.floor, roughness: 0.9 }),
  )
  floor.name = 'floor'
  floor.rotation.x = -Math.PI / 2
  group.add(floor)

  const shape = new THREE.Shape()
  gableProfile(dims).forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)))
  shape.closePath()
  const shellGeometry = new THREE.ExtrudeGeometry(shape, { depth: dims.length, bevelEnabled: false })
  shellGeometry.translate(0, 0, -dims.length / 2)

  const shell = new THREE.Mesh(
    shellGeometry,
    new THREE.MeshStandardMaterial({
      color: colors.glass,
      transparent: true,
      opacity: 0.16,
      roughness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  shell.name = 'shell'
  group.add(shell)

  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(shellGeometry), new THREE.LineBasicMaterial({ color: colors.frame }))
  frame.name = 'frame'
  group.add(frame)
  return group
}

/** Libera geometrías y materiales de un grupo construido aquí. */
export function disposeGroup(group: THREE.Object3D) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    mesh.geometry?.dispose()
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(material)) material.forEach((m) => m.dispose())
    else material?.dispose()
  })
}

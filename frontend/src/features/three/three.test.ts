import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { placeModel, toModel, toWorld } from './model'
import { CalloutProjector, isOccluded, OCCLUSION_INTERVAL_MS, projectToScreen, ProjectedCallout } from './projection'

function camera(z = 10) {
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
  cam.position.set(0, 0, z)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld()
  return cam
}

const box = () => new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial())

describe('placeModel', () => {
  it('gira a Y-arriba, centra en el origen y convierte ida y vuelta', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2)
    geometry.translate(10, 20, 30) // origen del STL lejos del centro
    geometry.computeBoundingSphere()
    const { mesh, radius, floorY } = placeModel(geometry, new THREE.MeshBasicMaterial())
    expect(radius).toBeCloseTo(Math.sqrt(3))
    expect(floorY).toBeCloseTo(-1)
    // La cara superior del STL (z = 31 crudo) queda arriba (y = 1) y centrada
    const world = toWorld(mesh, { x: 10, y: 20, z: 31 })
    expect(world.x).toBeCloseTo(0)
    expect(world.y).toBeCloseTo(1)
    expect(world.z).toBeCloseTo(0)
    const back = toModel(mesh, world)
    expect(back.x).toBeCloseTo(10)
    expect(back.y).toBeCloseTo(20)
    expect(back.z).toBeCloseTo(31)
    // No altera la geometría: los puntos guardados siguen en coordenadas crudas
    geometry.computeBoundingBox()
    expect(geometry.boundingBox!.min.z).toBeCloseTo(29)
  })
})

describe('proyección', () => {
  it('lleva el centro de la vista al centro de la pantalla', () => {
    const p = projectToScreen(new THREE.Vector3(0, 0, 0), camera(), 200, 100)
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(50)
    expect(p.behind).toBe(false)
  })

  it('marca como detrás de la cámara lo que queda a su espalda', () => {
    expect(projectToScreen(new THREE.Vector3(0, 0, 20), camera(), 200, 200).behind).toBe(true)
  })

  it('la cara trasera queda ocluida y la delantera no', () => {
    const mesh = box()
    mesh.updateMatrixWorld()
    expect(isOccluded(new THREE.Vector3(0, 0, 1), camera(), [mesh])).toBe(false)
    expect(isOccluded(new THREE.Vector3(0, 0, -1), camera(), [mesh])).toBe(true)
  })
})

describe('CalloutProjector', () => {
  const points = [
    { key: 'front', label: 'Frente', index: 1, x: 0.5, y: 0, z: 1 },
    { key: 'left', label: 'Izquierda', index: 2, x: -0.5, y: 0, z: 1 },
    { key: 'back', label: 'Atrás', index: 3, x: 0, y: 0, z: -1 },
  ]

  function setup() {
    const published: ProjectedCallout[][] = []
    const projector = new CalloutProjector((c) => published.push(c))
    projector.setPoints(points)
    return { projector, published, mesh: box() }
  }

  it('publica posiciones, lado y oclusión', () => {
    const { projector, published, mesh } = setup()
    expect(projector.update(camera(), mesh, 200, 200, 0)).toBe(true)
    const [front, left, back] = published[0]
    expect(front.x).toBeGreaterThan(100)
    expect(front.side).toBe('right')
    expect(left.side).toBe('left')
    expect(front.dimmed).toBe(false)
    expect(back.dimmed).toBe(true)
    expect(front.hidden).toBe(false)
    expect(front.index).toBe(1)
  })

  it('no vuelve a publicar si la cámara no se movió', () => {
    const { projector, published, mesh } = setup()
    const cam = camera()
    projector.update(cam, mesh, 200, 200, 0)
    expect(projector.update(cam, mesh, 200, 200, 1000)).toBe(false)
    expect(published).toHaveLength(1)
  })

  it('limita la oclusión a una vez por intervalo y se pone al día al detenerse', () => {
    const { projector, published, mesh } = setup()
    const cam = camera(10)
    projector.update(cam, mesh, 200, 200, 0)
    // Gira la cámara al otro lado antes de que pase el intervalo
    cam.position.set(0, 0, -10)
    cam.lookAt(0, 0, 0)
    projector.update(cam, mesh, 200, 200, OCCLUSION_INTERVAL_MS / 2)
    const stale = published[1].find((c) => c.key === 'front')!
    expect(stale.dimmed).toBe(false) // aún sin recalcular
    // La cámara ya no se mueve; al vencer el intervalo se recalcula
    expect(projector.update(cam, mesh, 200, 200, OCCLUSION_INTERVAL_MS + 1)).toBe(true)
    expect(published[2].find((c) => c.key === 'front')!.dimmed).toBe(true)
    expect(published[2].find((c) => c.key === 'back')!.dimmed).toBe(false)
  })

  it('oculta puntos fuera de la vista y republica al cambiar los puntos', () => {
    const publish = vi.fn()
    const projector = new CalloutProjector(publish)
    const cam = camera()
    projector.setPoints([{ key: 'lejos', label: 'Lejos', index: 1, x: 50, y: 0, z: 0 }])
    projector.update(cam, box(), 200, 200, 0)
    expect(publish.mock.calls[0][0][0].hidden).toBe(true)
    projector.setPoints([])
    expect(projector.update(cam, box(), 200, 200, 1)).toBe(true)
    expect(publish.mock.calls[1][0]).toEqual([])
    // Sin puntos, girar la cámara no vuelve a publicar (evita un render de React por frame)
    cam.position.set(5, 0, 5)
    cam.lookAt(0, 0, 0)
    expect(projector.update(cam, box(), 200, 200, 2)).toBe(false)
    expect(publish).toHaveBeenCalledTimes(2)
  })

  it('invalidate republica aunque la cámara siga quieta', () => {
    const { projector, published, mesh } = setup()
    const cam = camera()
    projector.update(cam, mesh, 200, 200, 0)
    expect(projector.update(cam, mesh, 200, 200, 10)).toBe(false)
    projector.invalidate()
    expect(projector.update(cam, mesh, 200, 200, 20)).toBe(true)
    expect(published).toHaveLength(2)
  })
})

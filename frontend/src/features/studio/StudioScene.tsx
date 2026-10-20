import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Callout } from '@/components/ui'
import { isClick } from '@/features/prototypes/pick'
import { buildInstancedPlants, InstancedPlants } from '@/features/three/plants/instancedPlants'
import { getPlantModel } from '@/features/three/plants/model'
import { addPlantLights } from '@/features/three/plants/scene'
import { PLANT_STAGE_LABELS } from '@/features/three/plants/types'
import { declutter } from '@/features/three/projection'
import { useProjectedCallouts } from '@/features/three/useProjectedCallouts'
import { useTheme } from '@/store/theme'
import { footprint, indexFromSelection, instancesFor, selectedPlant, selectionFromIndex } from './layout'
import type { StudioSceneProps } from './sceneTypes'

const BED_HEIGHT = 0.04
const PALETTE = {
  light: { floor: 0xdfe6da, grid: 0xc4d0c0, bed: 0xa6e22e, edge: 0x446a0e },
  dark: { floor: 0x1d231c, grid: 0x2a3229, bed: 0x4f7a12, edge: 0xb9ec5a },
}

interface SceneState {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  content: THREE.Group
  plants: InstancedPlants | null
  zoneMeshes: THREE.Mesh[]
  ring: THREE.Mesh
  disposables: Array<{ dispose(): void }>
}

/** Escena del Studio: piso, zonas como camas y plantas instanciadas. Cargar con LazyStudioScene. */
export default function StudioScene({ floor, zones, selection, editing, onSelect, onFloorClick, label, className = '' }: StudioSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<SceneState | null>(null)
  const framedFor = useRef('')
  const [ready, setReady] = useState(0)
  const [failed, setFailed] = useState(false)
  const theme = useTheme((s) => s.theme)
  const { projected, projector } = useProjectedCallouts()
  // Lo último de React, leído por los manejadores de three sin recrear la escena.
  const latest = useRef({ zones, selection, editing, onSelect, onFloorClick })
  latest.current = { zones, selection, editing, onSelect, onFloorClick }

  // 1) Renderer, cámara, luces, controles y picking: una sola vez.
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.touchAction = 'none'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    addPlantLights(scene)
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2 - 0.05 // no mirar por debajo del piso
    const content = new THREE.Group()
    scene.add(content)
    const ringGeometry = new THREE.RingGeometry(0.85, 1, 40)
    ringGeometry.rotateX(-Math.PI / 2)
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xa6e22e, transparent: true, opacity: 0.9, depthWrite: false })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.visible = false
    scene.add(ring)
    stateRef.current = { scene, camera, controls, content, plants: null, zoneMeshes: [], ring, disposables: [] }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const bedPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BED_HEIGHT)
    let downAt: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => {
      downAt = e.button === 0 ? { x: e.clientX, y: e.clientY } : null
    }
    const onUp = (e: PointerEvent) => {
      const start = downAt
      downAt = null
      const s = stateRef.current
      if (!s || !isClick(start, { x: e.clientX, y: e.clientY })) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const { zones: zs, selection: sel, editing: ed, onSelect: select, onFloorClick: floorClick } = latest.current
      const plantHit = s.plants ? raycaster.intersectObject(s.plants.group, true)[0] : undefined
      if (plantHit && s.plants) {
        const flat = s.plants.pick(plantHit.object, plantHit.instanceId)
        if (flat !== null) return select(selectionFromIndex(zs, flat))
      }
      if (ed && sel?.plant != null) {
        const point = raycaster.ray.intersectPlane(bedPlane, new THREE.Vector3())
        if (point) floorClick(point.x, point.z)
        return
      }
      const zoneHit = raycaster.intersectObjects(s.zoneMeshes, false)[0]
      select(zoneHit ? { zone: zoneHit.object.userData.zoneIndex as number, plant: null } : null)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      projector.invalidate()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      controls.update()
      projector.update(camera, content, mount.clientWidth || 1, mount.clientHeight || 1, performance.now())
      renderer.render(scene, camera)
    }
    tick()
    setReady((n) => n + 1)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      const s = stateRef.current
      s?.plants?.dispose()
      s?.disposables.forEach((d) => d.dispose())
      stateRef.current = null
      framedFor.current = ''
      ringGeometry.dispose()
      ringMaterial.dispose()
      controls.dispose()
      scene.clear()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [projector])

  // 2) Contenido: piso, camas y plantas; se reconstruye cuando cambian el layout o el tema.
  const contentKey = JSON.stringify({ floor, zones })
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    const { floor: f, zones: zs } = JSON.parse(contentKey) as Pick<StudioSceneProps, 'floor' | 'zones'>
    s.plants?.dispose()
    s.plants = null
    s.disposables.forEach((d) => d.dispose())
    s.disposables = []
    s.content.clear()
    s.zoneMeshes = []

    const palette = theme === 'dark' ? PALETTE.dark : PALETTE.light
    const floorGeometry = new THREE.PlaneGeometry(f.width, f.depth)
    floorGeometry.rotateX(-Math.PI / 2)
    floorGeometry.translate(f.width / 2, 0, f.depth / 2)
    const floorMaterial = new THREE.MeshStandardMaterial({ color: palette.floor, roughness: 1 })
    s.content.add(new THREE.Mesh(floorGeometry, floorMaterial))
    const size = Math.max(f.width, f.depth)
    const grid = new THREE.GridHelper(size, Math.max(1, Math.round(size)), palette.grid, palette.grid)
    grid.position.set(size / 2, 0.002, size / 2)
    const gridMaterial = grid.material as THREE.Material
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.5
    s.content.add(grid)
    const bedMaterial = new THREE.MeshStandardMaterial({ color: palette.bed, roughness: 0.9, transparent: true, opacity: 0.55 })
    const edgeMaterial = new THREE.LineBasicMaterial({ color: palette.edge })
    s.disposables.push(floorGeometry, floorMaterial, grid.geometry, gridMaterial, bedMaterial, edgeMaterial)

    zs.forEach((z, zi) => {
      const geometry = new THREE.BoxGeometry(z.width, BED_HEIGHT, z.depth)
      const mesh = new THREE.Mesh(geometry, bedMaterial)
      mesh.position.set(z.x + z.width / 2, BED_HEIGHT / 2, z.y + z.depth / 2)
      mesh.userData.zoneIndex = zi
      const edgesGeometry = new THREE.EdgesGeometry(geometry)
      mesh.add(new THREE.LineSegments(edgesGeometry, edgeMaterial))
      s.content.add(mesh)
      s.zoneMeshes.push(mesh)
      s.disposables.push(geometry, edgesGeometry)
    })

    const plants = buildInstancedPlants(instancesFor(zs))
    plants.group.position.y = BED_HEIGHT
    s.content.add(plants.group)
    s.plants = plants

    // Encuadre solo cuando cambia el tamaño del piso, para no saltar mientras se edita.
    const frameKey = `${f.width}x${f.depth}`
    if (framedFor.current !== frameKey) {
      framedFor.current = frameKey
      const center = new THREE.Vector3(f.width / 2, 0, f.depth / 2)
      const distance = size * 1.1 + 1
      s.camera.position.set(center.x + distance * 0.55, distance * 0.75, center.z + distance * 0.95)
      s.camera.far = distance * 10
      s.camera.updateProjectionMatrix()
      s.controls.target.copy(center)
      s.controls.minDistance = 0.3
      s.controls.maxDistance = distance * 3
      s.controls.update()
    }
    projector.invalidate()
  }, [contentKey, theme, ready, projector])

  // 3) Selección: anillo bajo la planta y callout con especie y etapa.
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    const plant = selectedPlant(zones, selection)
    const flat = indexFromSelection(zones, selection)
    if (!plant || !selection || flat === null) {
      s.ring.visible = false
      projector.setPoints([])
      return
    }
    const instance = instancesFor(zones)[flat]
    const height = getPlantModel(instance.kind, instance.stage, instance.variant).height
    s.ring.position.set(instance.x, BED_HEIGHT + 0.005, instance.z)
    s.ring.scale.setScalar(footprint(plant.species_name, plant.stage) * 1.3)
    s.ring.visible = true
    projector.setPoints([
      {
        key: 'seleccion',
        label: `${plant.species_name} · ${PLANT_STAGE_LABELS[plant.stage]}`,
        index: 1,
        x: instance.x,
        y: BED_HEIGHT + height,
        z: instance.z,
      },
    ])
  }, [zones, selection, ready, projector])

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={mountRef} className="absolute inset-0" role="img" aria-label={label} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {declutter(projected, mountRef.current?.clientHeight ?? 0, 26, mountRef.current?.clientWidth ?? 0).map((c) =>
          c.hidden ? null : (
            <Callout key={c.key} x={c.x} y={c.y} dy={c.dy} side={c.side} lineLength={28} dimmed={c.dimmed} label={c.label} />
          ),
        )}
      </div>
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
          No se pudo iniciar la escena 3D en este navegador.
        </div>
      )}
      <p className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-muted">
        {editing
          ? 'Clic en una planta para elegirla y luego en su zona para moverla'
          : 'Arrastra para girar · rueda para acercar · clic para seleccionar'}
      </p>
    </div>
  )
}

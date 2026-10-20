import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Callout } from '@/components/ui'
import { useTheme } from '@/store/theme'
import { useProjectedCallouts } from '../useProjectedCallouts'
import { webglAvailable } from '../webgl'
import { createPlantObject, getPlantModel } from './model'
import { addPlantLights, frameCamera } from './scene'
import type { PlantViewerCallout, PlantViewerProps } from './types'

const SOIL = { light: 0x8a7457, dark: 0x4a3f31 }

/** Espacio mínimo (px) para la línea y la etiqueta: si no cabe hacia afuera, el callout se voltea. */
const LABEL_ROOM = 170

function fitSide(side: 'left' | 'right', x: number, width: number): 'left' | 'right' {
  if (side === 'left' && x < LABEL_ROOM) return 'right'
  if (side === 'right' && width > 0 && width - x < LABEL_ROOM) return 'left'
  return side
}

/** Degradado radial para el alphaMap del suelo: el disco se desvanece en el borde en vez de cortarse. */
function radialFade(): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.6, '#ffffff')
  g.addColorStop(1, '#000000')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

/** Una planta procedural con giro automático y callouts. Cargar con LazyPlantViewer: importa three. */
export default function PlantViewer({ kind, stage = 'mature', seed = 0, label, callouts = [], className = '' }: PlantViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const soilRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const [noWebgl, setNoWebgl] = useState(false)
  const theme = useTheme((s) => s.theme)
  const { projected, projector } = useProjectedCallouts()
  const calloutsKey = JSON.stringify(callouts)

  useEffect(() => {
    soilRef.current?.color.setHex(theme === 'dark' ? SOIL.dark : SOIL.light)
  }, [theme])

  useEffect(() => {
    const model = getPlantModel(kind, stage, seed)
    const list: PlantViewerCallout[] = JSON.parse(calloutsKey)
    projector.setPoints(
      list.flatMap((c, i) => {
        const a = model.anchors.find((x) => x.key === c.anchor)
        return a ? [{ key: c.key, label: c.label, index: i + 1, x: a.x, y: a.y, z: a.z }] : []
      }),
    )
  }, [calloutsKey, kind, stage, seed, projector])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    if (!webglAvailable()) {
      setNoWebgl(true)
      return
    }
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setNoWebgl(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping // conserva el verde de las hojas (ACES lo apaga)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.touchAction = 'none'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    addPlantLights(scene)
    const model = getPlantModel(kind, stage, seed)
    const plant = createPlantObject(model)
    plant.traverse((o) => {
      o.castShadow = true
    })
    scene.add(plant)
    // Sombra suave de la planta sobre el suelo (las mallas son del visor; geometría y material, de la caché).
    const sun = scene.getObjectByName('sun') as THREE.DirectionalLight | undefined
    if (sun) {
      const extent = Math.max(model.radius, model.height * 0.5) * 1.6
      sun.castShadow = true
      sun.shadow.mapSize.set(1024, 1024)
      sun.shadow.bias = -0.0005
      sun.shadow.normalBias = 0.002
      Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: 20 })
      sun.shadow.camera.updateProjectionMatrix()
    }
    // Las hojas son el oclusor principal; su transformación es la identidad, igual que la del grupo.
    const occluder = plant.getObjectByName('leaf') ?? plant

    const soilGeometry = new THREE.CircleGeometry(Math.max(model.radius * 1.6, 0.06), 48)
    soilGeometry.rotateX(-Math.PI / 2)
    const soilFade = radialFade()
    const soilMaterial = new THREE.MeshStandardMaterial({
      color: useTheme.getState().theme === 'dark' ? SOIL.dark : SOIL.light,
      roughness: 1,
      alphaMap: soilFade,
      transparent: soilFade !== null,
      depthWrite: false,
    })
    soilRef.current = soilMaterial
    const soil = new THREE.Mesh(soilGeometry, soilMaterial)
    soil.receiveShadow = true
    soil.renderOrder = -1
    scene.add(soil)

    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.autoRotateSpeed = 0.8
    let interacting = false
    const onStart = () => {
      interacting = true
    }
    const onEnd = () => {
      interacting = false
    }
    controls.addEventListener('start', onStart)
    controls.addEventListener('end', onEnd)

    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      const target = frameCamera(camera, model)
      const distance = camera.position.distanceTo(target)
      controls.target.copy(target)
      controls.minDistance = distance * 0.4
      controls.maxDistance = distance * 2.5
      controls.update()
      projector.invalidate()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      controls.autoRotate = !interacting
      controls.update()
      projector.update(camera, occluder, mount.clientWidth || 1, mount.clientHeight || 1, performance.now())
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
      controls.dispose()
      soilGeometry.dispose()
      soilMaterial.dispose()
      soilFade?.dispose()
      sun?.dispose() // libera su mapa de sombras
      soilRef.current = null
      scene.clear() // geometría y materiales de la planta son de la caché: no se desechan
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [kind, stage, seed, projector])

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={mountRef} className="absolute inset-0" role="img" aria-label={label} />
      {!noWebgl && projected.length > 0 && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {projected.map((c) =>
            c.hidden ? null : (
              <Callout
                key={c.key}
                x={c.x}
                y={c.y}
                side={fitSide(c.side, c.x, mountRef.current?.clientWidth ?? 0)}
                lineLength={24}
                dimmed={c.dimmed}
                label={c.label}
              />
            ),
          )}
        </div>
      )}
      {noWebgl && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-muted">
          Tu navegador no admite WebGL, necesario para la ilustración 3D.
        </div>
      )}
    </div>
  )
}

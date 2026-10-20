import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Callout } from '@/components/ui'
import { buildGreenhouse, disposeGroup } from '@/features/three/greenhouse'
import { useProjectedCallouts } from '@/features/three/useProjectedCallouts'
import { viewerPalette } from '@/features/prototypes/viewerPalette'
import { useTheme } from '@/store/theme'
import { deviceToWorld, GreenhouseDims } from './format'

export interface SceneDevice {
  key: string
  label: string
  /** Metros dentro de la nave: x ancho, y largo, z altura. */
  x: number
  y: number
  z: number
  stale: boolean
}

export interface GreenhouseViewerProps {
  dims: GreenhouseDims
  devices: SceneDevice[]
  label?: string
  className?: string
}

const LIVE = 0xa6e22e
const STALE = 0x9aa898

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

/** Invernadero paramétrico con sensores como esferas y su última lectura en callouts. Chunk perezoso. */
export default function GreenhouseViewer({ dims, devices, label = 'Invernadero virtual', className = '' }: GreenhouseViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'ready' | 'nowebgl'>('ready')
  const theme = useTheme((s) => s.theme)
  const darkRef = useRef(theme === 'dark')
  const applyThemeRef = useRef<((dark: boolean) => void) | null>(null)
  const syncDevicesRef = useRef<((list: SceneDevice[]) => void) | null>(null)
  const { projected, projector } = useProjectedCallouts()
  const devicesKey = JSON.stringify(devices)

  useEffect(() => {
    darkRef.current = theme === 'dark'
    applyThemeRef.current?.(darkRef.current)
  }, [theme])

  // Callouts y esferas siguen a los datos sin reconstruir la escena.
  // Depende de las medidas (no de la identidad de `dims`, que el padre recrea en cada render).
  useEffect(() => {
    const list: SceneDevice[] = JSON.parse(devicesKey)
    projector.setPoints(list.map((d, i) => ({ key: d.key, label: d.label, index: i + 1, ...deviceToWorld(dims, d) })))
    syncDevicesRef.current?.(list)
  }, [devicesKey, dims.width, dims.length, projector])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    if (!webglAvailable()) {
      setPhase('nowebgl')
      return
    }
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setPhase('nowebgl')
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

    const palette = viewerPalette(darkRef.current)
    const scene = new THREE.Scene()
    const size = Math.max(dims.width, dims.length, dims.ridgeHeight)
    const fog = new THREE.Fog(palette.fog, size * 2.2, size * 6)
    scene.fog = fog
    scene.add(new THREE.AmbientLight(0xffffff, 0.45))
    const hemi = new THREE.HemisphereLight(0xffffff, palette.ground, 0.6)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffffff, 1.3)
    sun.position.set(6, 10, 8)
    scene.add(sun)
    const rim = new THREE.DirectionalLight(LIVE, 0.5)
    rim.position.set(-6, 4, -8)
    scene.add(rim)

    // Retícula del terreno alrededor de la nave (solo referencia visual, sin escala propia).
    const grid = new THREE.GridHelper(size * 3, 24, palette.grid, palette.grid)
    const gridMaterial = grid.material as THREE.LineBasicMaterial
    gridMaterial.vertexColors = false
    gridMaterial.color.setHex(palette.grid)
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.6
    grid.position.y = -0.01
    scene.add(grid)

    const greenhouse = buildGreenhouse(dims, { frame: palette.gridCenter, glass: 0xffffff, floor: palette.ground })
    scene.add(greenhouse)
    // Los puntos de los callouts están en coordenadas de escena: el grupo queda en identidad.
    const sensors = new THREE.Group()
    scene.add(sensors)
    const radius = Math.max(0.15, Math.min(dims.width, dims.length) * 0.03)
    const sphere = new THREE.SphereGeometry(radius, 24, 16)
    // Halo translúcido que late solo en los sensores con señal; uno sin señal queda gris y quieto.
    const haloGeometry = new THREE.SphereGeometry(radius * 1.9, 24, 16)
    const halos: THREE.Mesh[] = []
    const disposeSensors = () => {
      sensors.children.forEach((c) => ((c as THREE.Mesh).material as THREE.Material).dispose())
      sensors.clear()
      halos.length = 0
    }

    syncDevicesRef.current = (list) => {
      disposeSensors()
      for (const d of list) {
        const p = deviceToWorld(dims, d)
        const mesh = new THREE.Mesh(
          sphere,
          new THREE.MeshStandardMaterial({
            color: d.stale ? STALE : LIVE,
            emissive: d.stale ? 0x000000 : LIVE,
            emissiveIntensity: d.stale ? 0 : 0.35,
            roughness: 0.35,
          }),
        )
        mesh.position.set(p.x, p.y, p.z)
        sensors.add(mesh)
        if (!d.stale) {
          const halo = new THREE.Mesh(
            haloGeometry,
            new THREE.MeshBasicMaterial({ color: LIVE, transparent: true, opacity: 0.2, depthWrite: false }),
          )
          halo.position.set(p.x, p.y, p.z)
          sensors.add(halo)
          halos.push(halo)
        }
      }
    }
    syncDevicesRef.current(JSON.parse(devicesKey))

    applyThemeRef.current = (dark) => {
      const p = viewerPalette(dark)
      hemi.groundColor.setHex(p.ground)
      fog.color.setHex(p.fog)
      gridMaterial.color.setHex(p.grid)
      const floor = greenhouse.getObjectByName('floor') as THREE.Mesh | undefined
      ;(floor?.material as THREE.MeshStandardMaterial | undefined)?.color.setHex(p.ground)
    }

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000)
    camera.position.set(size * 0.9, size * 0.7, size * 1.1)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.target.set(0, dims.wallHeight / 2, 0)
    controls.minDistance = size * 0.4
    controls.maxDistance = size * 4
    controls.maxPolarAngle = Math.PI / 2.05
    controls.update()

    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()
    projector.invalidate()

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      controls.update()
      const pulse = 1 + 0.18 * Math.sin(performance.now() / 420)
      for (const h of halos) h.scale.setScalar(pulse)
      projector.update(camera, sensors, mount.clientWidth || 1, mount.clientHeight || 1, performance.now())
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      syncDevicesRef.current = null
      applyThemeRef.current = null
      disposeSensors()
      sphere.dispose()
      haloGeometry.dispose()
      grid.geometry.dispose()
      gridMaterial.dispose()
      disposeGroup(greenhouse)
      scene.clear()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
    // devicesKey se aplica con syncDevicesRef; la escena solo se reconstruye si cambian las medidas.
  }, [dims.width, dims.length, dims.ridgeHeight, projector])

  return (
    <div className={`relative overflow-hidden rounded-[22px] bg-gradient-to-b from-surface/60 to-bg-2/60 ${className}`}>
      <div ref={mountRef} className="absolute inset-0" role="img" aria-label={label} />
      {phase === 'ready' && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {projected.map((c) =>
            c.hidden ? null : <Callout key={c.key} x={c.x} y={c.y} side={c.side} dimmed={c.dimmed} label={c.label} index={c.index} />,
          )}
        </div>
      )}
      {phase === 'ready' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 p-3 text-[10px] font-semibold text-muted">
          <span className="glass flex items-center gap-3 !rounded-full px-3 py-1">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-lime shadow-[0_0_0_3px_rgb(var(--c-lime)/0.25)]" />
              Con señal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-fg/30" />
              Sin señal
            </span>
          </span>
          <span className="hidden sm:inline">Arrastra para girar · rueda para acercar</span>
        </div>
      )}
      {phase === 'nowebgl' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
          Tu navegador no admite WebGL, necesario para ver el invernadero en 3D. Las lecturas siguen disponibles abajo.
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { errorMessage } from '@/api/client'
import { Callout } from '@/components/ui'
import { placeModel, toModel } from '@/features/three/model'
import type { ModelPoint, ViewerHotspot } from '@/features/three/types'
import { useProjectedCallouts } from '@/features/three/useProjectedCallouts'
import { webglAvailable } from '@/features/three/webgl'
import { useTheme } from '@/store/theme'
import { BinarySource, fetchBinary, formatBytes } from './api'
import { isClick } from './pick'
import { viewerPalette } from './viewerPalette'

export interface StlViewerProps extends BinarySource {
  label?: string
  className?: string
  /** Puntos a mostrar como callouts, en coordenadas crudas del STL. */
  hotspots?: ViewerHotspot[]
  /** Si se da, un clic sobre la malla (sin arrastre) devuelve el punto en coordenadas crudas. */
  onPick?: (point: ModelPoint) => void
  /** false oculta la barra de ayuda y el botón de giro (vista decorativa, no interactiva). */
  chrome?: boolean
}

type Phase = 'loading' | 'ready' | 'error' | 'nowebgl'

const RESUME_AFTER_MS = 4000
const CREASE_ANGLE = Math.PI / 6
const SMOOTH_MAX_TRIANGLES = 1_500_000

/** Visor STL con three.js. Se carga de forma perezosa (ver LazyStlViewer) para no inflar el bundle principal. */
export default function StlViewer({ url, authed, label = 'Modelo 3D', className = '', hotspots, onPick, chrome = true }: StlViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const playingRef = useRef(true)
  const [playing, setPlaying] = useState(true)
  const [phase, setPhase] = useState<Phase>('loading')
  const [progress, setProgress] = useState<{ loaded: number; total?: number }>({ loaded: 0 })
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const theme = useTheme((s) => s.theme)
  const darkRef = useRef(theme === 'dark')
  const applyThemeRef = useRef<((dark: boolean) => void) | null>(null)

  // Recolorea la escena al cambiar de tema sin volver a descargar el modelo.
  useEffect(() => {
    darkRef.current = theme === 'dark'
    applyThemeRef.current?.(darkRef.current)
  }, [theme])

  const { projected, projector } = useProjectedCallouts()
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const pointsKey = JSON.stringify(hotspots ?? [])

  useEffect(() => {
    const list: ViewerHotspot[] = JSON.parse(pointsKey)
    projector.setPoints(list.map((h, i) => ({ key: h.key, label: h.label, index: i + 1, x: h.x, y: h.y, z: h.z })))
  }, [pointsKey, projector])

  useEffect(() => {
    const canvas = mountRef.current?.querySelector('canvas')
    if (canvas) canvas.style.cursor = onPick ? 'crosshair' : ''
  }, [onPick, phase])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    if (!webglAvailable()) {
      setPhase('nowebgl')
      return
    }

    setPhase('loading')
    setProgress({ loaded: 0 })
    let disposed = false
    let frame = 0
    let interacting = false
    const abort = new AbortController()

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
    const fog = new THREE.Fog(palette.fog, 10, 40)
    scene.fog = fog
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000)
    camera.position.set(3, 2, 4)

    scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    const hemi = new THREE.HemisphereLight(0xffffff, palette.ground, 0.6)
    scene.add(hemi)
    let material: THREE.MeshStandardMaterial | null = null
    let grid: THREE.GridHelper | null = null
    let mesh: THREE.Mesh | null = null

    const GRID_DIVISIONS = 24
    const paintGrid = (g: THREE.GridHelper, center: number, line: number) => {
      // GridHelper escribe 4 vértices por paso; el paso divisions/2 es la cruz central.
      const colors = g.geometry.getAttribute('color') as THREE.BufferAttribute
      const c = new THREE.Color(center)
      const l = new THREE.Color(line)
      for (let v = 0; v < colors.count; v++) {
        const col = Math.floor(v / 4) === GRID_DIVISIONS / 2 ? c : l
        colors.setXYZ(v, col.r, col.g, col.b)
      }
      colors.needsUpdate = true
    }

    applyThemeRef.current = (dark: boolean) => {
      const p = viewerPalette(dark)
      fog.color.setHex(p.fog)
      hemi.groundColor.setHex(p.ground)
      material?.color.setHex(p.mesh)
      if (grid) paintGrid(grid, p.gridCenter, p.grid)
    }
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(4, 6, 5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xa6e22e, 0.8)
    rim.position.set(-5, 3, -6)
    scene.add(rim)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.autoRotateSpeed = 0.6
    controls.enablePan = false

    // Pausa el giro mientras el usuario interactúa y lo reanuda unos segundos después.
    let resumeAt = 0
    const onStart = () => {
      interacting = true
    }
    const onEnd = () => {
      interacting = false
      resumeAt = performance.now() + RESUME_AFTER_MS
    }
    controls.addEventListener('start', onStart)
    controls.addEventListener('end', onEnd)

    const pickRay = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downAt: { x: number; y: number } | null = null
    const onPointerDown = (e: PointerEvent) => {
      // Solo el botón principal coloca puntos; clic derecho o central no.
      downAt = e.button === 0 ? { x: e.clientX, y: e.clientY } : null
    }
    const onPointerUp = (e: PointerEvent) => {
      const start = downAt
      downAt = null
      if (!mesh || !onPickRef.current || !isClick(start, { x: e.clientX, y: e.clientY })) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      pickRay.setFromCamera(pointer, camera)
      const hit = pickRay.intersectObject(mesh, false)[0]
      if (hit) onPickRef.current(toModel(mesh, hit.point))
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    const disposables: Array<{ dispose: () => void }> = []

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

    const tick = () => {
      frame = requestAnimationFrame(tick)
      controls.autoRotate = playingRef.current && !onPickRef.current && !interacting && performance.now() >= resumeAt
      controls.update()
      if (mesh) projector.update(camera, mesh, mount.clientWidth || 1, mount.clientHeight || 1, performance.now())
      renderer.render(scene, camera)
    }

    fetchBinary(
      { url, authed },
      { signal: abort.signal, onProgress: (loaded, total) => !disposed && setProgress({ loaded, total }) },
    )
      .then((buffer) => {
        if (disposed) return
        const raw = new STLLoader().parse(buffer)
        if (!raw.getAttribute('position') || raw.getAttribute('position').count === 0) {
          raw.dispose()
          throw new Error('empty')
        }
        // Superficies curvas suaves y aristas nítidas; en mallas enormes se queda el sombreado plano.
        const triangles = raw.getAttribute('position').count / 3
        let geometry = raw
        if (triangles <= SMOOTH_MAX_TRIANGLES) {
          geometry = toCreasedNormals(raw, CREASE_ANGLE)
          raw.dispose()
        } else {
          raw.computeVertexNormals()
        }
        geometry.computeBoundingSphere()
        material = new THREE.MeshStandardMaterial({ color: palette.mesh, metalness: 0.35, roughness: 0.45 })
        const placed = placeModel(geometry, material)
        mesh = placed.mesh
        const radius = placed.radius
        const floorY = placed.floorY
        scene.add(mesh)
        disposables.push(geometry, material)

        grid = new THREE.GridHelper(radius * 6, GRID_DIVISIONS, palette.gridCenter, palette.grid)
        grid.position.y = floorY - radius * 0.02
        const gridMaterial = grid.material as THREE.Material
        gridMaterial.transparent = true
        gridMaterial.opacity = 0.35
        scene.add(grid)
        disposables.push(grid.geometry, gridMaterial)

        const fov = (camera.fov * Math.PI) / 180
        const distance = (radius / Math.sin(fov / 2)) * 1.15
        camera.position.copy(new THREE.Vector3(1, 0.6, 1.2).normalize().multiplyScalar(distance))
        camera.near = distance / 100
        camera.far = distance * 20
        camera.updateProjectionMatrix()
        fog.near = distance * 1.5
        fog.far = distance * 4
        controls.target.set(0, 0, 0)
        controls.minDistance = radius * 0.6
        controls.maxDistance = distance * 4
        controls.update()

        // Por si el tema cambió mientras se descargaba el modelo.
        applyThemeRef.current?.(darkRef.current)
        projector.invalidate()
        setPhase('ready')
        tick()
      })
      .catch((err) => {
        if (disposed || abort.signal.aborted) return
        setError(
          err instanceof Error && err.message === 'empty'
            ? 'El modelo no contiene geometría'
            : errorMessage(err, 'No se pudo cargar el modelo 3D'),
        )
        setPhase('error')
      })

    return () => {
      disposed = true
      applyThemeRef.current = null
      abort.abort()
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      disposables.forEach((d) => d.dispose())
      scene.clear()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [url, authed, attempt])

  const togglePlay = () => {
    playingRef.current = !playingRef.current
    setPlaying(playingRef.current)
  }

  const pct = progress.total ? Math.round((progress.loaded / progress.total) * 100) : null

  return (
    <div
      className={`relative overflow-hidden rounded-[22px] bg-gradient-to-b from-surface/60 to-bg-2/60 ${className}`}
    >
      <div ref={mountRef} className="absolute inset-0" role="img" aria-label={label} />

      {phase === 'ready' && projected.length > 0 && (
        <div
          aria-hidden="true"
          // En modo selección las etiquetas no deben tapar el clic sobre la malla.
          className={`pointer-events-none absolute inset-0 ${onPick ? '[&_*]:!pointer-events-none' : ''}`}
        >
          {projected.map((c) => {
            if (c.hidden) return null
            const source = hotspots?.find((h) => h.key === c.key)
            return (
              <Callout
                key={c.key}
                x={c.x}
                y={c.y}
                side={c.side}
                dimmed={c.dimmed}
                label={c.label}
                index={c.index}
                title={source?.description || undefined}
              />
            )
          })}
        </div>
      )}

      {phase === 'loading' && (
        <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 font-sans text-xs text-muted">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span>Cargando modelo {pct !== null ? `${pct}%` : progress.loaded ? formatBytes(progress.loaded) : ''}</span>
          {pct !== null && (
            <span className="h-px w-40 bg-border">
              <span className="block h-px bg-accent transition-[width]" style={{ width: `${pct}%` }} />
            </span>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-danger">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="glass !rounded-full px-3 py-1.5 text-[11px] font-semibold"
          >
            Reintentar
          </button>
        </div>
      )}

      {phase === 'nowebgl' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
          Tu navegador no admite WebGL, necesario para ver el modelo 3D interactivo.
        </div>
      )}

      {phase === 'ready' && chrome && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-3">
          <span className="font-sans text-[10px] text-muted">
            {onPick ? 'Haz clic sobre el modelo para colocar el punto' : 'Arrastra para girar · rueda para acercar'}
          </span>
          <button
            type="button"
            onClick={togglePlay}
            aria-pressed={!playing}
            className="glass pointer-events-auto !rounded-full px-3 py-1.5 text-[11px] font-semibold"
          >
            {playing ? 'Pausar giro' : 'Reanudar giro'}
          </button>
        </div>
      )}
    </div>
  )
}

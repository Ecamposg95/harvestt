import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { errorMessage } from '@/api/client'
import { BinarySource, fetchBinary, formatBytes } from './api'

export interface StlViewerProps extends BinarySource {
  label?: string
  className?: string
}

type Phase = 'loading' | 'ready' | 'error' | 'nowebgl'

const RESUME_AFTER_MS = 4000

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

/** Visor STL con three.js. Se carga de forma perezosa (ver LazyStlViewer) para no inflar el bundle principal. */
export default function StlViewer({ url, authed, label = 'Modelo 3D', className = '' }: StlViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const playingRef = useRef(true)
  const [playing, setPlaying] = useState(true)
  const [phase, setPhase] = useState<Phase>('loading')
  const [progress, setProgress] = useState<{ loaded: number; total?: number }>({ loaded: 0 })
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

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

    const dark = document.documentElement.classList.contains('dark')
    const fogColor = dark ? 0x141813 : 0xe6ece2
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(fogColor, 10, 40)
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000)
    camera.position.set(3, 2, 4)

    scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x141813 : 0xcfdacb, 0.6))
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
      controls.autoRotate = playingRef.current && !interacting && performance.now() >= resumeAt
      controls.update()
      renderer.render(scene, camera)
    }

    fetchBinary(
      { url, authed },
      { signal: abort.signal, onProgress: (loaded, total) => !disposed && setProgress({ loaded, total }) },
    )
      .then((buffer) => {
        if (disposed) return
        const geometry = new STLLoader().parse(buffer)
        if (!geometry.getAttribute('position') || geometry.getAttribute('position').count === 0) {
          geometry.dispose()
          throw new Error('empty')
        }
        geometry.rotateX(-Math.PI / 2) // STL suele ser Z-arriba; three usa Y-arriba
        geometry.computeVertexNormals()
        geometry.center()
        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()
        const radius = geometry.boundingSphere?.radius || 1
        const floorY = geometry.boundingBox?.min.y ?? -radius

        const material = new THREE.MeshStandardMaterial({ color: dark ? 0x9aa898 : 0xd9dfd4, metalness: 0.35, roughness: 0.45 })
        const mesh = new THREE.Mesh(geometry, material)
        scene.add(mesh)
        disposables.push(geometry, material)

        const grid = new THREE.GridHelper(radius * 6, 24, 0x4f7a12, dark ? 0x2a3229 : 0xc4d0c0)
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
        scene.fog = new THREE.Fog(fogColor, distance * 1.5, distance * 4)
        controls.target.set(0, 0, 0)
        controls.minDistance = radius * 0.6
        controls.maxDistance = distance * 4
        controls.update()

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
      abort.abort()
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
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

      {phase === 'ready' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-3">
          <span className="font-sans text-[10px] text-muted">Arrastra para girar · rueda para acercar</span>
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

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useTheme } from '@/store/theme'
import type { VisionSite } from './api'
import { latLonToVector3 } from './geo'

export interface GlobeProps {
  sites: VisionSite[]
  animate: boolean
  className?: string
}

const R = 1
const ROTATION_SPEED = 0.0025

function palette(dark: boolean) {
  return dark
    ? { sphere: 0x1b221a, line: 0x4a5a47, accent: 0xa6e22e }
    : { sphere: 0x2c3a2b, line: 0x6f8a68, accent: 0x9be12b }
}

function circlePoints(fn: (t: number) => [number, number, number], n = 96) {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) pts.push(new THREE.Vector3(...fn((i / n) * Math.PI * 2)))
  return pts
}

/** Globo three.js: esfera con malla geográfica y los sitios de la red. Se carga de forma perezosa (ver LazyGlobe). */
export default function Globe({ sites, animate, className = '' }: GlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const theme = useTheme((s) => s.theme)
  const darkRef = useRef(theme === 'dark')
  const applyThemeRef = useRef<((dark: boolean) => void) | null>(null)
  const sitesKey = JSON.stringify(sites)

  useEffect(() => {
    darkRef.current = theme === 'dark'
    applyThemeRef.current?.(darkRef.current)
  }, [theme])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const list: VisionSite[] = JSON.parse(sitesKey)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    camera.position.set(0, 0.6, 4.2)
    camera.lookAt(0, 0, 0)

    const pal = palette(darkRef.current)
    const globe = new THREE.Group()
    globe.rotation.x = 0.25
    scene.add(globe)

    const sphereMat = new THREE.MeshBasicMaterial({ color: pal.sphere })
    const sphereGeo = new THREE.SphereGeometry(R, 48, 32)
    globe.add(new THREE.Mesh(sphereGeo, sphereMat))

    const lineMat = new THREE.LineBasicMaterial({ color: pal.line, transparent: true, opacity: 0.55 })
    const lineGeos: THREE.BufferGeometry[] = []
    const addLine = (pts: THREE.Vector3[]) => {
      const g = new THREE.BufferGeometry().setFromPoints(pts)
      lineGeos.push(g)
      globe.add(new THREE.Line(g, lineMat))
    }
    const rr = R * 1.002
    for (let lat = -60; lat <= 60; lat += 30) {
      addLine(circlePoints((t) => latLonToVector3(lat, (t / (Math.PI * 2)) * 360 - 180, rr)))
    }
    for (let lon = -180; lon < 180; lon += 30) {
      addLine(circlePoints((t) => latLonToVector3(90 - (t / (Math.PI * 2)) * 180, lon, rr)).slice(0, 49))
    }

    const dotGeo = new THREE.SphereGeometry(0.035, 16, 12)
    const dotMat = new THREE.MeshBasicMaterial({ color: pal.accent })
    // Anillo punteado: arcos cortos con huecos.
    const dashedRingGeo = new THREE.BufferGeometry()
    {
      const segs: number[] = []
      const n = 8
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2
        const a1 = a0 + (Math.PI * 2) / n * 0.55
        segs.push(Math.cos(a0) * 0.05, Math.sin(a0) * 0.05, 0, Math.cos(a1) * 0.05, Math.sin(a1) * 0.05, 0)
      }
      dashedRingGeo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3))
    }
    const dashedMat = new THREE.LineBasicMaterial({ color: pal.accent })

    const pulses: THREE.Mesh[] = []
    for (const s of list) {
      const [x, y, z] = latLonToVector3(s.lat, s.lon, R * 1.01)
      if (s.kind === 'historic') {
        const dot = new THREE.Mesh(dotGeo, dotMat)
        dot.position.set(x, y, z)
        globe.add(dot)
        pulses.push(dot)
      } else {
        const ring = new THREE.LineSegments(dashedRingGeo, dashedMat)
        ring.position.set(x, y, z)
        ring.lookAt(0, 0, 0)
        globe.add(ring)
      }
    }
    // Orienta la cara frontal hacia el sitio histórico (o México por defecto).
    const focus = list.find((s) => s.kind === 'historic') ?? { lon: -99 }
    globe.rotation.y = -((focus.lon + 90) * Math.PI) / 180 // la cara frontal es lon = -90

    const renderOnce = () => renderer.render(scene, camera)

    applyThemeRef.current = (dark: boolean) => {
      const p = palette(dark)
      sphereMat.color.setHex(p.sphere)
      lineMat.color.setHex(p.line)
      dotMat.color.setHex(p.accent)
      dashedMat.color.setHex(p.accent)
      if (!animate) renderOnce()
    }

    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      if (!animate) renderOnce()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      globe.rotation.y += ROTATION_SPEED
      const k = 1 + 0.35 * Math.sin(performance.now() / 380)
      pulses.forEach((p) => p.scale.setScalar(k))
      renderer.render(scene, camera)
    }
    if (animate) tick()
    else renderOnce()

    return () => {
      applyThemeRef.current = null
      cancelAnimationFrame(frame)
      observer.disconnect()
      ;[sphereGeo, dotGeo, dashedRingGeo, ...lineGeos, sphereMat, lineMat, dotMat, dashedMat].forEach((d) => d.dispose())
      scene.clear()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [sitesKey, animate])

  return (
    <div
      className={`relative aspect-square w-full max-w-[520px] overflow-hidden rounded-[22px] ${className}`}
    >
      <div ref={mountRef} className="absolute inset-0" role="img" aria-label="Globo con los sitios de la red HarvestT" />
    </div>
  )
}

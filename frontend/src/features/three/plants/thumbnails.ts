import * as THREE from 'three'
import { webglAvailable } from '../webgl'
import { createPlantObject, getPlantModel } from './model'
import { addPlantLights, frameCamera } from './scene'
import type { PlantKind, PlantStage } from './types'

export const THUMBNAIL_PX = 256

let shadowTexture: THREE.CanvasTexture | null | undefined

/** Sombra de contacto difusa bajo la planta: neutra (negro translúcido) para que sirva en tema claro y oscuro. */
function contactShadow(radius: number): THREE.Mesh | null {
  if (shadowTexture === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      g.addColorStop(0, '#ffffff')
      g.addColorStop(1, '#000000')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 64, 64)
    }
    shadowTexture = ctx ? new THREE.CanvasTexture(canvas) : null
  }
  if (!shadowTexture) return null
  const geometry = new THREE.CircleGeometry(Math.max(radius * 1.1, 0.04), 32)
  geometry.rotateX(-Math.PI / 2)
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: shadowTexture,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  })
  return new THREE.Mesh(geometry, material)
}

// undefined = aún no se intentó; null = sin WebGL. Un único contexto para todas las miniaturas.
let renderer: THREE.WebGLRenderer | null | undefined

function sharedRenderer(): THREE.WebGLRenderer | null {
  if (renderer !== undefined) return renderer
  renderer = null
  if (!webglAvailable()) return renderer
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    r.setPixelRatio(1)
    r.setSize(THUMBNAIL_PX, THUMBNAIL_PX, false)
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.NeutralToneMapping // mismo tono que el visor de la ficha
    r.setClearColor(0x000000, 0)
    renderer = r
  } catch {
    renderer = null
  }
  return renderer
}

/** Dibuja la planta fuera del DOM y devuelve un PNG (data URL); null si no hay WebGL. */
export function renderPlantThumbnail(kind: PlantKind, seed = 0, stage: PlantStage = 'mature'): string | null {
  const r = sharedRenderer()
  if (!r) return null
  const model = getPlantModel(kind, stage, seed)
  const scene = new THREE.Scene()
  addPlantLights(scene)
  scene.add(createPlantObject(model))
  const shadow = contactShadow(model.radius)
  if (shadow) scene.add(shadow)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100)
  frameCamera(camera, model)
  // La esfera de frameCamera es holgada (encierra la caja); en la miniatura se acerca un poco más.
  camera.zoom = 1.2
  camera.updateProjectionMatrix()
  r.clear()
  r.render(scene, camera)
  const url = r.domElement.toDataURL('image/png')
  scene.clear() // geometrías y materiales de la planta son de la caché
  if (shadow) {
    shadow.geometry.dispose()
    ;(shadow.material as THREE.Material).dispose()
  }
  return url
}

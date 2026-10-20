import * as THREE from 'three'

/** Multiplicador RGB sobre el color del material (1, 1, 1 = sin cambio). */
export type Tint = [number, number, number]

export const NO_TINT: Tint = [1, 1, 1]

export interface LeafOptions {
  length: number
  width: number
  /** Profundidad del pliegue en V a lo largo de la nervadura (fracción del medio ancho). */
  fold?: number
  /** Arqueo de la punta hacia +Z (fracción del largo); negativo la dobla hacia −Z. */
  curl?: number
  /** Ondulado del borde (lechuga). */
  ruffle?: number
  /** Exponente del perfil: < 1 ensancha la base, > 1 la afina. */
  taper?: number
  /** < 1 redondea el contorno (punta roma); 1 = contorno de lente. */
  roundness?: number
  /** Tinte en la base y en la punta de la hoja (degradado a lo largo). */
  baseTint?: Tint
  tipTint?: Tint
}

/** Añade (o reemplaza) un atributo `color` uniforme: el material lo multiplica por su color. */
export function tintGeometry(geometry: THREE.BufferGeometry, tint: Tint = NO_TINT): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set(tint, i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/**
 * Hoja con la base en el origen que crece hacia +Y; la lámina está en el plano XY y se arquea hacia +Z.
 * Se deforma un PlaneGeometry: u (0..1) a lo largo, v (−0.5..0.5) a lo ancho. Lleva color por vértice:
 * degradado base → punta y nervadura central un poco más clara.
 */
export function leafGeometry({
  length,
  width,
  fold = 0.25,
  curl = 0.2,
  ruffle = 0,
  taper = 0.8,
  roundness = 1,
  baseTint = NO_TINT,
  tipTint = NO_TINT,
}: LeafOptions) {
  const geometry = new THREE.PlaneGeometry(1, 1, 8, 14)
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getX(i)
    const u = pos.getY(i) + 0.5
    const profile = Math.pow(Math.max(Math.sin(Math.PI * Math.pow(u, taper)), 0), roundness) // 0 en base y punta
    const half = profile * width * 0.5
    const edge = Math.abs(v) * 2 // 0 en la nervadura, 1 en el borde
    const wave = ruffle * Math.sin(u * 22 + v * 7) * edge * edge * width * (0.4 + 0.6 * u)
    const z = curl * length * u * u + fold * half * edge + wave
    pos.setXYZ(i, v * 2 * half, u * length, z)
    const rib = 1 + 0.14 * Math.max(0, 1 - edge * 5) // nervadura más clara
    const shade = 0.92 + 0.08 * (1 - edge) // el borde un poco más oscuro
    for (let c = 0; c < 3; c++) colors[i * 3 + c] = (baseTint[c] + (tipTint[c] - baseTint[c]) * u) * rib * shade
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** PlaneGeometry emite primero la fila superior (u = 1), donde todo el borde converge en la punta. */
export function leafTip(leaf: THREE.BufferGeometry): THREE.Vector3 {
  return new THREE.Vector3().fromBufferAttribute(leaf.getAttribute('position') as THREE.BufferAttribute, 0)
}

/** Tallo recto desde el suelo (y = 0) hasta `height`. */
export function stemGeometry(height: number, radiusBottom: number, radiusTop = radiusBottom * 0.6) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 8, 1)
  geometry.translate(0, height / 2, 0)
  return geometry
}

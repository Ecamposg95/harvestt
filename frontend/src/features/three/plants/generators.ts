import * as THREE from 'three'
import { between } from './random'
import { leafGeometry, leafTip, stemGeometry, Tint, tintGeometry } from './shapes'
import type { PlantAnchor, PlantStage } from './types'

export type Rand = () => number

export interface PlantParts {
  leaf: THREE.BufferGeometry[]
  stem: THREE.BufferGeometry[]
  fruit: THREE.BufferGeometry[]
  flower: THREE.BufferGeometry[]
  /** Anclas propias de la especie (la punta de una hoja representativa). */
  anchors: PlantAnchor[]
}

/** Ángulo áureo (≈ 137,5°): filotaxis en espiral. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const STAGE: Record<PlantStage, 0 | 1 | 2> = { seedling: 0, vegetative: 1, mature: 2 }

function emptyParts(): PlantParts {
  return { leaf: [], stem: [], fruit: [], flower: [], anchors: [] }
}

function tipAnchor(leaf: THREE.BufferGeometry): PlantAnchor {
  const tip = leafTip(leaf)
  return { key: 'leaf', x: tip.x, y: tip.y, z: tip.z }
}

/** Interpola dos tintes. */
function mixTint(a: Tint, b: Tint, t: number): Tint {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Lechuga: roseta en espiral; hojas exteriores grandes, abiertas y onduladas, interiores pequeñas, erguidas y claras. */
export function generateLettuce(stage: PlantStage, rand: Rand): PlantParts {
  const out = emptyParts()
  const s = STAGE[stage]
  const count = [4, 14, 26][s]
  const outer = [0.05, 0.13, 0.19][s]
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1) // 0 = exterior, 1 = interior
    const length = outer * (1 - 0.5 * t) * between(rand, 0.9, 1.1)
    const leaf = leafGeometry({
      length,
      width: length * (s === 0 ? between(rand, 0.6, 0.7) : between(rand, 0.95, 1.15)),
      taper: s === 0 ? 0.9 : 1.4,
      roundness: s === 0 ? 0.9 : 0.55,
      fold: s === 0 ? 0.1 : -0.25, // borde hacia el cielo: hoja ahuecada
      curl: s === 0 ? 0.1 : 0.32 - 0.5 * t, // exteriores caen, interiores se cierran sobre el cogollo
      ruffle: s === 0 ? 0 : 0.1 * (1 - 0.5 * t),
      baseTint: [1.3, 1.22, 0.95],
      tipTint: mixTint([0.82, 0.9, 0.82], [1.12, 1.12, 0.9], t),
    })
    const tilt = (s === 0 ? 0.5 : 1.3 - 1.0 * t) + between(rand, -0.08, 0.08) // desde la vertical
    leaf.rotateX(tilt)
    leaf.rotateY(i * GOLDEN_ANGLE + between(rand, -0.15, 0.15))
    leaf.translate(0, 0.004 + 0.01 * t, 0)
    out.leaf.push(leaf)
  }
  out.anchors.push(tipAnchor(out.leaf[0]))
  return out
}

/** Hoja compuesta de tomate en su marco local: raquis sobre +X, folíolos en pares y uno terminal. */
function compoundLeaf(length: number, pairs: number, rand: Rand, tint: Tint): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  const rachis = new THREE.CylinderGeometry(length * 0.012, length * 0.02, length, 5, 1)
  rachis.rotateZ(-Math.PI / 2) // eje Y → +X
  rachis.translate(length / 2, 0, 0)
  parts.push(tintGeometry(rachis, [0.9, 1, 0.85]))
  const leaflet = (len: number) =>
    leafGeometry({
      length: len,
      width: len * 0.62,
      fold: 0.35,
      curl: 0.18,
      taper: 0.85,
      roundness: 0.85,
      ruffle: 0.03,
      baseTint: mixTint(tint, [1.15, 1.15, 1], 0.5),
      tipTint: tint,
    })
  for (let p = 0; p < pairs; p++) {
    const t = pairs === 1 ? 0.5 : 0.3 + (0.5 * p) / (pairs - 1)
    const len = length * between(rand, 0.42, 0.5)
    const right = leaflet(len) // hacia +Z, barrido hacia la punta
    right.rotateX(Math.PI / 2)
    right.rotateY(0.5)
    right.translate(length * t, 0, 0)
    const left = leaflet(len) // espejo hacia −Z (mismo arqueo hacia abajo)
    left.rotateX(Math.PI / 2)
    left.rotateY(Math.PI - 0.5)
    left.translate(length * t, 0, 0)
    parts.push(right, left)
  }
  const tip = leaflet(length * 0.48)
  tip.rotateX(Math.PI / 2)
  tip.rotateY(Math.PI / 2) // +Z → +X
  tip.translate(length, 0, 0)
  parts.push(tip) // el folíolo terminal queda al final
  return parts
}

/** Tintes de maduración del fruto sobre el rojo de la paleta: rojo, naranja, verde. */
const RIPENESS: Tint[] = [
  [1, 1, 1],
  [1, 2.2, 1.2],
  [0.4, 5.5, 2],
]

/** Tomate: tallo con leve zigzag, hojas compuestas en espiral y, al madurar, flores y racimos de frutos. */
export function generateTomato(stage: PlantStage, rand: Rand): PlantParts {
  const out = emptyParts()
  const s = STAGE[stage]
  const height = [0.12, 0.65, 1.25][s]
  const nodes = [2, 7, 12][s]
  const sway = [0.004, 0.02, 0.035][s]
  const points = [new THREE.Vector3(0, 0, 0)]
  for (let i = 1; i <= nodes; i++) {
    points.push(new THREE.Vector3(between(rand, -sway, sway), (height * i) / nodes, between(rand, -sway, sway)))
  }
  const curve = new THREE.CatmullRomCurve3(points)
  out.stem.push(new THREE.TubeGeometry(curve, nodes * 6, [0.003, 0.009, 0.014][s], 8, false))

  const leafLength = [0.07, 0.27, 0.4][s]
  const pairs = [1, 2, 3][s]
  for (let k = 1; k <= nodes; k++) {
    const t = k / nodes
    const at = curve.getPointAt(t)
    const length = leafLength * (1.15 - 0.5 * t) * between(rand, 0.9, 1.1)
    const lift = 0.55 - 0.7 * (1 - t) + between(rand, -0.1, 0.1) // abajo cuelgan, arriba suben
    const yaw = k * GOLDEN_ANGLE + between(rand, -0.2, 0.2)
    const leaf = compoundLeaf(length, pairs, rand, mixTint([0.82, 0.88, 0.82], [1.1, 1.15, 0.95], t))
    for (const g of leaf) {
      g.rotateZ(lift)
      g.rotateY(yaw)
      g.translate(at.x, at.y, at.z)
      out.leaf.push(g)
    }
    if (k === Math.ceil(nodes / 2)) out.anchors.push(tipAnchor(leaf[leaf.length - 1]))
  }

  if (s === 2) {
    for (let j = 0; j < 3; j++) {
      const at = curve.getPointAt(0.3 + 0.18 * j)
      const yaw = j * 2.1 + between(rand, -0.3, 0.3)
      const count = 3 + Math.floor(rand() * 3)
      for (let f = 0; f < count; f++) {
        const r = between(rand, 0.03, 0.042)
        const fruit = new THREE.SphereGeometry(r, 16, 12)
        fruit.scale(1, 0.85, 1)
        const a = yaw + (f - (count - 1) / 2) * 0.55
        const d = 0.06 + 0.03 * (f % 2)
        const x = at.x + Math.cos(a) * d
        const y = at.y - 0.04 - 0.03 * (f % 3)
        const z = at.z + Math.sin(a) * d
        fruit.translate(x, y, z)
        out.fruit.push(tintGeometry(fruit, RIPENESS[j]))
        const calyx = new THREE.ConeGeometry(r * 0.55, r * 0.35, 5, 1)
        calyx.translate(x, y + r * 0.85, z)
        out.stem.push(calyx)
      }
    }
    // Flores amarillas colgantes cerca de la punta.
    for (let j = 0; j < 2; j++) {
      const at = curve.getPointAt(0.86 + 0.08 * j)
      const yaw = j * 2.6 + between(rand, -0.3, 0.3)
      for (let f = 0; f < 4; f++) {
        const flower = new THREE.ConeGeometry(0.012, 0.014, 6, 1)
        flower.rotateX(Math.PI) // pétalos hacia abajo
        const a = yaw + f * 0.6
        flower.translate(at.x + Math.cos(a) * 0.035, at.y - 0.02, at.z + Math.sin(a) * 0.035)
        out.flower.push(flower)
      }
    }
  }
  return out
}

/** Verticilos de flores blancas a lo largo de una espiga desde `base` en dirección `dir`. */
function flowerSpike(base: THREE.Vector3, dir: THREE.Vector3, length: number, size: number, out: PlantParts) {
  const whorls = 5
  for (let w = 0; w < whorls; w++) {
    const f = w / (whorls - 1)
    const center = base.clone().addScaledVector(dir, length * f)
    const ring = size * (2.2 - 1.2 * f)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + w * 0.5
      const bud = new THREE.SphereGeometry(size * (1 - 0.35 * f), 6, 4)
      bud.translate(center.x + Math.cos(a) * ring, center.y, center.z + Math.sin(a) * ring)
      out.flower.push(bud)
    }
  }
}

/** Albahaca: tallo recto con pares de hojas opuestas, cada par girado 90° (decusado); ramas y espigas al madurar. */
export function generateBasil(stage: PlantStage, rand: Rand): PlantParts {
  const out = emptyParts()
  const s = STAGE[stage]
  const height = [0.06, 0.22, 0.4][s]
  const pairs = [2, 4, 7][s]
  const leafLength = [0.035, 0.085, 0.105][s]
  const basilLeaf = (length: number, young: number) =>
    leafGeometry({
      length,
      width: length * 0.7,
      fold: 0.45,
      curl: 0.2,
      taper: 0.85,
      roundness: 0.8,
      baseTint: [1.12, 1.12, 0.95],
      tipTint: mixTint([0.88, 0.95, 0.88], [1.12, 1.15, 0.95], young),
    })
  out.stem.push(stemGeometry(height, [0.0025, 0.0045, 0.007][s]))
  for (let k = 0; k < pairs; k++) {
    const t = (k + 1) / (pairs + 0.5)
    const length = leafLength * (1.1 - 0.5 * (k / pairs)) * between(rand, 0.9, 1.1)
    const lift = between(rand, 0.25, 0.45)
    const yaw = (k % 2) * (Math.PI / 2) + between(rand, -0.12, 0.12)
    for (const side of [0, Math.PI]) {
      const leaf = basilLeaf(length, k / pairs)
      leaf.rotateX(Math.PI / 2 - lift) // casi horizontal, un poco hacia arriba
      leaf.rotateY(yaw + side)
      leaf.translate(0, height * t, 0)
      out.leaf.push(leaf)
    }
  }
  out.anchors.push(tipAnchor(out.leaf[0]))
  if (s === 2) {
    const up = new THREE.Vector3(0, 1, 0)
    flowerSpike(new THREE.Vector3(0, height, 0), up, 0.06, 0.0045, out)
    // Dos ramas laterales en las axilas inferiores, cada una con sus pares de hojas y su espiga.
    for (let b = 0; b < 2; b++) {
      const y0 = height * ((b + 1) / (pairs + 0.5))
      const yaw = (b % 2) * (Math.PI / 2) + Math.PI / 4 + between(rand, -0.2, 0.2)
      const tilt = between(rand, 0.55, 0.7)
      const len = height * between(rand, 0.4, 0.5)
      const dir = up.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt).applyAxisAngle(up, yaw)
      const branch = stemGeometry(len, 0.004, 0.0025)
      branch.rotateX(tilt)
      branch.rotateY(yaw)
      branch.translate(0, y0, 0)
      out.stem.push(branch)
      const base = new THREE.Vector3(0, y0, 0)
      for (let p = 0; p < 3; p++) {
        const f = (p + 1) / 3.5
        const at = base.clone().addScaledVector(dir, len * f)
        const length = leafLength * (0.85 - 0.15 * p) * between(rand, 0.9, 1.1)
        const leafYaw = yaw + (p % 2 === 0 ? Math.PI / 2 : 0) + between(rand, -0.15, 0.15)
        for (const side of [0, Math.PI]) {
          const leaf = basilLeaf(length, 0.4 + 0.2 * p)
          leaf.rotateX(Math.PI / 2 - between(rand, 0.25, 0.5))
          leaf.rotateY(leafYaw + side)
          leaf.translate(at.x, at.y, at.z)
          out.leaf.push(leaf)
        }
      }
      flowerSpike(base.clone().addScaledVector(dir, len), dir, 0.035, 0.0038, out)
    }
  }
  return out
}

/** Genérico: tallo con hojas simples alternas en espiral (especies sin generador propio). */
export function generateGeneric(stage: PlantStage, rand: Rand): PlantParts {
  const out = emptyParts()
  const s = STAGE[stage]
  const height = [0.05, 0.18, 0.32][s]
  const count = [2, 7, 12][s]
  const leafLength = [0.035, 0.085, 0.11][s]
  out.stem.push(stemGeometry(height, [0.002, 0.0045, 0.0065][s]))
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const length = leafLength * (1 - 0.35 * t) * between(rand, 0.9, 1.1)
    const leaf = leafGeometry({
      length,
      width: length * 0.55,
      fold: 0.25,
      curl: 0.25,
      taper: 1,
      roundness: 0.85,
      baseTint: [1.1, 1.1, 0.95],
      tipTint: mixTint([0.88, 0.93, 0.88], [1.1, 1.12, 0.95], t),
    })
    leaf.rotateX(Math.PI / 2 - between(rand, 0.35, 0.6))
    leaf.rotateY(i * GOLDEN_ANGLE + between(rand, -0.2, 0.2))
    leaf.translate(0, height * (0.25 + 0.7 * t), 0)
    out.leaf.push(leaf)
  }
  out.anchors.push(tipAnchor(out.leaf[0]))
  return out
}

import type { CropCycle } from '@/features/projects/api'
import type { PlantInstance } from '@/features/three/plants/instances'
import { plantKindFor, PlantStage, variantFor } from '@/features/three/plants/types'
import type { Layout, LayoutPlacement, LayoutZone } from './api'

export interface Selection {
  zone: number
  /** null = la zona está seleccionada. */
  plant: number | null
}

export interface Floor {
  width: number
  depth: number
  illustrative: boolean
}

export const ILLUSTRATIVE_FLOOR_M = 10
export const MAX_ZONES = 20
export const MAX_PLACEMENTS = 400
/** Espaciado de dibujo de «Llenar zona»: no es una recomendación de marco de plantación. */
export const FILL_SPACING_M = 0.3

type CycleRef = Pick<CropCycle, 'id' | 'species_id' | 'species_name'>

const round = (n: number) => Math.round(n * 100) / 100

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Piso vigente: el del servidor si el proyecto tiene área; si no, crece con las zonas (ilustrativo). */
export function floorFor(layout: Pick<Layout, 'floor'>, zones: LayoutZone[]): Floor {
  if (!layout.floor.illustrative) return layout.floor
  return {
    width: Math.max(ILLUSTRATIVE_FLOOR_M, ...zones.map((z) => z.x + z.width)),
    depth: Math.max(ILLUSTRATIVE_FLOOR_M, ...zones.map((z) => z.y + z.depth)),
    illustrative: true,
  }
}

export function plantCount(zones: LayoutZone[]): number {
  return zones.reduce((n, z) => n + z.placements.length, 0)
}

/** Cuerpo del PUT: sin ids ni nombres derivados. */
export function layoutPayload(version: number, zones: LayoutZone[]) {
  return {
    version,
    zones: zones.map((z) => ({
      name: z.name,
      x: z.x,
      y: z.y,
      width: z.width,
      depth: z.depth,
      placements: z.placements.map((p) => ({
        species_id: p.species_id,
        crop_cycle_id: p.crop_cycle_id,
        stage: p.stage,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
      })),
    })),
  }
}

export function addZone(zones: LayoutZone[], floor: Floor): LayoutZone[] {
  if (zones.length >= MAX_ZONES) return zones
  const width = Math.min(3, floor.width)
  const depth = Math.min(1.2, floor.depth)
  const nextY = zones.reduce((y, z) => Math.max(y, z.y + z.depth + 0.6), 0)
  const y = floor.illustrative || nextY + depth <= floor.depth ? nextY : 0
  return [...zones, { name: `Zona ${zones.length + 1}`, x: 0, y: round(y), width, depth, placements: [] }]
}

export function moveZone(zones: LayoutZone[], index: number, x: number, y: number, floor: Floor): LayoutZone[] {
  return zones.map((z, i) => {
    if (i !== index) return z
    const maxX = floor.illustrative ? Infinity : floor.width - z.width
    const maxY = floor.illustrative ? Infinity : floor.depth - z.depth
    return { ...z, x: round(clamp(x, 0, maxX)), y: round(clamp(y, 0, maxY)) }
  })
}

export function removeZone(zones: LayoutZone[], index: number): LayoutZone[] {
  return zones.filter((_, i) => i !== index)
}

function plantFrom(cycle: CycleRef, stage: PlantStage, x: number, y: number, rotation = 0): LayoutPlacement {
  return {
    species_id: cycle.species_id,
    species_name: cycle.species_name,
    crop_cycle_id: cycle.id,
    stage,
    x: round(x),
    y: round(y),
    rotation,
  }
}

export function addPlant(zones: LayoutZone[], zoneIndex: number, cycle: CycleRef, stage: PlantStage): LayoutZone[] {
  if (plantCount(zones) >= MAX_PLACEMENTS) return zones
  return zones.map((z, i) => {
    if (i !== zoneIndex) return z
    const n = z.placements.length
    const perRow = Math.max(1, Math.floor(z.width / FILL_SPACING_M))
    const x = clamp(FILL_SPACING_M / 2 + (n % perRow) * FILL_SPACING_M, 0, z.width)
    const y = clamp(FILL_SPACING_M / 2 + Math.floor(n / perRow) * FILL_SPACING_M, 0, z.depth)
    return { ...z, placements: [...z.placements, plantFrom(cycle, stage, x, y)] }
  })
}

/** Reemplaza las plantas de la zona por una cuadrícula (espaciado de dibujo) sin pasar del máximo. */
export function fillZone(zones: LayoutZone[], zoneIndex: number, cycle: CycleRef, stage: PlantStage): LayoutZone[] {
  const room = MAX_PLACEMENTS - (plantCount(zones) - zones[zoneIndex].placements.length)
  return zones.map((z, i) => {
    if (i !== zoneIndex) return z
    const placements: LayoutPlacement[] = []
    for (let row = 0; FILL_SPACING_M / 2 + row * FILL_SPACING_M <= z.depth && placements.length < room; row++) {
      for (let col = 0; FILL_SPACING_M / 2 + col * FILL_SPACING_M <= z.width && placements.length < room; col++) {
        const x = FILL_SPACING_M / 2 + col * FILL_SPACING_M
        const y = FILL_SPACING_M / 2 + row * FILL_SPACING_M
        placements.push(plantFrom(cycle, stage, x, y, (col * 97 + row * 41) % 360))
      }
    }
    return { ...z, placements }
  })
}

function mapPlant(zones: LayoutZone[], sel: Selection, fn: (p: LayoutPlacement, z: LayoutZone) => LayoutPlacement): LayoutZone[] {
  if (sel.plant === null) return zones
  return zones.map((z, zi) =>
    zi !== sel.zone ? z : { ...z, placements: z.placements.map((p, pi) => (pi === sel.plant ? fn(p, z) : p)) },
  )
}

export function movePlant(zones: LayoutZone[], sel: Selection, x: number, y: number): LayoutZone[] {
  return mapPlant(zones, sel, (p, z) => ({ ...p, x: round(clamp(x, 0, z.width)), y: round(clamp(y, 0, z.depth)) }))
}

/** Clic sobre el piso (coordenadas del piso) → posición relativa a la zona de la planta, limitada a ella. */
export function movePlantToFloor(zones: LayoutZone[], sel: Selection, floorX: number, floorY: number): LayoutZone[] {
  const zone = zones[sel.zone]
  return zone ? movePlant(zones, sel, floorX - zone.x, floorY - zone.y) : zones
}

export function updatePlant(
  zones: LayoutZone[],
  sel: Selection,
  patch: Partial<Pick<LayoutPlacement, 'stage' | 'rotation'>>,
): LayoutZone[] {
  return mapPlant(zones, sel, (p) => ({ ...p, ...patch }))
}

export function removePlant(zones: LayoutZone[], sel: Selection): LayoutZone[] {
  if (sel.plant === null) return zones
  return zones.map((z, zi) => (zi !== sel.zone ? z : { ...z, placements: z.placements.filter((_, pi) => pi !== sel.plant) }))
}

const FOOTPRINT_M = { lettuce: 0.15, tomato: 0.25, basil: 0.1, generic: 0.1 } as const
const STAGE_FACTOR: Record<PlantStage, number> = { seedling: 0.35, vegetative: 0.7, mature: 1 }

/** Radio de dibujo en la vista superior (escala de dibujo, no un dato agronómico). */
export function footprint(speciesName: string, stage: PlantStage): number {
  return FOOTPRINT_M[plantKindFor(speciesName)] * STAGE_FACTOR[stage]
}

/** Instancias para la escena: posición de piso y variante estable por zona y posición (no por id). */
export function instancesFor(zones: LayoutZone[]): PlantInstance[] {
  const out: PlantInstance[] = []
  zones.forEach((z, zi) =>
    z.placements.forEach((p) => {
      out.push({
        index: out.length,
        kind: plantKindFor(p.species_name),
        stage: p.stage,
        variant: variantFor(`${zi}:${p.x.toFixed(2)}:${p.y.toFixed(2)}`),
        x: z.x + p.x,
        z: z.y + p.y,
        rotationDeg: p.rotation,
      })
    }),
  )
  return out
}

export function selectionFromIndex(zones: LayoutZone[], flat: number): Selection | null {
  let start = 0
  for (let zi = 0; zi < zones.length; zi++) {
    const n = zones[zi].placements.length
    if (flat < start + n) return { zone: zi, plant: flat - start }
    start += n
  }
  return null
}

export function indexFromSelection(zones: LayoutZone[], sel: Selection | null): number | null {
  if (!sel || sel.plant === null) return null
  let start = 0
  for (let zi = 0; zi < sel.zone; zi++) start += zones[zi].placements.length
  return start + sel.plant
}

export function selectedPlant(zones: LayoutZone[], sel: Selection | null): LayoutPlacement | null {
  if (!sel || sel.plant === null) return null
  return zones[sel.zone]?.placements[sel.plant] ?? null
}

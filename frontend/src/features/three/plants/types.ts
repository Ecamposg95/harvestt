// Sin three: las páginas importan estos tipos y helpers sin arrastrar el chunk 3D.
import { hashString } from './random'

export type PlantKind = 'lettuce' | 'tomato' | 'basil' | 'generic'
export type PlantStage = 'seedling' | 'vegetative' | 'mature'

export const PLANT_STAGES: PlantStage[] = ['seedling', 'vegetative', 'mature']

export const PLANT_STAGE_LABELS: Record<PlantStage, string> = {
  seedling: 'Plántula',
  vegetative: 'Vegetativa',
  mature: 'Madura',
}

/** Variantes de semilla por especie y etapa: pocas para que el instancing agrupe. */
export const PLANT_VARIANTS = 3

export const ILLUSTRATIVE_NOTICE = 'Representación ilustrativa; no predice crecimiento'

export type PlantAnchorKey = 'top' | 'leaf' | 'base'

export interface PlantAnchor {
  key: PlantAnchorKey
  x: number
  y: number
  z: number
}

export interface PlantViewerCallout {
  key: string
  anchor: PlantAnchorKey
  label: string
}

export interface PlantViewerProps {
  kind: PlantKind
  stage?: PlantStage
  seed?: number
  label: string
  callouts?: PlantViewerCallout[]
  className?: string
}

const KIND_BY_NAME: Array<[RegExp, PlantKind]> = [
  [/^lactuca\b/i, 'lettuce'],
  [/^solanum lycopersicum\b/i, 'tomato'],
  [/^ocimum\b/i, 'basil'],
]

/** Generador para una especie del catálogo; sin generador propio → genérico. */
export function plantKindFor(scientificName: string): PlantKind {
  const name = scientificName.trim()
  return KIND_BY_NAME.find(([re]) => re.test(name))?.[1] ?? 'generic'
}

/** Variante 0..PLANT_VARIANTS-1 estable para una clave (id de especie, posición de una planta…). */
export function variantFor(key: string): number {
  return hashString(key) % PLANT_VARIANTS
}

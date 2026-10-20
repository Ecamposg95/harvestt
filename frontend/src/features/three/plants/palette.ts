// Sin three: también la usa la vista superior SVG del Studio.
import type { PlantKind } from './types'

export interface PlantColors {
  leaf: number
  stem: number
  fruit: number
  flower: number
}

export const PLANT_COLORS: Record<PlantKind, PlantColors> = {
  lettuce: { leaf: 0x8cc63f, stem: 0xc5df8a, fruit: 0xc8402a, flower: 0xf3f0e4 },
  tomato: { leaf: 0x3f7d2c, stem: 0x5b8a3a, fruit: 0xd2452f, flower: 0xf2cf3a },
  basil: { leaf: 0x4f9a30, stem: 0x6a9c45, fruit: 0xc8402a, flower: 0xf3f0e4 },
  generic: { leaf: 0x6b9e4a, stem: 0x7a8f5a, fruit: 0xc8402a, flower: 0xf3f0e4 },
}

export function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

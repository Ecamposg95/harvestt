import { api } from '@/api/client'
import type { PlantStage } from '@/features/three/plants/types'
import { layoutPayload } from './layout'

export interface LayoutPlacement {
  id?: string
  species_id: string
  species_name: string
  crop_cycle_id: string | null
  stage: PlantStage
  /** Metros, relativos a la zona. */
  x: number
  y: number
  /** Grados. */
  rotation: number
}

export interface LayoutZone {
  id?: string
  name: string
  x: number
  y: number
  width: number
  depth: number
  placements: LayoutPlacement[]
}

export interface Layout {
  project_id: string
  version: number
  area_m2: number | null
  floor: { width: number; depth: number; illustrative: boolean }
  zones: LayoutZone[]
}

export async function getLayout(projectId: string): Promise<Layout> {
  const res = await api.get<Layout>(`/projects/${encodeURIComponent(projectId)}/layout`)
  return res.data
}

export async function saveLayout(projectId: string, version: number, zones: LayoutZone[]): Promise<Layout> {
  const res = await api.put<Layout>(`/projects/${encodeURIComponent(projectId)}/layout`, layoutPayload(version, zones))
  return res.data
}

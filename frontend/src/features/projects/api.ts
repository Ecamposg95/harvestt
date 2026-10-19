import { api } from '@/api/client'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export type CultivationSystem = 'hydroponic' | 'substrate' | 'soil' | 'aeroponic' | 'other'
export type CycleStatus = 'planned' | 'active' | 'finished' | 'cancelled'
export type ObservationKind = 'note' | 'measurement' | 'incident' | 'task' | 'decision'

export interface Project {
  id: string
  name: string
  objectives: string | null
  area_m2: number | null
  system: CultivationSystem
  location: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface CropCycle {
  id: string
  project_id: string
  species_id: string
  species_name: string
  cultivar_id: string | null
  cultivar_name: string | null
  started_on: string | null
  stage: string
  status: CycleStatus
  created_at: string
}

export interface ProjectDetail extends Project {
  crop_cycles: CropCycle[]
}

export interface ProjectInput {
  name: string
  objectives?: string | null
  area_m2?: number | null
  system: CultivationSystem
  location?: string | null
}

export interface ProjectPatch extends Partial<ProjectInput> {
  version: number
}

export interface CropCycleInput {
  species_id: string
  cultivar_id?: string | null
  started_on?: string | null
  stage?: string
  status?: CycleStatus
}

export interface Observation {
  id: string
  project_id: string
  crop_cycle_id: string | null
  kind: ObservationKind
  content: string
  author_id: string
  author_name: string
  observed_at: string
  created_at: string
}

export interface ObservationInput {
  kind: ObservationKind
  content: string
  crop_cycle_id?: string | null
  observed_at?: string | null
}

export async function listProjects(params: { page?: number; page_size?: number } = {}): Promise<Page<Project>> {
  const res = await api.get<Page<Project>>('/projects', { params })
  return res.data
}

export async function createProject(data: ProjectInput): Promise<ProjectDetail> {
  const res = await api.post<ProjectDetail>('/projects', data)
  return res.data
}

export async function getProject(id: string): Promise<ProjectDetail> {
  const res = await api.get<ProjectDetail>(`/projects/${encodeURIComponent(id)}`)
  return res.data
}

export async function updateProject(id: string, data: ProjectPatch): Promise<ProjectDetail> {
  const res = await api.patch<ProjectDetail>(`/projects/${encodeURIComponent(id)}`, data)
  return res.data
}

export async function createCropCycle(projectId: string, data: CropCycleInput): Promise<CropCycle> {
  const res = await api.post<CropCycle>(`/projects/${encodeURIComponent(projectId)}/crop-cycles`, data)
  return res.data
}

export async function listObservations(
  projectId: string,
  params: { page?: number; page_size?: number } = {},
): Promise<Page<Observation>> {
  const res = await api.get<Page<Observation>>(`/projects/${encodeURIComponent(projectId)}/observations`, { params })
  return res.data
}

export async function createObservation(projectId: string, data: ObservationInput): Promise<Observation> {
  const res = await api.post<Observation>(`/projects/${encodeURIComponent(projectId)}/observations`, data)
  return res.data
}

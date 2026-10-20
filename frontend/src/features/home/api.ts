import { api } from '@/api/client'

export interface HomeProject {
  id: string
  name: string
  system: string
  area_m2: number | null
  species: string[]
}

export interface HomeActivity {
  id: string
  text: string
  resource_type: string
  resource_id: string
  created_at: string
}

export interface HomeData {
  recent_project: HomeProject | null
  counts: { projects: number; crop_cycles: number; observations: number; sources_cited: number }
  activity: HomeActivity[]
}

export const homeApi = {
  get: () => api.get<HomeData>('/home').then((r) => r.data),
}

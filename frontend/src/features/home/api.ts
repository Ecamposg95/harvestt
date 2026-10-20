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

/** Última lectura simulada por variable; stale=true con value=null es "Sin señal". */
export interface HomeReading {
  variable: 'air_temperature' | 'relative_humidity'
  value: number | null
  unit: string
  observed_at: string | null
  stale: boolean
  device_name: string
  origin: 'simulated'
}

export interface HomeData {
  recent_project: HomeProject | null
  counts: { projects: number; crop_cycles: number; observations: number; sources_cited: number }
  readings: HomeReading[]
  activity: HomeActivity[]
}

export const homeApi = {
  get: () => api.get<HomeData>('/home').then((r) => r.data),
}

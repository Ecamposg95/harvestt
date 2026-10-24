import { api } from '@/api/client'

/** Indicador con procedencia; value=null es "Sin datos suficientes", nunca cero. */
export interface Kpi {
  key: string
  label: string
  value: number | null
  unit: string | null
  origin: 'measured' | 'derived' | 'simulated'
  formula: string
  inputs_count: number
  as_of: string
}

export interface ProjectImpact {
  project_id: string
  as_of: string
  kpis: Kpi[]
}

export interface PublicImpact {
  as_of: string
  kpis: Kpi[]
}

export const impactApi = {
  project: (id: string) => api.get<ProjectImpact>(`/projects/${encodeURIComponent(id)}/impact`).then((r) => r.data),
  public: () => api.get<PublicImpact>('/public/impact').then((r) => r.data),
}

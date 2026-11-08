import { api } from '@/api/client'

export type LayerStatus = 'done' | 'operating' | 'in_construction' | 'vision'

export const LAYER_LABEL: Record<LayerStatus, string> = {
  done: 'Hecho',
  operating: 'Operando',
  in_construction: 'En construcción',
  vision: 'Visión',
}

export interface VisionFigure {
  key: string
  label: string
  value: number | null
  status: 'available' | 'soon'
  origin: string
  formula: string
}

export interface VisionLayer {
  key: string
  status: LayerStatus
  reason: string
}

export interface VisionSite {
  kind: 'historic' | 'future'
  label: string
  lat: number
  lon: number
}

export interface Vision {
  as_of: string
  figures: VisionFigure[]
  layers: VisionLayer[]
  sites: VisionSite[]
}

export interface RequestInput {
  kind: 'node' | 'contact'
  name: string
  organization?: string
  email: string
  city?: string
  lat?: number
  lon?: number
  message: string
  /** Trampa anti-bots: debe viajar vacío. */
  website: string
}

export const visionApi = {
  summary: () => api.get<Vision>('/public/vision').then((r) => r.data),
  sendRequest: (input: RequestInput) => api.post('/public/requests', input).then(() => undefined),
}

export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface InboundRequest {
  id: string
  kind: 'node' | 'contact'
  name: string
  organization: string | null
  email: string
  city: string | null
  lat: number | null
  lon: number | null
  message: string
  status: RequestStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export const visionAdminApi = {
  list: (status?: RequestStatus) =>
    api.get<InboundRequest[]>('/admin/requests', { params: status ? { status } : undefined }).then((r) => r.data),
  review: (id: string, status: 'approved' | 'rejected', note?: string) =>
    api.patch<InboundRequest>(`/admin/requests/${id}`, { status, note }).then((r) => r.data),
}

import axios from 'axios'
import { api } from '@/api/client'

export type PrototypeStatus = 'concept' | 'design' | 'in_construction' | 'testing' | 'operational' | 'retired'
export type AssetKind = 'image' | 'model_stl'

export interface Spec {
  label: string
  value: string
  unit?: string | null
}

// ---- Interno ----

export interface Asset {
  id: string
  prototype_id: string
  kind: AssetKind
  filename: string
  content_type: string
  size_bytes: number
  checksum_sha256: string
  caption: string
  is_public: boolean
  sort_order: number
  created_at: string
}

export interface Prototype {
  id: string
  slug: string
  name: string
  codename: string | null
  purpose: string
  summary: string
  description: string
  status: PrototypeStatus
  specs: Spec[]
  is_public: boolean
  published_at: string | null
  sort_order: number
  hero_asset_id: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface PrototypeDetail extends Prototype {
  assets: Asset[]
}

export interface PrototypeCreateInput {
  name: string
  codename?: string | null
  purpose?: string
  status?: PrototypeStatus
}

export type PrototypeUpdateInput = Partial<
  Pick<
    Prototype,
    'name' | 'codename' | 'purpose' | 'summary' | 'description' | 'status' | 'specs' | 'is_public' | 'sort_order' | 'hero_asset_id'
  >
> & { version: number }

export interface AssetUpdateInput {
  caption?: string
  is_public?: boolean
  sort_order?: number
}

export const MAX_HOTSPOTS = 12

export interface Hotspot {
  id: string
  prototype_id: string
  asset_id: string
  label: string
  description: string
  x: number
  y: number
  z: number
  sort_order: number
  created_at: string
}

export interface HotspotCreateInput {
  asset_id: string
  label: string
  description?: string
  x: number
  y: number
  z: number
  sort_order?: number
}

export type HotspotUpdateInput = Partial<Pick<Hotspot, 'label' | 'description' | 'x' | 'y' | 'z' | 'sort_order'>>

// ---- Público ----

export interface PublicAsset {
  id: string
  kind: AssetKind
  filename: string
  content_type: string
  size_bytes: number
  caption: string
  url: string
}

export interface PublicHotspot {
  label: string
  description: string
  x: number
  y: number
  z: number
  sort_order: number
}

export interface PublicPrototypeSummary {
  slug: string
  name: string
  codename: string | null
  purpose: string
  summary: string
  status: PrototypeStatus
  published_at: string | null
  hero: PublicAsset | null
}

export interface PublicPrototypeDetail extends PublicPrototypeSummary {
  description: string
  specs: Spec[]
  assets: PublicAsset[]
  hotspots: PublicHotspot[]
}

export const prototypesApi = {
  // Público (el cliente solo añade token si existe; estos endpoints no lo requieren)
  publicList: () => api.get<PublicPrototypeSummary[]>('/public/prototypes').then((r) => r.data),
  publicDetail: (slug: string) =>
    api.get<PublicPrototypeDetail>(`/public/prototypes/${encodeURIComponent(slug)}`).then((r) => r.data),

  // Interno
  list: () => api.get<Prototype[]>('/prototypes').then((r) => r.data),
  get: (id: string) => api.get<PrototypeDetail>(`/prototypes/${id}`).then((r) => r.data),
  create: (data: PrototypeCreateInput) => api.post<PrototypeDetail>('/prototypes', data).then((r) => r.data),
  update: (id: string, data: PrototypeUpdateInput) =>
    api.patch<PrototypeDetail>(`/prototypes/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/prototypes/${id}`),
  uploadAsset: (
    id: string,
    input: { file: File; kind: AssetKind; caption: string; is_public: boolean },
    onProgress?: (fraction: number) => void,
  ) => {
    const form = new FormData()
    form.append('file', input.file)
    form.append('kind', input.kind)
    form.append('caption', input.caption)
    form.append('is_public', String(input.is_public))
    return api
      .post<Asset>(`/prototypes/${id}/assets`, form, {
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(e.loaded / e.total)
        },
      })
      .then((r) => r.data)
  },
  updateAsset: (id: string, assetId: string, data: AssetUpdateInput) =>
    api.patch<Asset>(`/prototypes/${id}/assets/${assetId}`, data).then((r) => r.data),
  removeAsset: (id: string, assetId: string) => api.delete(`/prototypes/${id}/assets/${assetId}`),
  listHotspots: (id: string) => api.get<Hotspot[]>(`/prototypes/${id}/hotspots`).then((r) => r.data),
  createHotspot: (id: string, data: HotspotCreateInput) =>
    api.post<Hotspot>(`/prototypes/${id}/hotspots`, data).then((r) => r.data),
  updateHotspot: (id: string, hotspotId: string, data: HotspotUpdateInput) =>
    api.patch<Hotspot>(`/prototypes/${id}/hotspots/${hotspotId}`, data).then((r) => r.data),
  removeHotspot: (id: string, hotspotId: string) => api.delete(`/prototypes/${id}/hotspots/${hotspotId}`),
}

/** Ruta interna (relativa al cliente `api`) para descargar un archivo privado. */
export function internalFilePath(prototypeId: string, assetId: string): string {
  return `/prototypes/${prototypeId}/assets/${assetId}/file`
}

export interface BinarySource {
  /** URL pública absoluta (p. ej. /api/v1/public/assets/…) o ruta interna relativa al cliente `api`. */
  url: string
  /** true: usa el cliente autenticado (Authorization + X-Organization-ID). */
  authed?: boolean
}

/** Descarga binaria con progreso; mismo origen, con cabecera de auth solo para archivos internos. */
export async function fetchBinary(
  source: BinarySource,
  opts: { signal?: AbortSignal; onProgress?: (loaded: number, total?: number) => void } = {},
): Promise<ArrayBuffer> {
  const config = {
    responseType: 'arraybuffer' as const,
    signal: opts.signal,
    onDownloadProgress: (e: { loaded: number; total?: number }) => opts.onProgress?.(e.loaded, e.total),
  }
  const res = source.authed ? await api.get<ArrayBuffer>(source.url, config) : await axios.get<ArrayBuffer>(source.url, config)
  return res.data
}

export function kindFromFilename(name: string): AssetKind | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'image'
  if (ext === 'stl') return 'model_stl'
  return null
}

export const MAX_BYTES: Record<AssetKind, number> = { image: 15 * 1024 * 1024, model_stl: 100 * 1024 * 1024 }

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

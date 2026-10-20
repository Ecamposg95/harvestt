import { api } from '@/api/client'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface CommonName {
  lang: string
  name: string
}

export interface SpeciesSummary {
  id: string
  scientific_name: string
  authorship: string | null
  common_names: CommonName[]
  family: string | null
}

export interface Source {
  id: string
  title: string
  publisher: string | null
  url: string | null
  license: string | null
  accessed_at: string | null
  rights: Record<string, unknown> | null
}

export interface Cultivar {
  id: string
  species_id: string
  name: string
  provenance: string | null
}

export type Origin = 'measured' | 'sourced' | 'derived' | 'simulated' | 'illustrative' | 'missing'

export interface TraitAssertion {
  id: string
  subject_type: string
  subject_id: string
  variable: string
  value_min: number | null
  value_max: number | null
  unit: string | null
  growth_stage: string
  cultivation_system: string
  origin: Origin | string
  review_status: string
  evidence_refs: { source_id: string; locator?: string | null }[]
  notes: string | null
  sources: Source[]
}

export interface ExternalId {
  id: string
  source_id?: string
  url?: string
  match_type?: string
  status?: string
  verified_at?: string
}

export interface MediaCallout {
  trait_variable: string
  /** 0..1 sobre el ancho de la imagen. */
  x: number
  /** 0..1 sobre el alto de la imagen. */
  y: number
}

export interface SpeciesMedia {
  id: string
  species_id: string
  kind: 'photo' | 'render'
  content_type: string
  license: string
  attribution: string
  source_url: string | null
  is_hero: boolean
  width: number | null
  height: number | null
  callouts: MediaCallout[]
  /** Ruta relativa al cliente `api` (requiere sesión). */
  url: string
  created_at: string
}

export interface MediaUploadInput {
  file: File
  kind: 'photo' | 'render'
  license: string
  attribution: string
  source_url: string
  is_hero: boolean
  callouts: MediaCallout[]
}

export interface SpeciesDetail extends SpeciesSummary {
  external_ids: Record<string, ExternalId | string> | null
  summary: string | null
  cultivars: Cultivar[]
  trait_assertions: TraitAssertion[]
  sources: Source[]
  media: SpeciesMedia[]
}

export interface PlantQuery {
  q?: string
  family?: string
  page?: number
  page_size?: number
}

export async function listPlants(params: PlantQuery): Promise<Page<SpeciesSummary>> {
  const res = await api.get<Page<SpeciesSummary>>('/plants', { params })
  return res.data
}

export async function listFamilies(): Promise<string[]> {
  const res = await api.get<string[]>('/plants/families')
  return res.data
}

export async function getPlant(id: string): Promise<SpeciesDetail> {
  const res = await api.get<SpeciesDetail>(`/plants/${encodeURIComponent(id)}`)
  return res.data
}

export async function getSource(id: string): Promise<Source> {
  const res = await api.get<Source>(`/sources/${encodeURIComponent(id)}`)
  return res.data
}

export async function uploadSpeciesMedia(speciesId: string, input: MediaUploadInput): Promise<SpeciesMedia> {
  const form = new FormData()
  form.append('file', input.file)
  form.append('kind', input.kind)
  form.append('license', input.license)
  form.append('attribution', input.attribution)
  form.append('source_url', input.source_url)
  form.append('is_hero', String(input.is_hero))
  form.append('callouts', JSON.stringify(input.callouts))
  const res = await api.post<SpeciesMedia>(`/plants/${encodeURIComponent(speciesId)}/media`, form)
  return res.data
}

export async function deleteSpeciesMedia(speciesId: string, mediaId: string): Promise<void> {
  await api.delete(`/plants/${encodeURIComponent(speciesId)}/media/${encodeURIComponent(mediaId)}`)
}

import { api } from '@/api/client'

/** Espeja `CopyOut` (app/modules/connectors/schemas.py). */
export interface CopyOut {
  status: 'ok' | 'not_found' | 'error'
  external_id: string | null
  payload: Record<string, unknown>
  license: string | null
  attribution: string | null
  source_url: string | null
  fetched_at: string | null
  last_attempt_at: string
  last_error: string | null
  stale: boolean
  reason: string | null
}

/** Espeja `BankSourceOut`; la copia viaja con la clave JSON `copy`. */
export interface BankSourceOut {
  key: string
  label: string
  contribution: string
  status: string
  license_summary: string
  copy: CopyOut | null
}

/** Espeja `IdentityOut`. */
export interface IdentityOut {
  key: string
  value: string | null
  url: string | null
  check: string
  detail: string | null
}

/** Espeja `BanksOut`. */
export interface BanksOut {
  species_id: string
  sources: BankSourceOut[]
  identity: IdentityOut[]
}

/** Espeja `LastSyncOut`. */
export interface LastSyncOut {
  status: string
  started_at: string
  finished_at: string | null
  species_total: number
  species_ok: number
  error: string | null
}

/** Espeja `CopiesCount`. */
export interface CopiesCount {
  ok: number
  not_found: number
  stale: number
}

/** Espeja `ConnectorOut`. */
export interface ConnectorOut {
  key: string
  label: string
  contribution: string
  license: string
  url: string
  status: string
  can_sync: boolean
  last_sync: LastSyncOut | null
  copies: CopiesCount
}

/** Espeja `ConnectorSyncOut`. */
export interface ConnectorSync {
  id: string
  source: string
  status: string
  started_at: string
  finished_at: string | null
  species_total: number
  species_ok: number
  error: string | null
}

/** Espeja `AccessionOut` (app/modules/connectors/genesys.py). */
export interface GenesysAccession {
  institute_code: string
  accession_number: string
  doi: string | null
  origin_country: string | null
  sampstat: number | null
  url: string
}

/** Espeja `AccessionRef`/`AccessionLink` (app/modules/projects/schemas.py). */
export interface AccessionLinkInput {
  source: 'genesys'
  institute_code: string
  accession_number: string
  doi?: string | null
}

/** Espeja `CropCycleListItem`. */
export interface CycleListItem {
  id: string
  project_id: string
  project_name: string
  species_id: string
  species_name: string
  cultivar_id: string | null
  cultivar_name: string | null
  started_on: string | null
  stage: string
  status: string
  created_at: string
  accession_ref: Record<string, unknown> | null
}

export type CropCycleOut = Omit<CycleListItem, 'project_name'>

export const fetchConnectors = () => api.get<ConnectorOut[]>('/connectors').then((r) => r.data)

export const syncConnector = (key: string) =>
  api.post<ConnectorSync>(`/connectors/${encodeURIComponent(key)}/sync`).then((r) => r.data)

export const fetchBanks = (speciesId: string) =>
  api.get<BanksOut>(`/plants/${encodeURIComponent(speciesId)}/banks`).then((r) => r.data)

export const fetchGenesysAccessions = (speciesId: string) =>
  api
    .get<GenesysAccession[]>('/connectors/genesys/accessions', { params: { species_id: speciesId } })
    .then((r) => r.data)

export const fetchCyclesForSpecies = (speciesId: string) =>
  api.get<CycleListItem[]>('/projects/crop-cycles', { params: { species_id: speciesId } }).then((r) => r.data)

export const linkAccession = (projectId: string, cycleId: string, speciesId: string, body: AccessionLinkInput) =>
  api
    .put<CropCycleOut>(`/projects/${projectId}/crop-cycles/${cycleId}/accession`, body, {
      params: { species_id: speciesId },
    })
    .then((r) => r.data)

export const unlinkAccession = (projectId: string, cycleId: string) =>
  api.delete(`/projects/${projectId}/crop-cycles/${cycleId}/accession`).then(() => undefined)

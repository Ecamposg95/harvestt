import { api } from '@/api/client'

export const DOMAINS = ['organism', 'plant', 'trait', 'environment', 'place', 'node'] as const
export type Domain = (typeof DOMAINS)[number]

export type TermStatus = 'proposed' | 'in_review' | 'published' | 'rejected' | 'obsolete'
export type MatchType = 'exact' | 'close' | 'broad'
export type Scheme =
  | 'ncbi_taxon'
  | 'wfo'
  | 'po'
  | 'bbch'
  | 'co'
  | 'ucum'
  | 'peco'
  | 'envo'
  | 'agrovoc'
  | 'geosparql'
  | 'koppen'
  | 'sosa'
  | 'ssn'
  | 'prov'

/** Espeja `TermSummary` (app/modules/ontology/schemas.py). */
export interface TermSummary {
  id: string
  hvt_id: string | null
  domain: string
  parent_id: string | null
  label: string
  status: string
  unit: string | null
}

/** Espeja `EquivalenceOut`. */
export interface EquivalenceOut {
  scheme: string
  external_id: string
  url: string
  external_label: string | null
  match: string
}

/** Espeja `TermDetail`. */
export interface TermDetail extends TermSummary {
  definition: string
  aliases: string[]
  equivalences: EquivalenceOut[]
  parent: TermSummary | null
  children: TermSummary[]
  replaced_by: TermSummary | null
  proposed_by_name: string
  review_note: string | null
  reviewed_at: string | null
  published_in_version: number | null
  obsoleted_in_version: number | null
}

/** Espeja `SuggestionOut`. */
export interface SuggestionOut {
  scheme: string
  external_id: string
  label: string
  url: string
}

/** Espeja `TermUsage` (app/modules/term_links/service.py). */
export interface TermUsage {
  species: number
  assertions: number
  projects: number
  cycles: number
}

/** Espeja `ReleaseOut`. */
export interface ReleaseOut {
  version: number
  note: string
  created_at: string
  term_count: number
}

/** Espeja `EquivalenceIn`. */
export interface EquivalenceIn {
  scheme: Scheme
  external_id: string
  url: string
  external_label?: string | null
  match: MatchType
}

/** Espeja `TermProposal`. */
export interface TermProposalInput {
  domain: Domain
  parent_id?: string | null
  label: string
  definition: string
  aliases?: string[]
  unit?: string | null
  equivalences?: EquivalenceIn[]
}

/** Espeja `TermEdit`. */
export interface TermEditInput {
  parent_id?: string | null
  label?: string
  definition?: string
  aliases?: string[]
  unit?: string | null
  equivalences?: EquivalenceIn[]
}

export interface ReviewInput {
  action: 'approve' | 'request_changes' | 'reject'
  note: string
}

export interface ObsoleteInput {
  replaced_by_id: string
  note: string
}

export interface EquivalencesInput {
  equivalences: EquivalenceIn[]
  note: string
}

export interface ListParams {
  domain?: Domain
  q?: string
  status?: TermStatus
  mine?: boolean
}

const term = (id: string) => `/ontology/terms/${encodeURIComponent(id)}`

export const EXPORT_TURTLE_URL = '/api/v1/public/ontology/export.ttl'
export const EXPORT_JSON_URL = '/api/v1/public/ontology/export.json'

export const ontologyApi = {
  list: (params?: ListParams) => api.get<TermSummary[]>('/ontology/terms', { params }).then((r) => r.data),
  get: (id: string) => api.get<TermDetail>(term(id)).then((r) => r.data),
  usage: (id: string) => api.get<TermUsage>(`${term(id)}/usage`).then((r) => r.data),
  releases: () => api.get<ReleaseOut[]>('/ontology/releases').then((r) => r.data),
  propose: (input: TermProposalInput) => api.post<TermDetail>('/ontology/terms', input).then((r) => r.data),
  edit: (id: string, input: TermEditInput) => api.patch<TermDetail>(term(id), input).then((r) => r.data),
  suggest: (q: string) => api.get<SuggestionOut[]>('/ontology/suggest', { params: { q } }).then((r) => r.data),
  reviewQueue: () => api.get<TermSummary[]>('/ontology/review-queue').then((r) => r.data),
  review: (id: string, body: ReviewInput) => api.post<TermDetail>(`${term(id)}/review`, body).then((r) => r.data),
  obsolete: (id: string, body: ObsoleteInput) => api.post<TermDetail>(`${term(id)}/obsolete`, body).then((r) => r.data),
  replaceEquivalences: (id: string, body: EquivalencesInput) =>
    api.put<TermDetail>(`${term(id)}/equivalences`, body).then((r) => r.data),
}

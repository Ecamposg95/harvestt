import type { Tone } from '@/components/ui'
import type { Domain } from './api'

export const DOMAIN_LABELS: Record<Domain, string> = {
  organism: 'Organismo',
  plant: 'Planta y etapas',
  trait: 'Rasgos',
  environment: 'Ambiente',
  place: 'Lugar',
  node: 'Nodo y medición',
}

export const STATUS_LABELS: Record<string, string> = {
  proposed: 'Propuesto',
  in_review: 'En revisión',
  published: 'Publicado',
  rejected: 'Rechazado',
  obsolete: 'Obsoleto',
}

export const STATUS_TONES: Record<string, Tone> = {
  proposed: 'warning',
  in_review: 'warning',
  published: 'accent',
  rejected: 'danger',
  obsolete: 'neutral',
}

export const MATCH_LABELS: Record<string, string> = {
  exact: 'Exacta',
  close: 'Cercana',
  broad: 'Amplia',
}

export const SCHEME_LABELS: Record<string, string> = {
  ncbi_taxon: 'NCBI Taxonomy',
  wfo: 'World Flora Online',
  po: 'Plant Ontology',
  bbch: 'BBCH',
  co: 'Crop Ontology',
  ucum: 'UCUM',
  peco: 'PECO',
  envo: 'ENVO',
  agrovoc: 'AGROVOC',
  geosparql: 'GeoSPARQL',
  koppen: 'Köppen-Geiger',
  sosa: 'SOSA',
  ssn: 'SSN',
  prov: 'PROV-O',
}

export function labelOf(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '—'
  return map[key] ?? key
}

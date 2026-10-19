import type { CommonName } from './api'

export const ORIGIN_LABELS: Record<string, string> = {
  measured: 'Medido',
  sourced: 'Con fuente',
  derived: 'Derivado',
  simulated: 'Simulado',
  illustrative: 'Ilustrativo',
  missing: 'Sin evidencia',
}

export const REVIEW_LABELS: Record<string, string> = {
  unreviewed: 'Sin revisar',
  in_review: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

export const VARIABLE_LABELS: Record<string, string> = {
  air_temperature: 'Temperatura del aire',
  relative_humidity: 'Humedad relativa',
  photoperiod: 'Fotoperiodo',
  ph: 'pH',
}

export const UNIT_LABELS: Record<string, string> = {
  Cel: '°C',
  '%': '%',
  h: 'h',
  '[pH]': 'pH',
}

export const CONTEXT_LABELS: Record<string, string> = {
  unknown: 'No especificado',
}

export const LANG_LABELS: Record<string, string> = { es: 'Español', en: 'Inglés' }

export function label(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '—'
  return map[key] ?? key
}

/** Separa el binomio (en cursiva) de la autoría: "Lactuca sativa L." → ["Lactuca sativa", "L."] */
export function splitScientificName(name: string, authorship: string | null): [string, string] {
  if (authorship && name.endsWith(` ${authorship}`)) {
    return [name.slice(0, -authorship.length - 1), authorship]
  }
  return [name, authorship ?? '']
}

export function namesFor(names: CommonName[], lang: string): string[] {
  return names.filter((n) => n.lang === lang).map((n) => n.name)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

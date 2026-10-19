import axios from 'axios'
import type { CultivationSystem, CycleStatus, ObservationKind } from './api'

export const SYSTEM_LABELS: Record<CultivationSystem, string> = {
  hydroponic: 'Hidroponía',
  substrate: 'Sustrato',
  soil: 'Suelo',
  aeroponic: 'Aeroponía',
  other: 'Otro',
}

export const CYCLE_STATUS_LABELS: Record<CycleStatus, string> = {
  planned: 'Planeado',
  active: 'Activo',
  finished: 'Terminado',
  cancelled: 'Cancelado',
}

export const OBSERVATION_KIND_LABELS: Record<ObservationKind, string> = {
  note: 'Nota',
  measurement: 'Medición',
  incident: 'Incidencia',
  task: 'Tarea',
  decision: 'Decisión',
}

export const STAGE_LABELS: Record<string, string> = { unknown: 'Sin definir' }

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatArea(area: number | null): string {
  if (area == null) return 'Sin especificar'
  return `${area.toLocaleString('es-MX', { maximumFractionDigits: 2 })} m²`
}

/** Errores 422 de la API por campo: {"area_m2": "..."}. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!axios.isAxiosError(err) || err.response?.status !== 422) return {}
  const details = (err.response.data as { error?: { details?: Record<string, unknown> } })?.error?.details
  const out: Record<string, string> = {}
  const list = (details?.errors as { loc: (string | number)[]; msg: string }[] | undefined) ?? []
  for (const e of list) {
    const field = String(e.loc[e.loc.length - 1])
    out[field] = translateMsg(e.msg)
  }
  if (typeof details?.field === 'string') {
    out[details.field] = (err.response.data as { error: { message: string } }).error.message
  }
  return out
}

function translateMsg(msg: string): string {
  if (msg.includes('greater than 0')) return 'Debe ser mayor que 0'
  if (msg.startsWith('Value error, ')) return msg.slice('Value error, '.length)
  if (msg.includes('at least 1 character')) return 'Campo obligatorio'
  if (msg.includes('valid number')) return 'Debe ser un número'
  return msg
}

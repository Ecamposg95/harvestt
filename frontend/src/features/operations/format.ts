// Sin importar three: lo usan las páginas, el inicio y la escena 3D.
import type { IncidentKind, IncidentStatus, LatestDevice, LatestValue, ReadingPoint, RunStatus, Scenario, Variable } from './api'

export const VARIABLES: Variable[] = ['air_temperature', 'relative_humidity']

export const VARIABLE_LABELS: Record<Variable, string> = {
  air_temperature: 'Temperatura del aire',
  relative_humidity: 'Humedad relativa',
}

/** Escala de los gauges: los rangos físicos generales que acepta el motor, no rangos óptimos. */
export const GAUGE_RANGES: Record<Variable, [number, number]> = {
  air_temperature: [-10, 50],
  relative_humidity: [0, 100],
}

export const SCENARIO_LABELS: Record<Scenario, string> = {
  base: 'Base',
  heat_rise: 'Subida de temperatura',
  sensor_loss: 'Pérdida de sensor y recuperación',
}

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  running: 'En curso',
  paused: 'En pausa',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

export const INCIDENT_KIND_LABELS: Record<IncidentKind, string> = { threshold: 'Umbral', stale: 'Sin señal' }

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Abierto',
  acknowledged: 'Reconocido',
  closed: 'Cerrado',
}

export function unitLabel(unit: string): string {
  return unit === 'Cel' ? '°C' : unit
}

export function formatReading(value: number): string {
  return value.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Texto de una lectura: valor con unidad, "Sin señal" o "Sin lecturas"; nunca 0 por ausencia. */
export function readingText(r: LatestValue): string {
  if (r.stale) return 'Sin señal'
  if (r.value === null) return 'Sin lecturas'
  return `${formatReading(r.value)} ${unitLabel(r.unit)}`
}

export function deviceCalloutLabel(device: LatestDevice): string {
  const texts = device.readings.map(readingText)
  const unique = Array.from(new Set(texts))
  const body = unique.length === 1 && (unique[0] === 'Sin señal' || unique[0] === 'Sin lecturas') ? unique : texts
  return [device.name, ...body].join(' · ')
}

/** Serie para LineChart: inserta un null donde faltan pasos (pérdida de señal) para cortar la línea. */
export function withGaps(points: ReadingPoint[], intervalMinutes: number | null): Array<{ t: string; value: number | null }> {
  const out: Array<{ t: string; value: number | null }> = []
  const maxGapMs = (intervalMinutes ?? 0) * 60_000 * 1.5
  let previous: number | null = null
  for (const p of points) {
    const t = Date.parse(p.observed_at)
    if (previous !== null && maxGapMs > 0 && t - previous > maxGapMs) out.push({ t: p.observed_at, value: null })
    out.push({ t: p.observed_at, value: p.value })
    previous = t
  }
  return out
}

export interface GreenhouseDims {
  width: number
  length: number
  wallHeight: number
  ridgeHeight: number
  /** true si el proyecto no tiene área registrada y se usa el tamaño ilustrativo. */
  illustrative: boolean
}

export const ILLUSTRATIVE_WIDTH_M = 8
export const ILLUSTRATIVE_LENGTH_M = 16
const WALL_HEIGHT_M = 3

/** Nave 1:2 con el área registrada (misma fórmula que telemetry/demo.py) o tamaño ilustrativo 8 × 16 m. */
export function greenhouseDims(areaM2: number | null): GreenhouseDims {
  const illustrative = !areaM2 || areaM2 <= 0
  const width = illustrative ? ILLUSTRATIVE_WIDTH_M : Math.sqrt(areaM2 / 2)
  const length = illustrative ? ILLUSTRATIVE_LENGTH_M : width * 2
  return { width, length, wallHeight: WALL_HEIGHT_M, ridgeHeight: WALL_HEIGHT_M + width * 0.2, illustrative }
}

/** Posición del dispositivo (x ancho, y largo, z altura, en m desde una esquina) a coordenadas de escena (Y arriba, centrada). */
export function deviceToWorld(dims: GreenhouseDims, p: { x: number; y: number; z: number }) {
  return { x: p.x - dims.width / 2, y: p.z, z: dims.length / 2 - p.y }
}

export function formatMeters(value: number): string {
  return value.toLocaleString('es-MX', { maximumFractionDigits: 1 })
}

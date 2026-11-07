import type { Kpi } from './api'

const DECIMAL_UNITS = new Set(['%', 'min'])

export function formatKpiValue(kpi: Kpi): string | null {
  if (kpi.value === null) return null
  const digits = kpi.unit && DECIMAL_UNITS.has(kpi.unit) ? 1 : 0
  return kpi.value.toLocaleString('es-MX', { maximumFractionDigits: digits })
}

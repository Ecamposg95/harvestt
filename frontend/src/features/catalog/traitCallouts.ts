import type { PlantAnchorKey, PlantViewerCallout } from '@/features/three/plants/types'
import type { TraitAssertion } from './api'
import { label, UNIT_LABELS, VARIABLE_LABELS } from './labels'

/** Rango legible de una afirmación, o null si no tiene valor. */
export function formatAssertionValue(a: TraitAssertion): string | null {
  const { value_min: min, value_max: max } = a
  if (min == null && max == null) return null
  const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 })
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`
  return min != null ? `≥ ${fmt(min)}` : `≤ ${fmt(max as number)}`
}

export interface TraitCallout {
  variable: string
  label: string
  /** Valor con unidad, o «Desconocido». Nunca un número supuesto. */
  value: string
  origin: string
}

/** Afirmación de la especie (o, si no hay, de una variedad) para un rasgo; sin valor → «Desconocido» / missing. */
export function traitCallout(assertions: TraitAssertion[], variable: string): TraitCallout {
  const candidates = assertions.filter((a) => a.variable === variable)
  const a = candidates.find((x) => x.subject_type === 'species') ?? candidates[0]
  const value = a ? formatAssertionValue(a) : null
  return {
    variable,
    label: label(VARIABLE_LABELS, variable),
    value: value ? `${value}${a?.unit ? ` ${label(UNIT_LABELS, a.unit)}` : ''}` : 'Desconocido',
    origin: value && a ? a.origin : 'missing',
  }
}

const ANCHOR_BY_VARIABLE: Record<string, PlantAnchorKey> = {
  air_temperature: 'top',
  photoperiod: 'top',
  relative_humidity: 'leaf',
  ph: 'base',
}
const ANCHOR_ORDER: PlantAnchorKey[] = ['top', 'leaf', 'base']

/** Hasta 3 callouts para la planta 3D: uno por ancla, en el orden de variables de la ficha. */
export function plantViewerCallouts(assertions: TraitAssertion[]): PlantViewerCallout[] {
  const used = new Set<PlantAnchorKey>()
  const out: PlantViewerCallout[] = []
  for (const variable of Array.from(new Set(assertions.map((a) => a.variable)))) {
    const anchor = ANCHOR_BY_VARIABLE[variable] ?? ANCHOR_ORDER.find((k) => !used.has(k))
    if (!anchor || used.has(anchor)) continue
    used.add(anchor)
    const t = traitCallout(assertions, variable)
    out.push({ key: variable, anchor, label: `${t.label}: ${t.value}` })
    if (out.length === ANCHOR_ORDER.length) break
  }
  return out
}

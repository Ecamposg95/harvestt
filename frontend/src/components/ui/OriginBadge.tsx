import { Badge, Tone } from './Badge'

export type Origin = 'measured' | 'sourced' | 'derived' | 'simulated' | 'illustrative' | 'missing'

export const ORIGIN_META: Record<Origin, { label: string; tone: Tone; hint: string }> = {
  measured: { label: 'Medido', tone: 'accent', hint: 'Dato registrado por una medición real.' },
  sourced: { label: 'Fuente', tone: 'accent', hint: 'Dato tomado de una fuente citada.' },
  derived: { label: 'Derivado', tone: 'neutral', hint: 'Calculado a partir de otros datos con una fórmula visible.' },
  simulated: { label: 'Simulado', tone: 'lime', hint: 'Generado por la simulación didáctica; no es una medición.' },
  illustrative: { label: 'Ilustrativo', tone: 'neutral', hint: 'Representación de ejemplo; no describe un caso real.' },
  missing: { label: 'Desconocido', tone: 'warning', hint: 'Todavía no hay evidencia para este dato.' },
}

export function OriginBadge({ origin, className }: { origin: string; className?: string }) {
  const meta = ORIGIN_META[origin as Origin]
  if (!meta) return <Badge className={className}>{origin}</Badge>
  return (
    <Badge tone={meta.tone} title={meta.hint} className={className}>
      {meta.label}
    </Badge>
  )
}

import type { PrototypeStatus } from './api'

export const STATUS_ORDER: PrototypeStatus[] = ['concept', 'design', 'in_construction', 'testing', 'operational', 'retired']

const LABELS: Record<PrototypeStatus, string> = {
  concept: 'Concepto',
  design: 'En diseño',
  in_construction: 'En construcción',
  testing: 'En pruebas',
  operational: 'Operativo',
  retired: 'Retirado',
}

type Tone = 'neutral' | 'accent' | 'warning' | 'danger'

const TONES: Record<PrototypeStatus, Tone> = {
  concept: 'neutral',
  design: 'neutral',
  in_construction: 'warning',
  testing: 'warning',
  operational: 'accent',
  retired: 'neutral',
}

export function statusLabel(status: string): string {
  return LABELS[status as PrototypeStatus] ?? status
}

export function statusTone(status: string): Tone {
  return TONES[status as PrototypeStatus] ?? 'neutral'
}

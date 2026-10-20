import { describe, expect, it } from 'vitest'
import type { TraitAssertion } from './api'
import { plantViewerCallouts, traitCallout } from './traitCallouts'

function assertion(variable: string, extra: Partial<TraitAssertion> = {}): TraitAssertion {
  return {
    id: `a-${variable}-${extra.subject_type ?? 'species'}`,
    subject_type: 'species',
    subject_id: 's1',
    variable,
    value_min: null,
    value_max: null,
    unit: null,
    growth_stage: 'unknown',
    cultivation_system: 'unknown',
    origin: 'missing',
    review_status: 'unreviewed',
    evidence_refs: [],
    notes: null,
    sources: [],
    ...extra,
  }
}

describe('traitCallout', () => {
  it('sin afirmación o sin valor muestra Desconocido con origen missing', () => {
    expect(traitCallout([], 'ph')).toEqual({ variable: 'ph', label: 'pH', value: 'Desconocido', origin: 'missing' })
    expect(traitCallout([assertion('ph', { origin: 'sourced' })], 'ph').value).toBe('Desconocido')
    expect(traitCallout([assertion('ph', { origin: 'sourced' })], 'ph').origin).toBe('missing')
  })

  it('usa la afirmación de la especie antes que la de una variedad, con unidad', () => {
    const list = [
      assertion('air_temperature', { subject_type: 'cultivar', value_min: 10, value_max: 12, unit: 'Cel', origin: 'measured' }),
      assertion('air_temperature', { value_min: 18, value_max: 24, unit: 'Cel', origin: 'sourced' }),
    ]
    expect(traitCallout(list, 'air_temperature')).toEqual({
      variable: 'air_temperature',
      label: 'Temperatura del aire',
      value: '18 – 24 °C',
      origin: 'sourced',
    })
  })
})

describe('plantViewerCallouts', () => {
  it('con las 4 variables del seed da 3 callouts, uno por ancla', () => {
    const list = ['air_temperature', 'ph', 'photoperiod', 'relative_humidity'].map((v) => assertion(v))
    expect(plantViewerCallouts(list)).toEqual([
      { key: 'air_temperature', anchor: 'top', label: 'Temperatura del aire: Desconocido' },
      { key: 'ph', anchor: 'base', label: 'pH: Desconocido' },
      { key: 'relative_humidity', anchor: 'leaf', label: 'Humedad relativa: Desconocido' },
    ])
  })

  it('sin afirmaciones no hay callouts', () => {
    expect(plantViewerCallouts([])).toEqual([])
  })
})

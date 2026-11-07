import { expect, it } from 'vitest'
import type { Kpi } from './api'
import { formatKpiValue } from './format'

const k = (over: Partial<Kpi>): Kpi => ({
  key: 'x',
  label: 'X',
  value: 1,
  unit: null,
  origin: 'measured',
  formula: 'f',
  inputs_count: 1,
  as_of: '2026-10-22T12:00:00Z',
  ...over,
})

it('null no se formatea', () => expect(formatKpiValue(k({ value: null }))).toBeNull())
it('cero es "0"', () => expect(formatKpiValue(k({ value: 0 }))).toBe('0'))
it('conteos con miles y sin decimales', () => {
  expect(formatKpiValue(k({ value: 1234 }))).toBe('1,234')
  expect(formatKpiValue(k({ value: 10.6, unit: 'días' }))).toBe('11')
})
it('porcentaje y minutos con hasta un decimal', () => {
  expect(formatKpiValue(k({ value: 37.46, unit: '%' }))).toBe('37.5')
  expect(formatKpiValue(k({ value: 6, unit: 'min' }))).toBe('6')
})

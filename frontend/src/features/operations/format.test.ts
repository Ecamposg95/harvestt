import { describe, expect, it } from 'vitest'
import type { LatestDevice, ReadingPoint } from './api'
import { deviceCalloutLabel, deviceToWorld, greenhouseDims, readingText, unitLabel, withGaps } from './format'

const point = (minute: number, value: number): ReadingPoint => ({
  device_id: 'd1',
  variable: 'air_temperature',
  value,
  unit: 'Cel',
  observed_at: new Date(Date.UTC(2026, 9, 20, 12, minute)).toISOString(),
})

describe('withGaps', () => {
  it('corta la línea donde faltan pasos y no inventa ceros', () => {
    const series = withGaps([point(0, 20), point(5, 21), point(25, 22), point(30, 23)], 5)
    expect(series.map((p) => p.value)).toEqual([20, 21, null, 22, 23])
    expect(series.some((p) => p.value === 0)).toBe(false)
  })

  it('respeta el intervalo de una serie reducida', () => {
    expect(withGaps([point(0, 1), point(10, 2), point(20, 3)], 10).map((p) => p.value)).toEqual([1, 2, 3])
  })
})

describe('greenhouseDims', () => {
  it('usa el área registrada en proporción 1:2', () => {
    const d = greenhouseDims(128)
    expect(d.width).toBeCloseTo(8)
    expect(d.length).toBeCloseTo(16)
    expect(d.illustrative).toBe(false)
    expect(d.ridgeHeight).toBeGreaterThan(d.wallHeight)
  })

  it('sin área usa el tamaño ilustrativo etiquetado', () => {
    expect(greenhouseDims(null)).toMatchObject({ width: 8, length: 16, illustrative: true })
  })

  it('convierte posiciones del dispositivo a la escena centrada', () => {
    const d = greenhouseDims(null)
    expect(deviceToWorld(d, { x: 4, y: 8, z: 1.5 })).toEqual({ x: 0, y: 1.5, z: 0 })
    expect(deviceToWorld(d, { x: 0, y: 0, z: 0 })).toEqual({ x: -4, y: 0, z: 8 })
  })
})

describe('textos de lectura', () => {
  const device = (readings: LatestDevice['readings']): LatestDevice => ({ device_id: 'd1', name: 'Sensor norte', x: 0, y: 0, z: 0, readings })

  it('valor con unidad, "Sin señal" si perdió la señal y "Sin lecturas" si aún no hay', () => {
    expect(unitLabel('Cel')).toBe('°C')
    expect(readingText({ variable: 'air_temperature', value: 24.34, unit: 'Cel', observed_at: 'x', stale: false })).toBe('24.3 °C')
    expect(readingText({ variable: 'air_temperature', value: 24.34, unit: 'Cel', observed_at: 'x', stale: true })).toBe('Sin señal')
    expect(readingText({ variable: 'relative_humidity', value: null, unit: '%', observed_at: null, stale: false })).toBe('Sin lecturas')
  })

  it('el callout resume el dispositivo sin repetir "Sin señal"', () => {
    const lost = device([
      { variable: 'air_temperature', value: 20, unit: 'Cel', observed_at: 'x', stale: true },
      { variable: 'relative_humidity', value: 60, unit: '%', observed_at: 'x', stale: true },
    ])
    expect(deviceCalloutLabel(lost)).toBe('Sensor norte · Sin señal')
    const live = device([
      { variable: 'air_temperature', value: 24.3, unit: 'Cel', observed_at: 'x', stale: false },
      { variable: 'relative_humidity', value: 61, unit: '%', observed_at: 'x', stale: false },
    ])
    expect(deviceCalloutLabel(live)).toBe('Sensor norte · 24.3 °C · 61.0 %')
  })
})

import { describe, expect, it } from 'vitest'
import {
  centerOn,
  easeOutCubic,
  fitView,
  lerpView,
  MAX_ZOOM,
  MIN_ZOOM,
  pan,
  screenRadius,
  toScreen,
  toWorld,
  zoomAround,
} from './camera'

describe('camera', () => {
  it('toScreen y toWorld son inversas', () => {
    const v = { k: 1.7, x: 33, y: -12 }
    const s = toScreen(v, 10, -4)
    const w = toWorld(v, s.x, s.y)
    expect(w.x).toBeCloseTo(10)
    expect(w.y).toBeCloseTo(-4)
  })

  it('zoomAround deja fijo el punto del mundo bajo el cursor', () => {
    const v = { k: 1, x: 10, y: 20 }
    const before = toWorld(v, 200, 150)
    const z = zoomAround(v, 2, 200, 150)
    const after = toWorld(z, 200, 150)
    expect(z.k).toBe(2)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('limita el zoom', () => {
    expect(zoomAround({ k: 1, x: 0, y: 0 }, 1000, 0, 0).k).toBe(MAX_ZOOM)
    expect(zoomAround({ k: 1, x: 0, y: 0 }, 1e-6, 0, 0).k).toBe(MIN_ZOOM)
  })

  it('pan desplaza en píxeles de pantalla', () => {
    expect(pan({ k: 2, x: 0, y: 0 }, 5, -3)).toEqual({ k: 2, x: 5, y: -3 })
  })

  it('fitView deja todos los puntos dentro del margen', () => {
    const pts = [
      { x: -100, y: -50 },
      { x: 300, y: 120 },
      { x: 0, y: 0 },
    ]
    const v = fitView(pts, 800, 600, 50)
    for (const p of pts) {
      const s = toScreen(v, p.x, p.y)
      expect(s.x).toBeGreaterThanOrEqual(50 - 1e-6)
      expect(s.x).toBeLessThanOrEqual(750 + 1e-6)
      expect(s.y).toBeGreaterThanOrEqual(50 - 1e-6)
      expect(s.y).toBeLessThanOrEqual(550 + 1e-6)
    }
    expect(v.k).toBeCloseTo(1.75)
  })

  it('fitView sin puntos centra el origen y nunca acerca más de maxZoom', () => {
    expect(fitView([], 800, 600)).toEqual({ k: 1, x: 400, y: 300 })
    expect(fitView([{ x: 5, y: 5 }], 800, 600).k).toBe(2)
  })

  it('centerOn lleva el punto al centro', () => {
    const v = centerOn(40, -20, 800, 600, 2)
    const s = toScreen(v, 40, -20)
    expect(s).toEqual({ x: 400, y: 300 })
  })

  it('lerpView parte de a, termina en b e interpola el zoom geométricamente', () => {
    const a = { k: 1, x: 0, y: 0 }
    const b = { k: 4, x: -100, y: 50 }
    const start = lerpView(a, b, 0, 800, 600)
    const end = lerpView(a, b, 1, 800, 600)
    expect(start.k).toBeCloseTo(1)
    expect(start.x).toBeCloseTo(0)
    expect(end.k).toBeCloseTo(4)
    expect(end.x).toBeCloseTo(-100)
    expect(end.y).toBeCloseTo(50)
    expect(lerpView(a, b, 0.5, 800, 600).k).toBeCloseTo(2)
  })

  it('screenRadius crece más lento que el zoom y tiene mínimo', () => {
    expect(screenRadius(10, 4)).toBe(20)
    expect(screenRadius(10, 0.25)).toBe(6)
  })

  it('easeOutCubic va de 0 a 1 desacelerando', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
  })
})

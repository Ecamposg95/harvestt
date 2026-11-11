import { expect, it } from 'vitest'
import { BBOX, mapHeight, project } from './projection'

const W = 600

it('las esquinas del bbox caen en (0, 0) y (width, height)', () => {
  const [minLon, minLat, maxLon, maxLat] = BBOX
  const h = mapHeight(W)
  const tl = project(minLon, maxLat, W)
  const br = project(maxLon, minLat, W)
  expect(tl.x).toBeCloseTo(0)
  expect(tl.y).toBeCloseTo(0)
  expect(br.x).toBeCloseTo(W)
  expect(br.y).toBeCloseTo(h)
})

it('la altura se deriva del ancho con el factor cos(23°)', () => {
  const [minLon, minLat, maxLon, maxLat] = BBOX
  const expected = (W * (maxLat - minLat)) / ((maxLon - minLon) * Math.cos((23 * Math.PI) / 180))
  expect(mapHeight(W)).toBeCloseTo(expected)
})

it('CDMX cae dentro del mapa', () => {
  const { x, y } = project(-99.1, 19.4, W)
  expect(x).toBeGreaterThan(0)
  expect(x).toBeLessThan(W)
  expect(y).toBeGreaterThan(0)
  expect(y).toBeLessThan(mapHeight(W))
})

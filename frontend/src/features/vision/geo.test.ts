import { expect, it } from 'vitest'
import { equirect, latLonToVector3 } from './geo'

it('latLonToVector3 sitúa (0,0) en +x y el polo norte en +y', () => {
  const [x, y, z] = latLonToVector3(0, 0, 1)
  expect(x).toBeCloseTo(1)
  expect(y).toBeCloseTo(0)
  expect(z).toBeCloseTo(0)
  const [px, py, pz] = latLonToVector3(90, 0, 1)
  expect(px).toBeCloseTo(0)
  expect(py).toBeCloseTo(1)
  expect(pz).toBeCloseTo(0)
})

it('equirect proyecta a un lienzo equirectangular', () => {
  expect(equirect(0, 0, 360, 180)).toEqual([180, 90])
  const [x, y] = equirect(19.4, -99.1, 360, 180)
  expect(x).toBeCloseTo(80.9)
  expect(y).toBeCloseTo(70.6)
})

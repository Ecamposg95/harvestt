import * as THREE from 'three'
import { expect, it } from 'vitest'
import { greenhouseDims } from '@/features/operations/format'
import { buildGreenhouse, gableProfile } from './greenhouse'

const colors = { frame: 0x262b25, glass: 0xffffff, floor: 0xcfdacb }

it('la nave mide lo que dice el área y tiene techo a dos aguas', () => {
  const dims = greenhouseDims(50) // 5 × 10 m
  const group = buildGreenhouse(dims, colors)
  const shell = group.getObjectByName('shell') as THREE.Mesh
  const box = new THREE.Box3().setFromObject(shell)
  expect(box.min.x).toBeCloseTo(-2.5)
  expect(box.max.x).toBeCloseTo(2.5)
  expect(box.min.z).toBeCloseTo(-5)
  expect(box.max.z).toBeCloseTo(5)
  expect(box.min.y).toBeCloseTo(0)
  expect(box.max.y).toBeCloseTo(dims.ridgeHeight)
  const profile = gableProfile(dims)
  expect(profile[3]).toEqual([0, dims.ridgeHeight]) // cumbrera al centro
  expect(group.getObjectByName('floor')).toBeDefined()
  expect(group.getObjectByName('frame')).toBeInstanceOf(THREE.LineSegments)
})

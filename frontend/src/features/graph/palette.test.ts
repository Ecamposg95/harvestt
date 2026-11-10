import { describe, expect, it } from 'vitest'
import { NODE_TYPES } from './api'
import { graphPalette } from './palette'

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

describe('graphPalette', () => {
  it('el término tiene un tono claramente distinto del resto (≥ 20°) en ambos temas', () => {
    for (const dark of [false, true]) {
      const { node } = graphPalette(dark)
      const term = hue(node.term)
      for (const t of NODE_TYPES.filter((x) => x !== 'term')) {
        expect(hueGap(term, hue(node[t])), `${dark ? 'oscuro' : 'claro'}: term vs ${t}`).toBeGreaterThanOrEqual(20)
      }
    }
  })

  it('da un color distinto a cada tipo en ambos temas', () => {
    for (const dark of [false, true]) {
      const colors = NODE_TYPES.map((t) => graphPalette(dark).node[t])
      expect(new Set(colors).size).toBe(NODE_TYPES.length)
    }
  })

  it('incluye el término en claro y oscuro', () => {
    expect(graphPalette(false).node.term).toMatch(/^#/)
    expect(graphPalette(true).node.term).toMatch(/^#/)
  })

  it('cambia nodos, aristas y etiquetas con el tema', () => {
    const light = graphPalette(false)
    const dark = graphPalette(true)
    expect(light.node.species).not.toBe(dark.node.species)
    expect(light.edge).not.toBe(dark.edge)
    expect(light.label).not.toBe(dark.label)
    expect(light.labelHalo).not.toBe(dark.labelHalo)
  })
})

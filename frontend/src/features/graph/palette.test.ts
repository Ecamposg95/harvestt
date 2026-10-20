import { describe, expect, it } from 'vitest'
import { NODE_TYPES } from './api'
import { graphPalette } from './palette'

describe('graphPalette', () => {
  it('da un color distinto a cada tipo en ambos temas', () => {
    for (const dark of [false, true]) {
      const colors = NODE_TYPES.map((t) => graphPalette(dark).node[t])
      expect(new Set(colors).size).toBe(NODE_TYPES.length)
    }
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

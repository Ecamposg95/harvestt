import { describe, expect, it } from 'vitest'
import { viewerPalette } from './viewerPalette'

describe('viewerPalette', () => {
  it('usa el fondo del tema para la niebla', () => {
    expect(viewerPalette(false).fog).toBe(0xe6ece2)
    expect(viewerPalette(true).fog).toBe(0x141813)
  })

  it('cambia la malla y la cuadrícula entre temas pero conserva la línea central', () => {
    const light = viewerPalette(false)
    const dark = viewerPalette(true)
    expect(light.mesh).not.toBe(dark.mesh)
    expect(light.grid).not.toBe(dark.grid)
    expect(light.gridCenter).toBe(dark.gridCenter)
  })
})

/** Colores del visor 3D por tema. Separado de StlViewer para probarlo sin WebGL. */
export interface ViewerPalette {
  fog: number
  ground: number
  mesh: number
  gridCenter: number
  grid: number
}

export function viewerPalette(dark: boolean): ViewerPalette {
  return dark
    ? { fog: 0x141813, ground: 0x141813, mesh: 0x9aa898, gridCenter: 0x4f7a12, grid: 0x2a3229 }
    : { fog: 0xe6ece2, ground: 0xcfdacb, mesh: 0xd9dfd4, gridCenter: 0x4f7a12, grid: 0xc4d0c0 }
}

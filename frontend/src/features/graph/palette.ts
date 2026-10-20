import type { NodeType } from './api'

/** Colores del lienzo del grafo por tema. Separado para probarlo sin canvas. */
export interface GraphPalette {
  node: Record<NodeType, string>
  edge: string
  edgeActive: string
  label: string
  /** Contorno de las etiquetas: el color del escenario, para que se lean sobre las aristas. */
  labelHalo: string
  ring: string
}

export function graphPalette(dark: boolean): GraphPalette {
  return dark
    ? {
        node: {
          species: '#a6e22e',
          cultivar: '#5eead4',
          trait: '#facc15',
          source: '#c4b5fd',
          project: '#7dd3fc',
          crop_cycle: '#f9a8d4',
          prototype: '#fb923c',
        },
        edge: 'rgba(230, 236, 226, 0.16)',
        edgeActive: 'rgba(185, 236, 90, 0.85)',
        label: '#e6ece2',
        labelHalo: 'rgba(12, 15, 11, 0.9)',
        ring: '#b9ec5a',
      }
    : {
        node: {
          species: '#4d7c0f',
          cultivar: '#0f766e',
          trait: '#a16207',
          source: '#6d28d9',
          project: '#0369a1',
          crop_cycle: '#be185d',
          prototype: '#c2410c',
        },
        edge: 'rgba(29, 36, 28, 0.18)',
        edgeActive: 'rgba(68, 106, 14, 0.9)',
        label: '#1d241c',
        labelHalo: 'rgba(243, 246, 240, 0.92)',
        ring: '#446a0e',
      }
}

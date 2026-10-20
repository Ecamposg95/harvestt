// Sin importar three: las páginas usan estos tipos sin arrastrar el chunk 3D.

/** Punto en coordenadas crudas del archivo STL. */
export interface ModelPoint {
  x: number
  y: number
  z: number
}

export interface ViewerHotspot extends ModelPoint {
  key: string
  label: string
  description?: string
}

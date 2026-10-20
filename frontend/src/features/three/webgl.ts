/** ¿El navegador puede crear un contexto WebGL? Sin importar three: las páginas lo usan para elegir 3D o 2D. */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

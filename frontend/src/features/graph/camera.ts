/** Vista 2D del lienzo: pantalla = mundo · k + (x, y). Funciones puras. */
export interface View {
  k: number
  x: number
  y: number
}

export interface Point {
  x: number
  y: number
}

export const MIN_ZOOM = 0.15
export const MAX_ZOOM = 5

export function clampZoom(k: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))
}

export function toScreen(v: View, wx: number, wy: number): Point {
  return { x: wx * v.k + v.x, y: wy * v.k + v.y }
}

export function toWorld(v: View, sx: number, sy: number): Point {
  return { x: (sx - v.x) / v.k, y: (sy - v.y) / v.k }
}

/** Zoom manteniendo fijo el punto del mundo que está bajo (sx, sy). */
export function zoomAround(v: View, factor: number, sx: number, sy: number): View {
  const k = clampZoom(v.k * factor)
  const w = toWorld(v, sx, sy)
  return { k, x: sx - w.x * k, y: sy - w.y * k }
}

export function pan(v: View, dx: number, dy: number): View {
  return { k: v.k, x: v.x + dx, y: v.y + dy }
}

export function centerOn(wx: number, wy: number, width: number, height: number, k: number): View {
  const kk = clampZoom(k)
  return { k: kk, x: width / 2 - wx * kk, y: height / 2 - wy * kk }
}

export function fitView(points: Point[], width: number, height: number, padding = 56, maxZoom = 2): View {
  if (points.length === 0 || width <= 0 || height <= 0) return { k: 1, x: width / 2, y: height / 2 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const k = clampZoom(Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY, maxZoom))
  return centerOn((minX + maxX) / 2, (minY + maxY) / 2, width, height, k)
}

/** Interpola el centro del mundo en línea recta y el zoom de forma geométrica (sin "columpio"). */
export function lerpView(a: View, b: View, t: number, width: number, height: number): View {
  const ca = toWorld(a, width / 2, height / 2)
  const cb = toWorld(b, width / 2, height / 2)
  const k = a.k * Math.pow(b.k / a.k, t)
  return centerOn(ca.x + (cb.x - ca.x) * t, ca.y + (cb.y - ca.y) * t, width, height, k)
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** Radio en pantalla: crece con la raíz del zoom para que al acercar no tape todo; mínimo 0.6×. */
export function screenRadius(radius: number, k: number): number {
  return radius * Math.max(0.6, Math.sqrt(k))
}

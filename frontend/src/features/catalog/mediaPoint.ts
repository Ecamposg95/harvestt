/** Clic en pantalla → posición relativa (0..1, 3 decimales) sobre el rectángulo de la imagen. */
export function relativePoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  const r = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000
  return { x: r((clientX - rect.left) / rect.width), y: r((clientY - rect.top) / rect.height) }
}

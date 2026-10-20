/** Distancia máxima entre pointerdown y pointerup para que cuente como clic y no como giro. */
export const PICK_TOLERANCE_PX = 5

export function isClick(
  start: { x: number; y: number } | null,
  end: { x: number; y: number },
  tolerance = PICK_TOLERANCE_PX,
): boolean {
  return start !== null && Math.hypot(end.x - start.x, end.y - start.y) <= tolerance
}

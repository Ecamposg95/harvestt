import type { LayoutZone } from './api'
import type { Floor, Selection } from './layout'

/** Mismas props para la escena 3D y el respaldo 2D. */
export interface StudioSceneProps {
  floor: Floor
  zones: LayoutZone[]
  selection: Selection | null
  editing: boolean
  onSelect: (selection: Selection | null) => void
  /** En modo edición, clic en el piso con una planta seleccionada (metros del piso). */
  onFloorClick: (x: number, y: number) => void
  label: string
  className?: string
}

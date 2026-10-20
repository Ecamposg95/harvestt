import { MouseEvent } from 'react'
import { cssHex, PLANT_COLORS } from '@/features/three/plants/palette'
import { PLANT_STAGE_LABELS, plantKindFor } from '@/features/three/plants/types'
import { footprint } from './layout'
import type { StudioSceneProps } from './sceneTypes'

const PAD = 0.5

/** Vista superior en SVG (respaldo sin WebGL). Mismas coordenadas que la escena 3D, en metros. */
export function StudioTopView({ floor, zones, selection, editing, onSelect, onFloorClick, label, className = '' }: StudioSceneProps) {
  const toFloor = (e: MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const ctm = svg.getScreenCTM?.()
    if (!ctm || typeof svg.createSVGPoint !== 'function') return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  const onBackground = (e: MouseEvent<SVGSVGElement>) => {
    if (editing && selection?.plant != null) {
      const p = toFloor(e)
      if (p) onFloorClick(p.x, p.y)
      return
    }
    onSelect(null)
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-PAD} ${-PAD} ${floor.width + 2 * PAD} ${floor.depth + 2 * PAD}`}
      preserveAspectRatio="xMidYMid meet"
      className={`h-full w-full ${className}`}
      onClick={onBackground}
    >
      <rect
        x={0}
        y={0}
        width={floor.width}
        height={floor.depth}
        rx={0.08}
        className="fill-surface/60 stroke-border"
        strokeWidth={0.03}
        strokeDasharray={floor.illustrative ? '0.15 0.1' : undefined}
      />
      {zones.map((z, zi) => {
        const zoneSelected = selection?.zone === zi && selection.plant === null
        return (
          <g key={zi}>
            <rect
              role="button"
              aria-label={`Zona ${z.name}`}
              aria-pressed={zoneSelected}
              x={z.x}
              y={z.y}
              width={z.width}
              height={z.depth}
              rx={0.05}
              className={zoneSelected ? 'fill-lime/40 stroke-accent' : 'fill-lime/20 stroke-accent/60'}
              strokeWidth={0.03}
              onClick={(e) => {
                if (editing && selection?.plant != null) return // deja pasar el clic: mover la planta
                e.stopPropagation()
                onSelect({ zone: zi, plant: null })
              }}
            />
            <text x={z.x + 0.08} y={z.y + 0.22} fontSize={0.18} className="pointer-events-none fill-muted">
              {z.name}
            </text>
            {z.placements.map((p, pi) => {
              const selected = selection?.zone === zi && selection.plant === pi
              const choose = () => onSelect({ zone: zi, plant: pi })
              return (
                <circle
                  key={pi}
                  role="button"
                  tabIndex={0}
                  aria-label={`${p.species_name} · ${PLANT_STAGE_LABELS[p.stage]}`}
                  aria-pressed={selected}
                  cx={z.x + p.x}
                  cy={z.y + p.y}
                  r={footprint(p.species_name, p.stage)}
                  fill={cssHex(PLANT_COLORS[plantKindFor(p.species_name)].leaf)}
                  stroke={selected ? '#a6e22e' : 'rgba(0,0,0,0.25)'}
                  strokeWidth={selected ? 0.05 : 0.015}
                  onClick={(e) => {
                    e.stopPropagation()
                    choose()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      choose()
                    }
                  }}
                />
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

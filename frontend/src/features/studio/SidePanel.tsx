import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Field, Input, OriginBadge, Select } from '@/components/ui'
import type { CropCycle } from '@/features/projects/api'
import { CYCLE_STATUS_LABELS } from '@/features/projects/labels'
import { PLANT_STAGE_LABELS, PLANT_STAGES, PlantStage } from '@/features/three/plants/types'
import type { LayoutZone } from './api'
import {
  addPlant,
  addZone,
  FILL_SPACING_M,
  fillZone,
  Floor,
  MAX_PLACEMENTS,
  MAX_ZONES,
  movePlant,
  moveZone,
  plantCount,
  removePlant,
  removeZone,
  selectedPlant,
  Selection,
  updatePlant,
} from './layout'

interface Props {
  zones: LayoutZone[]
  floor: Floor
  selection: Selection | null
  editing: boolean
  cycles: CropCycle[]
  onZones: (zones: LayoutZone[]) => void
  onSelect: (selection: Selection | null) => void
}

function NumberField({ label, value, onChange, step = 0.05 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <Field label={label}>
      {(id) => (
        <Input
          id={id}
          type="number"
          step={step}
          value={value}
          onChange={(e) => {
            if (e.target.value === '') return
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange(n)
          }}
        />
      )}
    </Field>
  )
}

function cycleLabel(c: CropCycle): string {
  return `${c.species_name}${c.cultivar_name ? ` ‘${c.cultivar_name}’` : ''} · ${CYCLE_STATUS_LABELS[c.status] ?? c.status}`
}

export function SidePanel({ zones, floor, selection, editing, cycles, onZones, onSelect }: Props) {
  const [cycleId, setCycleId] = useState(cycles[0]?.id ?? '')
  const [stage, setStage] = useState<PlantStage>('vegetative')
  const plant = selectedPlant(zones, selection)
  const zone = selection ? zones[selection.zone] : undefined
  const cycle = cycles.find((c) => c.id === cycleId)
  const total = plantCount(zones)

  if (plant && selection && zone) {
    const linked = cycles.find((c) => c.id === plant.crop_cycle_id)
    return (
      <Card className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="eyebrow">Planta seleccionada</h2>
          <OriginBadge origin="illustrative" />
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Especie</dt>
            <dd>
              <Link to={`/app/plants/${plant.species_id}`} className="italic hover:text-accent">
                {plant.species_name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Etapa ilustrada</dt>
            <dd>{PLANT_STAGE_LABELS[plant.stage]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Ciclo</dt>
            <dd>
              {linked
                ? `${CYCLE_STATUS_LABELS[linked.status] ?? linked.status} · inicio ${linked.started_on ?? 'sin fecha'}`
                : 'Sin ciclo vinculado'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Posición en {zone.name}</dt>
            <dd className="font-mono">
              {plant.x.toFixed(2)} × {plant.y.toFixed(2)} m
            </dd>
          </div>
        </dl>
        {editing && (
          <div className="space-y-3 border-t border-border pt-4">
            <Field label="Etapa">
              {(id) => (
                <Select
                  id={id}
                  value={plant.stage}
                  onChange={(e) => onZones(updatePlant(zones, selection, { stage: e.target.value as PlantStage }))}
                >
                  {PLANT_STAGES.map((st) => (
                    <option key={st} value={st}>
                      {PLANT_STAGE_LABELS[st]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="X en la zona (m)" value={plant.x} onChange={(x) => onZones(movePlant(zones, selection, x, plant.y))} />
              <NumberField label="Y en la zona (m)" value={plant.y} onChange={(y) => onZones(movePlant(zones, selection, plant.x, y))} />
            </div>
            <NumberField
              label="Rotación (°)"
              step={15}
              value={plant.rotation}
              onChange={(r) => onZones(updatePlant(zones, selection, { rotation: Math.max(-360, Math.min(360, r)) }))}
            />
            <Button
              variant="ghost"
              onClick={() => {
                onZones(removePlant(zones, selection))
                onSelect({ zone: selection.zone, plant: null })
              }}
            >
              Quitar planta
            </Button>
          </div>
        )}
      </Card>
    )
  }

  if (zone && selection) {
    return (
      <Card className="space-y-4 p-5">
        <h2 className="eyebrow">{zone.name}</h2>
        <p className="text-sm">
          <span className="font-mono">
            {zone.width.toFixed(2)} × {zone.depth.toFixed(2)} m
          </span>{' '}
          · {zone.placements.length} {zone.placements.length === 1 ? 'planta' : 'plantas'}
        </p>
        {editing && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="X de la zona (m)" value={zone.x} onChange={(x) => onZones(moveZone(zones, selection.zone, x, zone.y, floor))} />
              <NumberField label="Y de la zona (m)" value={zone.y} onChange={(y) => onZones(moveZone(zones, selection.zone, zone.x, y, floor))} />
            </div>
            {cycles.length === 0 ? (
              <p className="text-sm text-muted">
                Este proyecto no tiene cultivos. Añade uno desde el{' '}
                <Link to="/app/plants" className="text-accent hover:underline">
                  explorador vegetal
                </Link>{' '}
                para colocar plantas.
              </p>
            ) : (
              <>
                <Field label="Cultivo">
                  {(id) => (
                    <Select id={id} value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                      {cycles.map((c) => (
                        <option key={c.id} value={c.id}>
                          {cycleLabel(c)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Etapa ilustrada">
                  {(id) => (
                    <Select id={id} value={stage} onChange={(e) => setStage(e.target.value as PlantStage)}>
                      {PLANT_STAGES.map((st) => (
                        <option key={st} value={st}>
                          {PLANT_STAGE_LABELS[st]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!cycle || total >= MAX_PLACEMENTS}
                    onClick={() => {
                      if (!cycle) return
                      onZones(addPlant(zones, selection.zone, cycle, stage))
                      onSelect({ zone: selection.zone, plant: zone.placements.length })
                    }}
                  >
                    Agregar planta
                  </Button>
                  <Button variant="secondary" disabled={!cycle} onClick={() => cycle && onZones(fillZone(zones, selection.zone, cycle, stage))}>
                    Llenar zona
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  «Llenar zona» dibuja una cuadrícula cada {FILL_SPACING_M * 100} cm; no es una recomendación de marco de plantación.
                </p>
              </>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                onZones(removeZone(zones, selection.zone))
                onSelect(null)
              }}
            >
              Quitar zona
            </Button>
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="eyebrow">Resumen</h2>
      <p className="text-sm">
        {zones.length} {zones.length === 1 ? 'zona' : 'zonas'} · {total} {total === 1 ? 'planta' : 'plantas'}
      </p>
      <p className="text-xs text-muted">
        {floor.illustrative
          ? 'Piso ilustrativo: el proyecto no tiene área registrada.'
          : `Piso de ${floor.width.toFixed(1)} × ${floor.depth.toFixed(1)} m (área del proyecto).`}
      </p>
      <p className="text-sm text-muted">Selecciona una planta o una zona.</p>
      {editing && (
        <Button
          disabled={zones.length >= MAX_ZONES}
          onClick={() => {
            onZones(addZone(zones, floor))
            onSelect({ zone: zones.length, plant: null })
          }}
        >
          Agregar zona
        </Button>
      )}
    </Card>
  )
}

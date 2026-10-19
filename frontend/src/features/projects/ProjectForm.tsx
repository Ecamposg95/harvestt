import { FormEvent, ReactNode, useState } from 'react'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import type { CultivationSystem, ProjectInput } from './api'
import { SYSTEM_LABELS } from './labels'

export interface ProjectFormValues {
  name: string
  objectives: string
  area_m2: string
  system: CultivationSystem
  location: string
}

export const EMPTY_PROJECT: ProjectFormValues = { name: '', objectives: '', area_m2: '', system: 'hydroponic', location: '' }

interface Props {
  initial: ProjectFormValues
  submitLabel: string
  saving: boolean
  serverErrors?: Record<string, string>
  notice?: ReactNode
  onSubmit: (data: ProjectInput) => void
  onCancel?: () => void
}

/** Validación de cliente equivalente a la del servidor; el servidor sigue siendo la autoridad. */
export function validateProject(v: ProjectFormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!v.name.trim()) errors.name = 'El nombre es obligatorio'
  if (v.area_m2.trim()) {
    const n = Number(v.area_m2.replace(',', '.'))
    if (!Number.isFinite(n)) errors.area_m2 = 'Debe ser un número'
    else if (n <= 0) errors.area_m2 = 'Debe ser mayor que 0'
  }
  return errors
}

export function toInput(v: ProjectFormValues): ProjectInput {
  return {
    name: v.name.trim(),
    objectives: v.objectives.trim() || null,
    area_m2: v.area_m2.trim() ? Number(v.area_m2.replace(',', '.')) : null,
    system: v.system,
    location: v.location.trim() || null,
  }
}

export function ProjectForm({ initial, submitLabel, saving, serverErrors = {}, notice, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<ProjectFormValues>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const all = { ...serverErrors, ...errors }

  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => {
      const { [key]: _removed, ...rest } = e
      void _removed
      return rest
    })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = validateProject(values)
    setErrors(found)
    if (Object.keys(found).length === 0) onSubmit(toInput(values))
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Nombre" error={all.name}>
        {(id, d) => (
          <Input id={id} aria-describedby={d} aria-invalid={Boolean(all.name)} required maxLength={200} value={values.name} onChange={(e) => set('name', e.target.value)} />
        )}
      </Field>
      <Field label="Objetivos" error={all.objectives} hint="Qué se busca lograr con este cultivo.">
        {(id, d) => (
          <Textarea id={id} aria-describedby={d} value={values.objectives} onChange={(e) => set('objectives', e.target.value)} />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Área (m²)" error={all.area_m2} hint="Opcional; mayor que 0.">
          {(id, d) => (
            <Input
              id={id}
              aria-describedby={d}
              aria-invalid={Boolean(all.area_m2)}
              inputMode="decimal"
              value={values.area_m2}
              onChange={(e) => set('area_m2', e.target.value)}
            />
          )}
        </Field>
        <Field label="Sistema" error={all.system}>
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={values.system} onChange={(e) => set('system', e.target.value as CultivationSystem)}>
              {(Object.keys(SYSTEM_LABELS) as CultivationSystem[]).map((k) => (
                <option key={k} value={k}>
                  {SYSTEM_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Ubicación" error={all.location} hint="Opcional.">
        {(id, d) => (
          <Input id={id} aria-describedby={d} maxLength={300} value={values.location} onChange={(e) => set('location', e.target.value)} />
        )}
      </Field>
      {notice}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

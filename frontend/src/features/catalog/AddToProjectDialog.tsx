import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { Button, ErrorState, Field, Input, Loading, Select } from '@/components/ui'
import { createCropCycle, listProjects, Project } from '@/features/projects/api'
import type { SpeciesDetail } from './api'
import { Dialog } from './Dialog'

interface Props {
  species: SpeciesDetail
  onClose: () => void
}

export function AddToProjectDialog({ species, onClose }: Props) {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [projectId, setProjectId] = useState('')
  const [cultivarId, setCultivarId] = useState('')
  const [startedOn, setStartedOn] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Project | null>(null)

  const load = () => {
    setLoadError(null)
    setProjects(null)
    listProjects({ page_size: 100 })
      .then((page) => {
        setProjects(page.items)
        setProjectId((current) => current || page.items[0]?.id || '')
      })
      .catch((err) => setLoadError(errorMessage(err, 'No se pudieron cargar los proyectos')))
  }

  useEffect(load, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!projectId) {
      setError('Elige un proyecto')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createCropCycle(projectId, {
        species_id: species.id,
        cultivar_id: cultivarId || null,
        started_on: startedOn || null,
      })
      setCreated(projects?.find((p) => p.id === projectId) ?? null)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir la planta al proyecto'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title="Añadir a proyecto" onClose={onClose}>
      {created ? (
        <div className="space-y-4">
          <p className="text-sm">
            Se creó un ciclo de cultivo de <em>{species.scientific_name}</em> en <strong>{created.name}</strong>.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            <Link
              to={`/app/projects/${created.id}`}
              className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent/90"
            >
              Ir al proyecto
            </Link>
          </div>
        </div>
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : projects === null ? (
        <Loading label="Cargando proyectos…" />
      ) : projects.length === 0 ? (
        <div className="space-y-4 text-sm">
          <p className="text-muted">Aún no hay proyectos en esta organización.</p>
          <Link to="/app/projects?nuevo=1" className="font-medium text-accent hover:underline">
            Crear un proyecto
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-muted">
            Crea un ciclo de cultivo de <em>{species.scientific_name}</em> en uno de tus proyectos.
          </p>
          <Field label="Proyecto" error={error ?? undefined}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {species.cultivars.length > 0 && (
            <Field label="Variedad (opcional)">
              {(id) => (
                <Select id={id} value={cultivarId} onChange={(e) => setCultivarId(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {species.cultivars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label="Fecha de inicio (opcional)">
            {(id) => <Input id={id} type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />}
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Añadir
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

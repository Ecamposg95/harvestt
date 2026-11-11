import { useEffect, useState } from 'react'
import { errorMessage } from '@/api/client'
import { Button, Loading } from '@/components/ui'
import { useHasRole } from '@/store/auth'
import { Dialog } from '../catalog/Dialog'
import { fetchCyclesForSpecies, linkAccession, type CycleListItem, type GenesysAccession } from './api'
import { formatDay } from './labels'

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; cycles: CycleListItem[] }

const accessionText = (ref: Record<string, unknown>) =>
  [ref.institute_code, ref.accession_number].filter(Boolean).join(' · ')

/** Vincula una accesión de Genesys a un ciclo de cultivo de la misma especie. Solo guarda sus identificadores. */
export function UseInCycleDialog({
  speciesId,
  accession,
  onClose,
}: {
  speciesId: string
  accession: GenesysAccession
  onClose: () => void
}) {
  const canEdit = useHasRole('editor')
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [selected, setSelected] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    fetchCyclesForSpecies(speciesId)
      .then((cycles) => alive && setLoad({ status: 'ready', cycles }))
      .catch((err) => alive && setLoad({ status: 'error', message: errorMessage(err, 'No se pudieron cargar tus ciclos') }))
    return () => {
      alive = false
    }
  }, [speciesId])

  const confirm = async () => {
    if (load.status !== 'ready') return
    const cycle = load.cycles.find((c) => c.id === selected)
    if (!cycle) return
    setSaving(true)
    setError(undefined)
    try {
      await linkAccession(cycle.project_id, cycle.id, speciesId, {
        source: 'genesys',
        institute_code: accession.institute_code,
        accession_number: accession.accession_number,
        doi: accession.doi,
      })
      setDone(true)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo vincular la accesión'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title="Usar en mi ciclo" onClose={onClose}>
      <p className="mb-4 text-sm">
        Accesión <span className="font-mono">{accession.institute_code} · {accession.accession_number}</span>
        {accession.doi && <span className="block font-mono text-xs text-muted">DOI {accession.doi}</span>}
      </p>
      {load.status === 'loading' && <Loading label="Cargando tus ciclos…" />}
      {load.status === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {load.message}
        </p>
      )}
      {load.status === 'ready' && load.cycles.length === 0 && (
        <p className="text-sm text-muted">No tienes ciclos de esta especie</p>
      )}
      {done ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-accent">
            Accesión vinculada al ciclo. El ciclo guarda solo su código de instituto, número y DOI.
          </p>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      ) : (
        load.status === 'ready' &&
        load.cycles.length > 0 && (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs text-muted">Elige el ciclo</legend>
              {load.cycles.map((c) => (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 text-sm ${
                    selected === c.id ? 'border-accent bg-accent/5' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="cycle"
                    value={c.id}
                    checked={selected === c.id}
                    onChange={() => setSelected(c.id)}
                    className="mt-1 accent-[rgb(var(--c-accent))]"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {c.project_name} · {c.cultivar_name ?? c.species_name}
                    </span>
                    <span className="block text-xs text-muted">
                      {c.started_on ? `Desde ${formatDay(c.started_on + 'T12:00:00')}` : 'Sin fecha de inicio'}
                      {c.accession_ref && ` · Reemplaza ${accessionText(c.accession_ref)}`}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                onClick={confirm}
                loading={saving}
                disabled={!selected || !canEdit}
                title={canEdit ? undefined : 'Necesitas rol de editor'}
              >
                Vincular accesión
              </Button>
            </div>
          </div>
        )
      )}
    </Dialog>
  )
}

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import { Badge, Button, Card, Empty, ErrorState, Field, Forbidden, Input, Loading, PageHeader, Select } from '@/components/ui'
import { useHasRole } from '@/store/auth'
import { Prototype, PrototypeStatus, prototypesApi } from './api'
import { StatusBadge } from './shared'
import { STATUS_ORDER, statusLabel } from './status'

type State =
  | { phase: 'loading' }
  | { phase: 'forbidden' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; items: Prototype[] }

export function PrototypesAdminPage() {
  const canEdit = useHasRole('editor')
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    setState({ phase: 'loading' })
    prototypesApi
      .list()
      .then((items) => setState({ phase: 'ready', items }))
      .catch((err) =>
        setState(
          errorStatus(err) === 403
            ? { phase: 'forbidden' }
            : { phase: 'error', message: errorMessage(err, 'No se pudieron cargar los prototipos') },
        ),
      )
  }, [])

  useEffect(load, [load])

  return (
    <>
      <PageHeader
        eyebrow="Laboratorio"
        title="Prototipos"
        description="Hardware en desarrollo. Lo marcado como público aparece en la vitrina."
        actions={
          canEdit && !creating ? (
            <Button onClick={() => setCreating(true)}>Nuevo prototipo</Button>
          ) : undefined
        }
      />

      {creating && <CreateForm onCancel={() => setCreating(false)} />}

      {state.phase === 'loading' && <Loading />}
      {state.phase === 'forbidden' && <Forbidden />}
      {state.phase === 'error' && <ErrorState message={state.message} onRetry={load} />}
      {state.phase === 'ready' && state.items.length === 0 && !creating && (
        <Empty
          title="Aún no hay prototipos"
          description={canEdit ? 'Crea el primero para publicar su modelo 3D y fotos.' : 'Cuando el equipo registre prototipos aparecerán aquí.'}
          action={canEdit ? <Button onClick={() => setCreating(true)}>Nuevo prototipo</Button> : undefined}
        />
      )}
      {state.phase === 'ready' && state.items.length > 0 && (
        <ul className="grid gap-3">
          {state.items.map((p) => (
            <li key={p.id}>
              <Link to={`/app/prototypes/${p.id}`} className="block">
                <Card className="flex flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-medium">{p.name}</h2>
                      {p.codename && <span className="eyebrow">{p.codename}</span>}
                    </div>
                    {p.purpose && <p className="mt-1 truncate text-sm text-muted">{p.purpose}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <StatusBadge status={p.status} />
                    {p.is_public ? <Badge tone="accent">Público</Badge> : <Badge>Privado</Badge>}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function CreateForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [codename, setCodename] = useState('')
  const [purpose, setPurpose] = useState('')
  const [status, setStatus] = useState<PrototypeStatus>('concept')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('El nombre es obligatorio')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await prototypesApi.create({ name: name.trim(), codename: codename.trim() || null, purpose: purpose.trim(), status })
      navigate(`/app/prototypes/${created.id}`)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear el prototipo'))
      setSaving(false)
    }
  }

  return (
    <Card className="mb-6 p-5">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Nombre">
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus required />}
        </Field>
        <Field label="Nombre clave" hint="Opcional, p. ej. AURORA">
          {(id, describedBy) => (
            <Input id={id} aria-describedby={describedBy} value={codename} onChange={(e) => setCodename(e.target.value)} maxLength={80} />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Propósito" hint="Una línea: qué problema resuelve">
            {(id, describedBy) => (
              <Input id={id} aria-describedby={describedBy} value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={300} />
            )}
          </Field>
        </div>
        <Field label="Estado">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as PrototypeStatus)}>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {error && (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {error}
          </p>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={saving}>
            Crear prototipo
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  )
}

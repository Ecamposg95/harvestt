import { FormEvent, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { errorMessage } from '@/api/client'
import { Button, Field, Input, Textarea } from '@/components/ui'
import { visionApi, type RequestInput } from './api'

type Errors = Partial<Record<'name' | 'organization' | 'email' | 'city' | 'message', string>>
const FIELDS = ['name', 'organization', 'email', 'city', 'message'] as const

const FIELD_MESSAGE: Record<(typeof FIELDS)[number], string> = {
  name: 'Escribe tu nombre (2 a 120 caracteres).',
  organization: 'Revisa este campo.',
  email: 'Escribe un correo válido.',
  city: 'Revisa este campo.',
  message: 'El mensaje debe tener entre 10 y 2000 caracteres.',
}

/** Errores 422 por campo: formato propio de la API ({error.details.errors}) o FastAPI ({detail}). */
function fieldErrors(err: unknown): Errors {
  if (!axios.isAxiosError(err) || err.response?.status !== 422) return {}
  const data = err.response.data as {
    detail?: { loc?: unknown[]; msg?: string }[]
    error?: { details?: { errors?: { loc?: unknown[]; msg?: string }[] } }
  }
  const list = data?.error?.details?.errors ?? data?.detail ?? []
  const out: Errors = {}
  for (const e of Array.isArray(list) ? list : []) {
    const field = String(e.loc?.[e.loc.length - 1] ?? '') as (typeof FIELDS)[number]
    if (FIELDS.includes(field) && !out[field]) out[field] = FIELD_MESSAGE[field] ?? 'Revisa este campo.'
  }
  return out
}

/** Pide la posición una sola vez; ante cualquier fallo devuelve null sin ruido. */
function approxPosition(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => resolve(null),
        { timeout: 8000, maximumAge: 600000 },
      )
    } catch {
      resolve(null)
    }
  })
}

export function RequestForm({ kind, onDone }: { kind: 'node' | 'contact'; onDone: () => void }) {
  const [values, setValues] = useState({ name: '', organization: '', email: '', city: '', message: '' })
  const [share, setShare] = useState(false)
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  // Si el diálogo se cierra mientras se espera la ubicación, no se envía nada.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const set = (k: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setFormError(null)
    const input: RequestInput = { kind, name: values.name.trim(), email: values.email.trim(), message: values.message.trim(), website }
    if (values.organization.trim()) input.organization = values.organization.trim()
    if (kind === 'node') {
      if (values.city.trim()) input.city = values.city.trim()
      if (share) {
        const pos = await approxPosition()
        if (!alive.current) return
        if (pos) {
          input.lat = pos.lat
          input.lon = pos.lon
        }
      }
    }
    try {
      await visionApi.sendRequest(input)
      setSent(true)
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(fe)
      if (Object.keys(fe).length === 0) setFormError(errorMessage(err, 'No se pudo enviar la solicitud'))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p role="status">Gracias. El equipo revisará tu solicitud y te escribirá.</p>
        <Button onClick={onDone}>Cerrar</Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nombre" error={errors.name}>
        {(id, d) => (
          <Input id={id} aria-describedby={d} data-autofocus value={values.name} onChange={set('name')} required minLength={2} maxLength={120} />
        )}
      </Field>
      <Field label="Organización (opcional)" error={errors.organization}>
        {(id, d) => <Input id={id} aria-describedby={d} value={values.organization} onChange={set('organization')} maxLength={200} />}
      </Field>
      <Field label="Correo" error={errors.email}>
        {(id, d) => (
          <Input id={id} aria-describedby={d} type="email" value={values.email} onChange={set('email')} required maxLength={254} />
        )}
      </Field>
      {kind === 'node' && (
        <>
          <Field label="Ciudad" error={errors.city}>
            {(id, d) => <Input id={id} aria-describedby={d} value={values.city} onChange={set('city')} maxLength={120} />}
          </Field>
          <p className="text-xs text-muted">
            Si aprobamos tu solicitud, tu ciudad aparecerá en el mapa público de la red (ubicación redondeada a unos 11 km).
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5" />
            Compartir mi ubicación aproximada (ciudad)
          </label>
        </>
      )}
      <Field label="Mensaje" error={errors.message}>
        {(id, d) => (
          <Textarea id={id} aria-describedby={d} value={values.message} onChange={set('message')} required minLength={10} maxLength={2000} />
        )}
      </Field>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input name="hp_field" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" loading={busy} className="w-full">
        Enviar
      </Button>
    </form>
  )
}

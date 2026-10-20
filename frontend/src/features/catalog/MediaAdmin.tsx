import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react'
import { errorMessage } from '@/api/client'
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui'
import { AuthedImage } from '@/features/prototypes/shared'
import { deleteSpeciesMedia, MediaCallout, SpeciesDetail, uploadSpeciesMedia } from './api'
import { label, VARIABLE_LABELS } from './labels'
import { relativePoint } from './mediaPoint'

const MAX_CALLOUTS = 12

/** Carga y borrado de imágenes de la especie. Solo superadmin; nunca descarga imágenes de terceros. */
export function MediaAdmin({ species, onChanged }: { species: SpeciesDetail; onChanged: () => void }) {
  const variables = useMemo(() => Array.from(new Set(species.trait_assertions.map((a) => a.variable))), [species])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [kind, setKind] = useState<'photo' | 'render'>('photo')
  const [license, setLicense] = useState('')
  const [attribution, setAttribution] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [isHero, setIsHero] = useState(true)
  const [variable, setVariable] = useState(variables[0] ?? '')
  const [callouts, setCallouts] = useState<MediaCallout[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const addCallout = (e: MouseEvent<HTMLImageElement>) => {
    if (!variable || callouts.length >= MAX_CALLOUTS) return
    const p = relativePoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
    if (p) setCallouts((list) => [...list, { trait_variable: variable, ...p }])
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Elige una imagen')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await uploadSpeciesMedia(species.id, { file, kind, license, attribution, source_url: sourceUrl, is_hero: isHero, callouts })
      setFile(null)
      setCallouts([])
      setLicense('')
      setAttribution('')
      setSourceUrl('')
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo subir la imagen'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (mediaId: string) => {
    try {
      await deleteSpeciesMedia(species.id, mediaId)
      setConfirming(null)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo eliminar la imagen'))
    }
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="eyebrow">Medios con licencia</h2>
        <p className="mt-1 text-xs text-muted">
          Solo superadmin. Sube imágenes cuya licencia hayas verificado; la plataforma no descarga imágenes de terceros.
        </p>
      </div>

      {species.media.length > 0 && (
        <ul className="space-y-3">
          {species.media.map((m) => (
            <li key={m.id} className="flex items-center gap-3 text-sm">
              <AuthedImage path={m.url} alt={`Medio de ${species.scientific_name}`} className="h-12 w-12 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {m.attribution} · {m.license}
                </p>
                <p className="text-xs text-muted">
                  {m.kind === 'render' ? 'Render' : 'Foto'} · {m.callouts.length} callouts
                </p>
              </div>
              {m.is_hero && <Badge tone="lime">Héroe</Badge>}
              {confirming === m.id ? (
                <Button variant="danger" onClick={() => remove(m.id)}>
                  Confirmar eliminación
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setConfirming(m.id)}>
                  Eliminar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} aria-label="Subir medio" className="space-y-3">
        <Field label="Imagen" hint="PNG, JPG o WEBP de hasta 15 MB.">
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setCallouts([])
              }}
            />
          )}
        </Field>
        <Field label="Tipo">
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as 'photo' | 'render')}>
              <option value="photo">Foto</option>
              <option value="render">Render</option>
            </Select>
          )}
        </Field>
        <Field label="Licencia (SPDX o nombre)">
          {(id) => <Input id={id} value={license} onChange={(e) => setLicense(e.target.value)} placeholder="CC BY 4.0" />}
        </Field>
        <Field label="Atribución">
          {(id) => <Input id={id} value={attribution} onChange={(e) => setAttribution(e.target.value)} />}
        </Field>
        <Field label="URL de la fuente">
          {(id) => <Input id={id} type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isHero} onChange={(e) => setIsHero(e.target.checked)} />
          Usar como imagen principal
        </label>

        {preview && (
          <div className="space-y-2">
            <Field label="Variable del callout">
              {(id) => (
                <Select id={id} value={variable} onChange={(e) => setVariable(e.target.value)}>
                  {variables.map((v) => (
                    <option key={v} value={v}>
                      {label(VARIABLE_LABELS, v)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <p className="text-xs text-muted">
              Haz clic sobre la imagen para colocar un callout ({callouts.length}/{MAX_CALLOUTS}).
            </p>
            <div className="relative">
              <img src={preview} alt="Vista previa" onClick={addCallout} className="w-full cursor-crosshair rounded-lg" />
              {callouts.map((c, i) => (
                <span
                  key={i}
                  className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-lime"
                  style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                />
              ))}
            </div>
            {callouts.length > 0 && (
              <ul className="space-y-1 text-xs">
                {callouts.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span>
                      {label(VARIABLE_LABELS, c.trait_variable)} · {c.x.toFixed(2)}, {c.y.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      className="text-danger"
                      onClick={() => setCallouts((list) => list.filter((_, j) => j !== i))}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy} disabled={!file}>
          Subir imagen
        </Button>
      </form>
    </Card>
  )
}

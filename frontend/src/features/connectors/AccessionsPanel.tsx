import { useState } from 'react'
import { errorMessage, errorStatus } from '@/api/client'
import { Button } from '@/components/ui'
import { useHasRole } from '@/store/auth'
import { fetchGenesysAccessions, type BankSourceOut, type GenesysAccession } from './api'
import { formatCount, sampstatLabel } from './labels'
import { Attribution, CopyNotice, hasData } from './SourceBlock'
import { UseInCycleDialog } from './UseInCycleDialog'

interface GenesysPayload {
  total?: number
  sampled?: number
  by_country?: { country: string | null; count: number }[]
  by_sampstat?: { code: number | null; count: number }[]
}

type Live =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: GenesysAccession[] }

const MAX_BUCKETS = 8

function Counts<T>({
  title,
  items,
  label,
}: {
  title: string
  items: { key: T; count: number }[]
  label: (k: T) => string
}) {
  if (items.length === 0) return null
  const shown = items.slice(0, MAX_BUCKETS)
  const rest = items.slice(MAX_BUCKETS).reduce((n, i) => n + i.count, 0)
  return (
    <div className="min-w-0">
      <h4 className="eyebrow mb-2">{title}</h4>
      <ul className="space-y-1 text-xs">
        {shown.map((i) => (
          <li key={String(i.key)} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{label(i.key)}</span>
            <span className="font-mono tabular-nums text-muted">{formatCount(i.count)}</span>
          </li>
        ))}
        {rest > 0 && (
          <li className="flex justify-between gap-3 text-muted">
            <span>Otros</span>
            <span className="font-mono tabular-nums">{formatCount(rest)}</span>
          </li>
        )}
      </ul>
    </div>
  )
}

/** Accesiones de germoplasma en Genesys: conteos de la copia local y lista consultada en vivo. */
export function AccessionsPanel({ speciesId, source }: { speciesId: string; source: BankSourceOut }) {
  const canEdit = useHasRole('editor')
  const [live, setLive] = useState<Live>({ status: 'idle' })
  const [using, setUsing] = useState<GenesysAccession>()

  if (source.status !== 'active') {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted">
        Genesys requiere credenciales de API. Accesiones disponibles cuando el equipo las configure.
      </p>
    )
  }

  const copy = source.copy
  const payload = (hasData(copy) ? copy.payload : {}) as GenesysPayload

  const loadLive = async () => {
    setLive({ status: 'loading' })
    try {
      setLive({ status: 'ready', rows: await fetchGenesysAccessions(speciesId) })
    } catch (err) {
      setLive({
        status: 'error',
        message: errorStatus(err) === 503 ? 'Fuente no disponible' : errorMessage(err, 'No se pudo consultar Genesys'),
      })
    }
  }

  return (
    <div className="space-y-4">
      <CopyNotice copy={copy} />
      {hasData(copy) && (
        <>
          <p className="text-sm">
            {formatCount(payload.total ?? 0)} accesiones en Genesys
            {payload.sampled !== undefined && payload.sampled < (payload.total ?? 0) && (
              <span className="text-muted"> · conteos sobre {formatCount(payload.sampled)}</span>
            )}
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <Counts
              title="Por país de origen"
              items={(payload.by_country ?? []).map((c) => ({ key: c.country, count: c.count }))}
              label={(k) => k ?? 'Sin dato'}
            />
            <Counts
              title="Por estado biológico"
              items={(payload.by_sampstat ?? []).map((c) => ({ key: c.code, count: c.count }))}
              label={(k) => sampstatLabel(k)}
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={loadLive} loading={live.status === 'loading'}>
          Ver accesiones
        </Button>
        <span className="text-xs text-muted">Se consultan en vivo: Genesys no permite redistribuir su lista.</span>
      </div>

      {live.status === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {live.message}
        </p>
      )}
      {live.status === 'ready' &&
        (live.rows.length === 0 ? (
          <p className="text-sm text-muted">Genesys no devolvió accesiones de esta especie.</p>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="eyebrow">
                <tr className="border-b border-border">
                  <th scope="col" className="px-2 py-2 font-normal">Instituto</th>
                  <th scope="col" className="px-2 py-2 font-normal">Accesión</th>
                  <th scope="col" className="px-2 py-2 font-normal">Origen</th>
                  <th scope="col" className="px-2 py-2 font-normal">Estado biológico</th>
                  <th scope="col" className="px-2 py-2 font-normal"><span className="sr-only">Acción</span></th>
                </tr>
              </thead>
              <tbody>
                {live.rows.map((a) => (
                  <tr key={`${a.institute_code}-${a.accession_number}`} className="border-b border-border/60 last:border-0">
                    <td className="px-2 py-2 font-mono text-xs">{a.institute_code}</td>
                    <td className="px-2 py-2">
                      <a href={a.url} target="_blank" rel="noreferrer noopener" className="font-mono text-accent hover:underline">
                        {a.accession_number}
                      </a>
                    </td>
                    <td className="px-2 py-2">{a.origin_country ?? 'Sin dato'}</td>
                    <td className="px-2 py-2 text-xs">{sampstatLabel(a.sampstat)}</td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        variant="ghost"
                        className="!px-3 !py-1.5 text-xs"
                        disabled={!canEdit}
                        title={canEdit ? undefined : 'Necesitas rol de editor'}
                        onClick={() => setUsing(a)}
                      >
                        Usar en mi ciclo
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {copy && copy.status !== 'error' && <Attribution copy={copy} />}
      {using && <UseInCycleDialog speciesId={speciesId} accession={using} onClose={() => setUsing(undefined)} />}
    </div>
  )
}

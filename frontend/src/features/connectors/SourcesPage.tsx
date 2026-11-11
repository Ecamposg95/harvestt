import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '@/api/client'
import { Badge, Button, Card, Empty, ErrorState, Loading, PageHeader, type Tone } from '@/components/ui'
import { useAuth } from '@/store/auth'
import { fetchConnectors, syncConnector, type ConnectorOut } from './api'
import { CONNECTOR_STATUS_LABELS, SYNC_STATUS_LABELS } from './labels'

const STATUS_TONE: Record<string, Tone> = {
  active: 'lime',
  requires_credentials: 'warning',
  in_construction: 'neutral',
  requires_alliance: 'neutral',
}

const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

type SyncState = { running: boolean; error?: string }

function StateCell({ c, sync }: { c: ConnectorOut; sync?: SyncState }) {
  return (
    <div className="space-y-1">
      <Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{CONNECTOR_STATUS_LABELS[c.status] ?? c.status}</Badge>
      {c.key === 'genesys' && c.status === 'requires_credentials' && (
        <p className="text-xs text-muted">Requiere credenciales · solicitar token a helpdesk@genesys-pgr.org</p>
      )}
      {c.last_sync?.error && <p className="text-xs text-danger">{c.last_sync.error}</p>}
      {sync?.error && (
        <p role="alert" className="text-xs text-danger">
          {sync.error}
        </p>
      )}
    </div>
  )
}

function LastSync({ c }: { c: ConnectorOut }) {
  if (!c.last_sync) return <span className="text-muted">Nunca</span>
  const s = c.last_sync
  return (
    <div className="space-y-0.5">
      <p>{fmt(s.started_at)}</p>
      <p className="text-xs text-muted">
        {SYNC_STATUS_LABELS[s.status] ?? s.status} · {s.species_ok} de {s.species_total} especies
      </p>
    </div>
  )
}

function Copies({ c }: { c: ConnectorOut }) {
  return (
    <span className="tabular-nums">
      {c.copies.ok} ok / {c.copies.not_found} sin coincidencia / {c.copies.stale} desactualizadas
    </span>
  )
}

function SyncButton({ c, sync, onSync }: { c: ConnectorOut; sync?: SyncState; onSync: (k: string) => void }) {
  if (!c.can_sync) return null
  return (
    <Button variant="secondary" disabled={sync?.running} onClick={() => onSync(c.key)}>
      {sync?.running ? 'Sincronizando…' : 'Sincronizar'}
    </Button>
  )
}

export default function SourcesPage() {
  const isSuper = useAuth((s) => s.user?.is_superadmin)
  const [rows, setRows] = useState<ConnectorOut[]>()
  const [loadError, setLoadError] = useState<string>()
  const [syncs, setSyncs] = useState<Record<string, SyncState>>({})

  const load = useCallback(async () => {
    setLoadError(undefined)
    try {
      setRows(await fetchConnectors())
    } catch (err) {
      setLoadError(errorMessage(err, 'No se pudieron cargar las fuentes'))
    }
  }, [])

  useEffect(() => {
    if (isSuper) void load()
  }, [isSuper, load])

  const onSync = async (key: string) => {
    setSyncs((s) => ({ ...s, [key]: { running: true } }))
    try {
      await syncConnector(key)
      setSyncs((s) => ({ ...s, [key]: { running: false } }))
      await load()
    } catch (err) {
      setSyncs((s) => ({ ...s, [key]: { running: false, error: errorMessage(err, 'No se pudo sincronizar') } }))
    }
  }

  if (!isSuper) return <Empty title="No tienes permiso para ver esta página" />

  return (
    <div className="space-y-6">
      <PageHeader title="Fuentes" description="Bancos de datos de plantas: estado, licencias y sincronización." />
      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {!rows && !loadError && <Loading />}
      {rows && (
        <>
          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  {['Fuente', 'Aporte', 'Licencia', 'Estado', 'Última sincronización', 'Copias', ''].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.key} className="border-t border-line align-top">
                    <td className="px-4 py-3 font-medium text-fg">
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {c.label}
                      </a>
                    </td>
                    <td className="px-4 py-3">{c.contribution}</td>
                    <td className="px-4 py-3">{c.license}</td>
                    <td className="px-4 py-3">
                      <StateCell c={c} sync={syncs[c.key]} />
                    </td>
                    <td className="px-4 py-3">
                      <LastSync c={c} />
                    </td>
                    <td className="px-4 py-3">
                      <Copies c={c} />
                    </td>
                    <td className="px-4 py-3">
                      <SyncButton c={c} sync={syncs[c.key]} onSync={onSync} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-3 md:hidden">
            {rows.map((c) => (
              <Card key={c.key} className="space-y-2 p-4 text-sm">
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="font-medium text-fg hover:underline">
                  {c.label}
                </a>
                <p>{c.contribution}</p>
                <p className="text-xs text-muted">Licencia: {c.license}</p>
                <StateCell c={c} sync={syncs[c.key]} />
                <LastSync c={c} />
                <Copies c={c} />
                <div>
                  <SyncButton c={c} sync={syncs[c.key]} onSync={onSync} />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

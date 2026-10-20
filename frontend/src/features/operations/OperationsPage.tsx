import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import { Badge, Button, Card, Empty, ErrorState, Gauge, LineChart, Loading, OriginBadge, Select, StatTile, Tone } from '@/components/ui'
import { getProject, ProjectDetail } from '@/features/projects/api'
import { formatDateTime } from '@/features/projects/labels'
import { ProjectTabs } from '@/features/projects/ProjectTabs'
import { useHasRole } from '@/store/auth'
import {
  Device,
  Incident,
  LatestResponse,
  operationsApi,
  ReadingsResponse,
  RunAction,
  Scenario,
  SimulationRun,
  Variable,
} from './api'
import {
  deviceCalloutLabel,
  formatMeters,
  formatReading,
  GAUGE_RANGES,
  greenhouseDims,
  INCIDENT_KIND_LABELS,
  INCIDENT_STATUS_LABELS,
  RUN_STATUS_LABELS,
  SCENARIO_LABELS,
  unitLabel,
  VARIABLE_LABELS,
  VARIABLES,
  withGaps,
} from './format'
import { GreenhouseViewer } from './LazyGreenhouseViewer'
import { usePolling } from './usePolling'

export const DIDACTIC_NOTICE = 'Simulación didáctica, sin calibración agronómica'

interface Data {
  project: ProjectDetail
  devices: Device[]
  runs: SimulationRun[]
  latest: LatestResponse
  incidents: Incident[]
  charts: Record<Variable, ReadingsResponse | null>
}

type State = { phase: 'loading' } | { phase: 'error'; message: string; code?: number } | { phase: 'ready'; data: Data }

const STATUS_TONE: Record<string, Tone> = { running: 'lime', paused: 'warning', completed: 'accent', cancelled: 'neutral' }

function formatClock(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

/** Pie de la serie: tramo de tiempo simulado y rango observado, solo con puntos reales. */
function SeriesFooter({ series, unit }: { series: ReadingsResponse | null; unit: string }) {
  const points = series?.points ?? []
  if (points.length === 0) return null
  const values = points.map((p) => p.value)
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
      <span>
        {formatClock(points[0].observed_at)} → {formatClock(points[points.length - 1].observed_at)} · tiempo simulado
      </span>
      <span className="font-mono">
        mín {formatReading(Math.min(...values))} · máx {formatReading(Math.max(...values))} {unit}
      </span>
    </div>
  )
}

async function fetchCharts(projectId: string, deviceId: string | null, runId: string | null) {
  const empty = { air_temperature: null, relative_humidity: null } as Record<Variable, ReadingsResponse | null>
  if (!deviceId || !runId) return empty
  const results = await Promise.all(VARIABLES.map((variable) => operationsApi.readings(projectId, { variable, device_id: deviceId })))
  return { air_temperature: results[0], relative_humidity: results[1] }
}

export function OperationsPage() {
  const { id = '' } = useParams()
  const canEdit = useHasRole('editor')
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [selected, setSelected] = useState<string | null>(null)
  const [scenario, setScenario] = useState<Scenario>('base')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(
    async (quiet = false, deviceId: string | null = null) => {
      if (!quiet) setState({ phase: 'loading' })
      try {
        // latest materializa los pasos pendientes; el resto lee el estado ya al día.
        const [project, latest] = await Promise.all([getProject(id), operationsApi.latest(id)])
        const [devices, runs, incidents] = await Promise.all([
          operationsApi.devices(id),
          operationsApi.runs(id),
          operationsApi.alerts(id),
        ])
        const device = deviceId ?? latest.devices[0]?.device_id ?? null
        const charts = await fetchCharts(id, device, latest.run_id)
        setSelected(device)
        setState({ phase: 'ready', data: { project, devices, runs, latest, incidents, charts } })
      } catch (err) {
        if (!quiet) {
          setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar la operación'), code: errorStatus(err) })
        }
      }
    },
    [id],
  )

  useEffect(() => {
    load()
  }, [load])

  const data = state.phase === 'ready' ? state.data : null
  const run = data?.runs[0] ?? null
  usePolling(() => load(true, selected), run?.status === 'running')

  const back = (
    <Link to={`/app/projects/${encodeURIComponent(id)}`} className="mb-4 inline-block text-sm text-muted hover:text-fg">
      ← {data?.project.name ?? 'Proyecto'}
    </Link>
  )
  const notice = (
    <p role="note" className="glass mb-4 flex flex-wrap items-center gap-2 border-l-4 !border-l-lime px-4 py-2.5 text-sm font-semibold">
      <OriginBadge origin="simulated" />
      {DIDACTIC_NOTICE}
    </p>
  )

  if (state.phase === 'loading') return <>{back}<Loading label="Cargando operación…" /></>
  if (state.phase === 'error') {
    return (
      <>
        {back}
        {state.code === 404 ? (
          <Empty title="Proyecto no encontrado" description="No existe o no pertenece a tu organización activa." />
        ) : (
          <ErrorState message={state.message} onRetry={() => load()} />
        )}
      </>
    )
  }

  const { project, devices, latest, incidents, charts } = state.data
  const active = run !== null && (run.status === 'running' || run.status === 'paused')
  const dims = greenhouseDims(project.area_m2)
  const current = latest.devices.find((d) => d.device_id === selected) ?? latest.devices[0] ?? null

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      await load(true, selected)
    } catch (err) {
      setActionError(errorMessage(err, 'No se pudo completar la acción'))
    } finally {
      setBusy(false)
    }
  }
  const control = (action: RunAction) => run && act(() => operationsApi.controlRun(id, run.id, action))
  const acknowledge = (incident: Incident) => act(() => operationsApi.acknowledge(id, incident.id))
  const selectDevice = (deviceId: string) => {
    setSelected(deviceId)
    load(true, deviceId)
  }

  return (
    <>
      {back}
      <ProjectTabs projectId={id} active="operaciones" />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Operaciones · invernadero virtual</p>
          <h1 className="display mt-1 break-words text-3xl">{project.name}</h1>
        </div>
        {run && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone={STATUS_TONE[run.status]}>{RUN_STATUS_LABELS[run.status]}</Badge>
            <span>{SCENARIO_LABELS[run.scenario]}</span>
            <span>
              · Paso {run.emitted_steps} de {run.total_steps}
            </span>
          </div>
        )}
      </div>
      {notice}

      {devices.length === 0 ? (
        <Empty
          title="Sin dispositivos"
          description="Este proyecto aún no tiene sensores simulados. La demostración agrega dos sensores y dos reglas demostrativas (umbrales de ejemplo, no agronómicos)."
          action={
            canEdit ? (
              <Button disabled={busy} onClick={() => act(() => operationsApi.demoSetup(id))}>
                Preparar demostración
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
          <div className="min-w-0 space-y-3">
            <Card className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="font-bold">{run ? `Corrida · semilla ${run.seed}` : 'Sin corridas todavía'}</p>
                  <p className="text-xs text-muted">
                    {run?.sim_time ? `Tiempo simulado: ${formatDateTime(run.sim_time)}` : 'Inicia una corrida para generar lecturas simuladas.'}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    {run?.status === 'running' && (
                      <Button variant="secondary" disabled={busy} onClick={() => control('pause')}>
                        Pausar
                      </Button>
                    )}
                    {run?.status === 'paused' && (
                      <Button variant="secondary" disabled={busy} onClick={() => control('resume')}>
                        Reanudar
                      </Button>
                    )}
                    {active && (
                      <Button variant="ghost" disabled={busy} onClick={() => control('cancel')}>
                        Cancelar
                      </Button>
                    )}
                    {!active && (
                      <>
                        <Select
                          aria-label="Escenario"
                          value={scenario}
                          onChange={(e) => setScenario(e.target.value as Scenario)}
                          className="!w-auto"
                        >
                          {(Object.keys(SCENARIO_LABELS) as Scenario[]).map((s) => (
                            <option key={s} value={s}>
                              {SCENARIO_LABELS[s]}
                            </option>
                          ))}
                        </Select>
                        <Button disabled={busy} onClick={() => act(() => operationsApi.startRun(id, scenario))}>
                          {run ? 'Nueva corrida' : 'Iniciar simulación'}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {run && (
                <div
                  role="progressbar"
                  aria-label="Avance de la corrida"
                  aria-valuemin={0}
                  aria-valuemax={run.total_steps}
                  aria-valuenow={run.emitted_steps}
                  className="mt-4 h-1.5 overflow-hidden rounded-full bg-fg/10"
                >
                  <div
                    className="h-full rounded-full bg-lime transition-[width] duration-700 ease-out"
                    style={{ width: `${run.total_steps > 0 ? Math.min(100, (run.emitted_steps / run.total_steps) * 100) : 0}%` }}
                  />
                </div>
              )}
              {actionError && (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {actionError}
                </p>
              )}
              {run && (
                <details className="mt-3 text-xs text-muted">
                  <summary className="cursor-pointer font-semibold">Modelo {run.model_version}: parámetros de ejemplo y limitaciones</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {run.limits.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono sm:grid-cols-3">
                    {Object.entries(run.inputs).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </Card>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Dispositivo">
              {latest.devices.map((d) => {
                const stale = d.readings.some((r) => r.stale)
                const live = !stale && d.readings.some((r) => r.value !== null)
                return (
                  <button
                    key={d.device_id}
                    type="button"
                    aria-pressed={d.device_id === current?.device_id}
                    onClick={() => selectDevice(d.device_id)}
                    className={
                      d.device_id === current?.device_id
                        ? 'flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-ink-fg transition-colors'
                        : 'glass flex items-center gap-2 !rounded-full px-3 py-1.5 text-xs font-semibold transition-colors hover:text-accent'
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={live ? 'h-2 w-2 rounded-full bg-lime shadow-[0_0_0_3px_rgb(var(--c-lime)/0.25)]' : 'h-2 w-2 rounded-full bg-fg/30'}
                    />
                    {d.name}
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {VARIABLES.map((variable) => {
                const reading = current?.readings.find((r) => r.variable === variable)
                const [min, max] = GAUGE_RANGES[variable]
                if (!reading) return <StatTile key={variable} label={VARIABLE_LABELS[variable]} value={null} emptyText="No mide esta variable" />
                if (!reading.stale && reading.value === null) {
                  return <StatTile key={variable} label={VARIABLE_LABELS[variable]} value={null} emptyText="Sin lecturas" />
                }
                return (
                  <Card key={variable} className="flex flex-col items-center gap-2 p-4">
                    <Gauge
                      label={VARIABLE_LABELS[variable]}
                      min={min}
                      max={max}
                      unit={unitLabel(reading.unit)}
                      value={reading.stale || reading.value === null ? null : Math.round(reading.value * 10) / 10}
                    />
                    <OriginBadge origin="simulated" />
                  </Card>
                )
              })}
            </div>

            {VARIABLES.map((variable) => {
              const series = charts[variable]
              const unit = variable === 'air_temperature' ? '°C' : '%'
              return (
                <Card key={variable} className="p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="font-bold">
                      {VARIABLE_LABELS[variable]} <span className="text-xs font-semibold text-muted">({unit})</span>
                    </p>
                    <OriginBadge origin="simulated" />
                  </div>
                  <LineChart
                    ariaLabel={`${VARIABLE_LABELS[variable]} de ${current?.name ?? 'sin dispositivo'}`}
                    unit={unit}
                    data={series ? withGaps(series.points, series.interval_minutes) : []}
                  />
                  <SeriesFooter series={series} unit={unit} />
                  {series?.downsampled && (
                    <p className="mt-2 text-[11px] text-muted">Serie reducida: un punto cada {series.interval_minutes} min simulados.</p>
                  )}
                </Card>
              )
            })}
          </div>

          <div className="min-w-0 space-y-3">
            <Card className="p-2">
              <GreenhouseViewer
                className="h-[320px] sm:h-[380px]"
                dims={dims}
                devices={latest.devices.map((d) => ({
                  key: d.device_id,
                  label: deviceCalloutLabel(d),
                  x: d.x,
                  y: d.y,
                  z: d.z,
                  stale: d.readings.some((r) => r.stale),
                }))}
              />
              <p className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] text-muted">
                <OriginBadge origin="illustrative" />
                {dims.illustrative
                  ? `Tamaño ilustrativo de ${formatMeters(dims.width)} × ${formatMeters(dims.length)} m: el proyecto no tiene área registrada.`
                  : `Nave de ${formatMeters(dims.width)} × ${formatMeters(dims.length)} m a partir del área registrada (${formatMeters(project.area_m2 ?? 0)} m²); forma y alturas ilustrativas.`}
              </p>
            </Card>

            <Card className="p-5">
              <p className="mb-3 font-bold">Incidentes</p>
              {incidents.length === 0 ? (
                <p className="text-sm text-muted">Sin incidentes registrados.</p>
              ) : (
                <ul className="divide-y divide-border/50" aria-label="Incidentes">
                  {incidents.map((i) => (
                    <li key={i.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="warning">{INCIDENT_KIND_LABELS[i.kind]}</Badge>
                          <Badge tone={i.status === 'open' ? 'danger' : 'neutral'}>{INCIDENT_STATUS_LABELS[i.status]}</Badge>
                          <span className="font-semibold">{i.device_name}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {i.kind === 'stale' ? 'El dispositivo dejó de reportar.' : i.rule_label}
                        </p>
                        <p className="text-[11px] text-muted">
                          Abierto {formatDateTime(i.opened_at)}
                          {i.closed_at ? ` · cerrado ${formatDateTime(i.closed_at)}` : ''} (tiempo simulado)
                        </p>
                      </div>
                      {canEdit && i.acknowledged_at === null && (
                        <Button variant="secondary" disabled={busy} onClick={() => acknowledge(i)}>
                          Reconocer
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  )
}

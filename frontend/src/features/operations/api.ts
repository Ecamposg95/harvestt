import { api } from '@/api/client'

export type Variable = 'air_temperature' | 'relative_humidity'
export type Scenario = 'base' | 'heat_rise' | 'sensor_loss'
export type RunStatus = 'running' | 'paused' | 'completed' | 'cancelled'
export type RunAction = 'pause' | 'resume' | 'cancel'
export type IncidentKind = 'threshold' | 'stale'
export type IncidentStatus = 'open' | 'acknowledged' | 'closed'

export interface Device {
  id: string
  project_id: string
  name: string
  kind: 'simulated' | 'physical'
  variables: Variable[]
  x: number
  y: number
  z: number
  status: 'active' | 'inactive'
  created_at: string
}

export interface SimulationRun {
  id: string
  project_id: string
  scenario: Scenario
  model_version: string
  seed: number
  inputs: Record<string, number>
  device_ids: string[]
  status: RunStatus
  started_at: string
  paused_at: string | null
  paused_seconds: number
  ended_at: string | null
  total_steps: number
  emitted_steps: number
  sim_time: string | null
  limits: string[]
  author_id: string
  created_at: string
}

export interface ReadingPoint {
  device_id: string
  variable: Variable
  value: number
  unit: string
  observed_at: string
}

export interface ReadingsResponse {
  run_id: string | null
  interval_minutes: number | null
  downsampled: boolean
  points: ReadingPoint[]
}

export interface LatestValue {
  variable: Variable
  value: number | null
  unit: string
  observed_at: string | null
  stale: boolean
}

export interface LatestDevice {
  device_id: string
  name: string
  x: number
  y: number
  z: number
  readings: LatestValue[]
}

export interface LatestResponse {
  run_id: string | null
  run_status: RunStatus | null
  sim_time: string | null
  devices: LatestDevice[]
}

export interface AlertRule {
  id: string
  project_id: string
  variable: Variable
  comparator: 'gt' | 'lt'
  threshold: number
  hysteresis: number
  cooldown_minutes: number
  stale_after_minutes: number
  label: string
  is_didactic: boolean
  created_at: string
}

export interface Incident {
  id: string
  project_id: string
  rule_id: string | null
  rule_label: string | null
  scenario_run_id: string | null
  kind: IncidentKind
  device_id: string
  device_name: string
  opened_at: string
  closed_at: string | null
  severity: string
  evidence: Record<string, unknown>
  status: IncidentStatus
  acknowledged_by: string | null
  acknowledged_at: string | null
}

export interface DemoSetup {
  created_devices: number
  created_rules: number
  devices: Device[]
  rules: AlertRule[]
}

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`

export const operationsApi = {
  devices: (projectId: string) => api.get<Device[]>(`${base(projectId)}/devices`).then((r) => r.data),
  runs: (projectId: string) => api.get<SimulationRun[]>(`${base(projectId)}/simulation/runs`).then((r) => r.data),
  startRun: (projectId: string, scenario: Scenario) =>
    api.post<SimulationRun>(`${base(projectId)}/simulation/runs`, { scenario }).then((r) => r.data),
  controlRun: (projectId: string, runId: string, action: RunAction) =>
    api.post<SimulationRun>(`${base(projectId)}/simulation/runs/${encodeURIComponent(runId)}/${action}`).then((r) => r.data),
  latest: (projectId: string) => api.get<LatestResponse>(`${base(projectId)}/telemetry/latest`).then((r) => r.data),
  readings: (projectId: string, params: { variable: Variable; device_id: string; run_id?: string }) =>
    api.get<ReadingsResponse>(`${base(projectId)}/telemetry/readings`, { params }).then((r) => r.data),
  alerts: (projectId: string) => api.get<Incident[]>(`${base(projectId)}/alerts`).then((r) => r.data),
  acknowledge: (projectId: string, incidentId: string) =>
    api
      .patch<Incident>(`${base(projectId)}/alerts/${encodeURIComponent(incidentId)}`, { action: 'acknowledge' })
      .then((r) => r.data),
  rules: (projectId: string) => api.get<AlertRule[]>(`${base(projectId)}/alert-rules`).then((r) => r.data),
  demoSetup: (projectId: string) => api.post<DemoSetup>(`${base(projectId)}/simulation/demo`).then((r) => r.data),
}

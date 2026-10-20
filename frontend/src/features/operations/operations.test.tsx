import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as projectsApi from '@/features/projects/api'
import { useAuth } from '@/store/auth'
import { Device, Incident, LatestResponse, operationsApi, ReadingsResponse, SimulationRun } from './api'
import { DIDACTIC_NOTICE, OperationsPage } from './OperationsPage'
import { POLL_MS } from './usePolling'

vi.mock('@/features/projects/api', () => ({ getProject: vi.fn() }))
vi.mock('./LazyGreenhouseViewer', () => ({
  GreenhouseViewer: ({ devices }: { devices: { key: string; label: string; stale: boolean }[] }) => (
    <ul data-testid="scene">
      {devices.map((d) => (
        <li key={d.key} data-stale={d.stale}>
          {d.label}
        </li>
      ))}
    </ul>
  ),
}))

const project: projectsApi.ProjectDetail = {
  id: 'p1',
  name: 'Invernadero demostrativo',
  objectives: null,
  area_m2: null,
  system: 'other',
  location: null,
  version: 1,
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
  crop_cycles: [],
}

const devices: Device[] = [
  { id: 'd1', project_id: 'p1', name: 'Sensor norte', kind: 'simulated', variables: ['air_temperature', 'relative_humidity'], x: 4, y: 12, z: 1.5, status: 'active', created_at: '2026-10-20T10:00:00Z' },
  { id: 'd2', project_id: 'p1', name: 'Sensor sur', kind: 'simulated', variables: ['air_temperature', 'relative_humidity'], x: 4, y: 4, z: 1.5, status: 'active', created_at: '2026-10-20T10:00:00Z' },
]

const run = (status: SimulationRun['status']): SimulationRun => ({
  id: 'r1',
  project_id: 'p1',
  scenario: 'sensor_loss',
  model_version: 'didactic-v1',
  seed: 42,
  inputs: { step_minutes: 5, tick_seconds: 2 },
  device_ids: ['d1', 'd2'],
  status,
  started_at: '2026-10-20T12:00:00Z',
  paused_at: null,
  paused_seconds: 0,
  ended_at: null,
  total_steps: 288,
  emitted_steps: 70,
  sim_time: '2026-10-20T17:45:00Z',
  limits: ['Simulación didáctica, sin calibración agronómica.'],
  author_id: 'u1',
  created_at: '2026-10-20T12:00:00Z',
})

const latest: LatestResponse = {
  run_id: 'r1',
  run_status: 'running',
  sim_time: '2026-10-20T17:45:00Z',
  devices: [
    {
      device_id: 'd1', name: 'Sensor norte', x: 4, y: 12, z: 1.5,
      readings: [
        { variable: 'air_temperature', value: 21.2, unit: 'Cel', observed_at: '2026-10-20T16:55:00Z', stale: true },
        { variable: 'relative_humidity', value: 66, unit: '%', observed_at: '2026-10-20T16:55:00Z', stale: true },
      ],
    },
    {
      device_id: 'd2', name: 'Sensor sur', x: 4, y: 4, z: 1.5,
      readings: [
        { variable: 'air_temperature', value: 24.34, unit: 'Cel', observed_at: '2026-10-20T17:45:00Z', stale: false },
        { variable: 'relative_humidity', value: 61, unit: '%', observed_at: '2026-10-20T17:45:00Z', stale: false },
      ],
    },
  ],
}

const series: ReadingsResponse = {
  run_id: 'r1',
  interval_minutes: 5,
  downsampled: false,
  points: [0, 5, 30, 35].map((m, i) => ({
    device_id: 'd1', variable: 'air_temperature', value: 20 + i, unit: 'Cel',
    observed_at: new Date(Date.UTC(2026, 9, 20, 12, m)).toISOString(),
  })),
}

const incident: Incident = {
  id: 'i1', project_id: 'p1', rule_id: null, rule_label: null, scenario_run_id: 'r1', kind: 'stale', device_id: 'd1',
  device_name: 'Sensor norte', opened_at: '2026-10-20T17:10:00Z', closed_at: null, severity: 'warning',
  evidence: { simulated: true }, status: 'open', acknowledged_by: null, acknowledged_at: null,
}

function setRole(role: 'viewer' | 'editor') {
  useAuth.setState({
    token: 't',
    organizationId: 'o1',
    user: { id: 'u1', email: 'a@a.test', full_name: 'A', is_superadmin: false },
    memberships: [{ organization: { id: 'o1', name: 'Alfa', slug: 'alfa' }, role }],
  })
}

function mockApi(status: SimulationRun['status'] | null = 'running', overrides: Partial<Record<keyof typeof operationsApi, unknown>> = {}) {
  vi.mocked(projectsApi.getProject).mockResolvedValue(project)
  const spies = {
    devices: vi.spyOn(operationsApi, 'devices').mockResolvedValue(devices),
    runs: vi.spyOn(operationsApi, 'runs').mockResolvedValue(status ? [run(status)] : []),
    latest: vi.spyOn(operationsApi, 'latest').mockResolvedValue(status ? latest : { ...latest, run_id: null, run_status: null, sim_time: null }),
    alerts: vi.spyOn(operationsApi, 'alerts').mockResolvedValue(status ? [incident] : []),
    readings: vi.spyOn(operationsApi, 'readings').mockResolvedValue(series),
    startRun: vi.spyOn(operationsApi, 'startRun').mockResolvedValue(run('running')),
    controlRun: vi.spyOn(operationsApi, 'controlRun').mockResolvedValue(run('paused')),
    acknowledge: vi.spyOn(operationsApi, 'acknowledge').mockResolvedValue({ ...incident, status: 'acknowledged', acknowledged_at: 'x' }),
    demoSetup: vi.spyOn(operationsApi, 'demoSetup').mockResolvedValue({ created_devices: 2, created_rules: 2, devices, rules: [] }),
  }
  for (const [key, value] of Object.entries(overrides)) {
    ;(spies as Record<string, { mockResolvedValue: (v: unknown) => void }>)[key].mockResolvedValue(value)
  }
  return spies
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/projects/p1/operations']}>
      <Routes>
        <Route path="/app/projects/:id/operations" element={<OperationsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  setRole('editor')
})

afterEach(() => {
  vi.useRealTimers()
})

it('muestra la banda didáctica, gauges simulados, "Sin señal" y la línea con hueco', async () => {
  mockApi('running')
  renderPage()
  expect(await screen.findByRole('note')).toHaveTextContent(DIDACTIC_NOTICE)
  // El primer dispositivo perdió la señal: los gauges no muestran 0 ni el último valor
  const meters = screen.getAllByRole('meter')
  expect(meters).toHaveLength(2)
  meters.forEach((m) => expect(m).toHaveAttribute('aria-valuetext', 'Sin señal'))
  expect(screen.getAllByText('Simulado').length).toBeGreaterThanOrEqual(2)
  // La serie tiene un hueco de 25 min: dos tramos en la gráfica de temperatura
  const chart = screen.getByRole('img', { name: 'Temperatura del aire de Sensor norte' })
  expect(chart.querySelectorAll('path')).toHaveLength(2)
  const scene = screen.getByTestId('scene')
  expect(within(scene).getByText('Sensor norte · Sin señal')).toHaveAttribute('data-stale', 'true')
  expect(within(scene).getByText('Sensor sur · 24.3 °C · 61.0 %')).toHaveAttribute('data-stale', 'false')
  expect(screen.getByText(/Tamaño ilustrativo de 8 × 16 m/)).toBeInTheDocument()
})

it('al elegir otro dispositivo los gauges muestran su último valor', async () => {
  const spies = mockApi('running')
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Sensor sur' }))
  await waitFor(() => expect(screen.getAllByRole('meter')[0]).toHaveAttribute('aria-valuenow', '24.3'))
  expect(spies.readings).toHaveBeenLastCalledWith('p1', { variable: 'relative_humidity', device_id: 'd2' })
})

it('el editor pausa y cancela la corrida en curso', async () => {
  const spies = mockApi('running')
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Pausar' }))
  await waitFor(() => expect(spies.controlRun).toHaveBeenCalledWith('p1', 'r1', 'pause'))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(spies.controlRun).toHaveBeenCalledWith('p1', 'r1', 'cancel'))
})

it('inicia una corrida nueva con el escenario elegido y muestra el 409', async () => {
  const spies = mockApi('completed')
  renderPage()
  fireEvent.change(await screen.findByRole('combobox', { name: 'Escenario' }), { target: { value: 'heat_rise' } })
  fireEvent.click(screen.getByRole('button', { name: 'Nueva corrida' }))
  await waitFor(() => expect(spies.startRun).toHaveBeenCalledWith('p1', 'heat_rise'))
  spies.startRun.mockRejectedValue(
    new AxiosError('conflict', 'ERR', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      data: { error: { code: 'run_active', message: 'Ya hay una simulación activa en este proyecto' } },
      headers: {},
      config: { headers: new AxiosHeaders() },
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Nueva corrida' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Ya hay una simulación activa')
})

it('reconoce un incidente', async () => {
  const spies = mockApi('running')
  renderPage()
  const list = await screen.findByRole('list', { name: 'Incidentes' })
  expect(within(list).getByText('El dispositivo dejó de reportar.')).toBeInTheDocument()
  fireEvent.click(within(list).getByRole('button', { name: 'Reconocer' }))
  await waitFor(() => expect(spies.acknowledge).toHaveBeenCalledWith('p1', 'i1'))
})

it('el viewer ve lecturas e incidentes sin controles', async () => {
  setRole('viewer')
  mockApi('running')
  renderPage()
  await screen.findByRole('list', { name: 'Incidentes' })
  expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Reconocer' })).toBeNull()
})

it('consulta cada 5 s mientras la corrida está en curso y se detiene en pausa', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const spies = mockApi('running')
  renderPage()
  await screen.findByRole('note')
  await waitFor(() => expect(spies.latest).toHaveBeenCalledTimes(1))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS)
  })
  await waitFor(() => expect(spies.latest).toHaveBeenCalledTimes(2))
  spies.runs.mockResolvedValue([run('paused')])
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS)
  })
  await waitFor(() => expect(spies.latest).toHaveBeenCalledTimes(3))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
  })
  expect(spies.latest).toHaveBeenCalledTimes(3)
})

it('sin dispositivos ofrece preparar la demostración', async () => {
  const spies = mockApi(null, { devices: [], latest: { run_id: null, run_status: null, sim_time: null, devices: [] } })
  renderPage()
  expect(await screen.findByText('Sin dispositivos')).toBeInTheDocument()
  expect(screen.getByRole('note')).toHaveTextContent(DIDACTIC_NOTICE)
  fireEvent.click(screen.getByRole('button', { name: 'Preparar demostración' }))
  await waitFor(() => expect(spies.demoSetup).toHaveBeenCalledWith('p1'))
})

it('sin corrida, los sensores muestran "Sin lecturas" y la escena usa el área registrada', async () => {
  mockApi(null, {
    latest: {
      run_id: null,
      run_status: null,
      sim_time: null,
      devices: latest.devices.map((d) => ({ ...d, readings: d.readings.map((r) => ({ ...r, value: null, observed_at: null, stale: false })) })),
    },
  })
  vi.mocked(projectsApi.getProject).mockResolvedValue({ ...project, area_m2: 50 })
  renderPage()
  expect(await screen.findByText('Sin corridas todavía')).toBeInTheDocument()
  expect(screen.getAllByText('Sin lecturas').length).toBeGreaterThanOrEqual(2)
  expect(screen.queryAllByRole('meter')).toHaveLength(0)
  expect(within(screen.getByTestId('scene')).getByText('Sensor norte · Sin lecturas')).toBeInTheDocument()
  expect(screen.getByText(/Nave de 5 × 10 m a partir del área registrada \(50 m²\)/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Iniciar simulación' })).toBeInTheDocument()
})

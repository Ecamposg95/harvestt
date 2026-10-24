import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import * as projectsApi from '@/features/projects/api'
import { projectTabHref } from '@/features/projects/ProjectTabs'
import { impactApi, type Kpi } from './api'
import { KpiFigure } from './KpiFigure'
import { ProjectImpactPage } from './ProjectImpactPage'

vi.mock('@/features/projects/api', () => ({ getProject: vi.fn() }))

beforeEach(() => vi.restoreAllMocks())

export const kpi = (over: Partial<Kpi>): Kpi => ({
  key: 'active_cycles',
  label: 'Ciclos activos',
  value: 2,
  unit: null,
  origin: 'measured',
  formula: 'Número de ciclos del proyecto con estado «activo».',
  inputs_count: 3,
  as_of: '2026-10-22T12:00:00Z',
  ...over,
})

it('sin valor muestra "Sin datos suficientes" y ningún badge de origen', () => {
  render(<KpiFigure kpi={kpi({ value: null, origin: 'derived' })} size="tile" />)
  expect(screen.getByText('Sin datos suficientes')).toBeInTheDocument()
  expect(screen.queryByText('Derivado')).toBeNull()
})

it('con valor 0 muestra "0" y su badge', () => {
  render(<KpiFigure kpi={kpi({ value: 0 })} size="tile" />)
  expect(screen.getByText('0')).toBeInTheDocument()
  expect(screen.getByText('Medido')).toBeInTheDocument()
})

it('muestra unidad junto al valor', () => {
  render(<KpiFigure kpi={kpi({ value: 37.46, unit: '%', origin: 'derived' })} size="hero" />)
  expect(screen.getByText('37.5')).toBeInTheDocument()
  expect(screen.getByText('%')).toBeInTheDocument()
})

it('la fórmula aparece al enfocar o tocar "Cómo se calcula" y Escape la oculta', () => {
  render(<KpiFigure kpi={kpi({})} size="tile" />)
  const button = screen.getByRole('button', { name: /Cómo se calcula/ })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  fireEvent.focus(button)
  expect(button).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('tooltip')).toHaveTextContent('Número de ciclos del proyecto con estado «activo».')
  fireEvent.keyDown(button, { key: 'Escape' })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(button)
  expect(button).toHaveAttribute('aria-expanded', 'true')
})


const PROJECT_KPIS: Kpi[] = [
  kpi({ key: 'active_cycles', label: 'Ciclos activos', value: 2 }),
  kpi({ key: 'days_since_oldest_active_cycle', label: 'Días desde el inicio', value: null, unit: 'días', origin: 'derived' }),
  kpi({ key: 'observations_30d', label: 'Observaciones 30 días', value: 5 }),
  kpi({ key: 'evidence_coverage', label: 'Cobertura de evidencia', value: 40, unit: '%', origin: 'derived' }),
  kpi({ key: 'sources_cited', label: 'Fuentes citadas', value: 1 }),
  kpi({ key: 'simulation_runs', label: 'Corridas de simulación', value: 3, origin: 'simulated' }),
  kpi({ key: 'incidents_open', label: 'Incidentes abiertos', value: 0, origin: 'simulated' }),
  kpi({ key: 'incidents_acknowledged', label: 'Incidentes reconocidos', value: 1, origin: 'simulated' }),
  kpi({ key: 'mean_minutes_to_acknowledge', label: 'Tiempo medio a reconocer', value: 6, unit: 'min', origin: 'simulated' }),
  kpi({ key: 'future_kpi', label: 'KPI desconocido', value: 9 }),
]

function renderProjectImpact() {
  return render(
    <MemoryRouter initialEntries={['/app/projects/p1/impact']}>
      <Routes>
        <Route path="/app/projects/:id/impact" element={<ProjectImpactPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function mockProject() {
  vi.mocked(projectsApi.getProject).mockResolvedValue({ id: 'p1', name: 'Invernadero demostrativo' } as projectsApi.ProjectDetail)
}

it('projectTabHref de impacto', () => expect(projectTabHref('p1', 'impacto')).toBe('/app/projects/p1/impact'))

it('agrupa los KPIs, marca la pestaña Impacto y muestra "Sin datos suficientes" en los null', async () => {
  mockProject()
  vi.spyOn(impactApi, 'project').mockResolvedValue({ project_id: 'p1', as_of: '2026-10-22T12:00:00Z', kpis: PROJECT_KPIS })
  renderProjectImpact()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Invernadero demostrativo' })).toBeInTheDocument())
  expect(screen.getByRole('link', { name: 'Impacto' })).toHaveAttribute('aria-current', 'page')
  const cultivo = screen.getByRole('region', { name: 'Cultivo' })
  expect(within(cultivo).getByText('Ciclos activos')).toBeInTheDocument()
  expect(within(cultivo).getByText('Sin datos suficientes')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Evidencia' })).getByText('Fuentes citadas')).toBeInTheDocument()
  const sim = screen.getByRole('region', { name: 'Operación simulada' })
  expect(within(sim).getByText('Tiempo medio a reconocer')).toBeInTheDocument()
  expect(within(sim).getAllByText('Simulado')).toHaveLength(4)
  expect(screen.queryByText('KPI desconocido')).toBeNull()
  expect(screen.getByText(/Actualizado:/)).toBeInTheDocument()
})

it('error muestra reintento', async () => {
  mockProject()
  vi.spyOn(impactApi, 'project').mockRejectedValue(new Error('x'))
  renderProjectImpact()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument())
})

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { homeApi, HomeData } from './api'
import { HomePage } from './HomePage'

const base: HomeData = {
  recent_project: null,
  counts: { projects: 0, crop_cycles: 0, observations: 0, sources_cited: 0 },
  activity: [],
}

beforeEach(() => vi.restoreAllMocks())

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

it('sin proyectos invita a crear uno y no muestra lecturas', async () => {
  vi.spyOn(homeApi, 'get').mockResolvedValue(base)
  renderPage()
  await waitFor(() => expect(screen.getByText('Aún no hay proyectos')).toBeInTheDocument())
  expect(screen.getByRole('link', { name: 'Crear proyecto' })).toHaveAttribute('href', '/app/projects')
  expect(screen.getAllByText('Sin lecturas').length).toBeGreaterThanOrEqual(2)
  expect(screen.queryByText(/°C/)).toBeNull()
})

it('con proyecto muestra héroe, conteos reales y actividad', async () => {
  vi.spyOn(homeApi, 'get').mockResolvedValue({
    recent_project: { id: 'p1', name: 'Demo lechuga', system: 'hydroponic', area_m2: 12, species: ['Lactuca sativa L.'] },
    counts: { projects: 1, crop_cycles: 1, observations: 3, sources_cited: 0 },
    activity: [{ id: 'a1', text: 'Proyecto creado: Demo lechuga', resource_type: 'project', resource_id: 'p1', created_at: '2026-10-20T10:00:00Z' }],
  })
  renderPage()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Demo lechuga' })).toBeInTheDocument())
  expect(screen.getByText(/Lactuca sativa L\./)).toBeInTheDocument()
  expect(screen.getByText(/12 m²/)).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
  expect(screen.getByText('Proyecto creado: Demo lechuga')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Abrir proyecto' })).toHaveAttribute('href', '/app/projects/p1')
})

it('error muestra reintento', async () => {
  vi.spyOn(homeApi, 'get').mockRejectedValue(new Error('x'))
  renderPage()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument())
})

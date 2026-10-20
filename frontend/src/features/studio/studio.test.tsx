import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as projectsApi from '@/features/projects/api'
import * as webgl from '@/features/three/webgl'
import { useAuth } from '@/store/auth'
import * as api from './api'
import { StudioPage } from './StudioPage'

vi.mock('./api', () => ({ getLayout: vi.fn(), saveLayout: vi.fn() }))
vi.mock('@/features/projects/api', () => ({ getProject: vi.fn() }))
vi.mock('@/features/three/webgl', () => ({ webglAvailable: vi.fn(() => false) }))
vi.mock('./LazyStudioScene', () => ({
  StudioScene: ({ label, zones }: { label: string; zones: unknown[] }) => (
    <div data-testid="studio-3d" aria-label={label}>
      {zones.length}
    </div>
  ),
}))

const mocked = vi.mocked(api)

function setRole(role: 'viewer' | 'editor') {
  const org = { id: 'o1', name: 'Alfa', slug: 'alfa' }
  useAuth.setState({
    token: 't',
    organizationId: 'o1',
    user: { id: 'u1', email: 'a@a.test', full_name: 'A', is_superadmin: false },
    memberships: [{ organization: org, role }],
  })
}

const project: projectsApi.ProjectDetail = {
  id: 'p1',
  name: 'Invernadero norte',
  objectives: null,
  area_m2: 100,
  system: 'hydroponic',
  location: null,
  version: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  crop_cycles: [
    {
      id: 'c1',
      project_id: 'p1',
      species_id: 's1',
      species_name: 'Lactuca sativa L.',
      cultivar_id: null,
      cultivar_name: null,
      started_on: '2026-10-01',
      stage: 'unknown',
      status: 'active',
      created_at: '2026-10-01T00:00:00Z',
    },
  ],
}

const layout: api.Layout = {
  project_id: 'p1',
  version: 3,
  area_m2: 100,
  floor: { width: 10, depth: 10, illustrative: false },
  zones: [
    {
      id: 'z1',
      name: 'Mesa A',
      x: 0,
      y: 0,
      width: 4,
      depth: 2,
      placements: [
        { id: 'pl1', species_id: 's1', species_name: 'Lactuca sativa L.', crop_cycle_id: 'c1', stage: 'mature', x: 0.5, y: 0.5, rotation: 0 },
      ],
    },
  ],
}

function renderStudio() {
  return render(
    <MemoryRouter initialEntries={['/app/projects/p1/studio']}>
      <Routes>
        <Route path="/app/projects/:id/studio" element={<StudioPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(webgl.webglAvailable).mockReturnValue(false)
  vi.mocked(projectsApi.getProject).mockResolvedValue(project)
  mocked.getLayout.mockResolvedValue(layout)
  setRole('editor')
})

it('sin WebGL muestra la vista superior SVG con el aviso ilustrativo', async () => {
  renderStudio()
  const view = await screen.findByRole('img', { name: 'Studio de Invernadero norte' })
  expect(view.tagName.toLowerCase()).toBe('svg')
  expect(screen.getByRole('note')).toHaveTextContent('Representación ilustrativa; no predice crecimiento')
  expect(screen.getByText(/Vista superior 2D/)).toBeInTheDocument()
  expect(screen.queryByTestId('studio-3d')).toBeNull()
})

it('con WebGL usa la escena 3D', async () => {
  vi.mocked(webgl.webglAvailable).mockReturnValue(true)
  renderStudio()
  expect(await screen.findByTestId('studio-3d')).toHaveTextContent('1')
})

it('seleccionar una planta muestra especie, etapa, ciclo y posición', async () => {
  setRole('viewer')
  renderStudio()
  fireEvent.click(await screen.findByRole('button', { name: 'Lactuca sativa L. · Madura' }))
  expect(screen.getByRole('heading', { name: 'Planta seleccionada' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Lactuca sativa L.' })).toHaveAttribute('href', '/app/plants/s1')
  expect(screen.getByText('Madura')).toBeInTheDocument()
  expect(screen.getByText(/Activo · inicio 2026-10-01/)).toBeInTheDocument()
  expect(screen.getByText('0.50 × 0.50 m')).toBeInTheDocument()
  // El viewer no tiene modo edición
  expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  expect(screen.queryByLabelText('X en la zona (m)')).toBeNull()
})

it('editar: agregar una planta del ciclo, moverla y guardar con la versión', async () => {
  mocked.saveLayout.mockResolvedValue({ ...layout, version: 4 })
  renderStudio()
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Zona Mesa A' }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar planta' }))
  // La planta nueva queda seleccionada; X se limita al ancho de la zona
  fireEvent.change(screen.getByLabelText('X en la zona (m)'), { target: { value: '9' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar layout' }))
  await waitFor(() => expect(mocked.saveLayout).toHaveBeenCalled())
  const [projectId, version, zones] = mocked.saveLayout.mock.calls[0]
  expect(projectId).toBe('p1')
  expect(version).toBe(3)
  expect(zones[0].placements).toHaveLength(2)
  expect(zones[0].placements[1]).toMatchObject({ species_id: 's1', crop_cycle_id: 'c1', stage: 'vegetative', x: 4 })
  expect(await screen.findByText('Layout guardado (versión 4).')).toBeInTheDocument()
})

it('un 409 al guardar muestra el aviso y recarga', async () => {
  mocked.saveLayout.mockRejectedValue(
    new AxiosError('conflict', 'ERR', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      data: { error: { code: 'version_conflict', message: 'x' } },
      headers: {},
      config: { headers: new AxiosHeaders() },
    }),
  )
  renderStudio()
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar zona' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar layout' }))
  expect(await screen.findByText(/Otra persona guardó el layout/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cargar versión actual' }))
  await waitFor(() => expect(mocked.getLayout).toHaveBeenCalledTimes(2))
})

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import type { PlantViewerProps } from '@/features/three/plants/types'
import { useAuth } from '@/store/auth'
import * as api from './api'
import { PlantDetailPage } from './PlantDetailPage'
import { PlantsPage } from './PlantsPage'

vi.mock('./api', () => ({
  listPlants: vi.fn(),
  listFamilies: vi.fn(),
  getPlant: vi.fn(),
  getSource: vi.fn(),
}))

vi.mock('@/features/three/plants/thumbnails', () => ({
  renderPlantThumbnail: vi.fn(() => 'data:image/png;base64,iVBORw0KGgo='),
}))

vi.mock('@/features/three/plants/LazyPlantViewer', () => ({
  PlantViewer: ({ kind, stage, label, callouts }: PlantViewerProps) => (
    <div data-testid="plant-viewer" data-kind={kind} data-stage={stage} aria-label={label}>
      {(callouts ?? []).map((c) => c.label).join('|')}
    </div>
  ),
}))

const mocked = vi.mocked(api)

const lettuce: api.SpeciesSummary = {
  id: 's1',
  scientific_name: 'Lactuca sativa L.',
  authorship: 'L.',
  family: 'Asteraceae',
  common_names: [
    { lang: 'es', name: 'lechuga' },
    { lang: 'en', name: 'lettuce' },
  ],
}

function setRole(role: 'viewer' | 'editor') {
  const org = { id: 'o1', name: 'Alfa', slug: 'alfa' }
  useAuth.setState({
    token: 't',
    organizationId: 'o1',
    user: { id: 'u1', email: 'a@a.test', full_name: 'A', is_superadmin: false },
    memberships: [{ organization: org, role }],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setRole('viewer')
})

it('PlantsPage muestra tarjetas y envía la búsqueda desde la URL', async () => {
  mocked.listFamilies.mockResolvedValue(['Asteraceae', 'Solanaceae'])
  mocked.listPlants.mockResolvedValue({ items: [lettuce], total: 1, page: 1, page_size: 24 })

  render(
    <MemoryRouter initialEntries={['/app/plants?q=lechuga&family=Asteraceae']}>
      <Routes>
        <Route path="/app/plants" element={<PlantsPage />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByText('Lactuca sativa')).toBeInTheDocument()
  expect(screen.getByText('lechuga')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Lactuca sativa/ })).toHaveAttribute('href', '/app/plants/s1')
  expect(mocked.listPlants).toHaveBeenCalledWith({ q: 'lechuga', family: 'Asteraceae', page: 1, page_size: 24 })
  expect(screen.getByRole('searchbox')).toHaveValue('lechuga')
})

it('PlantsPage muestra estado vacío sin coincidencias', async () => {
  mocked.listFamilies.mockResolvedValue([])
  mocked.listPlants.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 24 })
  render(
    <MemoryRouter initialEntries={['/app/plants?q=zzz']}>
      <PlantsPage />
    </MemoryRouter>,
  )
  expect(await screen.findByText('Sin coincidencias')).toBeInTheDocument()
})

const detail: api.SpeciesDetail = {
  ...lettuce,
  summary: null,
  external_ids: { gbif: { id: '7403263', source_id: 'src1', url: 'https://www.gbif.org/species/7403263' } },
  cultivars: [],
  sources: [
    { id: 'src1', title: 'GBIF Backbone Taxonomy', publisher: 'GBIF', url: 'https://www.gbif.org/', license: 'CC BY 4.0', accessed_at: null, rights: null },
  ],
  trait_assertions: [
    {
      id: 'a1',
      subject_type: 'species',
      subject_id: 's1',
      variable: 'ph',
      value_min: null,
      value_max: null,
      unit: '[pH]',
      growth_stage: 'unknown',
      cultivation_system: 'unknown',
      origin: 'missing',
      review_status: 'unreviewed',
      evidence_refs: [],
      notes: null,
      sources: [],
    },
  ],
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/app/plants/s1']}>
      <Routes>
        <Route path="/app/plants/:id" element={<PlantDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

it('PlantDetailPage muestra valores faltantes como Desconocido y oculta acciones al viewer', async () => {
  mocked.getPlant.mockResolvedValue(detail)
  renderDetail()
  // El valor faltante y el OriginBadge "Desconocido" coinciden en texto
  expect((await screen.findAllByText('Desconocido')).length).toBeGreaterThanOrEqual(2)
  expect(screen.getByText('7403263')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Añadir a proyecto' })).not.toBeInTheDocument()
})

it('PlantDetailPage ofrece "Añadir a proyecto" al editor', async () => {
  setRole('editor')
  mocked.getPlant.mockResolvedValue(detail)
  renderDetail()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Añadir a proyecto' })).toBeInTheDocument())
})

it('la ficha muestra el nombre científico como titular display', async () => {
  mocked.getPlant.mockResolvedValue(detail)
  renderDetail()
  const heading = await screen.findByRole('heading', { level: 1 })
  expect(heading.className).toContain('display')
})

it('sin imagen, la ficha muestra la planta procedural madura etiquetada como ilustrativa', async () => {
  mocked.getPlant.mockResolvedValue(detail)
  renderDetail()
  const viewer = await screen.findByTestId('plant-viewer')
  expect(viewer).toHaveAttribute('data-kind', 'lettuce')
  expect(viewer).toHaveAttribute('data-stage', 'mature')
  expect(viewer).toHaveTextContent('pH: Desconocido')
  expect(screen.getByText('Ilustrativo')).toBeInTheDocument()
  expect(screen.getByText(/Representación ilustrativa; no predice crecimiento/)).toBeInTheDocument()
})

it('una especie sin generador propio usa la forma genérica y lo dice', async () => {
  mocked.getPlant.mockResolvedValue({ ...detail, scientific_name: 'Capsicum annuum L.' })
  renderDetail()
  expect(await screen.findByTestId('plant-viewer')).toHaveAttribute('data-kind', 'generic')
  expect(screen.getByText(/Forma genérica/)).toBeInTheDocument()
})

it('las tarjetas muestran una miniatura procedural etiquetada como ilustrativa', async () => {
  mocked.listFamilies.mockResolvedValue([])
  mocked.listPlants.mockResolvedValue({ items: [lettuce], total: 1, page: 1, page_size: 24 })
  render(
    <MemoryRouter initialEntries={['/app/plants']}>
      <PlantsPage />
    </MemoryRouter>,
  )
  const img = await screen.findByRole('img', { name: 'Ilustración de Lactuca sativa L.' })
  expect(img).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=')
  expect(screen.getByText('Ilustrativo')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Lactuca sativa/ })).toHaveAttribute('href', '/app/plants/s1')
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/store/auth'
import * as api from './api'
import { relativePoint } from './mediaPoint'
import { PlantDetailPage } from './PlantDetailPage'

vi.mock('./api', () => ({
  listPlants: vi.fn(),
  listFamilies: vi.fn(),
  getPlant: vi.fn(),
  getSource: vi.fn(),
  uploadSpeciesMedia: vi.fn(),
  deleteSpeciesMedia: vi.fn(),
}))
vi.mock('@/features/prototypes/shared', () => ({
  AuthedImage: ({ alt, className }: { alt: string; className?: string }) => <img alt={alt} className={className} />,
}))
vi.mock('@/features/three/plants/LazyPlantViewer', () => ({
  PlantViewer: () => <div data-testid="plant-viewer" />,
}))

const mocked = vi.mocked(api)

function setUser(superadmin: boolean) {
  const org = { id: 'o1', name: 'Alfa', slug: 'alfa' }
  useAuth.setState({
    token: 't',
    organizationId: 'o1',
    user: { id: 'u1', email: 'a@a.test', full_name: 'A', is_superadmin: superadmin },
    memberships: [{ organization: org, role: 'viewer' }],
  })
}

function assertion(variable: string, extra: Partial<api.TraitAssertion> = {}): api.TraitAssertion {
  return {
    id: `a-${variable}`,
    subject_type: 'species',
    subject_id: 's1',
    variable,
    value_min: null,
    value_max: null,
    unit: null,
    growth_stage: 'unknown',
    cultivation_system: 'unknown',
    origin: 'missing',
    review_status: 'unreviewed',
    evidence_refs: [],
    notes: null,
    sources: [],
    ...extra,
  }
}

const hero: api.SpeciesMedia = {
  id: 'm1',
  species_id: 's1',
  kind: 'photo',
  content_type: 'image/png',
  license: 'CC BY 4.0',
  attribution: 'Ana Pérez',
  source_url: 'https://example.org/foto',
  is_hero: true,
  width: 640,
  height: 480,
  callouts: [
    { trait_variable: 'ph', x: 0.2, y: 0.3 },
    { trait_variable: 'air_temperature', x: 0.8, y: 0.5 },
  ],
  url: '/plants/s1/media/m1/file',
  created_at: '2026-10-20T00:00:00Z',
}

const species: api.SpeciesDetail = {
  id: 's1',
  scientific_name: 'Lactuca sativa L.',
  authorship: 'L.',
  family: 'Asteraceae',
  common_names: [{ lang: 'es', name: 'lechuga' }],
  summary: null,
  external_ids: null,
  cultivars: [],
  sources: [],
  trait_assertions: [
    assertion('ph', { unit: '[pH]' }),
    assertion('air_temperature', { value_min: 18, value_max: 24, unit: 'Cel', origin: 'sourced' }),
  ],
  media: [hero],
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

beforeEach(() => {
  vi.clearAllMocks()
  setUser(false)
})

describe('héroe con imagen', () => {
  it('muestra la imagen, el crédito y callouts con valor u «Desconocido» y su origen', async () => {
    mocked.getPlant.mockResolvedValue(species)
    renderDetail()
    expect(await screen.findByRole('img', { name: 'Imagen de Lactuca sativa L.' })).toBeInTheDocument()
    const credit = screen.getByText(/Ana Pérez/).closest('figcaption')!
    expect(credit).toHaveTextContent('Foto: Ana Pérez · Licencia CC BY 4.0 · Fuente')
    expect(within(credit).getByRole('link', { name: 'Fuente' })).toHaveAttribute('href', 'https://example.org/foto')
    const callouts = screen.getAllByTestId('media-callout')
    expect(callouts).toHaveLength(2)
    expect(callouts[0].style.left).toBe('20%')
    expect(callouts[0].style.top).toBe('30%')
    expect(callouts[0]).toHaveTextContent('pH: Desconocido')
    expect(within(callouts[0]).getByText('Desconocido', { selector: 'span.inline-flex' })).toBeInTheDocument()
    expect(callouts[1]).toHaveTextContent('Temperatura del aire: 18 – 24 °C')
    expect(within(callouts[1]).getByText('Fuente')).toBeInTheDocument()
    expect(screen.queryByTestId('plant-viewer')).toBeNull()
  })

  it('sin imagen héroe vuelve a la planta 3D ilustrativa', async () => {
    mocked.getPlant.mockResolvedValue({ ...species, media: [{ ...hero, is_hero: false }] })
    renderDetail()
    expect(await screen.findByTestId('plant-viewer')).toBeInTheDocument()
    expect(screen.queryAllByTestId('media-callout')).toHaveLength(0)
  })
})

describe('panel de medios', () => {
  it('solo el superadmin lo ve', async () => {
    mocked.getPlant.mockResolvedValue(species)
    renderDetail()
    await screen.findByRole('img', { name: 'Imagen de Lactuca sativa L.' })
    expect(screen.queryByRole('form', { name: 'Subir medio' })).toBeNull()
  })

  it('el superadmin sube una imagen con licencia y atribución', async () => {
    setUser(true)
    mocked.getPlant.mockResolvedValue({ ...species, media: [] })
    mocked.uploadSpeciesMedia.mockResolvedValue(hero)
    renderDetail()
    const form = await screen.findByRole('form', { name: 'Subir medio' })
    const file = new File(['png'], 'lechuga.png', { type: 'image/png' })
    fireEvent.change(within(form).getByLabelText('Imagen'), { target: { files: [file] } })
    fireEvent.change(within(form).getByLabelText('Licencia (SPDX o nombre)'), { target: { value: 'CC BY 4.0' } })
    fireEvent.change(within(form).getByLabelText('Atribución'), { target: { value: 'Ana Pérez' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Subir imagen' }))
    await waitFor(() =>
      expect(mocked.uploadSpeciesMedia).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ file, license: 'CC BY 4.0', attribution: 'Ana Pérez', is_hero: true, callouts: [] }),
      ),
    )
    await waitFor(() => expect(mocked.getPlant).toHaveBeenCalledTimes(2))
  })

  it('borrar pide confirmación', async () => {
    setUser(true)
    mocked.getPlant.mockResolvedValue(species)
    mocked.deleteSpeciesMedia.mockResolvedValue(undefined)
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }))
    expect(mocked.deleteSpeciesMedia).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }))
    await waitFor(() => expect(mocked.deleteSpeciesMedia).toHaveBeenCalledWith('s1', 'm1'))
  })
})

describe('relativePoint', () => {
  it('convierte el clic a 0..1 sobre la imagen y lo limita', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 }
    expect(relativePoint(150, 75, rect)).toEqual({ x: 0.25, y: 0.25 })
    expect(relativePoint(500, 0, rect)).toEqual({ x: 1, y: 0 })
    expect(relativePoint(150, 75, { ...rect, width: 0 })).toBeNull()
  })
})

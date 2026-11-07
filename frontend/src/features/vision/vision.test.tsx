import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { prototypesApi } from '@/features/prototypes/api'
import { PublicLayout } from '@/layouts/PublicLayout'
import { visionApi, type Vision } from './api'
import { webglAvailable } from '@/features/three/webgl'
import { prefersReducedMotion } from './geo'
import { VisionPage } from './VisionPage'

vi.mock('@/features/prototypes/LazyStlViewer', () => ({
  StlViewer: ({ label }: { label: string }) => <div data-testid="stl" aria-label={label} />,
}))

vi.mock('@/features/three/webgl', () => ({ webglAvailable: vi.fn(() => false) }))
vi.mock('./geo', async (orig) => ({ ...(await orig<typeof import('./geo')>()), prefersReducedMotion: vi.fn(() => false) }))
vi.mock('./LazyGlobe', () => ({
  LazyGlobe: ({ animate }: { animate: boolean }) => <div data-testid="globe" data-animate={String(animate)} />,
}))

beforeEach(() => vi.restoreAllMocks())

const VISION: Vision = {
  as_of: '2026-11-07T12:00:00Z',
  figures: [
    { key: 'prototypes', label: 'Prototipos construidos', value: 3, status: 'available', origin: 'measured', formula: 'Prototipos publicados.' },
    { key: 'operating_nodes', label: 'Nodos operando', value: null, status: 'available', origin: 'measured', formula: 'Nodos con lecturas reales.' },
    { key: 'signed_readings', label: 'Lecturas firmadas', value: null, status: 'soon', origin: 'measured', formula: 'Aún no existe.' },
    { key: 'recognitions', label: 'Reconocimientos', value: 2, status: 'available', origin: 'measured', formula: 'Con evidencia.' },
  ],
  layers: [
    { key: 'history', status: 'done', reason: 'r' },
    { key: 'cortex', status: 'operating', reason: 'r' },
    { key: 'knowledge', status: 'in_construction', reason: 'r' },
    { key: 'trust', status: 'vision', reason: 'r' },
    { key: 'commons', status: 'vision', reason: 'r' },
  ],
  sites: [],
}

function renderPage() {
  vi.spyOn(prototypesApi, 'publicList').mockResolvedValue([
    {
      slug: 'geo', name: 'Geodésico', codename: null, purpose: '', summary: '', status: 'operating' as never,
      published_at: null, hero: null,
      model: { id: 'a', kind: 'model', url: '/m.stl', caption: '' } as never,
    },
  ])
  return render(
    <MemoryRouter>
      <VisionPage />
    </MemoryRouter>,
  )
}

it('renderiza cifras: "pronto" para soon, "Sin datos suficientes" para null y valor con badge', async () => {
  vi.spyOn(visionApi, 'summary').mockResolvedValue(VISION)
  renderPage()
  expect(await screen.findByText('Prototipos construidos')).toBeInTheDocument()
  expect(within(screen.getByText('Lecturas firmadas').parentElement!).getByText('pronto')).toBeInTheDocument()
  expect(within(screen.getByText('Nodos operando').parentElement!).getByText('Sin datos suficientes')).toBeInTheDocument()
  const proto = screen.getByText('Prototipos construidos').parentElement!
  expect(within(proto).getByText('3')).toBeInTheDocument()
  expect(within(proto).getByText('Medido')).toBeInTheDocument()
})

it('muestra las cinco capas en orden con su etiqueta de estado', async () => {
  vi.spyOn(visionApi, 'summary').mockResolvedValue(VISION)
  const { container } = renderPage()
  await screen.findByText('Prototipos construidos')
  const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
  expect(titles).toEqual([
    '2017–2018 · Prototipos físicos',
    'Hoy · HarvestT Cortex',
    'Capa 1 · Ontología, bancos de plantas y mapa',
    'Capa 2 · Red de confianza',
    'Capa 3 · harvestt.org',
  ])
  const knowledge = screen.getByRole('heading', { level: 3, name: /Capa 1/ }).closest('article')!
  expect(within(knowledge).getByText('En construcción')).toBeInTheDocument()
  expect(await screen.findByTestId('stl')).toBeInTheDocument()
  expect(within(container.querySelector('header')!).getByTestId('globe-slot')).toBeInTheDocument()
})

it('muestra error con reintento', async () => {
  const spy = vi.spyOn(visionApi, 'summary').mockRejectedValueOnce(new Error('x')).mockResolvedValue(VISION)
  renderPage()
  const retry = await screen.findByRole('button', { name: 'Reintentar' })
  fireEvent.click(retry)
  await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
  expect(await screen.findByText('Prototipos construidos')).toBeInTheDocument()
})

it('PublicLayout enlaza a /vision', () => {
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<p>contenido</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name: 'Visión' })).toHaveAttribute('href', '/vision')
})

const SITES: Vision['sites'] = [
  { kind: 'historic', label: 'CDMX · prototipos históricos', lat: 19.4, lon: -99.1 },
  { kind: 'future', label: 'Bogotá', lat: 4.7, lon: -74.1 },
]

it('sin WebGL usa GlobeFallback con la lista de sitios', async () => {
  vi.mocked(webglAvailable).mockReturnValue(false)
  vi.spyOn(visionApi, 'summary').mockResolvedValue({ ...VISION, sites: SITES })
  renderPage()
  expect(await screen.findByText('CDMX · prototipos históricos')).toBeInTheDocument()
  expect(screen.getByText('prototipo histórico')).toBeInTheDocument()
  expect(screen.getByText('nodo solicitado')).toBeInTheDocument()
  expect(screen.queryByTestId('globe')).toBeNull()
})

it('con movimiento reducido el globo recibe animate=false', async () => {
  vi.mocked(webglAvailable).mockReturnValue(true)
  vi.mocked(prefersReducedMotion).mockReturnValue(true)
  vi.spyOn(visionApi, 'summary').mockResolvedValue({ ...VISION, sites: SITES })
  renderPage()
  expect(await screen.findByTestId('globe')).toHaveAttribute('data-animate', 'false')
})

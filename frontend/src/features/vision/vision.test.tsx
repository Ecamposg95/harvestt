import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { prototypesApi } from '@/features/prototypes/api'
import { PublicLayout } from '@/layouts/PublicLayout'
import { visionAdminApi, visionApi, type InboundRequest, type Vision } from './api'
import { Sidebar } from '@/components/Sidebar'
import { useAuth } from '@/store/auth'
import { RequestsInboxPage } from './RequestsInboxPage'
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

it('webglAvailable se consulta una sola vez aunque la página se vuelva a renderizar', async () => {
  vi.mocked(webglAvailable).mockClear()
  vi.mocked(webglAvailable).mockReturnValue(false)
  const spy = vi.spyOn(visionApi, 'summary').mockResolvedValue({ ...VISION, sites: SITES })
  renderPage()
  fireEvent.click(await screen.findByText('CDMX · prototipos históricos').then(() => document.body))
  await screen.findByText('Prototipos construidos')
  expect(spy).toHaveBeenCalledTimes(1)
  expect(webglAvailable).toHaveBeenCalledTimes(1)
})

async function openForm(label: string) {
  vi.spyOn(visionApi, 'summary').mockResolvedValue(VISION)
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: label }))
  return screen.findByRole('dialog')
}

function fill(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Ana Pérez' } })
  fireEvent.change(within(dialog).getByLabelText('Correo'), { target: { value: 'ana@example.org' } })
  fireEvent.change(within(dialog).getByLabelText('Mensaje'), { target: { value: 'Quiero operar un nodo en mi huerto.' } })
}

it('envía solicitud de nodo sin coordenadas si no se marca ubicación', async () => {
  const send = vi.spyOn(visionApi, 'sendRequest').mockResolvedValue(undefined)
  const dialog = await openForm('Únete como nodo')
  expect(within(dialog).getByLabelText('Nombre')).toHaveFocus()
  fill(dialog)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }))
  expect(await screen.findByText('Gracias. El equipo revisará tu solicitud y te escribirá.')).toBeInTheDocument()
  expect(send).toHaveBeenCalledTimes(1)
  const body = send.mock.calls[0][0]
  expect(body).toMatchObject({ kind: 'node', name: 'Ana Pérez', email: 'ana@example.org', website: '' })
  expect(body).not.toHaveProperty('lat')
  expect(body).not.toHaveProperty('lon')
})

it('con la casilla marcada envía lat y lon juntas; si se niega, envía sin ellas', async () => {
  const send = vi.spyOn(visionApi, 'sendRequest').mockResolvedValue(undefined)
  const getCurrentPosition = vi.fn((ok: (p: unknown) => void) => ok({ coords: { latitude: 19.43, longitude: -99.13 } }))
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  const dialog = await openForm('Únete como nodo')
  fill(dialog)
  fireEvent.click(within(dialog).getByLabelText('Compartir mi ubicación aproximada (ciudad)'))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }))
  await screen.findByText(/Gracias/)
  expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0][0]).toMatchObject({ lat: 19.43, lon: -99.13 })
})

it('si la geolocalización falla envía sin coordenadas y sin error', async () => {
  const send = vi.spyOn(visionApi, 'sendRequest').mockResolvedValue(undefined)
  const getCurrentPosition = vi.fn((_ok: unknown, fail: () => void) => fail())
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
  const dialog = await openForm('Únete como nodo')
  fill(dialog)
  fireEvent.click(within(dialog).getByLabelText('Compartir mi ubicación aproximada (ciudad)'))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }))
  await screen.findByText(/Gracias/)
  expect(send.mock.calls[0][0]).not.toHaveProperty('lat')
  expect(send.mock.calls[0][0]).not.toHaveProperty('lon')
})

it('muestra error de validación del servidor junto al correo', async () => {
  const err = Object.assign(new Error('422'), {
    isAxiosError: true,
    response: { status: 422, data: { detail: [{ loc: ['body', 'email'], msg: 'Correo no válido', type: 'value_error' }] } },
  })
  vi.spyOn(visionApi, 'sendRequest').mockRejectedValue(err)
  const dialog = await openForm('Habla con el equipo')
  fill(dialog)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }))
  const msg = await within(dialog).findByText('Correo no válido')
  expect(within(dialog).getByLabelText('Correo')).toHaveAccessibleDescription('Correo no válido')
  expect(msg).toBeVisible()
  expect(within(dialog).queryByLabelText('Ciudad')).toBeNull()
})

it('Escape cierra el diálogo', async () => {
  await openForm('Habla con el equipo')
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

function setSuper(is_superadmin: boolean) {
  useAuth.setState({ user: { id: 'u', email: 'a@b.c', full_name: 'A', is_superadmin }, memberships: [] })
}

it('la entrada Solicitudes solo aparece para superadmin', () => {
  const view = (
    <MemoryRouter>
      <Sidebar mobileOpen={false} onClose={() => undefined} />
    </MemoryRouter>
  )
  setSuper(false)
  const { unmount } = render(view)
  expect(screen.queryByRole('link', { name: 'Solicitudes' })).toBeNull()
  unmount()
  setSuper(true)
  render(view)
  expect(screen.getByRole('link', { name: 'Solicitudes' })).toHaveAttribute('href', '/app/solicitudes')
})

const REQ: InboundRequest = {
  id: 'r1', kind: 'node', name: 'Ana Pérez', organization: 'Huerto Sur', email: 'ana@example.org', city: 'Bogotá',
  lat: 4.7, lon: -74.1, message: 'Quiero operar un nodo.', status: 'pending', review_note: null, reviewed_by: null,
  reviewed_at: null, created_at: '2026-11-01T10:00:00Z',
}

it('Solicitudes: sin superadmin muestra «Solo superadmin.» y no consulta', () => {
  setSuper(false)
  const list = vi.spyOn(visionAdminApi, 'list').mockResolvedValue([])
  render(<RequestsInboxPage />)
  expect(screen.getByText('Solo superadmin.')).toBeInTheDocument()
  expect(list).not.toHaveBeenCalled()
})

it('aprobar llama a review y la tarjeta sale de Pendientes', async () => {
  setSuper(true)
  const list = vi.spyOn(visionAdminApi, 'list').mockResolvedValue([REQ])
  const review = vi.spyOn(visionAdminApi, 'review').mockResolvedValue({ ...REQ, status: 'approved' })
  render(<RequestsInboxPage />)
  expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
  expect(list).toHaveBeenCalledWith('pending')
  expect(screen.getByText('Aprobar una solicitud de nodo con ubicación la muestra en el globo público, redondeada a nivel ciudad.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
  await waitFor(() => expect(screen.queryByText('Ana Pérez')).toBeNull())
  expect(review).toHaveBeenCalledWith('r1', 'approved', undefined)
})

it('rechazar exige nota', async () => {
  setSuper(true)
  vi.spyOn(visionAdminApi, 'list').mockResolvedValue([REQ])
  const review = vi.spyOn(visionAdminApi, 'review').mockResolvedValue({ ...REQ, status: 'rejected' })
  render(<RequestsInboxPage />)
  await screen.findByText('Ana Pérez')
  fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }))
  expect(await screen.findByText('Escribe el motivo del rechazo.')).toBeInTheDocument()
  expect(review).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Motivo del rechazo'), { target: { value: 'Fuera de alcance' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }))
  await waitFor(() => expect(review).toHaveBeenCalledWith('r1', 'rejected', 'Fuera de alcance'))
  await waitFor(() => expect(screen.queryByText('Ana Pérez')).toBeNull())
})

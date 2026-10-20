import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { kindFromFilename, prototypesApi, PublicPrototypeDetail } from './api'
import { Gallery } from './Gallery'
import { PrototypePublicPage } from './PrototypePublicPage'
import { RichText } from './shared'
import { ShowcasePage } from './ShowcasePage'
import { STATUS_ORDER, statusLabel, statusTone } from './status'
import { PublicLayout } from '@/layouts/PublicLayout'

vi.mock('./LazyStlViewer', () => ({
  StlViewer: ({ label, hotspots }: { label: string; hotspots?: { label: string }[] }) => (
    <div data-testid="stl-viewer">
      {label}
      <span data-testid="viewer-points">{(hotspots ?? []).map((h) => h.label).join('|')}</span>
    </div>
  ),
}))

function notFound() {
  const headers = new AxiosHeaders()
  return new AxiosError('404', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 404,
    statusText: 'Not Found',
    data: { error: { code: 'not_found', message: 'No se encontró el prototipo' } },
    headers,
    config: { headers },
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('status', () => {
  it('traduce cada estado al español', () => {
    expect(statusLabel('in_construction')).toBe('En construcción')
    expect(statusLabel('operational')).toBe('Operativo')
    expect(statusLabel('testing')).toBe('En pruebas')
    expect(STATUS_ORDER.every((s) => statusLabel(s) !== s)).toBe(true)
    expect(statusTone('operational')).toBe('accent')
    expect(statusLabel('desconocido')).toBe('desconocido')
  })

  it('detecta el tipo por extensión', () => {
    expect(kindFromFilename('Foto.JPG')).toBe('image')
    expect(kindFromFilename('pieza.stl')).toBe('model_stl')
    expect(kindFromFilename('notas.pdf')).toBeNull()
  })
})

describe('ShowcasePage', () => {
  it('muestra el estado vacío', async () => {
    vi.spyOn(prototypesApi, 'publicList').mockResolvedValue([])
    render(
      <MemoryRouter>
        <ShowcasePage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'HarvestT' })).toBeInTheDocument()
    expect(await screen.findByText('Prototipos en construcción')).toBeInTheDocument()
  })

  it('lista tarjetas con estado y enlace al detalle', async () => {
    vi.spyOn(prototypesApi, 'publicList').mockResolvedValue([
      {
        slug: 'g1',
        name: 'Germinador G1',
        codename: 'AURORA',
        purpose: 'Germinar semillas en casa',
        summary: '',
        status: 'in_construction',
        published_at: null,
        hero: null,
        model: null,
      },
    ])
    render(
      <MemoryRouter>
        <ShowcasePage />
      </MemoryRouter>,
    )
    const title = await screen.findByRole('heading', { name: 'Germinador G1' })
    expect(title.closest('a')).toHaveAttribute('href', '/prototipos/g1')
    expect(screen.getByText('En construcción')).toBeInTheDocument()
  })

  it('muestra en el héroe el modelo 3D del prototipo destacado y lo usa en la tarjeta sin foto', async () => {
    const model = { id: 'm1', kind: 'model_stl' as const, filename: 'a.stl', content_type: 'model/stl', size_bytes: 1, caption: '', url: '/m1' }
    vi.spyOn(prototypesApi, 'publicList').mockResolvedValue([
      { slug: 'ecos', name: 'Germinador ECOS', codename: 'ECOS', purpose: '', summary: '', status: 'testing', published_at: null, hero: null, model },
    ])
    render(
      <MemoryRouter>
        <ShowcasePage />
      </MemoryRouter>,
    )
    const featured = await screen.findByRole('region', { name: 'Prototipo destacado' })
    expect(within(featured).getByTestId('stl-viewer')).toBeInTheDocument()
    expect(within(featured).getByRole('link', { name: /Explorar Germinador ECOS/ })).toHaveAttribute('href', '/prototipos/ecos')
    expect(screen.getAllByTestId('stl-viewer')).toHaveLength(2)
  })

  it('con foto la tarjeta usa la imagen y sin modelo no hay destacado', async () => {
    const hero = { id: 'i1', kind: 'image' as const, filename: 'a.png', content_type: 'image/png', size_bytes: 1, caption: 'Frente', url: '/i1' }
    vi.spyOn(prototypesApi, 'publicList').mockResolvedValue([
      { slug: 'g1', name: 'G1', codename: null, purpose: '', summary: '', status: 'testing', published_at: null, hero, model: null },
    ])
    render(
      <MemoryRouter>
        <ShowcasePage />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('img', { name: 'Frente' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Prototipo destacado' })).toBeNull()
    expect(screen.queryByTestId('stl-viewer')).toBeNull()
  })

  it('muestra error con reintento', async () => {
    const spy = vi.spyOn(prototypesApi, 'publicList').mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([])
    render(
      <MemoryRouter>
        <ShowcasePage />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Prototipos en construcción')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

function renderPublic(slug = 'g1') {
  return render(
    <MemoryRouter initialEntries={[`/prototipos/${slug}`]}>
      <Routes>
        <Route path="/prototipos/:slug" element={<PrototypePublicPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PrototypePublicPage', () => {
  it('muestra 404 si el prototipo no es público', async () => {
    vi.spyOn(prototypesApi, 'publicDetail').mockRejectedValue(notFound())
    renderPublic('secreto')
    expect(await screen.findByText('Prototipo no encontrado')).toBeInTheDocument()
  })

  it('muestra visor, especificaciones y galería', async () => {
    const detail: PublicPrototypeDetail = {
      slug: 'g1',
      name: 'Germinador G1',
      codename: null,
      purpose: 'Germinar',
      summary: '',
      status: 'testing',
      published_at: null,
      hero: null,
        model: null,
      description: 'Primer párrafo.\n\nSegundo <b>párrafo</b>.',
      specs: [{ label: 'Bandejas', value: '4', unit: null }],
      assets: [
        { id: 'm1', kind: 'model_stl', filename: 'a.stl', content_type: 'model/stl', size_bytes: 10, caption: '', url: '/api/v1/public/assets/m1' },
        { id: 'i1', kind: 'image', filename: 'a.png', content_type: 'image/png', size_bytes: 10, caption: 'Frente', url: '/api/v1/public/assets/i1' },
      ],
      hotspots: [],
    }
    vi.spyOn(prototypesApi, 'publicDetail').mockResolvedValue(detail)
    const { container } = renderPublic()
    expect(await screen.findByRole('heading', { level: 1, name: 'Germinador G1' })).toBeInTheDocument()
    expect(screen.getByTestId('stl-viewer')).toBeInTheDocument()
    expect(screen.getByText('En pruebas')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Bandejas' })).toBeInTheDocument()
    expect(screen.getByText('Segundo <b>párrafo</b>.')).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByRole('button', { name: /Ampliar imagen 1 de 1/ })).toBeInTheDocument()
  })
})

describe('RichText', () => {
  it('renderiza títulos y listas como texto', () => {
    render(<RichText text={'# Sensores\n\n- Humedad\n- Luz'} />)
    expect(screen.getByRole('heading', { name: 'Sensores' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})

describe('Gallery', () => {
  const images = [
    { id: 'a', src: '/a.png', caption: 'Uno' },
    { id: 'b', src: '/b.png', caption: 'Dos' },
  ]

  it('abre, navega con flechas y cierra con Esc devolviendo el foco', () => {
    render(<Gallery images={images} />)
    const trigger = screen.getByRole('button', { name: /Ampliar imagen 1 de 2/ })
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName(/imagen 1 de 2/)
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/imagen 2 de 2/)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/imagen 1 de 2/)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})

describe('PublicLayout', () => {
  it('no fuerza el tema oscuro y ofrece navegación en píldoras', () => {
    const { container } = render(
      <MemoryRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<p>contenido</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(container.firstElementChild!.className).not.toContain('dark')
    expect(screen.getByRole('link', { name: 'Prototipos' }).className).toContain('rounded-full')
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login')
  })
})

describe('PrototypePublicPage diseño 53', () => {
  function renderAt(slug: string) {
    render(
      <MemoryRouter initialEntries={[`/prototipos/${slug}`]}>
        <Routes>
          <Route path="/prototipos/:slug" element={<PrototypePublicPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('muestra el nombre como titular display, specs como chips y sin specs inventadas', async () => {
    const detail: PublicPrototypeDetail = {
      slug: 'germinador-ecos',
      name: 'Germinador ECOS',
      codename: 'ECOS',
      purpose: 'Germinación doméstica automatizada',
      summary: '',
      status: 'in_construction',
      published_at: null,
      hero: null,
        model: null,
      description: '',
      specs: [
        { label: 'Iluminación', value: 'LED' },
        { label: 'Fotoperiodo', value: 'Configurable' },
      ],
      assets: [],
      hotspots: [],
    }
    vi.spyOn(prototypesApi, 'publicDetail').mockResolvedValue(detail)
    renderAt('germinador-ecos')
    const h1 = await screen.findByRole('heading', { level: 1, name: /Germinador ECOS/ })
    expect(h1.className).toContain('display')
    const chips = screen.getByTestId('spec-chips')
    expect(chips.children).toHaveLength(2)
    expect(chips).toHaveTextContent('Iluminación')
    expect(chips).toHaveTextContent('LED')
  })

  it('sin specs no muestra la fila de chips', async () => {
    vi.spyOn(prototypesApi, 'publicDetail').mockResolvedValue({
      slug: 'x', name: 'X', codename: null, purpose: '', summary: '', status: 'concept', published_at: null, hero: null, model: null, description: '', specs: [], assets: [], hotspots: [],
    } as PublicPrototypeDetail)
    renderAt('x')
    await screen.findByRole('heading', { level: 1, name: 'X' })
    expect(screen.queryByTestId('spec-chips')).toBeNull()
  })
})

describe('PrototypePublicPage hotspots', () => {
  const base: PublicPrototypeDetail = {
    slug: 'ecos',
    name: 'Germinador ECOS',
    codename: null,
    purpose: '',
    summary: '',
    status: 'testing',
    published_at: null,
    hero: null,
        model: null,
    description: '',
    specs: [],
    assets: [
      { id: 'm1', kind: 'model_stl', filename: 'a.stl', content_type: 'model/stl', size_bytes: 1, caption: 'Principal', url: '/a' },
      { id: 'm2', kind: 'model_stl', filename: 'b.stl', content_type: 'model/stl', size_bytes: 1, caption: 'Tapa', url: '/b' },
    ],
    hotspots: [
      { label: 'LED espectro completo', description: 'Luz para germinar', x: 0, y: 0, z: 1, sort_order: 0 },
      { label: 'Sensor de humedad', description: '', x: 1, y: 0, z: 0, sort_order: 1 },
    ],
  }

  function renderEcos(detail: PublicPrototypeDetail) {
    vi.spyOn(prototypesApi, 'publicDetail').mockResolvedValue(detail)
    render(
      <MemoryRouter initialEntries={['/prototipos/ecos']}>
        <Routes>
          <Route path="/prototipos/:slug" element={<PrototypePublicPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('pasa los puntos al visor del modelo principal y muestra la leyenda numerada', async () => {
    renderEcos(base)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByTestId('viewer-points')).toHaveTextContent('LED espectro completo|Sensor de humedad')
    const legend = screen.getByRole('list', { name: 'Puntos del modelo' })
    const items = within(legend).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('1')
    expect(items[0]).toHaveTextContent('LED espectro completo')
    expect(items[0]).toHaveTextContent('Luz para germinar')
  })

  it('al cambiar a otro modelo quita puntos y leyenda', async () => {
    renderEcos(base)
    fireEvent.click(await screen.findByRole('button', { name: 'Tapa' }))
    expect(screen.getByTestId('viewer-points').textContent).toBe('')
    expect(screen.queryByRole('list', { name: 'Puntos del modelo' })).toBeNull()
  })

  it('sin puntos no hay leyenda', async () => {
    renderEcos({ ...base, hotspots: [] })
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('list', { name: 'Puntos del modelo' })).toBeNull()
  })
})

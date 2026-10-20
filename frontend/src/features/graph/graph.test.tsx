import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GraphData, graphApi, NODE_TYPES } from './api'
import { FIXTURE } from './fixtures'
import type { GraphCanvasProps } from './GraphCanvas'
import GraphPage from './GraphPage'

// jsdom no implementa canvas: el lienzo se sustituye por un botón por nodo que llama a onSelect.
vi.mock('./GraphCanvas', () => ({
  GraphCanvas: ({ data, selectedId, onSelect }: GraphCanvasProps) => (
    <div data-testid="graph-canvas" data-selected={selectedId ?? ''}>
      {data.nodes.map((n) => (
        <button key={n.id} type="button" onClick={() => onSelect(n.id)}>
          nodo {n.label}
        </button>
      ))}
    </div>
  ),
}))

beforeEach(() => vi.restoreAllMocks())

function renderPage(data: GraphData = FIXTURE, url = '/app/graph') {
  const spy = vi.spyOn(graphApi, 'get').mockResolvedValue(data)
  render(
    <MemoryRouter initialEntries={[url]}>
      <GraphPage />
    </MemoryRouter>,
  )
  return spy
}

const panel = () => screen.getByRole('complementary', { name: 'Detalle del nodo' })

describe('GraphPage', () => {
  it('carga el grafo completo con leyenda, conteos y lienzo', async () => {
    const spy = renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Grafo de conocimiento' })).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith({ focus: null, depth: 2, types: [...NODE_TYPES] })
    const legend = screen.getByRole('group', { name: 'Leyenda y filtros por tipo' })
    const species = within(legend).getByRole('button', { name: /Especies/ })
    expect(species).toHaveAttribute('aria-pressed', 'true')
    expect(species).toHaveTextContent('1')
    expect(within(legend).getByRole('button', { name: /Cultivares/ })).toHaveTextContent('0')
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    expect(screen.getByText('6 nodos · 4 relaciones')).toBeInTheDocument()
    expect(screen.queryByText(/primeros 300 nodos/)).toBeNull()
  })

  it('busca sin acentos y abre el detalle con conexiones, procedencia y enlace', async () => {
    renderPage()
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Buscar en el grafo' }), { target: { value: 'lactuca' } })
    fireEvent.click(within(screen.getByRole('list', { name: 'Resultados de búsqueda' })).getByRole('button', { name: /Lechuga/ }))
    const p = panel()
    expect(within(p).getByRole('heading', { level: 2, name: 'Lechuga' })).toBeInTheDocument()
    expect(within(p).getByText('Lactuca sativa L.')).toBeInTheDocument()
    expect(within(p).getByRole('link', { name: 'Abrir ficha de la especie' })).toHaveAttribute('href', '/app/plants/sp1')
    expect(within(p).getByText('Afirmación · Desconocido · Sin revisar')).toBeInTheDocument()
    expect(within(p).getByText('Identificador GBIF 7403263')).toBeInTheDocument()
    expect(within(p).getByText('Cultivada en el ciclo')).toBeInTheDocument()
    expect(screen.getByTestId('graph-canvas')).toHaveAttribute('data-selected', 'species:sp1')
    expect(screen.queryByRole('list', { name: 'Resultados de búsqueda' })).toBeNull()
  })

  it('clic en un rasgo muestra su origen, sin enlace, y se navega por sus conexiones', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'nodo Fotoperiodo' }))
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Fotoperiodo' })).toBeInTheDocument()
    expect(within(panel()).getByText('Desconocido')).toBeInTheDocument()
    expect(within(panel()).queryByRole('link')).toBeNull()
    fireEvent.click(within(panel()).getByRole('button', { name: /Lechuga/ }))
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Lechuga' })).toBeInTheDocument()
  })

  it('los filtros por tipo recargan con types y no permiten apagar el último', async () => {
    const spy = renderPage()
    const legend = await screen.findByRole('group', { name: 'Leyenda y filtros por tipo' })
    fireEvent.click(within(legend).getByRole('button', { name: /Fuentes/ }))
    await waitFor(() =>
      expect(spy).toHaveBeenLastCalledWith({ focus: null, depth: 2, types: NODE_TYPES.filter((t) => t !== 'source') }),
    )
    expect(within(legend).getByRole('button', { name: /Fuentes/ })).toHaveAttribute('aria-pressed', 'false')
    for (const name of [/Especies/, /Cultivares/, /Rasgos/, /Proyectos/, /Ciclos/]) {
      fireEvent.click(within(legend).getByRole('button', { name }))
    }
    expect(within(legend).getByRole('button', { name: /Prototipos/ })).toBeDisabled()
  })

  it('explorar vecindario pide foco y profundidad; ver grafo completo lo quita', async () => {
    const spy = renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'nodo Lechuga' }))
    fireEvent.change(screen.getByLabelText('Profundidad'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explorar vecindario' }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith({ focus: 'species:sp1', depth: 3, types: [...NODE_TYPES] }))
    expect(await screen.findByText(/Vecindario de/)).toHaveTextContent('Vecindario de Lechuga a 3 saltos')
    fireEvent.click(screen.getByRole('button', { name: 'Ver grafo completo' }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith({ focus: null, depth: 2, types: [...NODE_TYPES] }))
  })

  it('abre enfocado si la URL trae foco y profundidad', async () => {
    const spy = renderPage(FIXTURE, '/app/graph?focus=species:sp1&depth=1')
    await screen.findByTestId('graph-canvas')
    expect(spy).toHaveBeenCalledWith({ focus: 'species:sp1', depth: 1, types: [...NODE_TYPES] })
    expect(screen.getByTestId('graph-canvas')).toHaveAttribute('data-selected', 'species:sp1')
  })

  it('avisa cuando el grafo se recorta a 300 nodos', async () => {
    renderPage({ ...FIXTURE, truncated: true })
    expect(await screen.findByText(/primeros 300 nodos/)).toBeInTheDocument()
  })

  it('sin nodos muestra un estado vacío honesto y no dibuja lienzo', async () => {
    renderPage({ nodes: [], edges: [], truncated: false })
    expect(await screen.findByText('Aún no hay nodos')).toBeInTheDocument()
    expect(screen.queryByTestId('graph-canvas')).toBeNull()
  })

  it('error con reintento', async () => {
    const spy = vi.spyOn(graphApi, 'get').mockRejectedValue(new Error('x'))
    render(
      <MemoryRouter>
        <GraphPage />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('es solo exploración: no hay controles de edición', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'nodo Lechuga' }))
    expect(screen.queryAllByRole('button', { name: /agregar|editar|eliminar|borrar|guardar/i })).toHaveLength(0)
  })
})

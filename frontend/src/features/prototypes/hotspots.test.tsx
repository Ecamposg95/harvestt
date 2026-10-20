import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { Asset, Hotspot, prototypesApi } from './api'
import { ModelPreview } from './HotspotEditor'

vi.mock('./LazyStlViewer', () => ({
  StlViewer: ({ hotspots, onPick }: { hotspots?: { label: string }[]; onPick?: (p: { x: number; y: number; z: number }) => void }) => (
    <div data-testid="stl-viewer">
      <span data-testid="viewer-points">{(hotspots ?? []).map((h) => h.label).join('|')}</span>
      {onPick && (
        <button type="button" onClick={() => onPick({ x: 1, y: 2, z: 3 })}>
          clic en la malla
        </button>
      )}
    </div>
  ),
}))

const asset: Asset = {
  id: 'stl1',
  prototype_id: 'p1',
  kind: 'model_stl',
  filename: 'carcasa.stl',
  content_type: 'model/stl',
  size_bytes: 10,
  checksum_sha256: 'x',
  caption: '',
  is_public: true,
  sort_order: 0,
  created_at: '2026-10-20T00:00:00Z',
}

function hs(id: string, label: string, sort_order: number, asset_id = 'stl1'): Hotspot {
  return { id, prototype_id: 'p1', asset_id, label, description: '', x: 0, y: 0, z: 0, sort_order, created_at: '' }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

it('agrega un punto: clic en la malla, etiqueta y guardar', async () => {
  vi.spyOn(prototypesApi, 'listHotspots').mockResolvedValueOnce([]).mockResolvedValueOnce([hs('h1', 'LED', 0)])
  const create = vi.spyOn(prototypesApi, 'createHotspot').mockResolvedValue(hs('h1', 'LED', 0))
  render(<ModelPreview prototypeId="p1" asset={asset} canEdit />)
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar punto' }))
  expect(screen.getByText('Haz clic sobre el modelo para colocar el punto.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'clic en la malla' }))
  fireEvent.change(screen.getByLabelText('Etiqueta'), { target: { value: 'LED' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar punto' }))
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith('p1', { asset_id: 'stl1', label: 'LED', description: '', x: 1, y: 2, z: 3 }),
  )
  const list = await screen.findByRole('list', { name: 'Puntos del modelo' })
  expect(within(list).getByText('LED')).toBeInTheDocument()
})

it('muestra solo los puntos de este modelo pero cuenta todos para el límite', async () => {
  const many = Array.from({ length: 12 }, (_, i) => hs(`h${i}`, `P${i}`, i, i < 2 ? 'stl1' : 'otro'))
  vi.spyOn(prototypesApi, 'listHotspots').mockResolvedValue(many)
  render(<ModelPreview prototypeId="p1" asset={asset} canEdit />)
  expect(await screen.findByText('12 / 12 puntos')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Agregar punto' })).toBeDisabled()
  expect(screen.getByText('Máximo 12 puntos por prototipo.')).toBeInTheDocument()
  expect(screen.getByTestId('viewer-points')).toHaveTextContent('P0|P1')
})

it('reordena intercambiando sort_order con el vecino', async () => {
  vi.spyOn(prototypesApi, 'listHotspots').mockResolvedValue([hs('a', 'Uno', 0), hs('b', 'Dos', 1)])
  const update = vi.spyOn(prototypesApi, 'updateHotspot').mockResolvedValue(hs('b', 'Dos', 0))
  render(<ModelPreview prototypeId="p1" asset={asset} canEdit />)
  fireEvent.click(await screen.findByRole('button', { name: 'Subir Dos' }))
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
  expect(update).toHaveBeenCalledWith('p1', 'b', { sort_order: 0 })
  expect(update).toHaveBeenCalledWith('p1', 'a', { sort_order: 1 })
})

it('borra tras confirmar', async () => {
  vi.spyOn(prototypesApi, 'listHotspots').mockResolvedValue([hs('a', 'Uno', 0)])
  const remove = vi.spyOn(prototypesApi, 'removeHotspot').mockResolvedValue({} as never)
  render(<ModelPreview prototypeId="p1" asset={asset} canEdit />)
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Uno' }))
  expect(remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación de Uno' }))
  await waitFor(() => expect(remove).toHaveBeenCalledWith('p1', 'a'))
})

it('muestra el error del servidor y conserva el formulario', async () => {
  vi.spyOn(prototypesApi, 'listHotspots').mockResolvedValue([])
  vi.spyOn(prototypesApi, 'createHotspot').mockRejectedValue(new Error('x'))
  render(<ModelPreview prototypeId="p1" asset={asset} canEdit />)
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar punto' }))
  fireEvent.click(screen.getByRole('button', { name: 'clic en la malla' }))
  fireEvent.change(screen.getByLabelText('Etiqueta'), { target: { value: 'LED' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar punto' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el punto')
  expect(screen.getByLabelText('Etiqueta')).toHaveValue('LED')
})

it('el viewer solo lee', async () => {
  vi.spyOn(prototypesApi, 'listHotspots').mockResolvedValue([hs('a', 'Uno', 0)])
  render(<ModelPreview prototypeId="p1" asset={asset} canEdit={false} />)
  const list = await screen.findByRole('list', { name: 'Puntos del modelo' })
  expect(within(list).getByText('Uno')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Agregar punto' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Eliminar Uno' })).toBeNull()
})

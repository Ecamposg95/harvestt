import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import axios from 'axios'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuth } from '@/store/auth'
import * as api from './api'
import { CONNECTOR_STATUS_LABELS } from './labels'
import SourcesPage from './SourcesPage'

beforeEach(() => {
  vi.restoreAllMocks()
  useAuth.setState({ user: null })
})

function loginAs(is_superadmin: boolean) {
  useAuth.setState({ user: { id: 'u1', email: 'a@local.test', full_name: 'Ana', is_superadmin } })
}

const row = (over: Partial<api.ConnectorOut> & Pick<api.ConnectorOut, 'key' | 'label'>): api.ConnectorOut => ({
  contribution: 'Aporte ' + over.label,
  license: 'CC0 1.0',
  url: 'https://example.org',
  status: 'active',
  can_sync: true,
  last_sync: null,
  copies: { ok: 0, not_found: 0, stale: 0 },
  ...over,
})

const ROWS: api.ConnectorOut[] = [
  row({
    key: 'gbif',
    label: 'GBIF',
    copies: { ok: 3, not_found: 1, stale: 2 },
    last_sync: {
      status: 'error',
      started_at: '2026-11-10T10:00:00Z',
      finished_at: '2026-11-10T10:01:00Z',
      species_total: 3,
      species_ok: 0,
      error: 'GBIF no respondió',
    },
  }),
  row({ key: 'wfo', label: 'World Flora Online' }),
  row({ key: 'wikidata', label: 'Wikidata / Wikimedia Commons' }),
  row({ key: 'genesys', label: 'Genesys', status: 'requires_credentials', can_sync: false }),
  row({ key: 'grin', label: 'USDA GRIN', status: 'in_construction', can_sync: false }),
  row({ key: 'cimmyt', label: 'CIMMYT', status: 'requires_alliance', can_sync: false }),
  row({ key: 'inifap', label: 'INIFAP / CNRG', status: 'requires_alliance', can_sync: false }),
]

const renderPage = () =>
  render(
    <MemoryRouter>
      <SourcesPage />
    </MemoryRouter>,
  )

it('muestra la vista sin permiso a quien no es superadmin', async () => {
  loginAs(false)
  const spy = vi.spyOn(api, 'fetchConnectors').mockResolvedValue(ROWS)
  renderPage()
  expect(screen.getByText('No tienes permiso para ver esta página')).toBeInTheDocument()
  expect(spy).not.toHaveBeenCalled()
})

it('renderiza las 7 fuentes, el error y los estados sin botón', async () => {
  loginAs(true)
  vi.spyOn(api, 'fetchConnectors').mockResolvedValue(ROWS)
  renderPage()
  await screen.findAllByText('World Flora Online')
  for (const l of ['GBIF', 'World Flora Online', 'Wikidata / Wikimedia Commons', 'Genesys', 'USDA GRIN', 'CIMMYT', 'INIFAP / CNRG'])
    expect(screen.getAllByText(l).length).toBeGreaterThan(0)
  expect(screen.getAllByText('GBIF no respondió').length).toBeGreaterThan(0)
  expect(screen.getAllByText(CONNECTOR_STATUS_LABELS.requires_alliance).length).toBe(4)
  expect(screen.getAllByText(/Requiere credenciales · solicitar token a helpdesk@genesys-pgr.org/).length).toBeGreaterThan(0)
  // solo 3 filas con can_sync (tabla + tarjetas)
  expect(screen.getAllByRole('button', { name: /Sincronizar/ }).length).toBe(6)
})

it('muestra «Sincronizando…» mientras la promesa está pendiente', async () => {
  loginAs(true)
  vi.spyOn(api, 'fetchConnectors').mockResolvedValue(ROWS)
  let resolve!: (v: api.ConnectorSync) => void
  vi.spyOn(api, 'syncConnector').mockReturnValue(new Promise((r) => (resolve = r)))
  renderPage()
  await screen.findAllByText('World Flora Online')
  fireEvent.click(screen.getAllByRole('button', { name: /Sincronizar/ })[1])
  expect(screen.getAllByText('Sincronizando…').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Sincronizando…')[0].closest('button')).toBeDisabled()
  await act(async () => {
    resolve({ id: 's', source: 'wfo', status: 'ok', started_at: 'x', finished_at: 'y', species_total: 3, species_ok: 3, error: null })
  })
  await waitFor(() => expect(screen.queryByText('Sincronizando…')).toBeNull())
})

it('muestra el mensaje del servidor en 429', async () => {
  loginAs(true)
  vi.spyOn(api, 'fetchConnectors').mockResolvedValue(ROWS)
  const err = new axios.AxiosError('x', '429', undefined, undefined, {
    status: 429,
    data: { error: { code: 'sync_cooldown', message: 'Espera 10 minutos entre sincronizaciones' } },
  } as never)
  vi.spyOn(api, 'syncConnector').mockRejectedValue(err)
  renderPage()
  await screen.findAllByText('World Flora Online')
  fireEvent.click(screen.getAllByRole('button', { name: /Sincronizar/ })[0])
  expect((await screen.findAllByText('Espera 10 minutos entre sincronizaciones')).length).toBeGreaterThan(0)
})

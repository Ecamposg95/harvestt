import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuth } from '@/store/auth'
import { visionApi } from '../vision/api'
import * as api from './api'
import { AccessionsPanel } from './AccessionsPanel'
import { BanksSection } from './BanksSection'
import { IdentityChips } from './IdentityChips'
import { PresenceMap } from './PresenceMap'
import { UseInCycleDialog } from './UseInCycleDialog'

beforeEach(() => {
  vi.restoreAllMocks()
  useAuth.setState({
    user: { id: 'u1', email: 'a@local.test', full_name: 'Ana', is_superadmin: false },
    organizationId: 'o1',
    memberships: [{ organization: { id: 'o1', name: 'Org', slug: 'org' }, role: 'editor' }],
  })
  vi.spyOn(visionApi, 'summary').mockResolvedValue({ as_of: '', figures: [], layers: [], sites: [] })
})

const copy = (over: Partial<api.CopyOut> = {}): api.CopyOut => ({
  status: 'ok',
  external_id: null,
  payload: {},
  license: 'CC0 1.0',
  attribution: 'Fuente consultada el 2026-11-10.',
  source_url: 'https://example.org',
  fetched_at: '2026-11-08T10:00:00Z',
  last_attempt_at: '2026-11-10T10:00:00Z',
  last_error: null,
  stale: false,
  reason: null,
  ...over,
})

const source = (key: string, c: api.CopyOut | null, status = 'active'): api.BankSourceOut => ({
  key,
  label: key.toUpperCase(),
  contribution: 'Aporte',
  status,
  license_summary: 'CC0 1.0',
  copy: c,
})

const banks = (sources: api.BankSourceOut[], identity: api.IdentityOut[] = []): api.BanksOut => ({
  species_id: 's1',
  sources,
  identity,
})

const renderSection = (data: api.BanksOut) => {
  vi.spyOn(api, 'fetchBanks').mockResolvedValue(data)
  return render(
    <MemoryRouter>
      <BanksSection speciesId="s1" commonNames={[{ name: 'jitomate', lang: 'es' }]} />
    </MemoryRouter>,
  )
}

it('una copia stale muestra «Fuente no disponible · última copia del <fecha>»', async () => {
  renderSection(
    banks([
      source('wfo', copy({ stale: true, last_error: 'timeout', payload: { name: 'Solanum lycopersicum', synonyms: [] } })),
    ]),
  )
  expect(await screen.findByText(/Fuente no disponible · última copia del 08\/11\/2026/)).toBeInTheDocument()
})

it('sin copia muestra «Sin datos de esta fuente todavía» y not_found muestra el motivo', async () => {
  renderSection(
    banks([
      source('gbif', null),
      source('wfo', copy({ status: 'not_found', reason: 'Sin coincidencia exacta en World Flora Online' })),
      source('wikidata', copy({ payload: { qid: 'Q1', common_names: {}, ids: {}, images: [] } })),
    ]),
  )
  expect(await screen.findByText('Sin datos de esta fuente todavía')).toBeInTheDocument()
  expect(screen.getByText('Sin coincidencia exacta en World Flora Online')).toBeInTheDocument()
})

it('el chip mismatch dice «No coinciden» con el detalle; un valor nulo no se dibuja', () => {
  render(
    <IdentityChips
      identity={[
        { key: 'wfo', value: 'wfo-0001029216', url: 'https://x', check: 'mismatch', detail: 'Wikidata indica wfo-9' },
        { key: 'ncbi', value: null, url: null, check: 'unknown', detail: null },
      ]}
    />,
  )
  expect(screen.getByText('No coinciden')).toBeInTheDocument()
  expect(screen.getByText('Wikidata indica wfo-9')).toBeInTheDocument()
  expect(screen.queryByText('NCBI')).not.toBeInTheDocument()
})

it('el autor de Commons con HTML se muestra como texto, sin enlace inyectado', async () => {
  const { container } = renderSection(
    banks([
      source(
        'wikidata',
        copy({
          payload: {
            qid: 'Q23501',
            common_names: { es: ['tomate'], en: ['tomato'] },
            ids: {},
            images: [
              {
                file: 'Tomato.jpg',
                thumb_url: 'https://upload.wikimedia.org/thumb.jpg',
                page_url: 'https://commons.wikimedia.org/wiki/File:Tomato.jpg',
                license: 'CC BY-SA 4.0',
                license_url: 'https://creativecommons.org/licenses/by-sa/4.0',
                artist: '<a href="x">Geographer</a>',
              },
            ],
          },
        }),
      ),
    ]),
  )
  expect(await screen.findByText('<a href="x">Geographer</a>', { exact: false })).toBeInTheDocument()
  expect(container.querySelector('a[href="x"]')).toBeNull()
  const img = container.querySelector('img')!
  expect(img.getAttribute('loading')).toBe('lazy')
  expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by-sa/4.0',
  )
})

it('nombres del equipo y de Wikidata/WFO lado a lado con su etiqueta', async () => {
  renderSection(
    banks([
      source('wfo', copy({ payload: { name: 'Solanum lycopersicum', authorship: 'L.', synonyms: [{ name: 'Lycopersicon esculentum', authorship: 'Mill.' }] } })),
      source('wikidata', copy({ payload: { qid: 'Q1', common_names: { es: ['tomate'], en: [] }, ids: {}, images: [] } })),
    ]),
  )
  expect(await screen.findByText('Equipo HarvestT')).toBeInTheDocument()
  expect(screen.getByText('Wikidata · sourced')).toBeInTheDocument()
  expect(screen.getByText('World Flora Online · sourced')).toBeInTheDocument()
  expect(screen.getByText('jitomate')).toBeInTheDocument()
  expect(screen.getByText('Lycopersicon esculentum')).toBeInTheDocument()
})

it('Genesys sin credenciales muestra el mensaje de credenciales', () => {
  render(<AccessionsPanel speciesId="s1" source={source('genesys', null, 'requires_credentials')} />)
  expect(
    screen.getByText('Genesys requiere credenciales de API. Accesiones disponibles cuando el equipo las configure.'),
  ).toBeInTheDocument()
})

it('Genesys: un 503 en la consulta en vivo muestra «Fuente no disponible»', async () => {
  vi.spyOn(api, 'fetchGenesysAccessions').mockRejectedValue({ isAxiosError: true, response: { status: 503 } })
  render(
    <AccessionsPanel
      speciesId="s1"
      source={source('genesys', copy({ payload: { total: 2, by_country: [{ country: 'MEX', count: 2 }], by_sampstat: [{ code: 300, count: 2 }], sampled: 2 } }))}
    />,
  )
  expect(screen.getByText('Variedad tradicional o criolla')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ver accesiones' }))
  expect(await screen.findByText('Fuente no disponible')).toBeInTheDocument()
})

it('el diálogo sin ciclos dice «No tienes ciclos de esta especie»', async () => {
  vi.spyOn(api, 'fetchCyclesForSpecies').mockResolvedValue([])
  render(
    <UseInCycleDialog
      speciesId="s1"
      accession={{ institute_code: 'MEX001', accession_number: 'A1', doi: null, origin_country: 'MEX', sampstat: 300, url: 'https://x' }}
      onClose={() => {}}
    />,
  )
  expect(await screen.findByText('No tienes ciclos de esta especie')).toBeInTheDocument()
})

it('el diálogo confirma con linkAccession', async () => {
  vi.spyOn(api, 'fetchCyclesForSpecies').mockResolvedValue([
    {
      id: 'c1', project_id: 'p1', project_name: 'Invernadero', species_id: 's1', species_name: 'Tomate',
      cultivar_id: null, cultivar_name: null, started_on: '2026-10-01', stage: 'seedling', status: 'active',
      created_at: '', accession_ref: null,
    },
  ])
  const link = vi.spyOn(api, 'linkAccession').mockResolvedValue({} as api.CropCycleOut)
  const onClose = vi.fn()
  render(
    <UseInCycleDialog
      speciesId="s1"
      accession={{ institute_code: 'MEX001', accession_number: 'A1', doi: '10.1/x', origin_country: 'MEX', sampstat: 300, url: 'https://x' }}
      onClose={onClose}
    />,
  )
  fireEvent.click(await screen.findByRole('radio', { name: /Invernadero/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Vincular accesión' }))
  await waitFor(() =>
    expect(link).toHaveBeenCalledWith('p1', 'c1', 's1', {
      source: 'genesys', institute_code: 'MEX001', accession_number: 'A1', doi: '10.1/x',
    }),
  )
})

it('un viewer ve «Usar en mi ciclo» deshabilitado con el título', async () => {
  useAuth.setState({ memberships: [{ organization: { id: 'o1', name: 'Org', slug: 'org' }, role: 'viewer' }] })
  vi.spyOn(api, 'fetchGenesysAccessions').mockResolvedValue([
    { institute_code: 'MEX001', accession_number: 'A1', doi: null, origin_country: 'MEX', sampstat: 300, url: 'https://x' },
  ])
  render(<AccessionsPanel speciesId="s1" source={source('genesys', copy({ payload: { total: 1, by_country: [], by_sampstat: [], sampled: 1 } }))} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ver accesiones' }))
  const btn = await screen.findByRole('button', { name: 'Usar en mi ciclo' })
  expect(btn).toBeDisabled()
  expect(btn).toHaveAttribute('title', 'Necesitas rol de editor')
})

it('el mapa avisa la muestra y lista los países', () => {
  render(
    <PresenceMap
      payload={{
        occurrences_total: 5000,
        excluded_nc: 25895,
        top_countries: [{ country: 'ES', count: 6616 }],
        mexico: { total: 1106, sampled: 900, cell_deg: 0.5, cells: [{ lat: 19.25, lon: -99.25, count: 10 }] },
      }}
      sites={[
        { kind: 'historic', label: 'Toluca', lat: 19.3, lon: -99.6 },
        { kind: 'future', label: 'Lejos', lat: 40, lon: -3 },
      ]}
      attribution="GBIF.org, consultado el 2026-11-10."
    />,
  )
  expect(screen.getByRole('img', { name: /1,106/ })).toBeInTheDocument()
  expect(screen.getByText(/Mapa con una muestra de 900 de 1,106/)).toBeInTheDocument()
  expect(
    screen.getByText('Presencia GBIF en México: 1,106 registros con licencia CC0/CC BY (25,895 excluidos por licencia NC en el mundo)'),
  ).toBeInTheDocument()
  expect(screen.getByText('Prototipo histórico')).toBeInTheDocument()
  expect(screen.queryByText('Nodo solicitado')).not.toBeInTheDocument()
})

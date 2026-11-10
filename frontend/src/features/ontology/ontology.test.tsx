import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { ontologyApi, type TermDetail, type TermSummary } from './api'
import OntologyPage from './OntologyPage'

beforeEach(() => vi.restoreAllMocks())

const summary = (over: Partial<TermSummary> & Pick<TermSummary, 'id' | 'label'>): TermSummary => ({
  hvt_id: null,
  domain: 'plant',
  parent_id: null,
  status: 'published',
  unit: null,
  ...over,
})

const TERMS: TermSummary[] = [
  summary({ id: 't1', hvt_id: 'HVT:000001', domain: 'organism', label: 'Especie' }),
  summary({ id: 't2', hvt_id: 'HVT:000002', domain: 'organism', parent_id: 't1', label: 'Cultivar' }),
  summary({ id: 't3', hvt_id: 'HVT:000003', domain: 'plant', label: 'Germinación' }),
  summary({ id: 't4', hvt_id: 'HVT:000004', domain: 'environment', label: 'Fotoperiodo', unit: 'h' }),
  summary({ id: 't5', hvt_id: 'HVT:000005', domain: 'plant', label: 'Brote viejo', status: 'obsolete' }),
]

function detail(s: TermSummary, over: Partial<TermDetail> = {}): TermDetail {
  return {
    ...s,
    definition: `Definición de ${s.label}.`,
    aliases: [],
    equivalences: [],
    parent: null,
    children: [],
    replaced_by: null,
    proposed_by_name: 'Equipo HarvestT',
    review_note: 'Vocabulario semilla del equipo',
    reviewed_at: '2026-11-09T00:00:00Z',
    published_in_version: 1,
    obsoleted_in_version: null,
    ...over,
  }
}

const DETAILS: Record<string, TermDetail> = {
  t1: detail(TERMS[0], {
    aliases: ['species', 'especie botánica'],
    equivalences: [
      {
        scheme: 'ncbi_taxon',
        external_id: '33090',
        url: 'https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=33090',
        external_label: 'Viridiplantae',
        match: 'exact',
      },
    ],
    children: [TERMS[1]],
  }),
  t2: detail(TERMS[1], { parent: TERMS[0] }),
  t3: detail(TERMS[2]),
  t5: detail(TERMS[4], { replaced_by: TERMS[2], obsoleted_in_version: 2 }),
}

function setup(url = '/app/ontologia', usage = { species: 3, assertions: 12, projects: 2, cycles: 4 }) {
  const list = vi.spyOn(ontologyApi, 'list').mockImplementation(async (params) => {
    if (params?.q) return TERMS.filter((t) => t.label.toLowerCase().includes(params.q!.toLowerCase()))
    return TERMS
  })
  vi.spyOn(ontologyApi, 'releases').mockResolvedValue([
    { version: 2, note: 'Obsoleto', created_at: '2026-11-09T00:00:00Z', term_count: 5 },
    { version: 1, note: 'Semilla', created_at: '2026-11-08T00:00:00Z', term_count: 5 },
  ])
  const get = vi.spyOn(ontologyApi, 'get').mockImplementation(async (id) => DETAILS[id])
  vi.spyOn(ontologyApi, 'usage').mockResolvedValue(usage)
  render(
    <MemoryRouter initialEntries={[url]}>
      <OntologyPage />
    </MemoryRouter>,
  )
  return { list, get }
}

it('muestra el árbol del dominio activo y cambia al elegir otra pestaña', async () => {
  setup()
  const tree = await screen.findByRole('list', { name: 'Términos de Organismo' })
  expect(within(tree).getByRole('button', { name: /Especie/ })).toBeInTheDocument()
  expect(within(tree).getByRole('button', { name: /Cultivar/ })).toBeInTheDocument()
  expect(within(tree).queryByText('Germinación')).toBeNull()

  fireEvent.click(screen.getByRole('tab', { name: /Planta y etapas/ }))
  const plant = screen.getByRole('list', { name: 'Términos de Planta y etapas' })
  expect(within(plant).getByRole('button', { name: /Germinación/ })).toBeInTheDocument()
})

it('muestra la versión vigente y los enlaces de exportación', async () => {
  setup()
  expect(await screen.findByText('Versión 2')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Exportar Turtle' })).toHaveAttribute('href', '/api/v1/public/ontology/export.ttl')
  expect(screen.getByRole('link', { name: 'Exportar JSON' })).toHaveAttribute('href', '/api/v1/public/ontology/export.json')
})

it('buscar «foto» llama a list con q="foto" y muestra los resultados', async () => {
  const { list } = setup()
  await screen.findByRole('list', { name: 'Términos de Organismo' })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar término' }), { target: { value: 'foto' } })
  await waitFor(() => expect(list).toHaveBeenCalledWith({ q: 'foto' }))
  const results = await screen.findByRole('list', { name: 'Resultados de búsqueda' })
  expect(within(results).getByRole('button', { name: /Fotoperiodo/ })).toBeInTheDocument()
})

it('la ficha muestra el ID, la equivalencia «Exacta», el crédito y el uso', async () => {
  const { get } = setup()
  const tree = await screen.findByRole('list', { name: 'Términos de Organismo' })
  fireEvent.click(within(tree).getByRole('button', { name: /Especie/ }))
  const card = await screen.findByRole('region', { name: 'Ficha del término' })
  await within(card).findByText('Definición de Especie.')
  expect(get).toHaveBeenCalledWith('t1')
  expect(within(card).getAllByText('HVT:000001').length).toBeGreaterThan(0)
  const eq = within(card).getByRole('table', { name: 'Equivalencias' })
  expect(within(eq).getByText('Exacta')).toBeInTheDocument()
  expect(within(eq).getByRole('link', { name: /33090/ })).toHaveAttribute(
    'href',
    'https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=33090',
  )
  expect(within(card).getByText('species')).toBeInTheDocument()
  expect(within(card).getByText(/Propuesto por Equipo HarvestT/)).toBeInTheDocument()
  expect(within(card).getByText(/Vocabulario semilla del equipo/)).toBeInTheDocument()
  expect(
    await within(card).findByText('Usado en: 3 especies · 12 afirmaciones · 2 proyectos · 4 ciclos'),
  ).toBeInTheDocument()
  expect(within(card).getByRole('link', { name: 'Ver en el grafo' })).toHaveAttribute(
    'href',
    '/app/graph?focus=term:HVT:000001',
  )
  const neighbors = within(card).getByRole('figure', { name: /Vecindario de Especie: 1 hijo, 1 equivalencia/ })
  // El hijo del vecindario abre su ficha.
  fireEvent.click(within(neighbors).getAllByRole('link', { name: 'Hijo: Cultivar' })[0])
  await waitFor(() => expect(get).toHaveBeenCalledWith('t2'))
})

it('sin datos enlazados dice «Aún sin datos enlazados»', async () => {
  setup('/app/ontologia?term=HVT:000003', { species: 0, assertions: 0, projects: 0, cycles: 0 })
  const card = await screen.findByRole('region', { name: 'Ficha del término' })
  expect(await within(card).findByText('Aún sin datos enlazados')).toBeInTheDocument()
})

it('un obsoleto muestra «reemplazado por» con enlace al reemplazo', async () => {
  setup('/app/ontologia?term=HVT:000005')
  const card = await screen.findByRole('region', { name: 'Ficha del término' })
  const notice = await within(card).findByText(/reemplazado por/)
  expect(notice.textContent).toContain('Obsoleto · reemplazado por')
  expect(within(notice).getByRole('link', { name: 'Germinación' })).toHaveAttribute(
    'href',
    '/app/ontologia?term=HVT:000003',
  )
})

it('?term=HVT:000003 abre esa ficha', async () => {
  const { get } = setup('/app/ontologia?term=HVT:000003')
  const card = await screen.findByRole('region', { name: 'Ficha del término' })
  expect(await within(card).findByText('Definición de Germinación.')).toBeInTheDocument()
  expect(get).toHaveBeenCalledWith('t3')
  // La pestaña activa sigue al término abierto.
  expect(screen.getByRole('tab', { name: /Planta y etapas/ })).toHaveAttribute('aria-selected', 'true')
})

it('una propuesta sin ID dice «Sin ID: propuesta»', async () => {
  const proposal = summary({ id: 'p1', label: 'Etapa nueva', status: 'proposed' })
  TERMS.push(proposal)
  DETAILS.p1 = detail(proposal, { proposed_by_name: 'Ana López', review_note: null, published_in_version: null })
  try {
    setup('/app/ontologia?term=p1')
    const card = await screen.findByRole('region', { name: 'Ficha del término' })
    expect(await within(card).findByText('Sin ID: propuesta')).toBeInTheDocument()
    expect(within(card).getByText('Propuesto')).toBeInTheDocument()
    expect(within(card).getByText(/Propuesto por Ana López/)).toBeInTheDocument()
    expect(ontologyApi.usage).not.toHaveBeenCalled()
  } finally {
    TERMS.pop()
    delete DETAILS.p1
  }
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuth } from '@/store/auth'
import { ontologyApi, type TermDetail, type TermSummary } from './api'
import OntologyPage from './OntologyPage'

beforeEach(() => {
  vi.restoreAllMocks()
  useAuth.setState({ user: null })
})

function loginAs(is_superadmin: boolean) {
  useAuth.setState({ user: { id: 'u1', email: 'ana@local.test', full_name: 'Ana López', is_superadmin } })
}

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
    if (params?.mine) return []
    return TERMS.filter(
      (t) => (!params?.domain || t.domain === params.domain) && (!params?.status || t.status === params.status),
    )
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

// --- Escritura: proponer, mis propuestas y revisión -------------------------------------------

const axiosError = (status: number, code: string, message: string, details: Record<string, unknown> = {}) => ({
  isAxiosError: true,
  response: { status, data: { error: { code, message, details } } },
})

const SUGGESTION = {
  scheme: 'bbch',
  external_id: '0',
  label: 'Germination / sprouting / bud development',
  url: 'https://doi.org/10.5073/20180906-074619',
}

async function openProposeDialog() {
  await screen.findByRole('list', { name: 'Términos de Organismo' })
  fireEvent.click(screen.getByRole('button', { name: 'Proponer término' }))
  return screen.findByRole('dialog', { name: 'Proponer término' })
}

function fillProposal(dialog: HTMLElement, label: string) {
  fireEvent.change(within(dialog).getByLabelText('Etiqueta'), { target: { value: label } })
  fireEvent.change(within(dialog).getByLabelText('Definición'), {
    target: { value: 'Grupo de plantas de una misma especie con rasgos estables.' },
  })
}

it('proponer envía la propuesta y muestra el aviso de crédito', async () => {
  loginAs(false)
  setup()
  vi.spyOn(ontologyApi, 'suggest').mockResolvedValue([])
  const propose = vi
    .spyOn(ontologyApi, 'propose')
    .mockImplementation(async (input) => detail(summary({ id: 'p9', label: input.label, status: 'proposed' })))
  const dialog = await openProposeDialog()
  expect(
    within(dialog).getByText(
      'Si se publica, tu nombre aparecerá como autor del término, también en la exportación pública',
    ),
  ).toBeInTheDocument()
  // El padre solo ofrece publicados del dominio.
  const parent = within(dialog).getByLabelText('Término padre')
  await within(parent).findByRole('option', { name: /Especie/ })
  expect(within(parent).queryByRole('option', { name: /Germinación/ })).toBeNull()
  fireEvent.change(parent, { target: { value: 't1' } })
  // La unidad solo aparece para rasgos.
  expect(within(dialog).queryByLabelText('Unidad')).toBeNull()

  fillProposal(dialog, 'Variedad local')
  fireEvent.change(within(dialog).getByLabelText('Alias'), { target: { value: 'criolla, landrace ,' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar propuesta' }))

  await waitFor(() =>
    expect(propose).toHaveBeenCalledWith({
      domain: 'organism',
      parent_id: 't1',
      label: 'Variedad local',
      definition: 'Grupo de plantas de una misma especie con rasgos estables.',
      aliases: ['criolla', 'landrace'],
      equivalences: [],
    }),
  )
  expect(await screen.findByText(/Propuesta enviada/)).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('una sugerencia se agrega como equivalencia cercana', async () => {
  loginAs(false)
  setup()
  const suggest = vi.spyOn(ontologyApi, 'suggest').mockResolvedValue([SUGGESTION])
  const propose = vi
    .spyOn(ontologyApi, 'propose')
    .mockImplementation(async (input) => detail(summary({ id: 'p9', label: input.label, status: 'proposed' })))
  const dialog = await openProposeDialog()
  fillProposal(dialog, 'Germinación temprana')
  const suggestions = await within(dialog).findByRole('list', { name: 'Sugerencias de Cortex' })
  expect(suggest).toHaveBeenLastCalledWith('Germinación temprana')
  fireEvent.click(within(suggestions).getByRole('button', { name: /Agregar BBCH 0/ }))

  const added = within(dialog).getByRole('list', { name: 'Equivalencias de la propuesta' })
  expect(within(added).getByLabelText('Correspondencia con BBCH 0')).toHaveValue('close')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar propuesta' }))
  await waitFor(() => expect(propose).toHaveBeenCalled())
  expect(propose.mock.calls[0][0].equivalences).toEqual([
    {
      scheme: 'bbch',
      external_id: '0',
      url: 'https://doi.org/10.5073/20180906-074619',
      external_label: 'Germination / sprouting / bud development',
      match: 'close',
    },
  ])
})

it('409 muestra el mensaje de duplicado', async () => {
  loginAs(false)
  setup()
  vi.spyOn(ontologyApi, 'suggest').mockResolvedValue([])
  vi.spyOn(ontologyApi, 'propose').mockRejectedValue(axiosError(409, 'term_exists', 'conflicto', { field: 'label' }))
  const dialog = await openProposeDialog()
  fillProposal(dialog, 'Especie')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar propuesta' }))
  expect(await within(dialog).findByText('Ya existe un término con esa etiqueta en este dominio')).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Etiqueta')).toHaveAttribute('aria-invalid', 'true')
})

it('422 muestra el mensaje junto al campo', async () => {
  loginAs(false)
  setup()
  vi.spyOn(ontologyApi, 'suggest').mockResolvedValue([])
  vi.spyOn(ontologyApi, 'propose').mockRejectedValue(
    axiosError(422, 'invalid_input', 'El término padre debe estar publicado y ser del mismo dominio', {
      field: 'parent_id',
    }),
  )
  const dialog = await openProposeDialog()
  fillProposal(dialog, 'Algo nuevo')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar propuesta' }))
  await within(dialog).findByText('El término padre debe estar publicado y ser del mismo dominio')
  expect(within(dialog).getByLabelText('Término padre')).toHaveAttribute('aria-invalid', 'true')
})

it('la pestaña Revisión no aparece sin superadmin', async () => {
  loginAs(false)
  setup()
  await screen.findByRole('list', { name: 'Términos de Organismo' })
  const sections = screen.getByRole('tablist', { name: 'Secciones de la ontología' })
  expect(within(sections).getByRole('tab', { name: 'Explorar' })).toBeInTheDocument()
  expect(within(sections).getByRole('tab', { name: 'Mis propuestas' })).toBeInTheDocument()
  expect(within(sections).queryByRole('tab', { name: /Revisión/ })).toBeNull()
})

// Una propuesta de la propia superadmin, para recorrer revisión y «Mis propuestas» con el mismo estado.
function setupReview() {
  loginAs(true)
  const proposal = summary({ id: 'p1', domain: 'organism', parent_id: 't1', label: 'Variedad local', status: 'proposed' })
  const store: Record<string, TermDetail> = {
    p1: detail(proposal, {
      aliases: ['criolla'],
      parent: TERMS[0],
      proposed_by_name: 'Ana López',
      review_note: null,
      reviewed_at: null,
      published_in_version: null,
      equivalences: [{ ...SUGGESTION, external_label: SUGGESTION.label, match: 'close' }],
    }),
  }
  const mine = () => Object.values(store).map(({ id, hvt_id, domain, parent_id, label, status, unit }) => ({
    id, hvt_id, domain, parent_id, label, status, unit,
  }))
  const { list } = setup()
  list.mockImplementation(async (params) => (params?.mine ? mine() : TERMS))
  vi.mocked(ontologyApi.get).mockImplementation(async (id) => store[id] ?? DETAILS[id])
  vi.spyOn(ontologyApi, 'reviewQueue').mockImplementation(async () =>
    mine().filter((t) => t.status === 'proposed' || t.status === 'in_review'),
  )
  const review = vi.spyOn(ontologyApi, 'review').mockImplementation(async (id, body) => {
    const next =
      body.action === 'approve'
        ? { status: 'published', hvt_id: 'HVT:000042', published_in_version: 3 }
        : { status: body.action === 'reject' ? 'rejected' : 'in_review' }
    store[id] = { ...store[id], ...next, review_note: body.note }
    return store[id]
  })
  return { list, review, store }
}

it('aprobar exige nota y llama a review con action approve', async () => {
  const { review } = setupReview()
  await screen.findByRole('list', { name: 'Términos de Organismo' })
  fireEvent.click(screen.getByRole('tab', { name: /Revisión/ }))
  const card = await screen.findByRole('article', { name: 'Variedad local' })
  // La tarjeta muestra la propuesta completa.
  expect(await within(card).findByText('Definición de Variedad local.')).toBeInTheDocument()
  expect(within(card).getByText(/Ana López/)).toBeInTheDocument()
  expect(within(card).getByText('criolla')).toBeInTheDocument()
  expect(within(card).getByText(/BBCH/)).toBeInTheDocument()

  const approve = within(card).getByRole('button', { name: 'Aprobar' })
  expect(approve).toBeDisabled()
  const note = within(card).getByLabelText('Nota de revisión')
  fireEvent.change(note, { target: { value: ' ok ' } })
  expect(approve).toBeDisabled()
  expect(within(card).getByRole('button', { name: 'Rechazar' })).toBeDisabled()

  vi.mocked(ontologyApi.releases).mockResolvedValue([
    { version: 3, note: 'Publicado: Variedad local', created_at: '2026-11-09T01:00:00Z', term_count: 6 },
  ])
  fireEvent.change(note, { target: { value: 'Bien definido' } })
  fireEvent.click(approve)
  await waitFor(() => expect(review).toHaveBeenCalledWith('p1', { action: 'approve', note: 'Bien definido' }))
  expect(await screen.findByText(/Publicado como HVT:000042/)).toBeInTheDocument()
  // Se refresca la versión y el árbol.
  expect(await screen.findByText('Versión 3')).toBeInTheDocument()
})

it('pedir cambios deja la propuesta editable en Mis propuestas', async () => {
  const { review } = setupReview()
  vi.spyOn(ontologyApi, 'suggest').mockResolvedValue([])
  await screen.findByRole('list', { name: 'Términos de Organismo' })
  fireEvent.click(screen.getByRole('tab', { name: /Revisión/ }))
  const card = await screen.findByRole('article', { name: 'Variedad local' })
  fireEvent.change(within(card).getByLabelText('Nota de revisión'), { target: { value: 'Agrega una fuente' } })
  fireEvent.click(within(card).getByRole('button', { name: 'Pedir cambios' }))
  await waitFor(() =>
    expect(review).toHaveBeenCalledWith('p1', { action: 'request_changes', note: 'Agrega una fuente' }),
  )

  fireEvent.click(screen.getByRole('tab', { name: 'Mis propuestas' }))
  const mine = await screen.findByRole('article', { name: 'Variedad local' })
  expect(within(mine).getByText('En revisión')).toBeInTheDocument()
  expect(await within(mine).findByText(/Agrega una fuente/)).toBeInTheDocument()
  fireEvent.click(within(mine).getByRole('button', { name: 'Editar' }))
  const dialog = await screen.findByRole('dialog', { name: 'Editar propuesta' })
  expect(within(dialog).getByLabelText('Etiqueta')).toHaveValue('Variedad local')
  expect(within(dialog).getByLabelText('Dominio')).toBeDisabled()

  const edit = vi.spyOn(ontologyApi, 'edit').mockImplementation(async (id) => ({ ...detail(TERMS[0]), id }))
  fireEvent.change(within(dialog).getByLabelText('Definición'), {
    target: { value: 'Población cultivada localmente durante generaciones.' },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
  await waitFor(() =>
    expect(edit).toHaveBeenCalledWith('p1', {
      parent_id: 't1',
      label: 'Variedad local',
      definition: 'Población cultivada localmente durante generaciones.',
      aliases: ['criolla'],
      equivalences: [
        {
          scheme: 'bbch',
          external_id: '0',
          url: 'https://doi.org/10.5073/20180906-074619',
          external_label: 'Germination / sprouting / bud development',
          match: 'close',
        },
      ],
    }),
  )
})

it('marcar obsoleto pide reemplazo y nota (superadmin)', async () => {
  loginAs(true)
  setup('/app/ontologia?term=HVT:000003')
  const obsolete = vi
    .spyOn(ontologyApi, 'obsolete')
    .mockImplementation(async () => ({ ...DETAILS.t3, status: 'obsolete', replaced_by: TERMS[0] }))
  const card = await screen.findByRole('region', { name: 'Ficha del término' })
  fireEvent.click(await within(card).findByRole('button', { name: 'Marcar obsoleto' }))
  const dialog = await screen.findByRole('dialog', { name: 'Marcar obsoleto' })
  const confirm = within(dialog).getByRole('button', { name: 'Marcar obsoleto' })
  expect(confirm).toBeDisabled()
  const replacement = within(dialog).getByLabelText('Reemplazado por')
  // No se ofrece a sí mismo ni a un obsoleto.
  expect(within(replacement).queryByRole('option', { name: /Germinación/ })).toBeNull()
  expect(within(replacement).queryByRole('option', { name: /Brote viejo/ })).toBeNull()
  fireEvent.change(replacement, { target: { value: 't1' } })
  fireEvent.change(within(dialog).getByLabelText('Nota'), { target: { value: 'Duplicado' } })
  fireEvent.click(confirm)
  await waitFor(() => expect(obsolete).toHaveBeenCalledWith('t3', { replaced_by_id: 't1', note: 'Duplicado' }))
})

it('sin superadmin la ficha no ofrece «Marcar obsoleto»', async () => {
  loginAs(false)
  setup('/app/ontologia?term=HVT:000003')
  const card = await screen.findByRole('region', { name: 'Ficha del término' })
  await within(card).findByText('Definición de Germinación.')
  expect(within(card).queryByRole('button', { name: 'Marcar obsoleto' })).toBeNull()
})

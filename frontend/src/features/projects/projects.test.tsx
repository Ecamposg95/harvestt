import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import { useAuth } from '@/store/auth'
import * as api from './api'
import { ProjectDetailPage } from './ProjectDetailPage'
import { ProjectsPage } from './ProjectsPage'
import { validateProject } from './ProjectForm'

vi.mock('./api', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  createCropCycle: vi.fn(),
  listObservations: vi.fn(),
  createObservation: vi.fn(),
}))

const mocked = vi.mocked(api)

function setRole(role: 'viewer' | 'editor') {
  const org = { id: 'o1', name: 'Alfa', slug: 'alfa' }
  useAuth.setState({
    token: 't',
    organizationId: 'o1',
    user: { id: 'u1', email: 'a@a.test', full_name: 'A', is_superadmin: false },
    memberships: [{ organization: org, role }],
  })
}

const project: api.ProjectDetail = {
  id: 'p1',
  name: 'Invernadero norte',
  objectives: 'Lechuga continua',
  area_m2: 120,
  system: 'hydroponic',
  location: null,
  version: 1,
  created_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
  crop_cycles: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  setRole('editor')
})

it('valida nombre obligatorio y área positiva', () => {
  const base = { name: '', objectives: '', area_m2: '0', system: 'soil' as const, location: '' }
  expect(validateProject(base)).toEqual({ name: 'El nombre es obligatorio', area_m2: 'Debe ser mayor que 0' })
  expect(validateProject({ ...base, name: 'X', area_m2: '' })).toEqual({})
})

it('ProjectsPage lista proyectos y muestra "Nuevo proyecto" al editor', async () => {
  mocked.listProjects.mockResolvedValue({ items: [project], total: 1, page: 1, page_size: 20 })
  render(
    <MemoryRouter initialEntries={['/app/projects']}>
      <ProjectsPage />
    </MemoryRouter>,
  )
  expect(await screen.findByText('Invernadero norte')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo proyecto' }))
  expect(screen.getByRole('button', { name: 'Crear proyecto' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }))
  expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument()
  expect(mocked.createProject).not.toHaveBeenCalled()
})

it('ProjectsPage oculta la creación al viewer', async () => {
  setRole('viewer')
  mocked.listProjects.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
  render(
    <MemoryRouter initialEntries={['/app/projects?nuevo=1']}>
      <ProjectsPage />
    </MemoryRouter>,
  )
  expect(await screen.findByText('Aún no hay proyectos')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Nuevo proyecto' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Crear proyecto' })).not.toBeInTheDocument()
})

it('ProjectDetailPage muestra conflicto de versión al guardar', async () => {
  mocked.getProject.mockResolvedValue(project)
  mocked.listObservations.mockResolvedValue({
    items: [
      {
        id: 'o1',
        project_id: 'p1',
        crop_cycle_id: null,
        kind: 'note',
        content: 'Primera observación',
        author_id: 'u1',
        author_name: 'Ana',
        observed_at: '2026-10-19T10:00:00Z',
        created_at: '2026-10-19T10:00:00Z',
      },
    ],
    total: 1,
    page: 1,
    page_size: 20,
  })
  const err = new AxiosError('conflict', 'ERR', undefined, undefined, {
    status: 409,
    statusText: 'Conflict',
    data: { error: { code: 'version_conflict', message: 'x' } },
    headers: {},
    config: { headers: new AxiosHeaders() },
  })
  mocked.updateProject.mockRejectedValue(err)

  render(
    <MemoryRouter initialEntries={['/app/projects/p1']}>
      <Routes>
        <Route path="/app/projects/:id" element={<ProjectDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(await screen.findByText('Primera observación')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await waitFor(() => expect(screen.getByText(/Otra persona modificó este proyecto/)).toBeInTheDocument())
  expect(mocked.updateProject).toHaveBeenCalledWith('p1', expect.objectContaining({ version: 1, name: 'Invernadero norte' }))
})

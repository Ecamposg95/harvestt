import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { graphApi } from '@/features/graph/api'
import { useAuth } from '@/store/auth'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
  useAuth.setState({ token: null, user: null, memberships: [] })
})

it('redirige /app a login sin sesión', () => {
  render(
    <MemoryRouter initialEntries={['/app']}>
      <App />
    </MemoryRouter>,
  )
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
})

it('carga /app/graph desde su chunk perezoso', async () => {
  vi.spyOn(graphApi, 'get').mockResolvedValue({ nodes: [], edges: [], truncated: false })
  useAuth.setState({
    token: 't',
    user: { id: 'u1', email: 'ana@alfa.test', full_name: 'Ana', is_superadmin: false },
    memberships: [],
  })
  render(
    <MemoryRouter initialEntries={['/app/graph']}>
      <App />
    </MemoryRouter>,
  )
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Grafo de conocimiento' }, { timeout: 5000 }),
  ).toBeInTheDocument()
  expect(await screen.findByText('Aún no hay nodos')).toBeInTheDocument()
})

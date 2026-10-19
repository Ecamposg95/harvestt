import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

it('redirige /app a login sin sesión', () => {
  render(
    <MemoryRouter initialEntries={['/app']}>
      <App />
    </MemoryRouter>,
  )
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
})

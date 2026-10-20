import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'

vi.mock('@/api/client', () => ({ api: { get: vi.fn(() => Promise.resolve({ data: { user: null, memberships: [] } })) } }))

it('cierra el cajón móvil al cruzar 768px', async () => {
  let listener: ((e: { matches: boolean }) => void) | undefined
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => (listener = cb),
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia
  const { AppLayout } = await import('./AppLayout')
  render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>,
  )
  act(() => screen.getByRole('button', { name: 'Abrir menú' }).click())
  expect(screen.getByTestId('sidebar-overlay')).toBeInTheDocument()
  act(() => listener!({ matches: true }))
  expect(screen.queryByTestId('sidebar-overlay')).toBeNull()
})

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

async function renderSidebar(props = { mobileOpen: false, onClose: () => undefined }) {
  const { Sidebar } = await import('./Sidebar')
  return render(
    <MemoryRouter initialEntries={['/app/projects']}>
      <Sidebar {...props} />
    </MemoryRouter>,
  )
}

it('arranca plegado con nombres accesibles y se expande', async () => {
  await renderSidebar()
  const nav = screen.getByRole('navigation', { name: 'Principal' })
  expect(nav.closest('aside')!.className).toContain('md:w-16')
  expect(screen.getByRole('link', { name: 'Proyectos' })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: 'Expandir menú' }))
  expect(nav.closest('aside')!.className).toContain('md:w-[232px]')
  expect(window.localStorage.getItem('harvestt_sidebar')).toBe('0')
})

it('recuerda la preferencia expandida', async () => {
  window.localStorage.setItem('harvestt_sidebar', '0')
  await renderSidebar()
  expect(screen.getByRole('button', { name: 'Plegar menú' })).toBeInTheDocument()
})

it('funciona aunque localStorage lance', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('bloqueado')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('bloqueado')
  })
  await renderSidebar()
  fireEvent.click(screen.getByRole('button', { name: 'Expandir menú' }))
  expect(screen.getByRole('button', { name: 'Plegar menú' })).toBeInTheDocument()
})

it('en móvil abierto muestra overlay que cierra', async () => {
  const onClose = vi.fn()
  await renderSidebar({ mobileOpen: true, onClose })
  fireEvent.click(screen.getByTestId('sidebar-overlay'))
  expect(onClose).toHaveBeenCalled()
})

it('en móvil abierto es un diálogo modal: foco dentro, Esc cierra y Tab no escapa', async () => {
  const onClose = vi.fn()
  await renderSidebar({ mobileOpen: true, onClose })
  const dialog = screen.getByRole('dialog', { name: 'Menú' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  const focusables = dialog.querySelectorAll<HTMLElement>('a[href], button')
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  expect(first).toHaveFocus()
  last.focus()
  fireEvent.keyDown(last, { key: 'Tab' })
  expect(first).toHaveFocus()
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
  expect(last).toHaveFocus()
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})

it('en escritorio no es diálogo', async () => {
  await renderSidebar()
  expect(screen.queryByRole('dialog')).toBeNull()
})

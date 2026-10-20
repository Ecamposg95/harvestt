import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})

it('usa tema claro cuando no hay preferencia guardada', async () => {
  const { useTheme } = await import('./theme')
  expect(useTheme.getState().theme).toBe('light')
  expect(document.documentElement.classList.contains('dark')).toBe(false)
})

it('respeta la preferencia oscura guardada', async () => {
  window.localStorage.setItem('harvestt_theme', 'dark')
  const { useTheme } = await import('./theme')
  expect(useTheme.getState().theme).toBe('dark')
  expect(document.documentElement.classList.contains('dark')).toBe(true)
})

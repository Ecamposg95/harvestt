import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { Kpi } from './api'
import { KpiFigure } from './KpiFigure'

export const kpi = (over: Partial<Kpi>): Kpi => ({
  key: 'active_cycles',
  label: 'Ciclos activos',
  value: 2,
  unit: null,
  origin: 'measured',
  formula: 'Número de ciclos del proyecto con estado «activo».',
  inputs_count: 3,
  as_of: '2026-10-22T12:00:00Z',
  ...over,
})

it('sin valor muestra "Sin datos suficientes" y ningún badge de origen', () => {
  render(<KpiFigure kpi={kpi({ value: null, origin: 'derived' })} size="tile" />)
  expect(screen.getByText('Sin datos suficientes')).toBeInTheDocument()
  expect(screen.queryByText('Derivado')).toBeNull()
})

it('con valor 0 muestra "0" y su badge', () => {
  render(<KpiFigure kpi={kpi({ value: 0 })} size="tile" />)
  expect(screen.getByText('0')).toBeInTheDocument()
  expect(screen.getByText('Medido')).toBeInTheDocument()
})

it('muestra unidad junto al valor', () => {
  render(<KpiFigure kpi={kpi({ value: 37.46, unit: '%', origin: 'derived' })} size="hero" />)
  expect(screen.getByText('37.5')).toBeInTheDocument()
  expect(screen.getByText('%')).toBeInTheDocument()
})

it('la fórmula aparece al enfocar o tocar "Cómo se calcula" y Escape la oculta', () => {
  render(<KpiFigure kpi={kpi({})} size="tile" />)
  const button = screen.getByRole('button', { name: /Cómo se calcula/ })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  fireEvent.focus(button)
  expect(button).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('tooltip')).toHaveTextContent('Número de ciclos del proyecto con estado «activo».')
  fireEvent.keyDown(button, { key: 'Escape' })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(button)
  expect(button).toHaveAttribute('aria-expanded', 'true')
})

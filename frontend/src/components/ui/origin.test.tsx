import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ORIGIN_META, OriginBadge, StatTile } from '.'

it.each([
  ['measured', 'Medido'],
  ['sourced', 'Fuente'],
  ['derived', 'Derivado'],
  ['simulated', 'Simulado'],
  ['illustrative', 'Ilustrativo'],
  ['missing', 'Desconocido'],
])('OriginBadge %s → %s con explicación', (origin, text) => {
  render(<OriginBadge origin={origin} />)
  const el = screen.getByText(text)
  expect(el).toHaveAttribute('title', ORIGIN_META[origin as keyof typeof ORIGIN_META].hint)
  expect(el.className).not.toContain('text-lime')
})

it('OriginBadge con origen desconocido muestra la clave tal cual', () => {
  render(<OriginBadge origin="otro" />)
  expect(screen.getByText('otro')).toBeInTheDocument()
})

it('StatTile sin valor muestra texto vacío, nunca 0', () => {
  render(<StatTile label="Temperatura del aire" value={null} unit="°C" emptyText="Sin lecturas" />)
  expect(screen.getByText('Sin lecturas')).toBeInTheDocument()
  expect(screen.queryByText(/0/)).toBeNull()
})

it('StatTile con valor 0 sí muestra 0', () => {
  render(<StatTile label="Observaciones" value={0} />)
  expect(screen.getByText('0')).toBeInTheDocument()
})

it('StatTile con origen muestra la etiqueta', () => {
  render(<StatTile label="Humedad" value={61} unit="%" origin="simulated" />)
  expect(screen.getByText('61')).toBeInTheDocument()
  expect(screen.getByText('Simulado')).toBeInTheDocument()
})

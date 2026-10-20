import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Callout } from '.'

it('ancla el punto en x,y y muestra la etiqueta', () => {
  render(<Callout x={120} y={80} label="Sensor de humedad" />)
  const root = screen.getByTestId('callout')
  expect(root.style.left).toBe('120px')
  expect(root.style.top).toBe('80px')
  expect(screen.getByText('Sensor de humedad')).toBeInTheDocument()
})

it('lado izquierdo invierte la dirección', () => {
  render(<Callout x={10} y={10} label="LED" side="left" />)
  expect(screen.getByTestId('callout').className).toContain('flex-row-reverse')
})

it('atenuado baja la opacidad', () => {
  render(<Callout x={0} y={0} label="Oculto" dimmed />)
  expect(screen.getByTestId('callout').className).toContain('opacity-35')
})

it('con índice muestra el número para móvil y oculta línea y etiqueta en pantallas chicas', () => {
  render(<Callout x={0} y={0} label="Bomba" index={3} title="Riego por goteo" />)
  const number = screen.getByText('3')
  expect(number.className).toContain('sm:hidden')
  const label = screen.getByText('Bomba')
  expect(label.className).toContain('hidden')
  expect(label.className).toContain('sm:inline-block')
  expect(label).toHaveAttribute('title', 'Riego por goteo')
})

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

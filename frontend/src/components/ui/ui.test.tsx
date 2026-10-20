import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Badge, Button, Card, PageHeader } from '.'

it('Button primario es píldora oscura', () => {
  render(<Button>Entrar</Button>)
  const btn = screen.getByRole('button', { name: 'Entrar' })
  expect(btn.className).toContain('rounded-full')
  expect(btn.className).toContain('bg-ink')
})

it('Card usa vidrio', () => {
  render(<Card data-testid="c">x</Card>)
  expect(screen.getByTestId('c').className).toContain('glass')
})

it('Badge lime rellena con lime pero escribe en tinta', () => {
  render(<Badge tone="lime">Simulado</Badge>)
  const b = screen.getByText('Simulado')
  expect(b.className).toContain('bg-lime')
  expect(b.className).not.toContain('text-lime')
})

it('PageHeader muestra eyebrow y título display', () => {
  render(<PageHeader eyebrow="Espacio" title="Proyectos" />)
  expect(screen.getByText('Espacio')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Proyectos' }).className).toContain('display')
})

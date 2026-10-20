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

it('Badge: opacidades de Tailwind válidas en todos los tonos', () => {
  const steps = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]
  for (const tone of ['neutral', 'accent', 'lime', 'warning', 'danger'] as const) {
    const { unmount } = render(<Badge tone={tone}>t-{tone}</Badge>)
    for (const m of screen.getByText(`t-${tone}`).className.matchAll(/\/(\d+)/g)) expect(steps).toContain(Number(m[1]))
    unmount()
  }
})

it('Badge lime es relleno sólido con tinta', () => {
  render(<Badge tone="lime">Simulado</Badge>)
  const b = screen.getByText('Simulado')
  expect(b.className).toContain('bg-lime')
  expect(b.className).toContain('text-ink')
  expect(b.className).not.toContain('bg-lime/')
  expect(b.className).not.toContain('text-lime')
})

it('PageHeader muestra eyebrow y título display', () => {
  render(<PageHeader eyebrow="Espacio" title="Proyectos" />)
  expect(screen.getByText('Espacio')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Proyectos' }).className).toContain('display')
})

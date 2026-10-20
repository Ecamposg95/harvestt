import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { BarChart, Gauge, LineChart, linePaths } from '.'

it('BarChart no dibuja barra para null', () => {
  const { container } = render(
    <BarChart ariaLabel="Temperatura" data={[{ label: 'a', value: 2 }, { label: 'b', value: null }, { label: 'c', value: 4 }]} />,
  )
  expect(container.querySelectorAll('[data-bar]')).toHaveLength(2)
  expect(container.querySelectorAll('[data-gap]')).toHaveLength(1)
})

it('BarChart dibuja el 0 como línea base plana, distinta del hueco', () => {
  const { container } = render(<BarChart ariaLabel="Conteo" data={[{ label: 'a', value: 0 }, { label: 'b', value: 3 }, { label: 'c', value: null }]} />)
  expect(container.querySelectorAll('[data-zero]')).toHaveLength(1)
  expect(container.querySelectorAll('[data-bar]')).toHaveLength(1)
  expect(container.querySelectorAll('[data-gap]')).toHaveLength(1)
})

it('linePaths corta la línea en los huecos', () => {
  const paths = linePaths([1, 2, null, null, 3, 4], 100, 50, 0, 5)
  expect(paths).toHaveLength(2)
  expect(paths[0].startsWith('M')).toBe(true)
})

it('linePaths sin datos no produce tramos', () => {
  expect(linePaths([null, null], 100, 50, 0, 1)).toEqual([])
})

it('LineChart sin datos muestra Sin lecturas', () => {
  render(<LineChart ariaLabel="Humedad" data={[]} />)
  expect(screen.getByText('Sin lecturas')).toBeInTheDocument()
})

it('Gauge sin valor muestra Sin señal', () => {
  render(<Gauge value={null} min={0} max={50} label="Temperatura" unit="°C" />)
  expect(screen.getByText('Sin señal')).toBeInTheDocument()
})

it('Gauge acota el valor al rango', () => {
  render(<Gauge value={80} min={0} max={50} label="Temperatura" unit="°C" />)
  expect(screen.getByText('80')).toBeInTheDocument()
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '50')
})

it('LineChart dibuja un punto visible para una lectura aislada', () => {
  const { container } = render(<LineChart ariaLabel="Humedad" data={[{ t: 'a', value: 5 }]} />)
  expect(container.querySelectorAll('circle')).toHaveLength(1)
})

it('LineChart dibuja un punto por cada lectura aislada separada por huecos', () => {
  const { container } = render(
    <LineChart
      ariaLabel="Humedad"
      data={[{ t: 'a', value: 1 }, { t: 'b', value: null }, { t: 'c', value: 2 }]}
    />,
  )
  expect(container.querySelectorAll('circle')).toHaveLength(2)
})

it('BarChart sin datos válidos muestra Sin lecturas', () => {
  render(<BarChart ariaLabel="Temperatura" data={[{ label: 'a', value: null }]} />)
  expect(screen.getByText('Sin lecturas')).toBeInTheDocument()
})

it('Gauge sin valor expone aria-valuetext Sin señal', () => {
  render(<Gauge value={null} min={0} max={50} label="Temperatura" />)
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'Sin señal')
})

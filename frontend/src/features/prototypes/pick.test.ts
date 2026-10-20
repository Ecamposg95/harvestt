import { expect, it } from 'vitest'
import { isClick, PICK_TOLERANCE_PX } from './pick'

it('un clic sin arrastre cuenta como selección', () => {
  expect(isClick({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(true)
})

it('arrastrar para girar no cuenta como selección', () => {
  expect(isClick({ x: 10, y: 10 }, { x: 10 + PICK_TOLERANCE_PX + 1, y: 10 })).toBe(false)
})

it('sin pointerdown previo no hay selección', () => {
  expect(isClick(null, { x: 0, y: 0 })).toBe(false)
})

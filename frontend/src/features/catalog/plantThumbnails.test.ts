import { describe, expect, it, vi } from 'vitest'
import { createThumbnailCache } from './plantThumbnails'

describe('miniaturas', () => {
  it('dibuja una vez por (especie, variante) y carga el renderer una sola vez', async () => {
    const render = vi.fn((kind: string, seed: number) => `data:${kind}:${seed}`)
    const load = vi.fn(async () => render)
    const cache = createThumbnailCache(load)
    const [a, b, c] = await Promise.all([cache.get('lettuce', 0), cache.get('lettuce', 0), cache.get('tomato', 1)])
    expect(a).toBe('data:lettuce:0')
    expect(b).toBe(a)
    expect(c).toBe('data:tomato:1')
    expect(render).toHaveBeenCalledTimes(2)
    expect(load).toHaveBeenCalledTimes(1)
    expect(cache.size()).toBe(2)
  })

  it('sin WebGL, si falla la carga del chunk o si falla el dibujo devuelve null', async () => {
    expect(await createThumbnailCache(async () => () => null).get('basil', 0)).toBeNull()
    expect(await createThumbnailCache(() => Promise.reject(new Error('chunk'))).get('basil', 0)).toBeNull()
    const broken = createThumbnailCache(async () => () => {
      throw new Error('gl')
    })
    expect(await broken.get('basil', 0)).toBeNull()
    // Un fallo no bloquea la cola: la siguiente miniatura se resuelve
    expect(await broken.get('tomato', 0)).toBeNull()
  })
})

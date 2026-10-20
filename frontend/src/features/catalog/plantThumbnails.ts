import { useEffect, useState } from 'react'
import type { PlantKind } from '@/features/three/plants/types'

export type ThumbnailRenderer = (kind: PlantKind, seed: number) => string | null

/**
 * Una promesa por (especie, variante): cada miniatura se dibuja una sola vez por sesión. Los dibujos van en
 * cola y ceden el hilo entre uno y otro para no trabar el scroll. Cualquier fallo resuelve a null.
 */
export function createThumbnailCache(load: () => Promise<ThumbnailRenderer>) {
  const cache = new Map<string, Promise<string | null>>()
  let renderer: Promise<ThumbnailRenderer | null> | null = null
  let queue: Promise<unknown> = Promise.resolve()
  return {
    get(kind: PlantKind, seed: number): Promise<string | null> {
      const key = `${kind}:${seed}`
      let hit = cache.get(key)
      if (!hit) {
        if (!renderer) renderer = load().catch(() => null)
        const loaded = renderer
        hit = queue
          .then(() => loaded)
          .then(
            (render) =>
              new Promise<string | null>((resolve) => {
                setTimeout(() => {
                  if (!render) return resolve(null)
                  try {
                    resolve(render(kind, seed))
                  } catch {
                    resolve(null)
                  }
                }, 0)
              }),
          )
        queue = hit
        cache.set(key, hit)
      }
      return hit
    },
    size: () => cache.size,
    clear: () => {
      cache.clear()
      renderer = null
    },
  }
}

// three entra solo por este import() dinámico.
export const plantThumbnails = createThumbnailCache(() =>
  import('@/features/three/plants/thumbnails').then((m) => m.renderPlantThumbnail),
)

export function usePlantThumbnail(kind: PlantKind, seed: number): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    plantThumbnails.get(kind, seed).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [kind, seed])
  return url
}

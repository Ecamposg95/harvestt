import { lazy, Suspense } from 'react'
import type { StudioSceneProps } from './sceneTypes'

// three vive solo en el chunk de StudioScene.
const StudioSceneImpl = lazy(() => import('./StudioScene'))

export function StudioScene(props: StudioSceneProps) {
  return (
    <Suspense
      fallback={
        <div role="status" className="flex h-full w-full items-center justify-center text-xs font-medium text-muted">
          Preparando escena 3D…
        </div>
      }
    >
      <StudioSceneImpl {...props} />
    </Suspense>
  )
}

import { lazy, Suspense } from 'react'
import type { PlantViewerProps } from './types'

// three vive solo en el chunk de PlantViewer.
const PlantViewerImpl = lazy(() => import('./PlantViewer'))

export function PlantViewer(props: PlantViewerProps) {
  return (
    <Suspense
      fallback={
        <div role="status" className={`flex items-center justify-center text-xs font-medium text-muted ${props.className ?? ''}`}>
          Preparando ilustración 3D…
        </div>
      }
    >
      <PlantViewerImpl {...props} />
    </Suspense>
  )
}

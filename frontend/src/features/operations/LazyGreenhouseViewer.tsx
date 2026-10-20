import { lazy, Suspense } from 'react'
import type { GreenhouseViewerProps } from './GreenhouseViewer'

// three.js vive solo en este chunk perezoso.
const GreenhouseViewerImpl = lazy(() => import('./GreenhouseViewer'))

export type { SceneDevice } from './GreenhouseViewer'

export function GreenhouseViewer(props: GreenhouseViewerProps) {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          className={`flex items-center justify-center rounded-[22px] border border-border bg-surface text-xs font-medium text-muted ${props.className ?? ''}`}
        >
          Preparando invernadero 3D…
        </div>
      }
    >
      <GreenhouseViewerImpl {...props} />
    </Suspense>
  )
}

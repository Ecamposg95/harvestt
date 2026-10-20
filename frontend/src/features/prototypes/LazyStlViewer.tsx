import { lazy, Suspense } from 'react'
import type { StlViewerProps } from './StlViewer'

// three.js vive solo en este chunk perezoso.
const StlViewerImpl = lazy(() => import('./StlViewer'))

export function StlViewer(props: StlViewerProps) {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          className={`flex items-center justify-center rounded-[22px] border border-border bg-surface text-xs font-medium text-muted ${props.className ?? ''}`}
        >
          Preparando visor 3D…
        </div>
      }
    >
      <StlViewerImpl {...props} />
    </Suspense>
  )
}

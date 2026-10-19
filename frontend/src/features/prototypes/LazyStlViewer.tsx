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
          className={`flex items-center justify-center rounded-lg border border-border bg-surface font-mono text-xs uppercase tracking-widest text-muted ${props.className ?? ''}`}
        >
          Preparando visor 3D…
        </div>
      }
    >
      <StlViewerImpl {...props} />
    </Suspense>
  )
}

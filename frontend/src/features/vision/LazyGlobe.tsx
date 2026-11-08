import { lazy, Suspense } from 'react'
import type { GlobeProps } from './Globe'

// three.js vive solo en este chunk perezoso.
const GlobeImpl = lazy(() => import('./Globe'))

export function LazyGlobe(props: GlobeProps) {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          className={`flex aspect-square w-full max-w-[520px] items-center justify-center text-xs font-medium text-muted ${props.className ?? ''}`}
        >
          Preparando globo…
        </div>
      }
    >
      <GlobeImpl {...props} />
    </Suspense>
  )
}

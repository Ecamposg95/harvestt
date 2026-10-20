import { useMemo, useState } from 'react'
import { CalloutProjector, ProjectedCallout } from './projection'

/** Estado de React con los callouts proyectados; el bucle de render del visor llama a projector.update. */
export function useProjectedCallouts() {
  const [projected, setProjected] = useState<ProjectedCallout[]>([])
  const projector = useMemo(() => new CalloutProjector(setProjected), [])
  return { projected, projector }
}

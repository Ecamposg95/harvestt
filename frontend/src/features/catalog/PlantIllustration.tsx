import { OriginBadge } from '@/components/ui'
import { PlantViewer } from '@/features/three/plants/LazyPlantViewer'
import { ILLUSTRATIVE_NOTICE, plantKindFor } from '@/features/three/plants/types'
import type { SpeciesDetail } from './api'
import { plantViewerCallouts } from './traitCallouts'

/** Planta 3D procedural madura de la especie, con sus rasgos como callouts. Siempre etiquetada ILUSTRATIVO. */
export function PlantIllustration({ species }: { species: SpeciesDetail }) {
  const kind = plantKindFor(species.scientific_name)
  return (
    <figure className="relative">
      <PlantViewer
        kind={kind}
        stage="mature"
        label={`Ilustración 3D de ${species.scientific_name}`}
        callouts={plantViewerCallouts(species.trait_assertions)}
        className="h-72 w-full rounded-[22px] lg:h-96 bg-gradient-to-b from-lime/15 to-transparent"
      />
      {/* Fondo opaco: un callout que pase por detrás no debe tapar la etiqueta. */}
      <div className="absolute left-3 top-3 z-10 rounded-full bg-surface">
        <OriginBadge origin="illustrative" />
      </div>
      <figcaption className="mt-2 text-[11px] text-muted">
        {ILLUSTRATIVE_NOTICE}
        {kind === 'generic' && ' · Forma genérica: aún no hay generador para esta especie.'}
      </figcaption>
    </figure>
  )
}

import { OriginBadge } from '@/components/ui'
import { plantKindFor, variantFor } from '@/features/three/plants/types'
import { usePlantThumbnail } from './plantThumbnails'

/** Miniatura procedural de la especie (PNG en caché); sin WebGL, la inicial. Siempre ILUSTRATIVO. */
export function PlantThumb({ speciesId, scientificName }: { speciesId: string; scientificName: string }) {
  const url = usePlantThumbnail(plantKindFor(scientificName), variantFor(speciesId))
  return (
    <div className="relative flex h-36 items-end justify-center overflow-hidden rounded-[18px] bg-gradient-to-b from-lime/20 to-transparent">
      {url ? (
        <img
          src={url}
          alt={`Ilustración de ${scientificName}`}
          width={144}
          height={144}
          className="h-36 w-36 object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-lime/30 text-3xl font-semibold text-ink"
        >
          {scientificName.charAt(0).toUpperCase()}
        </span>
      )}
      <OriginBadge origin="illustrative" className="absolute right-2 top-2" />
    </div>
  )
}

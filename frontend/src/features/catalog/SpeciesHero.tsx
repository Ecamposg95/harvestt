import { Callout, OriginBadge } from '@/components/ui'
import { AuthedImage } from '@/features/prototypes/shared'
import type { SpeciesDetail, SpeciesMedia } from './api'
import { traitCallout } from './traitCallouts'

/** Imagen héroe con crédito visible y callouts 2D en posiciones relativas (0..1). */
export function SpeciesHero({ species, media }: { species: SpeciesDetail; media: SpeciesMedia }) {
  return (
    <figure>
      <div className="relative overflow-hidden rounded-[22px]">
        <AuthedImage
          path={media.url}
          alt={`Imagen de ${species.scientific_name}`}
          className="block aspect-[4/3] w-full object-cover"
        />
        {media.callouts.map((c, i) => {
          const t = traitCallout(species.trait_assertions, c.trait_variable)
          return (
            <div
              key={`${c.trait_variable}-${i}`}
              data-testid="media-callout"
              className="absolute"
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
            >
              <Callout x={0} y={0} side={c.x > 0.5 ? 'left' : 'right'} label={`${t.label}: ${t.value}`}>
                <OriginBadge origin={t.origin} className="ml-2" />
              </Callout>
            </div>
          )
        })}
      </div>
      <figcaption className="mt-2 text-[11px] text-muted">
        {media.kind === 'render' ? 'Render' : 'Foto'}: {media.attribution} · Licencia {media.license}
        {media.source_url && (
          <>
            {' · '}
            <a href={media.source_url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
              Fuente
            </a>
          </>
        )}
      </figcaption>
    </figure>
  )
}

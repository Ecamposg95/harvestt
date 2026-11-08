import type { VisionSite } from './api'
import { equirect } from './geo'
import { SiteList } from './SiteList'

const W = 360
const H = 180

/** Mapa equirectangular 2D para navegadores sin WebGL, con la lista accesible de sitios. */
export function GlobeFallback({ sites, className = '' }: { sites: VisionSite[]; className?: string }) {
  const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150]
  const parallels = [-60, -30, 0, 30, 60]
  return (
    <div className={`min-w-0 ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa de sitios de la red" className="h-auto w-full rounded-[22px] bg-surface/60">
        <g className="stroke-border" strokeWidth={0.5} fill="none">
          <rect x={0} y={0} width={W} height={H} />
          {meridians.map((lon) => {
            const [x] = equirect(0, lon, W, H)
            return <line key={`m${lon}`} x1={x} y1={0} x2={x} y2={H} />
          })}
          {parallels.map((lat) => {
            const [, y] = equirect(lat, 0, W, H)
            return <line key={`p${lat}`} x1={0} y1={y} x2={W} y2={y} />
          })}
        </g>
        {sites.map((s, i) => {
          const [x, y] = equirect(s.lat, s.lon, W, H)
          return s.kind === 'historic' ? (
            <rect key={i} x={x - 3} y={y - 3} width={6} height={6} transform={`rotate(45 ${x} ${y})`} className="fill-muted stroke-text" strokeWidth={0.8} />
          ) : (
            <circle key={i} cx={x} cy={y} r={3.5} fill="none" strokeWidth={1.2} strokeDasharray="2 1.5" className="stroke-accent" />
          )
        })}
      </svg>
      <SiteList sites={sites} className="mt-3" />
    </div>
  )
}

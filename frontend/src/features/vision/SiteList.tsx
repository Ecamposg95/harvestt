import type { VisionSite } from './api'

const KIND_LABEL: Record<VisionSite['kind'], string> = { historic: 'prototipo histórico', future: 'nodo solicitado' }

/** Clave del globo y lista accesible de sitios; la comparten el globo WebGL y el mapa 2D. */
export function SiteList({ sites, className = '' }: { sites: VisionSite[]; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-xs font-semibold text-muted">◆ prototipo histórico · ○ nodo solicitado</p>
      <ul aria-label="Sitios de la red" className="mt-2 space-y-1 text-sm text-muted">
        {sites.map((s, i) => (
          <li key={i} className="break-words">
            <span className="font-semibold text-text">{s.label}</span> · <span>{KIND_LABEL[s.kind]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

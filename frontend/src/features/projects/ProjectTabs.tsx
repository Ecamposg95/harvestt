import { Link } from 'react-router-dom'
import { cx } from '@/components/ui'

export type ProjectTab = 'resumen' | 'bitacora' | 'ciclos' | 'operaciones'

const TABS: Array<{ key: ProjectTab; label: string }> = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'bitacora', label: 'Bitácora' },
  { key: 'ciclos', label: 'Ciclos' },
  { key: 'operaciones', label: 'Operaciones' },
]

export function projectTabHref(projectId: string, tab: ProjectTab): string {
  const base = `/app/projects/${encodeURIComponent(projectId)}`
  if (tab === 'resumen') return base
  if (tab === 'operaciones') return `${base}/operations`
  return `${base}?tab=${tab}`
}

export function ProjectTabs({ projectId, active }: { projectId: string; active: ProjectTab }) {
  return (
    <nav aria-label="Secciones del proyecto" className="mb-6 flex gap-2 overflow-x-auto pb-1">
      {TABS.map((t) => (
        <Link
          key={t.key}
          to={projectTabHref(projectId, t.key)}
          aria-current={t.key === active ? 'page' : undefined}
          className={cx(
            'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
            t.key === active ? 'bg-lime text-ink' : 'glass !rounded-full text-muted hover:text-fg',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

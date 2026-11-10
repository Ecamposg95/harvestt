import { Badge, cx } from '@/components/ui'
import type { TermSummary } from './api'
import { STATUS_LABELS, STATUS_TONES } from './labels'
import type { TreeNode } from './tree'

interface RowProps {
  term: TermSummary
  selected: boolean
  onSelect: (term: TermSummary) => void
  showDomain?: string
}

/** Botón de un término: etiqueta, ID HVT y estado si no está publicado. */
export function TermRow({ term, selected, onSelect, showDomain }: RowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(term)}
      aria-current={selected ? 'true' : undefined}
      className={cx(
        'flex w-full min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors',
        selected ? 'bg-ink text-ink-fg' : 'text-fg hover:bg-fg/5',
      )}
    >
      <span className={cx('min-w-0 flex-1 truncate', term.status === 'obsolete' && 'line-through opacity-70')}>
        {term.label}
      </span>
      {showDomain && <span className={cx('hidden text-[11px] sm:inline', selected ? 'text-ink-fg/70' : 'text-muted')}>{showDomain}</span>}
      {term.status !== 'published' && (
        <Badge tone={STATUS_TONES[term.status] ?? 'neutral'} className="shrink-0">
          {STATUS_LABELS[term.status] ?? term.status}
        </Badge>
      )}
      <span className={cx('shrink-0 font-mono text-[11px]', selected ? 'text-ink-fg/70' : 'text-muted')}>
        {term.hvt_id ?? '—'}
      </span>
    </button>
  )
}

interface BranchProps {
  nodes: TreeNode[]
  selectedId: string | null
  onSelect: (t: TermSummary) => void
  label?: string
}

function Branch({ nodes, selectedId, onSelect, label }: BranchProps) {
  return (
    <ul aria-label={label} className={cx('space-y-0.5', !label && 'ml-3 mt-0.5 border-l border-border/70 pl-2')}>
      {nodes.map((n) => (
        <li key={n.id}>
          <TermRow term={n} selected={n.id === selectedId} onSelect={onSelect} />
          {n.children.length > 0 && <Branch nodes={n.children} selectedId={selectedId} onSelect={onSelect} />}
        </li>
      ))}
    </ul>
  )
}

/** Árbol de un dominio, totalmente desplegado (los dominios son pequeños). */
export function TermTree({
  nodes,
  label,
  selectedId,
  onSelect,
}: {
  nodes: TreeNode[]
  label: string
  selectedId: string | null
  onSelect: (term: TermSummary) => void
}) {
  if (nodes.length === 0) {
    return <p className="px-2 py-6 text-sm text-muted">Este dominio aún no tiene términos.</p>
  }
  return <Branch nodes={nodes} selectedId={selectedId} onSelect={onSelect} label={label} />
}

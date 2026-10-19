import { Button } from '@/components/ui'

interface Props {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}

/** Paginación simple anterior/siguiente; no se muestra si todo cabe en una página. */
export function Pagination({ page, pageSize, total, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <nav aria-label="Paginación" className="mt-6 flex items-center justify-between gap-3 text-sm text-muted">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      <span className="font-mono text-xs">
        Página {page} de {pages}
      </span>
      <Button variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Siguiente
      </Button>
    </nav>
  )
}

import { ReactNode, useEffect, useId, useRef } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** Ancho del panel: `md` (formularios cortos, por defecto) o `lg` (formularios largos). */
  size?: 'md' | 'lg'
}

/** Diálogo modal mínimo: cierra con Escape o clic en el fondo y enfoca su contenido al abrir. */
export function Dialog({ title, onClose, children, size = 'md' }: Props) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first =
      panel.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel.current?.querySelector<HTMLElement>('select, input, textarea, button')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm p-4 sm:items-center" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`glass max-h-full w-full overflow-y-auto p-6 ${size === 'lg' ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md px-2 text-xl leading-none text-muted hover:bg-raised hover:text-fg"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

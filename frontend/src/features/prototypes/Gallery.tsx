import { KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'

export interface GalleryImage {
  id: string
  src: string
  caption?: string
}

/** Grilla de imágenes con lightbox accesible: Esc cierra, ←/→ navegan, el foco queda atrapado y se restaura. */
export function Gallery({ images, title = 'Galería' }: { images: GalleryImage[]; title?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const triggers = useRef<Array<HTMLButtonElement | null>>([])
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const lastOpened = useRef<number | null>(null)

  const close = useCallback(() => setOpen(null), [])
  const step = useCallback(
    (delta: number) => setOpen((i) => (i === null ? i : (i + delta + images.length) % images.length)),
    [images.length],
  )

  useEffect(() => {
    if (open === null) {
      if (lastOpened.current !== null) triggers.current[lastOpened.current]?.focus()
      lastOpened.current = null
      return
    }
    if (lastOpened.current === null) closeRef.current?.focus()
    lastOpened.current = open
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      step(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'Tab') {
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button')
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  if (images.length === 0) return null
  const current = open !== null ? images[open] : null

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((img, i) => (
          <li key={img.id}>
            <button
              ref={(el) => {
                triggers.current[i] = el
              }}
              type="button"
              onClick={() => setOpen(i)}
              className="group glass block w-full overflow-hidden text-left"
              aria-label={`Ampliar imagen ${i + 1} de ${images.length}${img.caption ? `: ${img.caption}` : ''}`}
            >
              <img
                src={img.src}
                alt={img.caption || `${title}, imagen ${i + 1}`}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              {img.caption && <span className="block truncate px-3 py-2 text-xs text-muted">{img.caption}</span>}
            </button>
          </li>
        ))}
      </ul>

      {current && open !== null && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${title}: imagen ${open + 1} de ${images.length}`}
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs uppercase tracking-widest text-white/70">
            <span>
              {open + 1} / {images.length}
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              className="rounded-full border border-white/20 px-3 py-1.5 text-white hover:bg-white/10"
            >
              Cerrar
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16" onClick={close}>
            <img
              src={current.src}
              alt={current.caption || `${title}, imagen ${open + 1}`}
              className="max-h-full max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-4">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={images.length < 2}
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs uppercase tracking-wider text-white hover:bg-white/10 disabled:opacity-30"
            >
              ← Anterior
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-sm text-white/80">{current.caption}</p>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={images.length < 2}
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs uppercase tracking-wider text-white hover:bg-white/10 disabled:opacity-30"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </>
  )
}

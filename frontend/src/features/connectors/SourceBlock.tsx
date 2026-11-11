import { ReactNode } from 'react'
import type { BankSourceOut, CopyOut } from './api'
import { formatDay } from './labels'

/** ¿La copia trae datos que se pueden mostrar (aunque estén desactualizados)? */
export const hasData = (copy: CopyOut | null): copy is CopyOut => copy !== null && copy.status === 'ok'

/** Estado de la copia local según la regla R6; nada si la copia está vigente. */
export function CopyNotice({ copy }: { copy: CopyOut | null }) {
  if (copy === null || copy.status === 'error')
    return (
      <div className="space-y-1">
        <p className="text-sm text-muted">Sin datos de esta fuente todavía</p>
        {copy?.last_error && <p className="text-xs text-danger">Último intento: {copy.last_error}</p>}
      </div>
    )
  return (
    <>
      {copy.stale && copy.fetched_at && (
        <p className="rounded-xl bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning">
          Fuente no disponible · última copia del {formatDay(copy.fetched_at)}
        </p>
      )}
      {copy.status === 'not_found' && <p className="text-sm text-muted">{copy.reason ?? 'Sin coincidencia exacta'}</p>}
    </>
  )
}

/** Pie de atribución de una copia: texto, licencia y enlace a la fuente. */
export function Attribution({ copy }: { copy: CopyOut }) {
  if (!copy.attribution && !copy.license && !copy.source_url) return null
  return (
    <p className="text-[11px] leading-relaxed text-muted">
      {copy.attribution}
      {copy.license && <> Licencia: {copy.license}.</>}
      {copy.source_url && (
        <>
          {' '}
          <a href={copy.source_url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
            Ver en la fuente
          </a>
        </>
      )}
    </p>
  )
}

/** Bloque de una fuente: encabezado, estado de la copia y contenido si hay datos. */
export function SourceBlock({
  source,
  title,
  aside,
  children,
  className = '',
}: {
  source: BankSourceOut | undefined
  title?: string
  /** Sustituye a la descripción del aporte en el encabezado (p. ej., la etiqueta de origen). */
  aside?: ReactNode
  children?: (copy: CopyOut) => ReactNode
  className?: string
}) {
  const copy = source?.copy ?? null
  return (
    <div className={`min-w-0 space-y-3 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">{title ?? source?.label}</h3>
        {aside ?? (source && <span className="text-xs text-muted">{source.contribution}</span>)}
      </div>
      <CopyNotice copy={copy} />
      {hasData(copy) && children?.(copy)}
      {copy && copy.status !== 'error' && <Attribution copy={copy} />}
    </div>
  )
}

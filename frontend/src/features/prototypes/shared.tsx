import { ImgHTMLAttributes, ReactNode, useEffect, useState } from 'react'
import { Badge } from '@/components/ui'
import { api } from '@/api/client'
import { statusLabel, statusTone } from './status'

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={statusTone(status)} className={className}>
      {statusLabel(status)}
    </Badge>
  )
}

/**
 * Texto tipo Markdown renderizado de forma segura como texto plano de React (sin HTML):
 * párrafos por línea en blanco, `# ` títulos, `- ` listas y saltos de línea preservados.
 */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
  const out: ReactNode[] = blocks.map((block, i) => {
    const lines = block.split('\n')
    const heading = /^(#{1,3})\s+(.*)$/.exec(block)
    if (heading && lines.length === 1) {
      return (
        <h3 key={i} className="pt-2 text-lg font-semibold text-fg">
          {heading[2]}
        </h3>
      )
    }
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      return (
        <ul key={i} className="list-disc space-y-1 pl-5">
          {lines.map((l, j) => (
            <li key={j}>{l.replace(/^\s*[-*]\s+/, '')}</li>
          ))}
        </ul>
      )
    }
    return (
      <p key={i} className="whitespace-pre-line">
        {block}
      </p>
    )
  })
  return <div className={`space-y-4 leading-relaxed ${className}`}>{out}</div>
}

/** Descarga un archivo privado con el cliente autenticado y lo expone como object URL. */
export function useAuthedObjectUrl(path: string | null) {
  const [state, setState] = useState<{ url: string | null; error: boolean }>({ url: null, error: false })
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    let objectUrl: string | null = null
    setState({ url: null, error: false })
    api
      .get<Blob>(path, { responseType: 'blob', signal: controller.signal })
      .then((res) => {
        objectUrl = URL.createObjectURL(res.data)
        setState({ url: objectUrl, error: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ url: null, error: true })
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])
  return state
}

export function AuthedImage({ path, alt, className, ...rest }: { path: string } & ImgHTMLAttributes<HTMLImageElement>) {
  const { url, error } = useAuthedObjectUrl(path)
  if (error) {
    return <div className={`flex items-center justify-center bg-raised text-xs text-muted ${className ?? ''}`}>Sin vista previa</div>
  }
  if (!url) return <div className={`animate-pulse bg-raised ${className ?? ''}`} aria-hidden="true" />
  return <img src={url} alt={alt} className={className} {...rest} />
}

/** Marcador de posición para prototipos sin imagen principal: retícula técnica + iniciales. */
export function HeroPlaceholder({ name, codename }: { name: string; codename?: string | null }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-surface">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(rgb(var(--c-border) / 0.6) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--c-border) / 0.6) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />
      <span aria-hidden="true" className="relative font-mono text-4xl font-medium uppercase tracking-[0.3em] text-accent/70 sm:text-6xl">
        {(codename || name).slice(0, 3)}
      </span>
    </div>
  )
}

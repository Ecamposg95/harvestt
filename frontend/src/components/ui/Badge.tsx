import { ReactNode } from 'react'
import { cx } from './cx'

export type Tone = 'neutral' | 'accent' | 'lime' | 'warning' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'bg-fg/5 text-muted',
  accent: 'bg-accent/12 text-accent',
  lime: 'bg-lime/45 text-fg',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

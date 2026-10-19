import { ReactNode } from 'react'
import { cx } from './cx'

type Tone = 'neutral' | 'accent' | 'warning' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'border-border text-muted',
  accent: 'border-accent/40 bg-accent/10 text-accent',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  danger: 'border-danger/40 bg-danger/10 text-danger',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

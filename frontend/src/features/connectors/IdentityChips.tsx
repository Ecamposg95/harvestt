import type { IdentityOut } from './api'

const KEY_LABELS: Record<string, string> = { gbif: 'GBIF', wfo: 'WFO', ncbi: 'NCBI', wikidata: 'Wikidata' }

function CheckMark({ check }: { check: string }) {
  if (check === 'match')
    return (
      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-accent">
        Coinciden
      </span>
    )
  if (check === 'mismatch')
    return (
      <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-danger">
        No coinciden
      </span>
    )
  return null
}

/** Un chip por identificador cruzado; marca «No coinciden» sin elegir uno cuando las fuentes difieren. */
export function IdentityChips({ identity }: { identity: IdentityOut[] }) {
  const shown = identity.filter((i) => i.value !== null)
  if (shown.length === 0) return <p className="text-sm text-muted">Sin identificadores cruzados todavía.</p>
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Identificadores cruzados">
      {shown.map((i) => (
        <li
          key={i.key}
          className={`flex min-w-0 max-w-full flex-col gap-0.5 rounded-2xl border px-3 py-1.5 text-xs ${
            i.check === 'mismatch' ? 'border-danger/40 bg-danger/5' : 'border-border bg-surface/60'
          }`}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-muted">{KEY_LABELS[i.key] ?? i.key}</span>
            {i.url ? (
              <a
                href={i.url}
                target="_blank"
                rel="noreferrer noopener"
                className="break-all font-mono text-accent hover:underline"
              >
                {i.value}
              </a>
            ) : (
              <span className="break-all font-mono">{i.value}</span>
            )}
            <CheckMark check={i.check} />
          </span>
          {i.detail && <span className={i.check === 'mismatch' ? 'text-danger' : 'text-muted'}>{i.detail}</span>}
        </li>
      ))}
    </ul>
  )
}

import { KeyboardEvent } from 'react'
import { cx } from '@/components/ui'
import type { EquivalenceOut, TermDetail, TermSummary } from './api'
import { MATCH_LABELS, SCHEME_LABELS } from './labels'

const MAX_CHILDREN = 8
const MAX_EQUIVALENCES = 6
const CHAR_W = 6.8

interface Box {
  x: number // centro
  y: number // centro
  w: number
  h: number
}

function fit(text: string, width: number): string {
  const max = Math.max(4, Math.floor((width - 18) / CHAR_W))
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

interface Layout {
  width: number
  height: number
  parent?: Box
  center: Box
  children: Box[]
  more?: { x: number; y: number }
  equivalences: Box[]
  eqMore?: { x: number; y: number }
  /** En la vista estrecha las equivalencias van debajo, sin aristas. */
  eqEdges: boolean
  eqTitle?: { x: number; y: number }
}

function layout(term: TermDetail, wide: boolean): Layout {
  const kids = Math.min(term.children.length, MAX_CHILDREN)
  const eqs = Math.min(term.equivalences.length, MAX_EQUIVALENCES)
  const cols = wide ? 4 : 2
  const axis = wide ? (eqs ? 210 : 320) : 170
  const top = term.parent ? 34 : 0
  const parent = term.parent ? { x: axis, y: top, w: wide ? 200 : 220, h: 32 } : undefined
  const center = { x: axis, y: top + (term.parent ? 86 : 40), w: wide ? 230 : 260, h: 44 }
  const childW = wide ? 96 : 150
  const step = childW + 8
  const rowsTop = center.y + 76
  const children: Box[] = []
  for (let i = 0; i < kids; i++) {
    const row = Math.floor(i / cols)
    const inRow = Math.min(cols, kids - row * cols)
    const col = i % cols
    children.push({ x: axis + (col - (inRow - 1) / 2) * step, y: rowsTop + row * 40, w: childW, h: 30 })
  }
  const rows = Math.ceil(kids / cols)
  let bottom = kids ? rowsTop + (rows - 1) * 40 + 15 : center.y + center.h / 2
  const more = term.children.length > MAX_CHILDREN ? { x: axis, y: bottom + 22 } : undefined
  if (more) bottom += 30

  const equivalences: Box[] = []
  let eqMore: Layout['eqMore']
  let eqTitle: Layout['eqTitle']
  if (wide) {
    const startY = center.y - ((eqs - 1) * 38) / 2
    const firstY = Math.max(22, startY)
    for (let i = 0; i < eqs; i++) equivalences.push({ x: 520, y: firstY + i * 38, w: 200, h: 30 })
    if (term.equivalences.length > MAX_EQUIVALENCES) eqMore = { x: 520, y: firstY + eqs * 38 }
    const eqBottom = eqs ? firstY + (eqs - 1) * 38 + 15 + (eqMore ? 30 : 0) : 0
    bottom = Math.max(bottom, eqBottom)
  } else if (eqs) {
    eqTitle = { x: 20, y: bottom + 34 }
    const firstY = bottom + 62
    for (let i = 0; i < eqs; i++) equivalences.push({ x: axis, y: firstY + i * 38, w: 300, h: 30 })
    bottom = firstY + (eqs - 1) * 38 + 15
    if (term.equivalences.length > MAX_EQUIVALENCES) {
      eqMore = { x: axis, y: bottom + 22 }
      bottom += 30
    }
  }
  return {
    width: wide ? 640 : 340,
    height: Math.ceil(bottom + 16),
    parent,
    center,
    children,
    more,
    equivalences,
    eqMore,
    eqEdges: wide,
    eqTitle,
  }
}

function Pill({
  box,
  text,
  className,
  textClass,
  onOpen,
  label,
  bold,
}: {
  box: Box
  text: string
  className: string
  textClass: string
  onOpen?: () => void
  label?: string
  bold?: boolean
}) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen?.()
    }
  }
  return (
    <g
      role={onOpen ? 'link' : undefined}
      aria-label={onOpen ? label : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? onKey : undefined}
      className={cx(onOpen && 'cursor-pointer outline-none [&:focus-visible>rect]:stroke-accent [&:hover>rect]:stroke-accent')}
    >
      <title>{label ?? text}</title>
      <rect x={box.x - box.w / 2} y={box.y - box.h / 2} width={box.w} height={box.h} rx={box.h / 2} className={className} strokeWidth={1.5} />
      <text
        x={box.x}
        y={box.y}
        textAnchor="middle"
        dominantBaseline="central"
        className={cx(textClass, bold ? 'font-bold' : 'font-medium')}
        fontSize={bold ? 14 : 12}
      >
        {fit(text, box.w)}
      </text>
    </g>
  )
}

const edge = (x1: number, y1: number, x2: number, y2: number) => {
  const my = (y1 + y2) / 2
  return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`
}
const sideEdge = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
}

const eqText = (e: EquivalenceOut) => `${SCHEME_LABELS[e.scheme] ?? e.scheme} · ${e.external_id}`

function Diagram({ term, wide, onOpen }: { term: TermDetail; wide: boolean; onOpen: (t: TermSummary) => void }) {
  const l = layout(term, wide)
  const c = l.center
  const neutral = 'fill-surface stroke-border'
  return (
    <svg
      viewBox={`0 0 ${l.width} ${l.height}`}
      className={cx('h-auto w-full', wide ? 'hidden sm:block' : 'sm:hidden')}
    >
      <g fill="none" strokeWidth={1.5} className="stroke-muted/50">
        {l.parent && <path d={edge(l.parent.x, l.parent.y + l.parent.h / 2, c.x, c.y - c.h / 2)} />}
        {l.children.map((b, i) => (
          <path key={i} d={edge(c.x, c.y + c.h / 2, b.x, b.y - b.h / 2)} />
        ))}
      </g>
      {l.eqEdges && (
        <g fill="none" strokeWidth={1.5} strokeDasharray="4 4" className="stroke-accent/60">
          {l.equivalences.map((b, i) => (
            <path key={i} d={sideEdge(c.x + c.w / 2, c.y, b.x - b.w / 2, b.y)} />
          ))}
        </g>
      )}
      {l.parent && term.parent && (
        <Pill
          box={l.parent}
          text={term.parent.label}
          label={`Padre: ${term.parent.label}`}
          className={neutral}
          textClass="fill-fg"
          onOpen={() => onOpen(term.parent!)}
        />
      )}
      <Pill box={c} text={term.label} className="fill-lime stroke-lime" textClass="fill-ink" bold />
      {l.children.map((b, i) => {
        const child = term.children[i]
        return (
          <Pill
            key={child.id}
            box={b}
            text={child.label}
            label={`Hijo: ${child.label}`}
            className={neutral}
            textClass="fill-fg"
            onOpen={() => onOpen(child)}
          />
        )
      })}
      {l.more && (
        <text x={l.more.x} y={l.more.y} textAnchor="middle" dominantBaseline="central" fontSize={12} className="fill-muted font-semibold">
          +{term.children.length - MAX_CHILDREN}
        </text>
      )}
      {l.eqTitle && (
        <text x={l.eqTitle.x} y={l.eqTitle.y} fontSize={11} className="fill-muted font-bold uppercase tracking-[0.08em]">
          Equivalencias
        </text>
      )}
      {l.equivalences.map((b, i) => {
        const e = term.equivalences[i]
        return (
          <Pill
            key={`${e.scheme}:${e.external_id}`}
            box={b}
            text={eqText(e)}
            label={`${eqText(e)} (${MATCH_LABELS[e.match] ?? e.match})`}
            className="fill-accent/10 stroke-accent/60"
            textClass="fill-accent"
          />
        )
      })}
      {l.eqMore && (
        <text x={l.eqMore.x} y={l.eqMore.y} textAnchor="middle" dominantBaseline="central" fontSize={12} className="fill-muted font-semibold">
          +{term.equivalences.length - MAX_EQUIVALENCES}
        </text>
      )}
    </svg>
  )
}

/**
 * Vecindario estático del término (sin d3): el padre arriba, el término al centro,
 * hasta 8 hijos abajo y las equivalencias a la derecha (debajo en pantallas estrechas).
 * Los colores salen de los tokens del tema vía clases fill-* / stroke-*.
 */
export function TermNeighbors({ term, onOpen }: { term: TermDetail; onOpen: (t: TermSummary) => void }) {
  const parts = [
    term.parent ? `padre ${term.parent.label}` : null,
    term.children.length ? `${term.children.length} ${term.children.length === 1 ? 'hijo' : 'hijos'}` : null,
    term.equivalences.length
      ? `${term.equivalences.length} ${term.equivalences.length === 1 ? 'equivalencia' : 'equivalencias'}`
      : null,
  ].filter(Boolean)
  const summary = `Vecindario de ${term.label}${parts.length ? `: ${parts.join(', ')}` : ''}`
  return (
    <figure aria-label={summary} className="min-w-0 rounded-3xl border border-border/60 bg-bg/40 p-3 sm:p-4">
      <Diagram term={term} wide onOpen={onOpen} />
      <Diagram term={term} wide={false} onOpen={onOpen} />
    </figure>
  )
}

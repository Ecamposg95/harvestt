interface Column {
  title: string
  items: string[]
  note?: string
}

const COLUMNS: Column[] = [
  {
    title: '1 · Nodos',
    items: ['Invernadero Geodésico', 'Cultivador Delta', 'Germinador ECOS', 'Nodo aliado'],
    note: 'hardware que mide y firma',
  },
  {
    title: '2 · Red de confianza',
    items: ['Lectura firmada', 'Cadena de bloques', 'Sello verificable'],
    note: 'nadie altera un dato sin que se note',
  },
  {
    title: '3 · Cortex',
    items: ['Ontología', 'Grafo de conocimiento', 'Recomendaciones con cita'],
    note: 'IA que interpreta',
  },
  {
    title: '4 · harvestt.org',
    items: ['Mapa de la red', 'Datos abiertos', 'Ontología pública', 'Verificar un dato'],
    note: 'libre para investigar y citar',
  },
]

const BOX_H = 30
const GAP = 8
const HEAD = 34

/** Diagrama del ecosistema: cuatro columnas en horizontal y apiladas por debajo de 640 px. */
export function EcosystemDiagram() {
  return (
    <figure className="glass min-w-0 p-3 sm:p-6">
      <figcaption className="eyebrow mb-4">Ecosistema: nodos → red de confianza → Cortex → harvestt.org</figcaption>
      <div role="img" aria-label="Ecosistema HarvestT: los nodos de hardware miden, la red de confianza encadena cada lectura, Cortex la interpreta y harvestt.org la publica abierta.">
        <HorizontalSvg />
        <VerticalSvg />
      </div>
    </figure>
  )
}

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0,0 L10,5 L0,10 z" className="fill-accent" />
      </marker>
    </defs>
  )
}

function HorizontalSvg() {
  const colW = 200
  const step = 240
  const maxItems = Math.max(...COLUMNS.map((c) => c.items.length))
  const height = HEAD + maxItems * (BOX_H + GAP) + 28
  return (
    <svg viewBox={`0 0 ${step * 3 + colW} ${height}`} className="hidden h-auto w-full sm:block" aria-hidden="true" focusable="false">
      <Defs id="eco-arrow-h" />
      {COLUMNS.map((col, ci) => {
        const x = ci * step
        return (
          <g key={col.title}>
            <text x={x + colW / 2} y={16} textAnchor="middle" className="fill-accent text-[12px] font-bold">
              {col.title}
            </text>
            {col.items.map((item, i) => (
              <g key={item}>
                <rect x={x} y={HEAD + i * (BOX_H + GAP)} width={colW} height={BOX_H} rx={9} className="fill-surface stroke-accent" strokeWidth={1.5} />
                <text x={x + colW / 2} y={HEAD + i * (BOX_H + GAP) + 19} textAnchor="middle" className="fill-fg text-[12px]">
                  {item}
                </text>
              </g>
            ))}
            <text x={x + colW / 2} y={height - 6} textAnchor="middle" className="fill-muted text-[10px]">
              {col.note}
            </text>
            {ci < COLUMNS.length - 1 && (
              <line x1={x + colW + 4} y1={height / 2 - 8} x2={x + step - 6} y2={height / 2 - 8} className="stroke-accent" strokeWidth={2} markerEnd="url(#eco-arrow-h)" />
            )}
          </g>
        )
      })}
    </svg>
  )
}

function VerticalSvg() {
  const w = 300
  let y = 0
  const parts: JSX.Element[] = []
  COLUMNS.forEach((col, ci) => {
    const top = y
    parts.push(
      <text key={`t${ci}`} x={w / 2} y={top + 14} textAnchor="middle" className="fill-accent text-[12px] font-bold">
        {col.title}
      </text>,
    )
    col.items.forEach((item, i) => {
      const iy = top + 24 + i * (BOX_H + 6)
      parts.push(
        <g key={`${ci}-${item}`}>
          <rect x={20} y={iy} width={w - 40} height={BOX_H} rx={9} className="fill-surface stroke-accent" strokeWidth={1.5} />
          <text x={w / 2} y={iy + 19} textAnchor="middle" className="fill-fg text-[12px]">
            {item}
          </text>
        </g>,
      )
    })
    const bottom = top + 24 + col.items.length * (BOX_H + 6)
    parts.push(
      <text key={`n${ci}`} x={w / 2} y={bottom + 8} textAnchor="middle" className="fill-muted text-[10px]">
        {col.note}
      </text>,
    )
    y = bottom + 18
    if (ci < COLUMNS.length - 1) {
      parts.push(<line key={`a${ci}`} x1={w / 2} y1={y} x2={w / 2} y2={y + 20} className="stroke-accent" strokeWidth={2} markerEnd="url(#eco-arrow-v)" />)
      y += 30
    }
  })
  return (
    <svg viewBox={`0 0 ${w} ${y}`} className="mx-auto h-auto w-full max-w-sm sm:hidden" aria-hidden="true" focusable="false">
      <Defs id="eco-arrow-v" />
      {parts}
    </svg>
  )
}

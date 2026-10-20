/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'

// Fuente cruda de todo src (sin pruebas): se recorre el grafo de imports ESTÁTICOS.
const sources = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// `import x from`, `import { a } from`, `export * from`; el cuerpo no admite ( ; = para no saltar entre sentencias.
const STATIC_FROM = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[\w*\s{},$]*?\s*from\s+['"]([^'"]+)['"]/g
const SIDE_EFFECT = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g

function resolve(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = `/src/${spec.slice(2)}`
  else if (spec.startsWith('.')) base = new URL(spec, `file://${from}`).pathname
  else return null
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (candidate in sources) return candidate
  }
  return null
}

function specifiers(code: string): string[] {
  const out: string[] = []
  for (const m of code.matchAll(STATIC_FROM)) if (!m[1]) out.push(m[2])
  for (const m of code.matchAll(SIDE_EFFECT)) out.push(m[1])
  return out
}

/** Módulos alcanzables desde `entry` siguiendo solo imports estáticos (no `import()` ni `import type`). */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>()
  const stack = [entry]
  while (stack.length) {
    const file = stack.pop()!
    if (seen.has(file) || !(file in sources)) continue
    seen.add(file)
    for (const spec of specifiers(sources[file])) {
      const next = resolve(file, spec)
      if (next) stack.push(next)
    }
  }
  return seen
}

function threeImports(files: Set<string>): string[] {
  const out: string[] = []
  for (const file of files) {
    for (const spec of specifiers(sources[file])) {
      if (spec === 'three' || spec.startsWith('three/')) out.push(`${file} → ${spec}`)
    }
  }
  return out
}

const main = reachable('/src/main.tsx')

// [envoltorio que sí entra al bundle principal, implementación que solo entra por import() dinámico]
const LAZY_PAIRS: Array<[string, string]> = [
  ['/src/features/prototypes/LazyStlViewer.tsx', '/src/features/prototypes/StlViewer.tsx'],
]

describe('frontera del chunk de three', () => {
  it('nada alcanzable estáticamente desde main.tsx importa three', () => {
    expect(threeImports(main)).toEqual([])
  })

  it.each(LAZY_PAIRS)('%s entra al bundle; su implementación no', (wrapper, impl) => {
    expect(main.has(wrapper)).toBe(true)
    expect(main.has(impl)).toBe(false)
  })

  it('el análisis detecta three cuando se parte de un módulo 3D (control del propio test)', () => {
    expect(threeImports(reachable('/src/features/prototypes/StlViewer.tsx'))).not.toEqual([])
  })
})

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// import/export estáticos; excluye `import type` y los `import()` dinámicos (que crean chunks aparte).
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm
const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

function resolveLocal(spec: string, from: string): string {
  const base = spec.startsWith('@/') ? resolve(SRC, spec.slice(2)) : resolve(dirname(from), spec)
  for (const ext of EXTENSIONS) {
    const candidate = base + ext
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  throw new Error(`No se pudo resolver ${spec} desde ${from}`)
}

/** Paquetes npm alcanzables por imports estáticos desde un archivo de `src/`. */
function staticPackages(entry: string): Set<string> {
  const seen = new Set<string>()
  const packages = new Set<string>()
  const stack = [resolve(SRC, entry)]
  while (stack.length > 0) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!/\.tsx?$/.test(file)) continue
    for (const match of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      const spec = match[1]
      if (spec.startsWith('.') || spec.startsWith('@/')) stack.push(resolveLocal(spec, file))
      else packages.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])
    }
  }
  return packages
}

describe('chunks perezosos', () => {
  it('d3-force y three no son alcanzables desde App.tsx por imports estáticos', () => {
    const packages = staticPackages('App.tsx')
    expect(packages.has('react')).toBe(true) // el recorrido funciona
    expect(packages.has('d3-force')).toBe(false)
    expect(packages.has('three')).toBe(false)
  })

  it('la página del grafo sí trae d3-force (control positivo)', () => {
    expect(staticPackages('features/graph/GraphPage.tsx').has('d3-force')).toBe(true)
  })
})

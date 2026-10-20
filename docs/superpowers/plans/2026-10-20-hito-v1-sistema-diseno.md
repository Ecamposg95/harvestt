# Hito V1 · Sistema de diseño Salvia cristal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** todas las pantallas existentes de HarvestT Cortex pasan al estilo "Salvia cristal" (referencias 43 y 53), con sidebar plegable, componentes reutilizables (`OriginBadge`, `StatTile`, `Callout`, gráficas SVG) y un inicio `/app` alimentado por un nuevo endpoint `GET /api/v1/home` con datos reales.

**Architecture:** se reemplazan los tokens CSS (mismo esquema de canales RGB, mismos nombres + `bg-2`, `lime`, `ink`, `ink-fg`), así las clases Tailwind existentes siguen funcionando y solo cambian de aspecto. Los primitivos de `components/ui` conservan nombres y props (`Button` variant `primary` sigue existiendo, `Card` pasa a ser vidrio) para no tocar llamadores; los componentes nuevos se agregan junto a ellos. Backend: módulo `app/modules/home/` de solo lectura, sin migración.

**Tech Stack:** React 18.3.1 + TS 5.6 + Vite 5.4 + Tailwind 3.4 + vitest 2.1.9 + @testing-library/react 16.1; FastAPI 0.127 + SQLAlchemy 2.0.45 + pytest 8.3.4. Nueva dependencia: `@fontsource/manrope@5.1.0`.

**Spec:** `docs/superpowers/specs/2026-10-19-hito-visual-design.md` (sección 3). Plan maestro: `docs/superpowers/plans/2026-10-20-hito-visual-maestro.md`.

## Global Constraints

- Rama `feat/hito-v1-diseno` desde `main`. No push a `main` sin autorización explícita del usuario.
- Ningún número inventado: sin dato → "Sin lecturas" / "Sin datos" / "Desconocido", nunca `0` ni valores de ejemplo.
- Etiquetas de origen solo vía `OriginBadge`: MEDIDO / FUENTE / DERIVADO / SIMULADO / ILUSTRATIVO / DESCONOCIDO.
- No copiar marcas, logos ni textos de `docs/screenshots/` (diseños de terceros). `docs/screenshots/` no se versiona.
- `accent` (`#4f7a12` claro / `#b9ec5a` oscuro) es el verde legible para texto, bordes y foco; `lime` (`#a6e22e`) solo para rellenos.
- Tema claro por defecto; el oscuro se conserva con el selector existente.
- Tipografía Manrope self-hosted (`@fontsource/manrope`); sin Google Fonts en runtime.
- Sin librerías nuevas de íconos ni de gráficas.
- Textos de UI en español natural; sin jerga de backend.
- Todo acceso a `localStorage` vía `readStorage` / `writeStorage` (`src/store/storage.ts`).
- Backend: todo query privado filtrado por `organization_id` con `scoped()`.

## Review Focus

1. **Contraste del lima.** `text-lime` sobre fondo claro es ilegible; un revisor debe rechazar cualquier texto en `lime`. Test: Task 3 verifica que `OriginBadge` y `Badge` no usan `text-lime`.
2. **Cero contra ausencia.** Un tenant sin proyectos o un proyecto sin ciclos debe mostrar estados vacíos, no "0 °C" ni un héroe roto. Tests: Task 7 (`recent_project is None`) y Task 8 (pantalla sin proyecto).
3. **Fuga entre tenants en la actividad.** `AuditEvent` de otra organización no debe aparecer en `/home`. Test: Task 7.
4. **Sidebar sin `localStorage`.** En modo privado el acceso lanza excepción; la app debe seguir funcionando con el riel plegado. Test: Task 6.
5. **Huecos en gráficas.** Un `null` en una serie debe dibujarse como hueco (sin barra / línea cortada), no como valor cero. Test: Task 4.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `frontend/src/styles/index.css` | Tokens claro/oscuro, fondo degradado, clase `.glass` |
| `frontend/tailwind.config.js` | Colores token (+ `bg-2`, `lime`, `ink`, `ink-fg`), fuente Manrope, sombra `glass`, radios |
| `frontend/src/main.tsx`, `frontend/index.html` | Importar Manrope; quitar Google Fonts |
| `frontend/src/store/theme.ts` | Tema claro por defecto |
| `frontend/src/components/ui/{Button,Card,Badge,PageHeader,States,Field}.tsx` | Primitivos restilizados (mismas props) |
| `frontend/src/components/ui/OriginBadge.tsx` | Mapa único origen → etiqueta/tono/explicación |
| `frontend/src/components/ui/StatTile.tsx` | Tarjeta de métrica con estado vacío |
| `frontend/src/components/ui/charts.tsx` | `BarChart`, `LineChart`, `Gauge` en SVG con huecos |
| `frontend/src/components/ui/Callout.tsx` | Punto + línea + etiqueta en coordenadas de pantalla |
| `frontend/src/components/icons.tsx` | Íconos SVG inline del riel |
| `frontend/src/components/Sidebar.tsx` | Riel plegable / expandido / drawer |
| `frontend/src/store/sidebar.ts` | Estado plegado persistido |
| `frontend/src/layouts/{AppLayout,PublicLayout}.tsx` | Layouts nuevos |
| `frontend/src/features/home/{api.ts,HomePage.tsx,home.test.tsx}` | Inicio `/app` (reemplaza `pages/AppHome.tsx`) |
| `frontend/src/features/prototypes/*`, `features/catalog/*`, `features/projects/*`, `pages/LoginPage.tsx` | Rediseño de pantallas |
| `app/modules/home/{__init__,schemas,service,router}.py` | `GET /api/v1/home` |
| `tests/test_home.py` | Tests del endpoint |

---

### Task 1: Tokens, tipografía y tema claro por defecto

**Files:**
- Modify: `frontend/src/styles/index.css`, `frontend/tailwind.config.js`, `frontend/src/main.tsx`, `frontend/index.html`, `frontend/src/store/theme.ts`, `frontend/package.json`
- Test: `frontend/src/store/theme.test.ts`

**Interfaces:**
- Produces: clases Tailwind `bg-bg`, `bg-bg-2`, `bg-surface`, `bg-raised`, `border-border`, `text-fg`, `text-muted`, `text-accent`, `bg-accent`, `text-accent-fg`, `bg-lime`, `bg-ink`, `text-ink`, `text-ink-fg`, `text-danger`, `text-warning`, `shadow-glass`, `font-sans` (Manrope); clase CSS `.glass`; `useTheme` con `theme` inicial `'light'`.

- [ ] **Step 1: Crear rama e instalar fuente**

```bash
cd /mnt/c/Users/ecamp/Devs/harvestt && git checkout -b feat/hito-v1-diseno
cd frontend && npm install --save-exact @fontsource/manrope@5.1.0
```

- [ ] **Step 2: Test que falla (tema claro por defecto)**

`frontend/src/store/theme.test.ts`:

```ts
import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})

it('usa tema claro cuando no hay preferencia guardada', async () => {
  const { useTheme } = await import('./theme')
  expect(useTheme.getState().theme).toBe('light')
  expect(document.documentElement.classList.contains('dark')).toBe(false)
})

it('respeta la preferencia oscura guardada', async () => {
  window.localStorage.setItem('harvestt_theme', 'dark')
  const { useTheme } = await import('./theme')
  expect(useTheme.getState().theme).toBe('dark')
  expect(document.documentElement.classList.contains('dark')).toBe(true)
})
```

- [ ] **Step 3: Verificar que falla**

Run: `cd frontend && npx vitest run src/store/theme.test.ts`
Expected: FAIL en el primer test (`expected 'dark' to be 'light'`).

- [ ] **Step 4: Implementar**

`frontend/src/store/theme.ts` línea del valor inicial:

```ts
const initial = (readStorage('harvestt_theme') as Theme | null) ?? 'light'
```

`frontend/src/styles/index.css` (reemplazo completo):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Tokens como canales RGB para usar opacidad en Tailwind: bg-accent/20.
   accent = verde legible (texto, bordes, foco). lime = solo rellenos. */
:root {
  --c-bg: 230 236 226;
  --c-bg-2: 207 218 203;
  --c-surface: 255 255 255;
  --c-raised: 242 245 239;
  --c-border: 196 208 192;
  --c-fg: 29 36 28;
  --c-muted: 93 106 91;
  --c-accent: 79 122 18;
  --c-accent-fg: 255 255 255;
  --c-lime: 166 226 46;
  --c-ink: 38 43 37;
  --c-ink-fg: 234 246 213;
  --c-danger: 185 28 28;
  --c-warning: 161 98 7;
  --glass-alpha: 0.52;
  --glass-edge: 255 255 255;
  --glass-edge-alpha: 0.85;
  color-scheme: light;
}

.dark {
  --c-bg: 20 24 19;
  --c-bg-2: 29 35 28;
  --c-surface: 33 40 32;
  --c-raised: 42 50 41;
  --c-border: 58 68 56;
  --c-fg: 230 236 226;
  --c-muted: 154 168 152;
  --c-accent: 185 236 90;
  --c-accent-fg: 20 24 19;
  --c-lime: 166 226 46;
  --c-ink: 13 16 12;
  --c-ink-fg: 234 246 213;
  --c-danger: 248 113 113;
  --c-warning: 251 191 36;
  --glass-alpha: 0.7;
  --glass-edge: 255 255 255;
  --glass-edge-alpha: 0.08;
  color-scheme: dark;
}

html,
body,
#root {
  min-height: 100%;
}

body {
  @apply font-sans text-fg antialiased;
  background: linear-gradient(160deg, rgb(var(--c-bg)), rgb(var(--c-bg-2))) fixed;
  background-color: rgb(var(--c-bg));
}

:focus-visible {
  outline: 2px solid rgb(var(--c-accent));
  outline-offset: 2px;
}

@layer components {
  /* Tarjeta de vidrio; sin soporte de blur queda como superficie casi opaca. */
  .glass {
    @apply rounded-3xl shadow-glass;
    background: rgb(var(--c-surface) / 0.92);
    border: 1px solid rgb(var(--glass-edge) / var(--glass-edge-alpha));
  }
  @supports (backdrop-filter: blur(1px)) {
    .glass {
      background: rgb(var(--c-surface) / var(--glass-alpha));
      backdrop-filter: blur(12px);
    }
  }
  .display {
    @apply font-extrabold uppercase leading-[0.92] tracking-[-0.045em];
  }
  .eyebrow {
    @apply text-[11px] font-semibold uppercase tracking-[0.12em] text-muted;
  }
}
```

`frontend/tailwind.config.js` (reemplazo completo):

```js
/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        'bg-2': token('bg-2'),
        surface: token('surface'),
        raised: token('raised'),
        border: token('border'),
        fg: token('fg'),
        muted: token('muted'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        lime: token('lime'),
        ink: token('ink'),
        'ink-fg': token('ink-fg'),
        danger: token('danger'),
        warning: token('warning'),
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glass: '0 8px 30px rgb(40 60 30 / 0.08)',
      },
    },
  },
  plugins: [],
}
```

`frontend/src/main.tsx`: agregar antes de `import './styles/index.css'`:

```ts
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
```

`frontend/index.html`: eliminar las tres líneas `<link rel="preconnect" …fonts.googleapis.com…>`, `<link rel="preconnect" …fonts.gstatic.com…>` y `<link href="https://fonts.googleapis.com/css2?family=IBM+Plex…" rel="stylesheet" />`. Cambiar `<meta name="theme-color">` si existe a `#e6ece2`.

- [ ] **Step 5: Verificar**

Run: `cd frontend && npx vitest run && npm run typecheck && npm run build`
Expected: todos los tests PASS (incluidos los 2 nuevos), build OK.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/styles/index.css frontend/tailwind.config.js frontend/src/main.tsx frontend/index.html frontend/src/store/theme.ts frontend/src/store/theme.test.ts
git commit -m "feat(ui): tokens Salvia cristal, Manrope self-hosted y tema claro por defecto"
```

---

### Task 2: Primitivos restilizados (Button, Card, Badge, Field, PageHeader, States)

**Files:**
- Modify: `frontend/src/components/ui/{Button,Card,Badge,Field,PageHeader,States}.tsx`, `frontend/src/components/ui/index.ts`
- Test: `frontend/src/components/ui/ui.test.tsx`

**Interfaces:**
- Consumes: tokens de Task 1.
- Produces: `Button` (variants `primary|secondary|ghost|danger`, sin cambio de props); `Card` (vidrio, mismas props); `Badge` con tono nuevo `'lime'` (`Tone = 'neutral'|'accent'|'lime'|'warning'|'danger'`); `PageHeader({title, description?, actions?, eyebrow?})`.

- [ ] **Step 1: Test que falla**

`frontend/src/components/ui/ui.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Badge, Button, Card, PageHeader } from '.'

it('Button primario es píldora oscura', () => {
  render(<Button>Entrar</Button>)
  const btn = screen.getByRole('button', { name: 'Entrar' })
  expect(btn.className).toContain('rounded-full')
  expect(btn.className).toContain('bg-ink')
})

it('Card usa vidrio', () => {
  render(<Card data-testid="c">x</Card>)
  expect(screen.getByTestId('c').className).toContain('glass')
})

it('Badge lime rellena con lime pero escribe en tinta', () => {
  render(<Badge tone="lime">Simulado</Badge>)
  const b = screen.getByText('Simulado')
  expect(b.className).toContain('bg-lime')
  expect(b.className).not.toContain('text-lime')
})

it('PageHeader muestra eyebrow y título display', () => {
  render(<PageHeader eyebrow="Espacio" title="Proyectos" />)
  expect(screen.getByText('Espacio')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Proyectos' }).className).toContain('display')
})
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && npx vitest run src/components/ui/ui.test.tsx`
Expected: FAIL (`rounded-md` en lugar de `rounded-full`, falta `glass`, tono `lime` no existe → error de tipos/clase).

- [ ] **Step 3: Implementar**

`Button.tsx` — reemplazar `styles` y la clase base:

```tsx
const styles: Record<Variant, string> = {
  primary: 'bg-ink text-ink-fg hover:bg-ink/90',
  secondary: 'glass !rounded-full text-fg hover:bg-surface/80',
  ghost: 'text-muted hover:bg-surface/60 hover:text-fg',
  danger: 'bg-danger text-white hover:bg-danger/90',
}
```

y en `className` cambiar `'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium …'` por:

```tsx
'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'
```

`Card.tsx`:

```tsx
import { HTMLAttributes } from 'react'
import { cx } from './cx'

/** Tarjeta de vidrio (Salvia cristal). */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('glass', className)} {...rest} />
}
```

`Badge.tsx`:

```tsx
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
```

`Field.tsx` — cambiar la constante `control`:

```ts
const control =
  'w-full rounded-2xl border border-border/70 bg-surface/80 px-4 py-2.5 text-sm text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none'
```

`PageHeader.tsx`:

```tsx
import { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string
  description?: string
  actions?: ReactNode
  eyebrow?: string
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="display break-words text-3xl sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
```

`States.tsx` — en `Empty` cambiar el contenedor a `'glass flex flex-col items-center gap-2 px-6 py-14 text-center'`; en `ErrorState` a `'glass flex flex-col items-start gap-3 border-danger/30 p-5'`; en `Loading` el spinner a `border-accent`.

`index.ts`: exportar el tipo: `export type { Tone } from './Badge'`.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx vitest run && npm run typecheck`
Expected: PASS todo (los tests de features no dependen de clases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui
git commit -m "feat(ui): primitivos en píldora y vidrio"
```

---

### Task 3: OriginBadge y StatTile

**Files:**
- Create: `frontend/src/components/ui/OriginBadge.tsx`, `frontend/src/components/ui/StatTile.tsx`
- Modify: `frontend/src/components/ui/index.ts`, `frontend/src/features/catalog/PlantDetailPage.tsx:33-38`, `frontend/src/features/catalog/labels.ts:3-10`, `frontend/src/features/catalog/catalog.test.tsx:116`
- Test: `frontend/src/components/ui/origin.test.tsx`

**Interfaces:**
- Produces:
  - `type Origin = 'measured'|'sourced'|'derived'|'simulated'|'illustrative'|'missing'`
  - `ORIGIN_META: Record<Origin, {label: string; tone: Tone; hint: string}>`
  - `OriginBadge({origin: string, className?: string})`
  - `StatTile({label: string, value?: string|number|null, unit?: string, origin?: string, emptyText?: string, highlight?: boolean, children?: ReactNode})`

- [ ] **Step 1: Test que falla**

`frontend/src/components/ui/origin.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ORIGIN_META, OriginBadge, StatTile } from '.'

it.each([
  ['measured', 'Medido'],
  ['sourced', 'Fuente'],
  ['derived', 'Derivado'],
  ['simulated', 'Simulado'],
  ['illustrative', 'Ilustrativo'],
  ['missing', 'Desconocido'],
])('OriginBadge %s → %s con explicación', (origin, text) => {
  render(<OriginBadge origin={origin} />)
  const el = screen.getByText(text)
  expect(el).toHaveAttribute('title', ORIGIN_META[origin as keyof typeof ORIGIN_META].hint)
  expect(el.className).not.toContain('text-lime')
})

it('OriginBadge con origen desconocido muestra la clave tal cual', () => {
  render(<OriginBadge origin="otro" />)
  expect(screen.getByText('otro')).toBeInTheDocument()
})

it('StatTile sin valor muestra texto vacío, nunca 0', () => {
  render(<StatTile label="Temperatura del aire" value={null} unit="°C" emptyText="Sin lecturas" />)
  expect(screen.getByText('Sin lecturas')).toBeInTheDocument()
  expect(screen.queryByText(/0/)).toBeNull()
})

it('StatTile con valor 0 sí muestra 0', () => {
  render(<StatTile label="Observaciones" value={0} />)
  expect(screen.getByText('0')).toBeInTheDocument()
})

it('StatTile con origen muestra la etiqueta', () => {
  render(<StatTile label="Humedad" value={61} unit="%" origin="simulated" />)
  expect(screen.getByText('61')).toBeInTheDocument()
  expect(screen.getByText('Simulado')).toBeInTheDocument()
})
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && npx vitest run src/components/ui/origin.test.tsx`
Expected: FAIL (`ORIGIN_META` / `OriginBadge` / `StatTile` no exportados).

- [ ] **Step 3: Implementar**

`OriginBadge.tsx`:

```tsx
import { Badge, Tone } from './Badge'

export type Origin = 'measured' | 'sourced' | 'derived' | 'simulated' | 'illustrative' | 'missing'

export const ORIGIN_META: Record<Origin, { label: string; tone: Tone; hint: string }> = {
  measured: { label: 'Medido', tone: 'accent', hint: 'Dato registrado por una medición real.' },
  sourced: { label: 'Fuente', tone: 'accent', hint: 'Dato tomado de una fuente citada.' },
  derived: { label: 'Derivado', tone: 'neutral', hint: 'Calculado a partir de otros datos con una fórmula visible.' },
  simulated: { label: 'Simulado', tone: 'lime', hint: 'Generado por la simulación didáctica; no es una medición.' },
  illustrative: { label: 'Ilustrativo', tone: 'neutral', hint: 'Representación de ejemplo; no describe un caso real.' },
  missing: { label: 'Desconocido', tone: 'warning', hint: 'Todavía no hay evidencia para este dato.' },
}

export function OriginBadge({ origin, className }: { origin: string; className?: string }) {
  const meta = ORIGIN_META[origin as Origin]
  if (!meta) return <Badge className={className}>{origin}</Badge>
  return (
    <Badge tone={meta.tone} title={meta.hint} className={className}>
      {meta.label}
    </Badge>
  )
}
```

`StatTile.tsx`:

```tsx
import { ReactNode } from 'react'
import { cx } from './cx'
import { OriginBadge } from './OriginBadge'

interface Props {
  label: string
  value?: string | number | null
  unit?: string
  origin?: string
  emptyText?: string
  highlight?: boolean
  children?: ReactNode
}

export function StatTile({ label, value, unit, origin, emptyText = 'Sin datos', highlight, children }: Props) {
  const hasValue = value !== null && value !== undefined && value !== ''
  return (
    <div className={cx('glass flex min-w-0 flex-col gap-1 p-4', highlight && '!bg-lime/40')}>
      <span className="eyebrow truncate">{label}</span>
      {hasValue ? (
        <p className="text-2xl font-bold tracking-tight">
          {value}
          {unit && <span className="ml-1 text-sm font-semibold text-muted">{unit}</span>}
        </p>
      ) : (
        <p className="text-sm font-semibold text-muted">{emptyText}</p>
      )}
      {origin && hasValue && <OriginBadge origin={origin} className="w-fit" />}
      {children}
    </div>
  )
}
```

`index.ts` agregar:

```ts
export { OriginBadge, ORIGIN_META } from './OriginBadge'
export type { Origin } from './OriginBadge'
export { StatTile } from './StatTile'
```

`PlantDetailPage.tsx`: borrar la función local `OriginBadge` (líneas 33-38), quitar `ORIGIN_LABELS` del import de `./labels`, e importar `OriginBadge` desde `@/components/ui`. `labels.ts`: borrar `ORIGIN_LABELS` (queda sin uso). `catalog.test.tsx:116`: cambiar `'Sin evidencia'` por `'Desconocido'`.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui frontend/src/features/catalog
git commit -m "feat(ui): OriginBadge único y StatTile con estado vacío"
```

---

### Task 4: Gráficas SVG (BarChart, LineChart, Gauge) con huecos

**Files:**
- Create: `frontend/src/components/ui/charts.tsx`
- Modify: `frontend/src/components/ui/index.ts`
- Test: `frontend/src/components/ui/charts.test.tsx`

**Interfaces:**
- Produces:
  - `BarChart({data: Array<{label: string; value: number|null}>, highlightIndex?: number, height?: number, ariaLabel: string})`
  - `LineChart({data: Array<{t: string; value: number|null}>, height?: number, ariaLabel: string, unit?: string})`
  - `Gauge({value: number|null, min: number, max: number, label: string, unit?: string})`
  - `linePaths(values: Array<number|null>, width: number, height: number, min: number, max: number): string[]` (exportada para tests: un `d` por tramo continuo)

- [ ] **Step 1: Test que falla**

`frontend/src/components/ui/charts.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { BarChart, Gauge, LineChart, linePaths } from '.'

it('BarChart no dibuja barra para null', () => {
  const { container } = render(
    <BarChart ariaLabel="Temperatura" data={[{ label: 'a', value: 2 }, { label: 'b', value: null }, { label: 'c', value: 4 }]} />,
  )
  expect(container.querySelectorAll('[data-bar]')).toHaveLength(2)
  expect(container.querySelectorAll('[data-gap]')).toHaveLength(1)
})

it('linePaths corta la línea en los huecos', () => {
  const paths = linePaths([1, 2, null, null, 3, 4], 100, 50, 0, 5)
  expect(paths).toHaveLength(2)
  expect(paths[0].startsWith('M')).toBe(true)
})

it('linePaths sin datos no produce tramos', () => {
  expect(linePaths([null, null], 100, 50, 0, 1)).toEqual([])
})

it('LineChart sin datos muestra Sin lecturas', () => {
  render(<LineChart ariaLabel="Humedad" data={[]} />)
  expect(screen.getByText('Sin lecturas')).toBeInTheDocument()
})

it('Gauge sin valor muestra Sin señal', () => {
  render(<Gauge value={null} min={0} max={50} label="Temperatura" unit="°C" />)
  expect(screen.getByText('Sin señal')).toBeInTheDocument()
})

it('Gauge acota el valor al rango', () => {
  render(<Gauge value={80} min={0} max={50} label="Temperatura" unit="°C" />)
  expect(screen.getByText('80')).toBeInTheDocument()
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '50')
})
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && npx vitest run src/components/ui/charts.test.tsx`
Expected: FAIL (módulos no exportados).

- [ ] **Step 3: Implementar**

`charts.tsx`:

```tsx
import { cx } from './cx'

export function BarChart({
  data,
  highlightIndex,
  height = 120,
  ariaLabel,
}: {
  data: Array<{ label: string; value: number | null }>
  highlightIndex?: number
  height?: number
  ariaLabel: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value ?? 0))
  return (
    <div role="img" aria-label={ariaLabel} className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) =>
        d.value === null ? (
          <span key={i} data-gap className="flex-1 self-end border-b-2 border-dashed border-border" title={`${d.label}: sin dato`} />
        ) : (
          <span
            key={i}
            data-bar
            title={`${d.label}: ${d.value}`}
            className={cx('flex-1 rounded-full', i === highlightIndex ? 'bg-lime' : 'bg-fg/15')}
            style={{ height: `${Math.max(6, (d.value / max) * 100)}%` }}
          />
        ),
      )}
    </div>
  )
}

/** Un path SVG por tramo continuo; los null cortan la línea. */
export function linePaths(values: Array<number | null>, width: number, height: number, min: number, max: number): string[] {
  const span = max - min || 1
  const step = values.length > 1 ? width / (values.length - 1) : 0
  const paths: string[] = []
  let current = ''
  values.forEach((v, i) => {
    if (v === null) {
      if (current) paths.push(current)
      current = ''
      return
    }
    const x = (i * step).toFixed(1)
    const y = (height - ((v - min) / span) * height).toFixed(1)
    current += current ? ` L${x} ${y}` : `M${x} ${y}`
  })
  if (current) paths.push(current)
  return paths
}

export function LineChart({
  data,
  height = 140,
  ariaLabel,
  unit,
}: {
  data: Array<{ t: string; value: number | null }>
  height?: number
  ariaLabel: string
  unit?: string
}) {
  const values = data.map((d) => d.value)
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm font-semibold text-muted" style={{ height }}>
        Sin lecturas
      </div>
    )
  }
  const min = Math.min(...present)
  const max = Math.max(...present)
  const W = 600
  const paths = linePaths(values, W, height, min, max)
  return (
    <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgb(var(--c-accent))" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      ))}
      <title>
        {ariaLabel}: {min}–{max}
        {unit ? ` ${unit}` : ''}
      </title>
    </svg>
  )
}

export function Gauge({ value, min, max, label, unit }: { value: number | null; min: number; max: number; label: string; unit?: string }) {
  const clamped = value === null ? min : Math.min(max, Math.max(min, value))
  const frac = (clamped - min) / (max - min || 1)
  const R = 40
  const C = Math.PI * R
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value === null ? undefined : clamped}
      className="flex flex-col items-center"
    >
      <svg viewBox="0 0 100 56" className="w-full max-w-[160px]">
        <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="rgb(var(--c-fg) / 0.1)" strokeWidth={10} strokeLinecap="round" />
        {value !== null && (
          <path
            d="M10 50 A40 40 0 0 1 90 50"
            fill="none"
            stroke="rgb(var(--c-lime))"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${C * frac} ${C}`}
          />
        )}
      </svg>
      {value === null ? (
        <p className="-mt-4 text-sm font-semibold text-muted">Sin señal</p>
      ) : (
        <p className="-mt-5 text-xl font-bold">
          {value}
          {unit && <span className="ml-0.5 text-xs text-muted">{unit}</span>}
        </p>
      )}
      <p className="eyebrow mt-1">{label}</p>
    </div>
  )
}
```

`index.ts` agregar: `export { BarChart, LineChart, Gauge, linePaths } from './charts'`.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx vitest run src/components/ui && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui
git commit -m "feat(ui): gráficas SVG con huecos para datos ausentes"
```

---

### Task 5: Callout

**Files:**
- Create: `frontend/src/components/ui/Callout.tsx`
- Modify: `frontend/src/components/ui/index.ts`
- Test: `frontend/src/components/ui/callout.test.tsx`

**Interfaces:**
- Produces: `Callout({x: number, y: number, label: string, side?: 'left'|'right', dimmed?: boolean, lineLength?: number, children?: ReactNode})` — posición absoluta en px dentro de un contenedor `relative`; `x,y` es el punto anclado. V2/V3/V4 lo reutilizan con coordenadas proyectadas.

- [ ] **Step 1: Test que falla**

`frontend/src/components/ui/callout.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Callout } from '.'

it('ancla el punto en x,y y muestra la etiqueta', () => {
  render(<Callout x={120} y={80} label="Sensor de humedad" />)
  const root = screen.getByTestId('callout')
  expect(root.style.left).toBe('120px')
  expect(root.style.top).toBe('80px')
  expect(screen.getByText('Sensor de humedad')).toBeInTheDocument()
})

it('lado izquierdo invierte la dirección', () => {
  render(<Callout x={10} y={10} label="LED" side="left" />)
  expect(screen.getByTestId('callout').className).toContain('flex-row-reverse')
})

it('atenuado baja la opacidad', () => {
  render(<Callout x={0} y={0} label="Oculto" dimmed />)
  expect(screen.getByTestId('callout').className).toContain('opacity-35')
})
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && npx vitest run src/components/ui/callout.test.tsx`
Expected: FAIL (`Callout` no exportado).

- [ ] **Step 3: Implementar**

`Callout.tsx`:

```tsx
import { ReactNode } from 'react'
import { cx } from './cx'

interface Props {
  x: number
  y: number
  label: string
  side?: 'left' | 'right'
  dimmed?: boolean
  lineLength?: number
  children?: ReactNode
}

/** Punto + línea + etiqueta. El punto queda exactamente en (x, y) del contenedor relativo. */
export function Callout({ x, y, label, side = 'right', dimmed, lineLength = 44, children }: Props) {
  return (
    <div
      data-testid="callout"
      className={cx(
        'pointer-events-none absolute flex items-center transition-opacity',
        side === 'left' && 'flex-row-reverse',
        dimmed && 'opacity-35',
      )}
      style={{ left: `${x}px`, top: `${y}px`, transform: side === 'left' ? 'translate(calc(-100% + 5px), -50%)' : 'translate(-5px, -50%)' }}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-ink bg-lime" />
      <span className="h-px shrink-0 bg-ink/70" style={{ width: lineLength }} />
      <span className="pointer-events-auto max-w-[220px] rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-ink-fg">
        {label}
        {children}
      </span>
    </div>
  )
}
```

`index.ts` agregar: `export { Callout } from './Callout'`.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx vitest run src/components/ui/callout.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui
git commit -m "feat(ui): componente Callout reutilizable"
```

---

### Task 6: Sidebar plegable y AppLayout

**Files:**
- Create: `frontend/src/components/icons.tsx`, `frontend/src/components/Sidebar.tsx`, `frontend/src/store/sidebar.ts`
- Modify: `frontend/src/layouts/AppLayout.tsx` (reemplazo completo)
- Test: `frontend/src/components/sidebar.test.tsx`

**Interfaces:**
- Consumes: `readStorage`, `writeStorage` (`src/store/storage.ts`); `useAuth`, `useTheme`.
- Produces: `useSidebar` (zustand) `{collapsed: boolean, toggle(): void}` con clave `harvestt_sidebar` (`'1'` = plegado; por defecto plegado); `Sidebar({mobileOpen: boolean, onClose(): void})`; `NAV_ITEMS: Array<{to: string; label: string; icon: IconName; end?: boolean}>`.

- [ ] **Step 1: Test que falla**

`frontend/src/components/sidebar.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

async function renderSidebar(props = { mobileOpen: false, onClose: () => undefined }) {
  const { Sidebar } = await import('./Sidebar')
  return render(
    <MemoryRouter initialEntries={['/app/projects']}>
      <Sidebar {...props} />
    </MemoryRouter>,
  )
}

it('arranca plegado con nombres accesibles y se expande', async () => {
  await renderSidebar()
  const nav = screen.getByRole('navigation', { name: 'Principal' })
  expect(nav.closest('aside')!.className).toContain('md:w-16')
  expect(screen.getByRole('link', { name: 'Proyectos' })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: 'Expandir menú' }))
  expect(nav.closest('aside')!.className).toContain('md:w-[232px]')
  expect(window.localStorage.getItem('harvestt_sidebar')).toBe('0')
})

it('recuerda la preferencia expandida', async () => {
  window.localStorage.setItem('harvestt_sidebar', '0')
  await renderSidebar()
  expect(screen.getByRole('button', { name: 'Plegar menú' })).toBeInTheDocument()
})

it('funciona aunque localStorage lance', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('bloqueado')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('bloqueado')
  })
  await renderSidebar()
  fireEvent.click(screen.getByRole('button', { name: 'Expandir menú' }))
  expect(screen.getByRole('button', { name: 'Plegar menú' })).toBeInTheDocument()
})

it('en móvil abierto muestra overlay que cierra', async () => {
  const onClose = vi.fn()
  await renderSidebar({ mobileOpen: true, onClose })
  fireEvent.click(screen.getByTestId('sidebar-overlay'))
  expect(onClose).toHaveBeenCalled()
})
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && npx vitest run src/components/sidebar.test.tsx`
Expected: FAIL (`./Sidebar` no existe).

- [ ] **Step 3: Implementar**

`store/sidebar.ts`:

```ts
import { create } from 'zustand'
import { readStorage, writeStorage } from './storage'

const KEY = 'harvestt_sidebar'

export const useSidebar = create<{ collapsed: boolean; toggle: () => void }>((set, get) => ({
  collapsed: readStorage(KEY) !== '0',
  toggle: () => {
    const collapsed = !get().collapsed
    writeStorage(KEY, collapsed ? '1' : '0')
    set({ collapsed })
  },
}))
```

`components/icons.tsx`:

```tsx
export type IconName = 'home' | 'leaf' | 'folder' | 'cube' | 'globe' | 'sun' | 'moon' | 'logout' | 'chevron' | 'menu'

const PATHS: Record<IconName, string> = {
  home: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z',
  leaf: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4',
  chevron: 'M9 6l6 6-6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
}

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
```

`components/Sidebar.tsx`:

```tsx
import { NavLink, useNavigate } from 'react-router-dom'
import { Icon, IconName } from '@/components/icons'
import { cx } from '@/components/ui'
import { useAuth } from '@/store/auth'
import { useSidebar } from '@/store/sidebar'
import { useTheme } from '@/store/theme'

export const NAV_ITEMS: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: '/app', label: 'Inicio', icon: 'home', end: true },
  { to: '/app/plants', label: 'Explorador vegetal', icon: 'leaf' },
  { to: '/app/projects', label: 'Proyectos', icon: 'folder' },
  { to: '/app/prototypes', label: 'Prototipos', icon: 'cube' },
]

function RailButton({ icon, label, expanded, onClick }: { icon: IconName; label: string; expanded: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={expanded ? undefined : label}
      title={expanded ? undefined : label}
      className="flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-ink-fg/70 hover:bg-white/10 hover:text-ink-fg"
    >
      <Icon name={icon} />
      {expanded && <span className="truncate text-sm font-medium">{label}</span>}
    </button>
  )
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { collapsed, toggle } = useSidebar()
  const { theme, toggle: toggleTheme } = useTheme()
  const { user, memberships, organizationId, setOrganization, logout } = useAuth()
  const navigate = useNavigate()
  const expanded = !collapsed || mobileOpen

  return (
    <>
      {mobileOpen && <div data-testid="sidebar-overlay" className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />}
      <aside
        className={cx(
          'fixed inset-y-3 left-3 z-40 flex-col rounded-3xl bg-ink p-2.5 text-ink-fg transition-[width] duration-200 md:sticky md:top-3 md:flex md:h-[calc(100vh-1.5rem)]',
          mobileOpen ? 'flex w-[232px]' : 'hidden',
          collapsed ? 'md:w-16' : 'md:w-[232px]',
        )}
      >
        <NavLink to="/app" onClick={onClose} className="mb-6 flex h-11 items-center gap-2 px-2.5" aria-label="HarvestT Cortex">
          <span className="h-6 w-6 shrink-0 rounded-full bg-lime" />
          {expanded && (
            <span className="truncate font-extrabold tracking-tight">
              HarvestT <span className="font-medium text-ink-fg/60">Cortex</span>
            </span>
          )}
        </NavLink>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              aria-label={expanded ? undefined : item.label}
              title={expanded ? undefined : item.label}
              className={({ isActive }) =>
                cx(
                  'flex h-11 items-center gap-3 rounded-2xl px-3 transition-colors',
                  isActive ? 'bg-lime text-ink' : 'text-ink-fg/70 hover:bg-white/10 hover:text-ink-fg',
                )
              }
            >
              <Icon name={item.icon} />
              {expanded && <span className="truncate text-sm font-semibold">{item.label}</span>}
            </NavLink>
          ))}
          <NavLink
            to="/"
            aria-label={expanded ? undefined : 'Ver vitrina pública'}
            title={expanded ? undefined : 'Ver vitrina pública'}
            className="mt-auto flex h-11 items-center gap-3 rounded-2xl px-3 text-ink-fg/70 hover:bg-white/10 hover:text-ink-fg"
          >
            <Icon name="globe" />
            {expanded && <span className="truncate text-sm font-medium">Ver vitrina pública</span>}
          </NavLink>
        </nav>
        <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
          {expanded && memberships.length > 1 && (
            <select
              aria-label="Organización activa"
              value={organizationId ?? ''}
              onChange={(e) => {
                setOrganization(e.target.value)
                window.location.reload()
              }}
              className="mb-1 w-full rounded-xl bg-white/10 px-2 py-1.5 text-xs text-ink-fg"
            >
              {memberships.map((m) => (
                <option key={m.organization.id} value={m.organization.id} className="text-fg">
                  {m.organization.name}
                </option>
              ))}
            </select>
          )}
          {expanded && user?.email && <p className="truncate px-3 py-1 text-xs text-ink-fg/50">{user.email}</p>}
          <RailButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'} expanded={expanded} onClick={toggleTheme} />
          <RailButton
            icon="logout"
            label="Salir"
            expanded={expanded}
            onClick={() => {
              logout()
              navigate('/login')
            }}
          />
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expandir menú' : 'Plegar menú'}
            className="hidden h-10 w-full items-center justify-center rounded-2xl text-ink-fg/60 hover:bg-white/10 md:flex"
          >
            <Icon name="chevron" className={cx('h-4 w-4 transition-transform', !collapsed && 'rotate-180')} />
          </button>
        </div>
      </aside>
    </>
  )
}
```

`layouts/AppLayout.tsx` (reemplazo completo):

```tsx
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { api } from '@/api/client'
import { Icon } from '@/components/icons'
import { Sidebar } from '@/components/Sidebar'
import { Membership, User, useAuth } from '@/store/auth'

export function AppLayout() {
  const { user, setProfile } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (user) return
    api
      .get<{ user: User; memberships: Membership[] }>('/auth/me')
      .then((res) => setProfile(res.data.user, res.data.memberships))
      .catch(() => undefined)
  }, [user, setProfile])

  return (
    <div className="flex min-h-screen gap-3 p-3">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass mb-3 flex h-14 items-center gap-3 px-3 md:hidden">
          <button onClick={() => setMobileOpen(true)} className="rounded-full p-2 hover:bg-surface" aria-label="Abrir menú">
            <Icon name="menu" />
          </button>
          <span className="font-extrabold tracking-tight">
            HarvestT <span className="font-medium text-muted">Cortex</span>
          </span>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-1 py-4 sm:px-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx vitest run && npm run typecheck`
Expected: PASS (incluido `App.test.tsx`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components frontend/src/store/sidebar.ts frontend/src/layouts/AppLayout.tsx
git commit -m "feat(ui): sidebar plegable con riel oscuro y drawer móvil"
```

---

### Task 7: Endpoint `GET /api/v1/home`

**Files:**
- Create: `app/modules/home/__init__.py`, `app/modules/home/schemas.py`, `app/modules/home/service.py`, `app/modules/home/router.py`
- Modify: `app/main.py` (import + incluir router en la tupla de routers)
- Test: `tests/test_home.py`

**Interfaces:**
- Consumes: `get_context`, `RequestContext`, `scoped`, modelos `Project`, `CropCycle`, `Observation` (`app.modules.projects.models`), `TraitAssertion`, `SUBJECT_SPECIES` (`app.modules.catalog.models`), `AuditEvent` (`app.modules.audit.models`).
- Produces: `GET /api/v1/home` → `HomeOut`:

```json
{
  "recent_project": {"id": "…", "name": "…", "system": "hydroponic", "area_m2": 12.0, "species": ["Lactuca sativa L."]} | null,
  "counts": {"projects": 1, "crop_cycles": 1, "observations": 3, "sources_cited": 0},
  "activity": [{"id": "…", "text": "Proyecto creado: Demo", "resource_type": "project", "resource_id": "…", "created_at": "…"}]
}
```

- [ ] **Step 1: Test que falla**

`tests/test_home.py`:

```python
from app.modules.audit.models import AuditEvent
from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Species

URL = "/api/v1/home"


def test_home_empty_tenant(client, tenants):
    res = client.get(URL, headers=tenants["alfa_viewer"])
    assert res.status_code == 200
    body = res.json()
    assert body["recent_project"] is None
    assert body["counts"] == {"projects": 0, "crop_cycles": 0, "observations": 0, "sources_cited": 0}
    assert body["activity"] == []


def test_home_requires_auth(client):
    assert client.get(URL).status_code == 401


def test_home_counts_recent_and_activity(client, tenants, db):
    catalog_seed.seed(db)
    db.commit()
    lettuce = db.query(Species).filter(Species.scientific_name.like("Lactuca%")).one()
    h = tenants["alfa_editor"]
    p1 = client.post("/api/v1/projects", json={"name": "Primero", "system": "soil"}, headers=h).json()
    p2 = client.post("/api/v1/projects", json={"name": "Demo lechuga", "system": "hydroponic", "area_m2": 12}, headers=h).json()
    client.post(f"/api/v1/projects/{p2['id']}/crop-cycles", json={"species_id": lettuce.id}, headers=h)
    client.post(f"/api/v1/projects/{p1['id']}/observations", json={"kind": "note", "content": "Hola"}, headers=h)

    body = client.get(URL, headers=tenants["alfa_viewer"]).json()
    assert body["recent_project"]["name"] == "Demo lechuga"
    assert body["recent_project"]["species"] == [lettuce.scientific_name]
    assert body["counts"]["projects"] == 2
    assert body["counts"]["crop_cycles"] == 1
    assert body["counts"]["observations"] == 1
    # Las afirmaciones sembradas no tienen evidencia: no hay fuentes citadas.
    assert body["counts"]["sources_cited"] == 0
    texts = [a["text"] for a in body["activity"]]
    assert "Proyecto creado: Demo lechuga" in texts
    assert "Ciclo de cultivo iniciado" in texts


def test_home_isolated_between_tenants(client, tenants, db):
    client.post("/api/v1/projects", json={"name": "Secreto beta", "system": "soil"}, headers=tenants["beta_editor"])
    db.add(AuditEvent(organization_id=tenants["beta_org"].id, resource_type="project", resource_id="x", operation="create", data={"name": "Secreto beta"}))
    db.commit()
    body = client.get(URL, headers=tenants["alfa_viewer"]).json()
    assert body["recent_project"] is None
    assert body["counts"]["projects"] == 0
    assert all("Secreto" not in a["text"] for a in body["activity"])


def test_home_activity_limited_to_10(client, tenants):
    h = tenants["alfa_editor"]
    for i in range(12):
        client.post("/api/v1/projects", json={"name": f"P{i}", "system": "soil"}, headers=h)
    body = client.get(URL, headers=h).json()
    assert len(body["activity"]) == 10
    assert body["activity"][0]["text"] == "Proyecto creado: P11"
```

- [ ] **Step 2: Verificar que falla**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_home.py -v`
Expected: FAIL (404 en `/api/v1/home`).

- [ ] **Step 3: Implementar**

`app/modules/home/__init__.py`: vacío.

`app/modules/home/schemas.py`:

```python
from datetime import datetime

from pydantic import BaseModel


class HomeProject(BaseModel):
    id: str
    name: str
    system: str
    area_m2: float | None
    species: list[str]


class HomeCounts(BaseModel):
    projects: int
    crop_cycles: int
    observations: int
    sources_cited: int


class HomeActivity(BaseModel):
    id: str
    text: str
    resource_type: str
    resource_id: str
    created_at: datetime


class HomeOut(BaseModel):
    recent_project: HomeProject | None
    counts: HomeCounts
    activity: list[HomeActivity]
```

`app/modules/home/service.py`:

```python
"""Resumen del inicio de la plataforma: solo datos reales del tenant activo."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import RequestContext
from app.core.tenant import scoped
from app.modules.audit.models import AuditEvent
from app.modules.catalog.models import SUBJECT_SPECIES, TraitAssertion
from app.modules.home.schemas import HomeActivity, HomeCounts, HomeOut, HomeProject
from app.modules.projects.models import CropCycle, Observation, Project

ACTIVITY_LIMIT = 10

_TEXTS = {
    ("project", "create"): "Proyecto creado: {name}",
    ("project", "update"): "Proyecto actualizado",
    ("crop_cycle", "create"): "Ciclo de cultivo iniciado",
    ("prototype", "create"): "Prototipo creado: {name}",
    ("prototype", "update"): "Prototipo actualizado",
    ("prototype", "delete"): "Prototipo eliminado",
    ("prototype_asset", "update"): "Archivo de prototipo actualizado",
    ("prototype_asset", "delete"): "Archivo de prototipo eliminado",
}


def activity_text(event: AuditEvent) -> str:
    template = _TEXTS.get((event.resource_type, event.operation))
    if template is None:
        return "Cambio registrado"
    name = (event.data or {}).get("name")
    if "{name}" in template:
        return template.format(name=name) if name else template.split(":")[0]
    return template


def _count(db: Session, model, ctx: RequestContext) -> int:
    return db.scalar(select(func.count()).select_from(scoped(model, ctx).subquery())) or 0


def _sources_cited(db: Session, ctx: RequestContext) -> int:
    species_ids = db.scalars(scoped(CropCycle, ctx).with_only_columns(CropCycle.species_id).distinct()).all()
    if not species_ids:
        return 0
    refs = db.scalars(
        select(TraitAssertion.evidence_refs).where(
            TraitAssertion.subject_type == SUBJECT_SPECIES, TraitAssertion.subject_id.in_(species_ids)
        )
    ).all()
    return len({r.get("source_id") for group in refs for r in (group or []) if r.get("source_id")})


def build_home(db: Session, ctx: RequestContext) -> HomeOut:
    recent = db.scalar(scoped(Project, ctx).order_by(Project.updated_at.desc(), Project.created_at.desc()).limit(1))
    recent_out = None
    if recent is not None:
        cycles = db.scalars(scoped(CropCycle, ctx).where(CropCycle.project_id == recent.id)).unique().all()
        species = sorted({c.species.scientific_name for c in cycles if c.species is not None})
        recent_out = HomeProject(
            id=recent.id, name=recent.name, system=recent.system, area_m2=recent.area_m2, species=species
        )

    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.organization_id == ctx.organization_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(ACTIVITY_LIMIT)
    ).all()

    return HomeOut(
        recent_project=recent_out,
        counts=HomeCounts(
            projects=_count(db, Project, ctx),
            crop_cycles=_count(db, CropCycle, ctx),
            observations=_count(db, Observation, ctx),
            sources_cited=_sources_cited(db, ctx),
        ),
        activity=[
            HomeActivity(
                id=e.id,
                text=activity_text(e),
                resource_type=e.resource_type,
                resource_id=e.resource_id,
                created_at=e.created_at,
            )
            for e in events
        ],
    )
```

`app/modules/home/router.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context
from app.modules.home.schemas import HomeOut
from app.modules.home.service import build_home

router = APIRouter(prefix="/home", tags=["home"])


@router.get("", response_model=HomeOut)
def home(ctx: RequestContext = Depends(get_context), db: Session = Depends(get_db)):
    return build_home(db, ctx)
```

`app/main.py`: agregar `from app.modules.home.router import router as home_router` y cambiar la tupla a `(identity_router, catalog_router, projects_router, prototypes_router, home_router)`.

Nota para el implementador: `utcnow()` tiene resolución de microsegundos, así que el orden por `created_at` es estable entre peticiones HTTP consecutivas. Ejecutar `tests/test_home.py` 5 veces seguidas (`for i in 1 2 3 4 5; do pytest tests/test_home.py -q || break; done`); si alguna falla por empate, no relajar el aislamiento: solo cambiar el último assert a `"Proyecto creado: P11" in texts`.

- [ ] **Step 4: Verificar**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/ -q`
Expected: todos PASS (48 previos + 5 nuevos).

- [ ] **Step 5: Commit**

```bash
git add app/modules/home app/main.py tests/test_home.py
git commit -m "feat(home): endpoint de resumen del inicio con datos reales del tenant"
```

---

### Task 8: Inicio `/app` estilo 43

**Files:**
- Create: `frontend/src/features/home/api.ts`, `frontend/src/features/home/HomePage.tsx`
- Delete: `frontend/src/pages/AppHome.tsx`
- Modify: `frontend/src/App.tsx` (import y `<Route index element={<HomePage />} />`)
- Test: `frontend/src/features/home/home.test.tsx`

**Interfaces:**
- Consumes: `GET /home` (Task 7); `Card`, `StatTile`, `BarChart`, `Badge`, `Loading`, `ErrorState`, `Empty`, `Button` de `@/components/ui`; `formatDate` de `@/features/catalog/labels`; `SYSTEM_LABELS` de `@/features/projects/labels` y el tipo `CultivationSystem` de `@/features/projects/api`.
- Produces: `homeApi.get(): Promise<HomeData>`; tipos `HomeData`, `HomeProject`, `HomeActivity`.

- [ ] **Step 1: Test que falla**

`frontend/src/features/home/home.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { homeApi, HomeData } from './api'
import { HomePage } from './HomePage'

const base: HomeData = {
  recent_project: null,
  counts: { projects: 0, crop_cycles: 0, observations: 0, sources_cited: 0 },
  activity: [],
}

beforeEach(() => vi.restoreAllMocks())

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

it('sin proyectos invita a crear uno y no muestra lecturas', async () => {
  vi.spyOn(homeApi, 'get').mockResolvedValue(base)
  renderPage()
  await waitFor(() => expect(screen.getByText('Aún no hay proyectos')).toBeInTheDocument())
  expect(screen.getByRole('link', { name: 'Crear proyecto' })).toHaveAttribute('href', '/app/projects')
  expect(screen.getAllByText('Sin lecturas').length).toBeGreaterThanOrEqual(2)
  expect(screen.queryByText(/°C/)).toBeNull()
})

it('con proyecto muestra héroe, conteos reales y actividad', async () => {
  vi.spyOn(homeApi, 'get').mockResolvedValue({
    recent_project: { id: 'p1', name: 'Demo lechuga', system: 'hydroponic', area_m2: 12, species: ['Lactuca sativa L.'] },
    counts: { projects: 1, crop_cycles: 1, observations: 3, sources_cited: 0 },
    activity: [{ id: 'a1', text: 'Proyecto creado: Demo lechuga', resource_type: 'project', resource_id: 'p1', created_at: '2026-10-20T10:00:00Z' }],
  })
  renderPage()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Demo lechuga' })).toBeInTheDocument())
  expect(screen.getByText(/Lactuca sativa L\./)).toBeInTheDocument()
  expect(screen.getByText(/12 m²/)).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
  expect(screen.getByText('Proyecto creado: Demo lechuga')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Abrir proyecto' })).toHaveAttribute('href', '/app/projects/p1')
})

it('error muestra reintento', async () => {
  vi.spyOn(homeApi, 'get').mockRejectedValue(new Error('x'))
  renderPage()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument())
})
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && npx vitest run src/features/home`
Expected: FAIL (`./api` no existe).

- [ ] **Step 3: Implementar**

`features/home/api.ts`:

```ts
import { api } from '@/api/client'

export interface HomeProject {
  id: string
  name: string
  system: string
  area_m2: number | null
  species: string[]
}

export interface HomeActivity {
  id: string
  text: string
  resource_type: string
  resource_id: string
  created_at: string
}

export interface HomeData {
  recent_project: HomeProject | null
  counts: { projects: number; crop_cycles: number; observations: number; sources_cited: number }
  activity: HomeActivity[]
}

export const homeApi = {
  get: () => api.get<HomeData>('/home').then((r) => r.data),
}
```

`features/home/HomePage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { BarChart, Card, ErrorState, Loading, StatTile } from '@/components/ui'
import { formatDate } from '@/features/catalog/labels'
import type { CultivationSystem } from '@/features/projects/api'
import { SYSTEM_LABELS } from '@/features/projects/labels'
import { useAuth } from '@/store/auth'
import { HomeData, homeApi } from './api'

type State = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready'; data: HomeData }

function GreenhouseArt() {
  return (
    <svg viewBox="0 0 200 150" className="h-full w-full" aria-hidden="true">
      <polygon points="20,70 100,20 180,70" fill="rgb(var(--c-surface) / 0.7)" stroke="rgb(var(--c-surface))" strokeWidth="2" />
      <rect x="20" y="70" width="160" height="70" fill="rgb(var(--c-lime) / 0.25)" stroke="rgb(var(--c-surface))" strokeWidth="2" />
      {[60, 100, 140].map((x) => (
        <line key={x} x1={x} y1="70" x2={x} y2="140" stroke="rgb(var(--c-surface))" strokeWidth="1.5" />
      ))}
    </svg>
  )
}

export function HomePage() {
  const user = useAuth((s) => s.user)
  const [state, setState] = useState<State>({ phase: 'loading' })

  const load = useCallback(() => {
    setState({ phase: 'loading' })
    homeApi
      .get()
      .then((data) => setState({ phase: 'ready', data }))
      .catch((err) => setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar el inicio') }))
  }, [])
  useEffect(load, [load])

  if (state.phase === 'loading') return <Loading />
  if (state.phase === 'error') return <ErrorState message={state.message} onRetry={load} />
  const { recent_project: p, counts, activity } = state.data

  return (
    <div className="space-y-3">
      <p className="eyebrow">Hola{user?.full_name ? `, ${user.full_name}` : ''}</p>
      <Card className="relative overflow-hidden p-6 sm:min-h-[220px]">
        <div className="relative z-10 max-w-md">
          <p className="eyebrow">{p ? 'Proyecto activo' : 'Comienza aquí'}</p>
          {p ? (
            <>
              <h1 className="display mt-2 break-words text-4xl sm:text-5xl">{p.name}</h1>
              <p className="mt-3 text-sm text-muted">
                {[p.species.join(', ') || 'Sin especie asignada', SYSTEM_LABELS[p.system as CultivationSystem] ?? p.system, p.area_m2 ? `${p.area_m2} m²` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <Link to={`/app/projects/${p.id}`} className="mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-fg">
                Abrir proyecto
              </Link>
            </>
          ) : (
            <>
              <h1 className="display mt-2 text-4xl sm:text-5xl">Aún no hay proyectos</h1>
              <p className="mt-3 text-sm text-muted">Crea un proyecto de cultivo para ver aquí su estado.</p>
              <Link to="/app/projects" className="mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-fg">
                Crear proyecto
              </Link>
            </>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-0 right-4 hidden h-[180px] w-[240px] sm:block">
          <GreenhouseArt />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Temperatura del aire" value={null} emptyText="Sin lecturas" />
        <StatTile label="Humedad relativa" value={null} emptyText="Sin lecturas" />
        <StatTile label="Observaciones" value={counts.observations} />
        <StatTile label="Fuentes citadas" value={counts.sources_cited} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <p className="font-bold">Espacio de trabajo</p>
          <p className="mb-4 text-xs text-muted">Registros reales de esta organización</p>
          <BarChart
            ariaLabel="Proyectos, ciclos y observaciones"
            highlightIndex={2}
            data={[
              { label: 'Proyectos', value: counts.projects },
              { label: 'Ciclos', value: counts.crop_cycles },
              { label: 'Observaciones', value: counts.observations },
            ]}
          />
          <div className="mt-2 grid grid-cols-3 text-center text-[11px] text-muted">
            <span>Proyectos · {counts.projects}</span>
            <span>Ciclos · {counts.crop_cycles}</span>
            <span>Observaciones · {counts.observations}</span>
          </div>
        </Card>
        <Card className="p-5">
          <p className="mb-2 font-bold">Actividad reciente</p>
          {activity.length === 0 ? (
            <p className="text-sm text-muted">Sin actividad todavía.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{a.text}</span>
                  <span className="shrink-0 text-[11px] text-muted">{formatDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
```

`App.tsx`: reemplazar `import { AppHome } from '@/pages/AppHome'` por `import { HomePage } from '@/features/home/HomePage'` y `<Route index element={<AppHome />} />` por `<Route index element={<HomePage />} />`. Borrar `src/pages/AppHome.tsx`.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/features/home frontend/src/App.tsx frontend/src/pages
git commit -m "feat(home): inicio con héroe del proyecto activo, métricas reales y actividad"
```

---

### Task 9: PublicLayout, vitrina y login

**Files:**
- Modify: `frontend/src/layouts/PublicLayout.tsx` (reemplazo completo), `frontend/src/features/prototypes/ShowcasePage.tsx`, `frontend/src/features/prototypes/shared.tsx` (`HeroPlaceholder`), `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/NotFound.tsx`
- Test: `frontend/src/features/prototypes/prototypes.test.tsx` (agregar caso)

**Interfaces:**
- Consumes: `prototypesApi.publicList`, `StatusBadge`, `HeroPlaceholder`, `Card`, `Button`.
- Produces: `PublicLayout` sin clase `dark` forzada; nav en píldoras con enlaces "Prototipos" y "Plataforma"/"Iniciar sesión".

- [ ] **Step 1: Test que falla**

Agregar a `prototypes.test.tsx` dentro del archivo (nuevo `describe`):

```tsx
import { PublicLayout } from '@/layouts/PublicLayout'

describe('PublicLayout', () => {
  it('no fuerza el tema oscuro y ofrece navegación en píldoras', () => {
    const { container } = render(
      <MemoryRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<p>contenido</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(container.firstElementChild!.className).not.toContain('dark')
    expect(screen.getByRole('link', { name: 'Prototipos' }).className).toContain('rounded-full')
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && npx vitest run src/features/prototypes`
Expected: FAIL (`dark` presente / sin `rounded-full`).

- [ ] **Step 3: Implementar**

`layouts/PublicLayout.tsx`:

```tsx
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '@/store/auth'

export function PublicLayout() {
  const token = useAuth((s) => s.token)
  return (
    <div className="min-h-screen text-fg">
      <header className="fixed inset-x-0 top-0 z-30 px-3 pt-3">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-2 sm:px-4">
          <Link to="/" aria-label="Inicio" className="flex items-center gap-2 font-extrabold tracking-tight">
            <span className="h-5 w-5 rounded-full bg-lime" />
            HarvestT
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/" className="glass !rounded-full px-4 py-2 font-semibold">
              Prototipos
            </Link>
            <Link to={token ? '/app' : '/login'} className="rounded-full bg-ink px-4 py-2 font-semibold text-ink-fg">
              {token ? 'Plataforma' : 'Iniciar sesión'}
            </Link>
          </nav>
        </div>
      </header>
      <main className="pt-20">
        <Outlet />
      </main>
      <footer className="py-10 text-center text-xs text-muted">HarvestT · General Systech · Atlas Tech</footer>
    </div>
  )
}
```

`ShowcasePage.tsx` — conservar lógica y estados; cambiar presentación:
- Sección héroe: quitar el fondo de retícula; contenedor `mx-auto flex min-h-[60vh] max-w-7xl flex-col justify-end px-4 pb-12 pt-10 sm:px-6`; eyebrow `<p className="eyebrow">Laboratorio de hardware · General Systech</p>`; título `<h1 className="display mt-4 text-[clamp(3rem,11vw,8rem)]">HarvestT</h1>`; párrafo `mt-6 max-w-2xl text-lg text-muted sm:text-xl`; enlace "Ver prototipos" como `rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-fg mt-8 w-fit`.
- Encabezado de lista: `h2` con clase `eyebrow`; contador con `eyebrow`.
- Esqueletos de carga: `glass aspect-[16/9] animate-pulse`.
- Vacío: contenedor `glass flex flex-col items-center gap-4 px-6 py-24 text-center`; punto `bg-lime`.
- `PrototypeCard`: el `article` pasa a `glass grid items-center gap-6 p-4 sm:p-6 lg:grid-cols-12 lg:gap-10`; la imagen `relative aspect-[16/10] overflow-hidden rounded-2xl lg:col-span-7` (sin borde ni degradado oscuro); texto `lg:col-span-5`; número/codename con `eyebrow` y el codename en `text-accent`; título `display mt-3 break-words text-4xl sm:text-5xl`; "Explorar →" como `rounded-full bg-ink px-4 py-2 text-xs font-semibold text-ink-fg`.

`shared.tsx` — `HeroPlaceholder`: fondo `bg-gradient-to-br from-surface/80 to-lime/20`, retícula con `rgb(var(--c-fg) / 0.06)`, iniciales `font-extrabold text-accent/60`.

`LoginPage.tsx`: contenedor `flex min-h-screen items-center justify-center px-4`; `<Card className="w-full max-w-sm p-8">`; reemplazar `<Logo className="mb-6 text-lg" />` por:

```tsx
<div className="mb-8">
  <span className="mb-4 block h-8 w-8 rounded-full bg-lime" />
  <h1 className="display text-3xl">HarvestT Cortex</h1>
  <p className="mt-1 text-sm text-muted">Inicia sesión para continuar</p>
</div>
```

(y quitar el import de `Logo`). El botón "Entrar" ya es píldora oscura por Task 2.

`NotFound.tsx`: envolver en `Card` centrada con título `display text-4xl` "404" y enlace píldora oscura a `/`.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx vitest run && npm run typecheck`
Expected: PASS (los tests existentes de vitrina siguen buscando por rol/texto).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/layouts/PublicLayout.tsx frontend/src/features/prototypes frontend/src/pages
git commit -m "feat(ui): vitrina, login y 404 en Salvia cristal"
```

---

### Task 10: Página pública de prototipo estilo 53

**Files:**
- Modify: `frontend/src/features/prototypes/PrototypePublicPage.tsx` (componente `Detail` y estados), `frontend/src/features/prototypes/StlViewer.tsx:68-157,201-243` (colores de escena y contenedor)
- Test: `frontend/src/features/prototypes/prototypes.test.tsx` (agregar caso)

**Interfaces:**
- Consumes: `PublicPrototypeDetail` (`specs: Spec[]`), `StlViewer({url, label, className})`, `Gallery`, `StatusBadge`, `RichText`.
- Produces: estructura de página: cabecera de dos columnas (texto izquierda, visor derecha en `lg`), fila de chips de specs `data-testid="spec-chips"` (máx. 4 visibles arriba; si hay más, la tabla completa sigue abajo).

- [ ] **Step 1: Test que falla**

Agregar a `prototypes.test.tsx` (usa el patrón de mock existente de `prototypesApi.publicDetail`; si el archivo ya tiene un `detail` de ejemplo, reutilizarlo con estos campos):

```tsx
describe('PrototypePublicPage diseño 53', () => {
  it('muestra el nombre como titular display, specs como chips y sin specs inventadas', async () => {
    const detail: PublicPrototypeDetail = {
      slug: 'germinador-ecos',
      name: 'Germinador ECOS',
      codename: 'ECOS',
      purpose: 'Germinación doméstica automatizada',
      summary: '',
      status: 'in_construction',
      published_at: null,
      hero: null,
      description: '',
      specs: [
        { label: 'Iluminación', value: 'LED' },
        { label: 'Fotoperiodo', value: 'Configurable' },
      ],
      assets: [],
    }
    vi.spyOn(prototypesApi, 'publicDetail').mockResolvedValue(detail)
    render(
      <MemoryRouter initialEntries={['/prototipos/germinador-ecos']}>
        <Routes>
          <Route path="/prototipos/:slug" element={<PrototypePublicPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const h1 = await screen.findByRole('heading', { level: 1, name: /Germinador ECOS/ })
    expect(h1.className).toContain('display')
    const chips = screen.getByTestId('spec-chips')
    expect(chips.children).toHaveLength(2)
    expect(chips).toHaveTextContent('Iluminación')
    expect(chips).toHaveTextContent('LED')
  })

  it('sin specs no muestra la fila de chips', async () => {
    vi.spyOn(prototypesApi, 'publicDetail').mockResolvedValue({
      slug: 'x', name: 'X', codename: null, purpose: '', summary: '', status: 'concept', published_at: null, hero: null, description: '', specs: [], assets: [],
    })
    render(
      <MemoryRouter initialEntries={['/prototipos/x']}>
        <Routes>
          <Route path="/prototipos/:slug" element={<PrototypePublicPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { level: 1, name: 'X' })
    expect(screen.queryByTestId('spec-chips')).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && npx vitest run src/features/prototypes`
Expected: FAIL (sin clase `display`, sin `spec-chips`).

- [ ] **Step 3: Implementar**

En `PrototypePublicPage.tsx`, reemplazar el `return` de `Detail` hasta la sección de visor por una cabecera de dos columnas (mantener la lógica `models`, `images`, `modelId`):

```tsx
  const [first, ...restName] = data.name.split(' ')
  const chips = data.specs.slice(0, 4)

  return (
    <article className="overflow-x-hidden">
      <header className="mx-auto grid max-w-7xl gap-8 px-4 pb-8 pt-6 sm:px-6 lg:grid-cols-12 lg:items-center">
        <div className="min-w-0 lg:col-span-5">
          <Link to="/" className="eyebrow hover:text-accent">
            ← Prototipos
          </Link>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {data.codename && <span className="eyebrow text-accent">{data.codename}</span>}
            <StatusBadge status={data.status} />
          </div>
          <h1 className="display mt-4 break-words text-[clamp(2.75rem,8vw,5.5rem)]">
            {first}
            {restName.length > 0 && (
              <>
                <br />
                <span className="text-accent">{restName.join(' ')}</span>
              </>
            )}
          </h1>
          {data.purpose && <p className="mt-5 max-w-md text-base text-muted sm:text-lg">{data.purpose}</p>}
          {images.length > 0 && (
            <a href="#galeria" className="mt-6 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-fg">
              Ver galería
            </a>
          )}
        </div>
        <section aria-label="Vista principal" className="min-w-0 lg:col-span-7">
          {/* bloque existente del visor: StlViewer / selector de modelos / hero / HeroPlaceholder,
              con el contenedor cambiado a "glass overflow-hidden p-2" y el StlViewer con
              className="h-[52vh] min-h-[320px] w-full rounded-[22px]" */}
        </section>
      </header>

      {chips.length > 0 && (
        <div data-testid="spec-chips" className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 sm:px-6 lg:grid-cols-4">
          {chips.map((s, i) => (
            <div key={i} className={`glass p-4 ${i === 1 ? '!bg-lime/40' : ''}`}>
              <p className="eyebrow truncate">{s.label}</p>
              <p className="mt-1 break-words text-lg font-bold">
                {s.value}
                {s.unit && <span className="ml-1 text-sm text-muted">{s.unit}</span>}
              </p>
            </div>
          ))}
        </div>
      )}
```

El comentario del bloque del visor indica **mover** (no reescribir) el JSX existente de la sección "Vista principal" dentro de esa `section`, cambiando solo las clases indicadas: botones de selección de modelo → `rounded-full px-3 py-1.5 text-xs font-semibold` con activo `bg-ink text-ink-fg` e inactivo `glass !rounded-full text-muted`; caja de imagen/placeholder → `glass aspect-[4/3] overflow-hidden p-2` con la imagen `rounded-[22px]`.

Las secciones "Descripción", "Especificaciones" (tabla completa) y "Galería" se conservan; cambiar sus `h2` a `eyebrow`, la tabla a `glass` con filas `border-border/50`, y los estados de carga/404 a clases `glass` / `display` equivalentes.

`StlViewer.tsx` — adaptar la escena al fondo claro, leyendo el tema activo:

```ts
const dark = document.documentElement.classList.contains('dark')
const fogColor = dark ? 0x141813 : 0xe6ece2
```

y usar: `scene.fog = new THREE.Fog(fogColor, 10, 40)` (y en la línea 157 `new THREE.Fog(fogColor, distance * 1.5, distance * 4)`); `HemisphereLight(0xffffff, dark ? 0x141813 : 0xcfdacb, 0.6)`; luz de contorno `0xa6e22e` a `0.8`; material `MeshStandardMaterial({ color: dark ? 0x9aa898 : 0xd9dfd4, metalness: 0.35, roughness: 0.45 })`; `GridHelper(radius * 6, 24, 0x4f7a12, dark ? 0x2a3229 : 0xc4d0c0)`. Contenedor (línea 201): `relative overflow-hidden rounded-[22px] bg-gradient-to-b from-surface/60 to-bg-2/60 ${className}`; textos de carga y botones con `font-sans` en lugar de `font-mono`; botón "Restablecer vista" `glass !rounded-full px-3 py-1.5 text-[11px] font-semibold`.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx vitest run && npm run typecheck && npm run build`
Expected: PASS; el chunk `three` sigue separado (verificar en la salida de `vite build` que existe `assets/three-*.js`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/prototypes
git commit -m "feat(prototypes): página pública con titular display, visor en vidrio y chips de specs"
```

---

### Task 11: Catálogo, proyectos y admin de prototipos

**Files:**
- Modify: `frontend/src/features/catalog/{PlantsPage,PlantDetailPage,Dialog,Pagination,AddToProjectDialog}.tsx`, `frontend/src/features/projects/{ProjectsPage,ProjectDetailPage,ObservationLog,ProjectForm}.tsx`, `frontend/src/features/prototypes/{PrototypesAdminPage,PrototypeAdminDetailPage,Gallery}.tsx`
- Test: los tests existentes de cada feature + caso nuevo en `frontend/src/features/catalog/catalog.test.tsx`

**Interfaces:**
- Consumes: `Card`, `PageHeader({eyebrow})`, `Badge`, `OriginBadge`, `Button`.
- Produces: ninguna interfaz nueva; misma lógica y textos (los tests existentes buscan por rol y texto y deben seguir pasando sin cambios, salvo el de Task 3).

Reglas de conversión (aplicar en todos los archivos listados, sin cambiar lógica ni textos):

| Antes | Después |
|---|---|
| `rounded-lg border border-border bg-surface` / `<Card className="… border …">` | `<Card>` (o clase `glass`) sin `border` |
| `font-mono text-xs uppercase tracking-wider text-muted` (rótulos) | `eyebrow` |
| `rounded-md` en botones/enlaces de acción | `rounded-full` |
| `border-b border-border` en pestañas | pestañas píldora: contenedor `glass inline-flex !rounded-full p-1`, pestaña activa `rounded-full bg-ink px-4 py-1.5 text-ink-fg`, inactiva `rounded-full px-4 py-1.5 text-muted` |
| `hover:border-accent/50` en tarjetas enlace | `transition-transform hover:-translate-y-0.5` |
| `bg-bg/80` overlays de diálogo | `bg-ink/40 backdrop-blur-sm`; panel del diálogo `glass p-6` |
| `<PageHeader title="…">` | agregar `eyebrow`: Explorador → `"Catálogo"`, Proyectos → `"Espacio de trabajo"`, Prototipos → `"Laboratorio"` |

Ficha de planta (`PlantDetailPage.tsx`): cabecera como héroe preparado para V4: `Card` `relative overflow-hidden p-6 sm:p-8` con eyebrow de familia, nombre científico (`ScientificName`) en `display text-4xl` (la cursiva del binomio se conserva), nombres comunes debajo, y a la derecha un placeholder `hidden sm:flex h-40 w-40 items-center justify-center rounded-full bg-lime/30` con la inicial del género. Cada afirmación en lista `glass` con `OriginBadge`.

- [ ] **Step 1: Test que falla**

Agregar a `catalog.test.tsx` (reutilizando el mock de `getPlant` existente del test de ficha):

```tsx
it('la ficha muestra el nombre científico como titular display', async () => {
  // usar el mismo setup del test existente que renderiza PlantDetailPage para 's1'
  const heading = await screen.findByRole('heading', { level: 1 })
  expect(heading.className).toContain('display')
})
```

(El implementador copia el bloque de `render`/mock del test existente de la ficha al inicio de este caso.)

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && npx vitest run src/features/catalog`
Expected: FAIL (el `h1` no tiene `display`).

- [ ] **Step 3: Implementar** las reglas de conversión en los archivos listados.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx vitest run && npm run typecheck && grep -rn "text-lime\|font-mono text-xs uppercase" src --include='*.tsx' || true`
Expected: tests PASS; el grep no devuelve `text-lime` y solo quedan `font-mono` en valores técnicos (IDs, checksums, tamaños).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features
git commit -m "feat(ui): catálogo, proyectos y admin de prototipos en Salvia cristal"
```

---

### Task 12: Cierre de fase V1

**Files:**
- Modify: `README.md` (sección "HarvestT Cortex (plataforma)": subsección "Estado: real / simulado / pendiente")

- [ ] **Step 1: README**

Agregar al final de la sección de plataforma:

```markdown
### Estado: real / simulado / pendiente (hito visual V1)

| Elemento | Estado |
|---|---|
| Proyectos, ciclos, observaciones, actividad del inicio | Real (datos del tenant) |
| Catálogo de especies | Real; rasgos sin evidencia se muestran como "Desconocido" |
| Lecturas de temperatura y humedad en el inicio | Pendiente (V3: invernadero virtual, etiquetadas SIMULADO) |
| Callouts sobre modelos STL | Pendiente (V2) |
| Studio 3D, impacto, grafo | Pendiente (V4–V6) |
```

- [ ] **Step 2: Verificación completa**

```bash
cd /mnt/c/Users/ecamp/Devs/harvestt
~/.venvs/harvestt/bin/python -m pytest -q
cd frontend && npm run typecheck && npm test && npm run build && cd ..
docker build -t harvestt:v1 . 
```

Expected: pytest todo PASS; vitest todo PASS; build OK; imagen construida.

- [ ] **Step 3: Smoke del contenedor y revisión visual**

```bash
docker run -d --name hv1 -p 8090:8000 -e ENVIRONMENT=development -e DATABASE_URL=sqlite:////tmp/hv1.db -e SEED_ADMIN_EMAIL=admin@example.test -e SEED_ADMIN_PASSWORD=dev-pass-123 harvestt:v1
curl -s localhost:8090/api/v1/health/ready
```

Expected: `{"status":"ok","database":"up"}`. Abrir `http://localhost:8090/`, `/login`, `/app` (tras login), `/app/plants`, `/app/projects`, `/app/prototypes` en tema claro, oscuro y a 375 px de ancho: sin scroll horizontal, sin texto lima sobre claro, riel plegable funcionando, inicio con "Sin lecturas". Luego `docker rm -f hv1`.

Nota: si `alembic upgrade` en el CMD no soporta SQLite en el contenedor, usar el `docker-compose.yml` existente (Postgres 17) para el smoke en lugar de SQLite.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: estado real/simulado/pendiente tras el hito visual V1"
```

- [ ] **Step 5: Entrega**

Reportar al usuario: resumen, capturas de las pantallas clave y resultados de verificación. **No** hacer merge a `main` ni push sin autorización explícita.

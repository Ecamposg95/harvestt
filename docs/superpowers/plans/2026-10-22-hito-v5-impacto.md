# V5 · Impacto y KPIs — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KPIs de proyecto y públicos calculados al vuelo, cada uno con valor (o `null`), origen y fórmula visibles; pestaña "Impacto" en el proyecto y sección pública "Impacto" en la vitrina.

**Architecture:** módulo backend `app/modules/impact/` sin tablas ni migración: un servicio puro de consultas que arma una lista de `KpiOut` y un router con `GET /projects/{id}/impact` (viewer) y `GET /public/impact` (sin autenticación, solo catálogo global + organización `PUBLIC_ORG_SLUG`). En el frontend, `features/impact/` con cliente, formateo, una tarjeta `KpiFigure` (número grande + `OriginBadge` + fórmula en tooltip accesible), la página de proyecto y la sección de la vitrina.

**Tech Stack:** FastAPI + SQLAlchemy 2 + pytest (backend); React 18 + TS + Tailwind + vitest/Testing Library (frontend). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-19-hito-visual-design.md` §7 (y §9 pruebas V5). Roadmap: `docs/superpowers/plans/2026-10-20-hito-visual-maestro.md`.

## Global Constraints

- Ningún número inventado: cada KPI es un conteo real, un cálculo con fórmula visible o lleva origen `simulated`.
- Forma de cada KPI: `{key, label, value | null, unit, origin, formula, inputs_count, as_of}`.
- `value = null` cuando faltan insumos (denominador 0, sin fechas, sin reconocimientos) → UI "Sin datos suficientes". Los conteos son reales y valen `0` cuando no hay registros (un conteo en cero no es falta de insumos).
- Orígenes solo del vocabulario existente `measured|derived|simulated` (constantes `ORIGIN_*` de `app/modules/catalog/models.py`).
- Fuera de alcance explícito: rendimiento, ahorro de agua, CO₂, dinero o cualquier estimación sin metodología documentada.
- `/public/impact` no expone nada de proyectos, ciclos, observaciones, telemetría ni IDs internos.
- Sin migración; sin dependencias nuevas.
- Rama `feat/hito-v5-impacto` desde `main`; merge y despliegue solo con autorización explícita del usuario.
- Textos de UI en español; etiquetas de origen solo vía `OriginBadge`.

## Review Focus

1. **Proyecto vacío** (sin ciclos, especies, observaciones ni corridas): los conteos dan `0` y los derivados `null`; nunca `NaN`, división entre cero ni "0 %" → prueba en Tarea 1.
2. **Ciclo activo sin `started_on`**: no cuenta para "días desde inicio"; si ninguno tiene fecha → `null` → prueba en Tarea 1.
3. **Relojes mezclados en incidentes**: `opened_at` está en tiempo simulado y `acknowledged_at` en tiempo real; el tiempo medio a reconocer debe usar `Incident.created_at` (real) → prueba en Tarea 1.
4. **Organización pública inexistente o datos de tenants privados**: `/public/impact` responde 200, no cuenta prototipos borrados/no públicos/de otra organización y no cambia al crear proyectos → prueba en Tarea 2.
5. **`value: 0` vs `value: null` en la UI**: `0` se muestra como "0", `null` como "Sin datos suficientes" y sin badge de origen → prueba en Tarea 3.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/modules/impact/__init__.py` | vacío |
| `app/modules/impact/schemas.py` | `KpiOut`, `ProjectImpactOut`, `PublicImpactOut` |
| `app/modules/impact/service.py` | `project_kpis`, `public_kpis` y helpers de conteo |
| `app/modules/impact/router.py` | rutas de proyecto y pública |
| `app/main.py` | registrar `impact_router` |
| `tests/test_impact.py` | pruebas backend V5 |
| `frontend/src/features/impact/api.ts` | tipos y `impactApi` |
| `frontend/src/features/impact/format.ts` | `formatKpiValue` |
| `frontend/src/features/impact/KpiFigure.tsx` | tarjeta de KPI con origen y fórmula |
| `frontend/src/features/impact/ProjectImpactPage.tsx` | pestaña Impacto del proyecto |
| `frontend/src/features/impact/ImpactSection.tsx` | sección pública en la vitrina |
| `frontend/src/features/impact/impact.test.tsx`, `format.test.ts` | pruebas frontend |
| `frontend/src/features/projects/ProjectTabs.tsx` | pestaña `impacto` |
| `frontend/src/App.tsx` | ruta `projects/:id/impact` |
| `frontend/src/features/prototypes/ShowcasePage.tsx`, `frontend/src/layouts/PublicLayout.tsx` | sección y enlace "Impacto" |
| `README.md`, `docs/superpowers/plans/2026-10-20-hito-visual-maestro.md` | estado real/simulado/pendiente |

---

### Task 1: KPIs de proyecto (`GET /projects/{id}/impact`)

**Files:**
- Create: `app/modules/impact/__init__.py`, `app/modules/impact/schemas.py`, `app/modules/impact/service.py`, `app/modules/impact/router.py`, `tests/test_impact.py`
- Modify: `app/main.py` (import y tupla de routers)

**Interfaces:**
- Consumes: `get_project(db, ctx, project_id) -> Project` (`app/modules/projects/service.py`); `simulation.refresh_current_run(db, ctx, project, now)`; `get_now` (`app/modules/simulation/clock.py`); `scoped(model, ctx)`; `require_role(ROLE_VIEWER)`; modelos `CropCycle`, `Observation`, `TraitAssertion`, `SimulationRun`, `Incident`; constantes `CYCLE_ACTIVE`, `SUBJECT_SPECIES`, `ORIGIN_MISSING`, `ORIGIN_MEASURED`, `ORIGIN_DERIVED`, `ORIGIN_SIMULATED`, `INCIDENT_OPEN`.
- Produces:
  - `class KpiOut(BaseModel)`: `key: str`, `label: str`, `value: float | None`, `unit: str | None`, `origin: str`, `formula: str`, `inputs_count: int`, `as_of: datetime`.
  - `class ProjectImpactOut(BaseModel)`: `project_id: str`, `as_of: datetime`, `kpis: list[KpiOut]`.
  - `def project_kpis(db: Session, ctx: RequestContext, project: Project, now: datetime) -> ProjectImpactOut`
  - `def evidence_coverage(db: Session, species_ids: list[str] | None) -> tuple[float | None, int]` — `None` = todo el catálogo; devuelve `(porcentaje redondeado a 1 decimal | None, total)`. La reutiliza la Tarea 2.
  - `router = APIRouter(tags=["impact"])` en `app/modules/impact/router.py`, con `GET /projects/{project_id}/impact` (`response_model=ProjectImpactOut`).

KPIs de proyecto, en este orden (copiar `key`, `label`, `unit`, `origin` y `formula` tal cual):

| key | label | unit | origin | formula | value | inputs_count |
|---|---|---|---|---|---|---|
| `active_cycles` | Ciclos activos | `None` | measured | Número de ciclos del proyecto con estado «activo». | conteo | ciclos del proyecto |
| `days_since_oldest_active_cycle` | Días desde el inicio del ciclo activo más antiguo | días | derived | Fecha de hoy − fecha de inicio del ciclo activo más antiguo con fecha registrada. | `(now.date() − min(started_on)).days`; `null` si ningún ciclo activo tiene `started_on` | ciclos activos con fecha |
| `observations_30d` | Observaciones en los últimos 30 días | `None` | measured | Entradas de la bitácora con fecha de observación dentro de los últimos 30 días. | conteo con `observed_at >= now − 30 d` | igual al valor |
| `evidence_coverage` | Cobertura de evidencia de las especies | % | derived | Afirmaciones con origen distinto de «desconocido» ÷ total de afirmaciones de las especies del proyecto × 100. | `evidence_coverage(db, species_ids)`; `null` si total 0 | total de afirmaciones |
| `sources_cited` | Fuentes citadas | `None` | measured | Fuentes distintas citadas como evidencia en las afirmaciones de las especies del proyecto. | conteo de `source_id` distintos en `evidence_refs` | afirmaciones de las especies |
| `simulation_runs` | Corridas de simulación | `None` | simulated | Corridas de la simulación didáctica creadas en el proyecto. | conteo | igual al valor |
| `incidents_open` | Incidentes abiertos | `None` | simulated | Incidentes con estado «abierto» generados por la telemetría simulada. | conteo | incidentes del proyecto |
| `incidents_acknowledged` | Incidentes reconocidos | `None` | simulated | Incidentes de la telemetría simulada que una persona reconoció. | conteo con `acknowledged_at IS NOT NULL` | incidentes del proyecto |
| `mean_minutes_to_acknowledge` | Tiempo medio a reconocer | min | simulated | Promedio de (momento del reconocimiento − momento en que se registró el incidente), en tiempo real. | media de `acknowledged_at − created_at` en minutos, 1 decimal; `null` sin reconocidos | incidentes reconocidos |

"Especies del proyecto" = `species_id` distintos de los ciclos del proyecto (cualquier estado). Todas las consultas privadas pasan por `scoped(...)` y filtran `project_id`. `as_of = now` en cada KPI y en la respuesta.

- [ ] **Step 1: Crear la rama**

```bash
git checkout main && git pull --ff-only && git checkout -b feat/hito-v5-impacto
```

- [ ] **Step 2: Escribir las pruebas que fallan** en `tests/test_impact.py`

Reutilizar `make_project` (`tests/test_devices.py`), `add_device`, `start` (`tests/test_simulation.py`), `add_rule`, `run_to_end` (`tests/test_alerts.py`), fixtures `client`, `tenants`, `db`, `clock`. Helper local `kpis(client, h, pid) -> dict[str, dict]` indexado por `key`.

```python
def test_project_impact_requires_auth_and_tenant(client, tenants):
    p = make_project(client, tenants["alfa_editor"])
    assert client.get(f"{API}/projects/{p['id']}/impact").status_code == 401
    assert client.get(f"{API}/projects/{p['id']}/impact", headers=tenants["beta_viewer"]).status_code == 404

def test_empty_project_counts_zero_and_derived_null(client, tenants, clock):
    k = kpis(client, tenants["alfa_viewer"], make_project(client, tenants["alfa_editor"])["id"])
    assert list(k) == ["active_cycles", "days_since_oldest_active_cycle", "observations_30d", "evidence_coverage",
                       "sources_cited", "simulation_runs", "incidents_open", "incidents_acknowledged",
                       "mean_minutes_to_acknowledge"]
    for key in ("active_cycles", "observations_30d", "sources_cited", "simulation_runs", "incidents_open", "incidents_acknowledged"):
        assert k[key]["value"] == 0
    for key in ("days_since_oldest_active_cycle", "evidence_coverage", "mean_minutes_to_acknowledge"):
        assert k[key]["value"] is None
    assert {v["origin"] for v in k.values()} <= {"measured", "derived", "simulated"}
    assert all(v["formula"] and v["as_of"] for v in k.values())

def test_cycles_days_and_coverage(client, tenants, db, clock):
    # catalog_seed.seed(db); dos ciclos activos de lechuga: uno con started_on = 2026-10-10, otro sin fecha;
    # un ciclo "planned" de otra especie. clock.now = 2026-10-20.
    # Esperado: active_cycles == 2, days_since_oldest_active_cycle == 10 con inputs_count == 1,
    # evidence_coverage == round(no_missing / total * 100, 1) calculado en la prueba sobre TraitAssertion
    # de las dos especies, inputs_count == total.

def test_active_cycle_without_start_date_gives_null_days(client, tenants, db, clock):
    # un único ciclo activo sin started_on → days value None, inputs_count 0

def test_observations_window_is_30_days(client, tenants, db, clock):
    # tres observaciones: hace 1 día, hace 29 días, hace 31 días (ajustar observed_at en db) → value 2

def test_sources_cited_counts_distinct_sources_of_project_species(client, tenants, db, clock):
    # dos afirmaciones de la especie del proyecto citando el mismo source_id y una tercera citando otro → 2;
    # una afirmación de otra especie citando un tercer source → no cuenta

def test_simulation_and_incident_kpis(client, tenants, db, clock):
    # setup de test_alerts: regla + heat_rise seed=42 + run_to_end 288 pasos → simulation_runs == 1, un incidente.
    # Fijar en db: incident.created_at = T, acknowledged_at = T + 6 min → mean_minutes_to_acknowledge == 6.0,
    # incidents_acknowledged == 1, inputs_count == 1. El incidente cerrado no cuenta en incidents_open.
    # Además: opened_at (tiempo simulado) puede quedar horas después de created_at; el KPI no debe usarlo.

def test_other_project_data_not_counted(client, tenants, db, clock):
    # observación y ciclo en otro proyecto del mismo tenant → no cambian los KPIs del primero
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_impact.py -v`
Expected: FAIL (404 en la ruta / `ModuleNotFoundError: app.modules.impact`).

- [ ] **Step 4: Implementar** `schemas.py`, `service.py` (`project_kpis`, `evidence_coverage`, helper `_kpi(key, label, value, unit, origin, formula, inputs_count, now) -> KpiOut`) y `router.py`

El router de proyecto: dependencias `require_role(ROLE_VIEWER)`, `get_db`, `get_now`; `project = get_project(db, ctx, project_id)`; llamar `simulation.refresh_current_run(db, ctx, project, now)` antes de calcular para que los incidentes reflejen el paso actual (igual que `home._readings`). Registrar `impact_router` en la tupla de `app/main.py`.

- [ ] **Step 5: Correr y verificar que pasan, y la suite completa**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_impact.py -v && make test`
Expected: PASS, sin regresiones.

- [ ] **Step 6: Commit**

```bash
git add app/modules/impact app/main.py tests/test_impact.py
git commit -m "feat(impact): KPIs de proyecto con origen, fórmula y null sin insumos"
```

---

### Task 2: KPIs públicos (`GET /public/impact`)

**Files:**
- Modify: `app/modules/impact/schemas.py`, `app/modules/impact/service.py`, `app/modules/impact/router.py`, `tests/test_impact.py`

**Interfaces:**
- Consumes: `evidence_coverage(db, None)` y `_kpi(...)` (Tarea 1); `prototypes.service.public_org_id(db, slug) -> str | None`; `settings.public_org_slug` importado como `from app.core.config import settings` en `impact/router.py` (las pruebas lo parchean con `monkeypatch.setattr(impact_router, "settings", Settings(public_org_slug="alfa"))`, igual que `tests/test_prototypes.py::public_alfa`).
- Produces:
  - `class PublicImpactOut(BaseModel)`: `as_of: datetime`, `kpis: list[KpiOut]`.
  - `def public_kpis(db: Session, public_org_id: str | None, now: datetime) -> PublicImpactOut`
  - Ruta `GET /public/impact` (sin autenticación), `response_model=PublicImpactOut`.

| key | label | unit | origin | formula | value | inputs_count |
|---|---|---|---|---|---|---|
| `published_prototypes` | Prototipos publicados | `None` | measured | Prototipos publicados en la vitrina. | `is_public` y `deleted_at IS NULL` en la organización pública; `0` si no existe | igual al valor |
| `catalog_species` | Especies en el catálogo | `None` | measured | Especies registradas en el catálogo vegetal. | conteo de `Species` | igual al valor |
| `licensed_sources` | Fuentes con licencia registrada | `None` | measured | Fuentes del catálogo con licencia registrada. | `Source.license` no nulo ni vacío | total de fuentes |
| `catalog_evidence_coverage` | Cobertura de evidencia del catálogo | % | derived | Afirmaciones con origen distinto de «desconocido» ÷ total de afirmaciones del catálogo × 100. | `evidence_coverage(db, None)` | total de afirmaciones |

- [ ] **Step 1: Escribir las pruebas que fallan**

```python
def test_public_impact_without_auth_and_shape(client, db, public_alfa_impact):
    body = client.get(f"{API}/public/impact").json()
    assert [k["key"] for k in body["kpis"]] == ["published_prototypes", "catalog_species", "licensed_sources", "catalog_evidence_coverage"]
    assert set(body) == {"as_of", "kpis"}
    assert all(set(k) == {"key", "label", "value", "unit", "origin", "formula", "inputs_count", "as_of"} for k in body["kpis"])

def test_public_impact_counts_only_public_live_prototypes_of_public_org(client, tenants, db, public_alfa_impact):
    # alfa: uno público, uno privado, uno público y luego borrado; beta: uno público → published_prototypes == 1

def test_public_impact_unknown_public_org_still_answers(client, monkeypatch):
    # Settings(public_org_slug="no-existe") → 200, published_prototypes == 0

def test_public_impact_does_not_leak_tenant_data(client, tenants, db, public_alfa_impact):
    # snapshot = respuesta; crear proyecto "Secreto alfa", ciclo y observación; la respuesta
    # (sin as_of) es idéntica y "Secreto" no aparece en el JSON serializado

def test_public_catalog_coverage_and_licensed_sources(client, db):
    # catalog_seed.seed(db) + dos Source (una con license="CC-BY-4.0", otra sin) →
    # licensed_sources == 1 (inputs_count == total de fuentes); coverage igual al cálculo directo; sin afirmaciones → None
```

`public_alfa_impact` es un fixture local que parchea `impact_router.settings`.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_impact.py -k public -v`
Expected: FAIL (404).

- [ ] **Step 3: Implementar `public_kpis` y la ruta**

La ruta resuelve `public_org_id(db, settings.public_org_slug)` y llama `public_kpis(db, org_id, now)` con `now` de `get_now`.

- [ ] **Step 4: Correr y verificar que pasan, y la suite completa**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_impact.py -v && make test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/modules/impact tests/test_impact.py
git commit -m "feat(impact): KPIs públicos del catálogo y la vitrina sin datos de proyectos"
```

---

### Task 3: Cliente, formateo y `KpiFigure` (frontend)

**Files:**
- Create: `frontend/src/features/impact/api.ts`, `format.ts`, `format.test.ts`, `KpiFigure.tsx`, `impact.test.tsx`

**Interfaces:**
- Consumes: `api` (`@/api/client`), `OriginBadge` y `cx` (`@/components/ui`).
- Produces:
  - `export interface Kpi { key: string; label: string; value: number | null; unit: string | null; origin: 'measured' | 'derived' | 'simulated'; formula: string; inputs_count: number; as_of: string }`
  - `export interface ProjectImpact { project_id: string; as_of: string; kpis: Kpi[] }`, `export interface PublicImpact { as_of: string; kpis: Kpi[] }`
  - `export const impactApi = { project: (id: string) => Promise<ProjectImpact>, public: () => Promise<PublicImpact> }` (rutas `/projects/${encodeURIComponent(id)}/impact` y `/public/impact`).
  - `export function formatKpiValue(kpi: Kpi): string | null` — `null` si `value === null`; con `unit === '%'` o `'min'` hasta un decimal (`toLocaleString('es-MX', {maximumFractionDigits: 1})`: punto decimal, coma de miles); el resto entero con `maximumFractionDigits: 0`.
  - `export function KpiFigure({ kpi, size }: { kpi: Kpi; size: 'hero' | 'tile' }): JSX.Element` — etiqueta, número (o "Sin datos suficientes"), unidad, `OriginBadge` solo con valor, y botón "Cómo se calcula" (`aria-expanded`, `aria-controls`) que muestra la fórmula en un globo al pasar el cursor, al enfocar o al tocar; `Escape` lo cierra. `hero` usa tipografía de display (clamp, Manrope 800) para la vitrina; `tile` usa el estilo de `StatTile`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// format.test.ts
it('null no se formatea', () => expect(formatKpiValue(k({ value: null }))).toBeNull())
it('cero es "0"', () => expect(formatKpiValue(k({ value: 0 }))).toBe('0'))
it('conteos con miles', () => expect(formatKpiValue(k({ value: 1234 }))).toBe('1,234'))
it('porcentaje y minutos con un decimal', () => {
  expect(formatKpiValue(k({ value: 37.46, unit: '%' }))).toBe('37.5')
  expect(formatKpiValue(k({ value: 6, unit: 'min' }))).toBe('6')
})

// impact.test.tsx (KpiFigure)
it('sin valor muestra "Sin datos suficientes" y ningún badge de origen')
it('con valor 0 muestra "0" y su badge')       // getByText('0'), getByText('Medido')
it('la fórmula aparece al enfocar o tocar "Cómo se calcula" y Escape la oculta') // aria-expanded true/false
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd frontend && npx vitest run src/features/impact`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar `api.ts`, `format.ts` y `KpiFigure.tsx`**

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd frontend && npx vitest run src/features/impact && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/impact
git commit -m "feat(impact): cliente, formateo y tarjeta de KPI con origen y fórmula"
```

---

### Task 4: Pestaña "Impacto" del proyecto

**Files:**
- Create: `frontend/src/features/impact/ProjectImpactPage.tsx`
- Modify: `frontend/src/features/projects/ProjectTabs.tsx`, `frontend/src/App.tsx`, `frontend/src/features/impact/impact.test.tsx`

**Interfaces:**
- Consumes: `impactApi.project`, `KpiFigure` (Tarea 3); `ProjectTabs`, `projectTabHref`; `Loading`, `ErrorState`, `PageHeader` de `@/components/ui`; `errorMessage` como lo usa `OperationsPage`.
- Produces: `export function ProjectImpactPage()` en la ruta `projects/:id/impact`; `ProjectTab` gana `'impacto'` (después de `'studio'`, etiqueta "Impacto", `projectTabHref(id, 'impacto') === '/app/projects/<id>/impact'`).

Diseño: encabezado con el nombre del proyecto (de `projectsApi`, como hace `OperationsPage`), `ProjectTabs active="impacto"`, banda de texto "Cifras calculadas en vivo con los datos del proyecto. Las de telemetría provienen de la simulación didáctica.", y tres grupos de `KpiFigure size="tile"` en rejilla (1 col móvil, 3 en `lg`): **Cultivo** (`active_cycles`, `days_since_oldest_active_cycle`, `observations_30d`), **Evidencia** (`evidence_coverage`, `sources_cited`), **Operación simulada** (`simulation_runs`, `incidents_open`, `incidents_acknowledged`, `mean_minutes_to_acknowledge`). KPIs con `key` desconocida se ignoran. Pie con "Actualizado: <as_of en es-MX>".

- [ ] **Step 1: Escribir las pruebas que fallan** (en `impact.test.tsx`, con `MemoryRouter initialEntries={['/app/projects/p1/impact']}` y `Route path="/app/projects/:id/impact"`)

```ts
it('agrupa los KPIs, marca la pestaña Impacto y muestra "Sin datos suficientes" en los null')
it('error muestra reintento')
// y en projects.test.tsx o aquí:
it('projectTabHref de impacto', () => expect(projectTabHref('p1', 'impacto')).toBe('/app/projects/p1/impact'))
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd frontend && npx vitest run src/features/impact src/features/projects`
Expected: FAIL.

- [ ] **Step 3: Implementar la página, la pestaña y la ruta**

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS (suite completa).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/impact frontend/src/features/projects/ProjectTabs.tsx frontend/src/App.tsx
git commit -m "feat(impact): pestaña Impacto del proyecto con KPIs agrupados"
```

---

### Task 5: Sección pública "Impacto" en la vitrina

**Files:**
- Create: `frontend/src/features/impact/ImpactSection.tsx`
- Modify: `frontend/src/features/prototypes/ShowcasePage.tsx` (montar después de `#prototipos`), `frontend/src/layouts/PublicLayout.tsx` (enlace "Impacto" a `/#impacto`), `frontend/src/features/impact/impact.test.tsx`

**Interfaces:**
- Consumes: `impactApi.public`, `KpiFigure size="hero"`.
- Produces: `export function ImpactSection()` — `<section id="impacto" aria-labelledby="impacto-titulo" className="… scroll-mt-16">`.

Diseño (inspirado en la referencia 34): `h2.eyebrow` "Impacto", titular de display "Lo que la plataforma ya sostiene con datos", párrafo narrativo fijo: "Cada cifra se calcula en vivo a partir del catálogo y de la vitrina. Toca «Cómo se calcula» para ver su fórmula y su origen. No mostramos estimaciones de rendimiento, agua, carbono ni dinero sin una metodología documentada." Rejilla de 4 `KpiFigure size="hero"` (2×2 en `sm`, 4 en `lg`). Carga: esqueletos con `role="status"`; error: la sección no se muestra (la vitrina no debe romperse por un KPI) — se registra `console.warn`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('muestra los cuatro KPIs públicos con su origen y la nota de lo que no se estima')
it('si /public/impact falla, la vitrina sigue sin la sección')   // queryByRole('region', {name: 'Impacto'}) es null
it('el enlace "Impacto" del encabezado público apunta a /#impacto')
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd frontend && npx vitest run src/features/impact src/features/prototypes`
Expected: FAIL.

- [ ] **Step 3: Implementar `ImpactSection`, montarla en `ShowcasePage` y el enlace en `PublicLayout`**

El enlace con `#` debe desplazar a la sección también cuando ya se está en `/`: usar `<a href="/#impacto">` (no `Link`), o `Link` más `scrollIntoView` en `ShowcasePage` cuando `location.hash === '#impacto'` tras cargar.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/impact frontend/src/features/prototypes/ShowcasePage.tsx frontend/src/layouts/PublicLayout.tsx
git commit -m "feat(impact): sección pública Impacto en la vitrina con fórmula y origen por cifra"
```

---

### Task 6: Cierre de fase

**Files:**
- Modify: `README.md` (tabla "Estado: real / simulado / pendiente"), `docs/superpowers/plans/2026-10-20-hito-visual-maestro.md` (fila V5 y "Pendiente")

- [ ] **Step 1: Verificación completa**

Run: `make test && cd frontend && npm run typecheck && npm test && npm run build`
Expected: todo verde; el chunk principal no crece con three/d3 (V5 no los importa).

- [ ] **Step 2: Smoke del contenedor**

Run: `docker build -t harvestt-cortex:local . && docker rm -f hvt-local-app && docker run -d --name hvt-local-app --network hvt-local -p 8080:8080 -v hvt-local-files:/tmp/storage -e DATABASE_URL=postgresql://postgres:pg@hvt-local-db:5432/hvt -e SECRET_KEY=local-only-secret-0123456789abcdef0123 -e SEED_ADMIN_EMAIL=admin@local.test -e SEED_ADMIN_PASSWORD=harvestt-local -e STORAGE_DIR=/tmp/storage -e PORT=8080 harvestt-cortex:local`
Expected: `curl -s localhost:8080/api/v1/public/impact` devuelve 4 KPIs; con sesión, `/api/v1/projects/<id>/impact` devuelve 9.

- [ ] **Step 3: Revisión visual en navegador** (claro, oscuro, 375 px): `/#impacto` y `/app/projects/<id>/impact` del proyecto demo con una corrida e incidente reconocido; el globo de fórmula no se sale de la pantalla en móvil.

- [ ] **Step 4: Actualizar README y plan maestro**

README: filas "KPIs de impacto (proyecto)" → conteos reales, derivados con fórmula, telemetría SIMULADO; "KPIs públicos" → catálogo y vitrina reales; "Rendimiento, agua, CO₂, dinero" → fuera de alcance sin metodología. Plan maestro: V5 "Completa", en producción "No" hasta autorización; quitar V5 de "Pendiente".

- [ ] **Step 5: Commit y push de la rama**

```bash
git add README.md docs/superpowers/plans/2026-10-20-hito-visual-maestro.md
git commit -m "docs: estado de V5 impacto en README y plan maestro"
git push -u origin feat/hito-v5-impacto
```

Merge a `main` y despliegue a Railway **solo** con autorización explícita del usuario; tras desplegar, verificar `https://harvestt-production.up.railway.app/api/v1/public/impact` y la sección en la vitrina.

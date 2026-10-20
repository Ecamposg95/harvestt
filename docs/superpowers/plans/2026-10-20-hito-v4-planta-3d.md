# Hito visual V4 — Planta 3D híbrida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que cada especie tenga una planta 3D procedural ilustrativa (lechuga, tomate, albahaca y una genérica, en tres etapas) visible en la ficha y en las tarjetas del catálogo; que cada proyecto tenga un Studio con zonas y plantas colocadas, guardado con versión; y que la ficha muestre una imagen con licencia y callouts de rasgos cuando un superadmin la haya subido.

**Architecture:** frontend: generadores puros de geometría en `features/three/plants/` (semilla determinista, una geometría por especie/etapa/semilla en caché, dibujada con `InstancedMesh`), un visor perezoso para la ficha, miniaturas PNG del catálogo desde un único renderer compartido y el Studio (`/app/projects/:id/studio`) con escena 3D perezosa y respaldo SVG 2D. Backend: módulo nuevo `app/modules/studio` con `Zone`/`Placement`, `GET/PUT /projects/{id}/layout` (reemplazo completo con versión y 409), y `SpeciesMedia` global en `catalog` (escritura solo superadmin, licencia y atribución obligatorias, misma validación de imagen que prototipos). Una sola migración `0006_studio_layout_species_media` (después de `0005` de V3).

**Tech Stack:** FastAPI 0.127, SQLAlchemy 2 (sync), Alembic, pytest (SQLite en pruebas, Postgres 17 en producción); React 18.3.1, TS 5.6, Vite 5, Tailwind 3, vitest 2.1.9 + Testing Library, three 0.170.0 (solo en chunks perezosos), zustand.

**Spec:** `docs/superpowers/specs/2026-10-19-hito-visual-design.md` — sección 6 (vinculante), y 1 (criterio "ningún número inventado"), 3.2 (`Callout`, `OriginBadge`), 9 (pruebas V4) y 11 (fuera de alcance: modelo científico de crecimiento).

**Rama:** `feat/hito-v4-planta-3d`, ya creada desde `feat/demo-visual` (`39913bc`, contiene V2 completo). V4 se integra a `main` **después de V3**: la migración `0006` declara `down_revision = "0005"` (`0005_simulation_telemetry` de V3). Antes del merge, rebase sobre `main` con V3; conflictos esperados y triviales (solo agregar líneas de ambos lados) en `app/main.py` (tupla de routers), `app/models_registry.py`, `app/modules/home/service.py` (`_TEXTS`), `frontend/src/App.tsx` (rutas), `frontend/src/features/projects/ProjectDetailPage.tsx` (pestañas) y `README.md`.

**Prioridad de demo:** las Tasks 1–3 son solo frontend, no tocan la base de datos y se pueden desplegar solas (ficha con planta 3D y catálogo con miniaturas). Las Tasks 4–5 (layout + Studio) necesitan la migración `0006`, que depende de `0005`: no desplegar T4+ en un entorno sin V3. Si la demo ocurre antes de integrar V3, el Studio se muestra desde una rama de integración local (`git merge feat/hito-v3-invernadero` sobre esta rama) — nunca cambiando `down_revision`.

## Global Constraints

- Sin dependencias nuevas (frontend ni backend).
- three solo dentro de chunks perezosos: nada alcanzable con imports estáticos desde `src/main.tsx` puede importar `three` o `three/...`. Lo fija `frontend/src/features/three/lazyBoundary.test.ts` (Task 1), que recorre el grafo de imports estáticos. Módulos sin three que las páginas sí pueden importar: `features/three/types.ts`, `features/three/webgl.ts`, `features/three/plants/{types,random,palette,instances}.ts` y los envoltorios `Lazy*.tsx` / `catalog/plantThumbnails.ts` (que usan `import()` dinámico).
- Geometrías de `getPlantModel` y materiales de `getPlantMaterial` son cachés de sesión: los visores **nunca** los desechan (solo desechan renderer, controles y lo que crean ellos mismos).
- Unidades en metros. Zona: `x, y` desde el origen del piso, `width` (eje X), `depth` (eje Y del plano). Planta: `x, y` **relativos a su zona**, `rotation` en grados. En three: `X = x`, `Z = y`, `Y` hacia arriba.
- Toda planta procedural lleva `OriginBadge origin="illustrative"` y el texto exacto "Representación ilustrativa; no predice crecimiento" (constante `ILLUSTRATIVE_NOTICE`). Los tamaños de las plantas generadas son escala de dibujo: no se muestran como números ni se presentan como predicción.
- Ningún valor agronómico inventado: los callouts muestran el valor de la afirmación o "Desconocido" con su `OriginBadge`.
- No se descargan imágenes de terceros: ningún código hace peticiones a `source_url`; solo se guarda y enlaza.
- Layout: lectura con cualquier rol del tenant (`get_context`, igual que `GET /projects/{id}`); escritura `editor`. `SpeciesMedia`: lectura con sesión (cualquier miembro); escritura solo superadmin (`require_superadmin`).
- Borrado lógico (`deleted_at`) en todo. Toda escritura auditada (`record()` para layout; `AuditEvent` con `organization_id = None` para medios globales).
- Copias de UI en español; Tailwind: `text-accent` para texto verde, `bg-lime` solo relleno, opacidades en múltiplos de 5.
- Comandos: backend `~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings`; frontend (en `frontend/`) `npx tsc -b`, `npx vitest run`, `npm run build`.

## Review Focus

1. **three no entra al bundle principal:** la ficha, el catálogo y el Studio solo importan envoltorios perezosos. Lo fija `lazyBoundary.test.ts` (Task 1, ampliado en Tasks 2, 3 y 5 con cada par envoltorio/implementación) más el `grep` de `WebGLRenderer` sobre `dist/assets/index-*.js` en las Tasks 3, 5 y 8.
2. **Determinismo y reutilización de geometría:** misma (especie, etapa, semilla) → mismos vértices y el mismo objeto en caché; otra semilla → otros vértices; 30 plantas en 3 variantes → 3 `InstancedMesh` que comparten la geometría de la caché; la variante de una planta no cambia al guardar (los IDs se regeneran en el PUT). Pruebas `generadores son deterministas…`, `getPlantModel genera una vez…`, `30 lechugas en 3 variantes…` (Task 1) e `instancesFor: la variante sobrevive a guardar` (Task 5).
3. **Límites del layout:** coordenadas de planta relativas a su zona; zona fuera del piso → 422 con `path`; el borde exacto cuenta como dentro; proyecto sin área acepta cualquier zona y su piso es ilustrativo. Pruebas `test_zone_outside_project_area_is_422_with_path`, `test_plant_outside_its_zone_is_422`, `test_project_without_area_has_illustrative_floor_that_grows` (Task 4).
4. **Reemplazo completo y concurrencia:** un PUT con versión vieja → 409 y el layout anterior queda intacto; el reemplazo borra lógicamente zonas y plantas previas. Pruebas `test_stale_version_conflicts_and_keeps_layout` y `test_replace_reload_and_audit` (Task 4); en UI, `un 409 al guardar muestra el aviso y recarga` (Task 5).
5. **Medios con licencia:** sin licencia o atribución → 422 y nada queda guardado (ni fila ni archivo); solo superadmin escribe; el JSON nunca expone `storage_key` ni `checksum`; el archivo responde con caché privada y 304 por `ETag`. Pruebas `test_license_and_attribution_are_required`, `test_only_superadmin_writes`, `test_superadmin_uploads_and_detail_lists_media`, `test_file_streams_with_private_cache_and_etag` (Task 6).

## Rulings sobre el spec

- **Área del proyecto como piso:** el proyecto solo tiene `area_m2`, no forma. El piso es un cuadrado de lado `√area_m2` anclado en `(0, 0)`; "zona dentro del área" = `x + width ≤ lado` y `y + depth ≤ lado`. Sin área no hay límite y el piso se dibuja ilustrativo (mínimo 10 × 10 m, crece con las zonas). Costo si está mal: cambiar `floor_bounds()` y `floorFor()`.
- **Versión del layout:** columna nueva `projects.layout_version` (empieza en 0), independiente de `projects.version` para que editar el proyecto no invalide el Studio y viceversa. Costo si está mal: mover una columna.
- **Coordenadas de planta relativas a la zona** y `rotation` en grados `[-360, 360]`: mover una zona arrastra sus plantas; "planta dentro de su zona" = `0 ≤ x ≤ width`, `0 ≤ y ≤ depth`. Costo: convertir en el servicio.
- **Semilla sin columna:** la semilla de cada planta es una variante 0–2 derivada de su zona y posición (`variantFor("zi:x:y")`), no un campo guardado. Así hay como máximo 3 geometrías por especie y etapa y el instancing rinde; la variante sobrevive al reemplazo completo (los IDs cambian en cada PUT). Costo si está mal: añadir columna `seed`.
- **Límites y orden:** máximo 20 zonas y 400 plantas por layout → 422 `layout_limit` (el spec no fija límite; protege el render). Zonas y plantas tienen `sort_order` (columna extra) para que el orden —y por lo tanto la selección por índice— sea estable. Sin detección de colisiones, como dice el spec.
- **Etapa de la planta independiente del ciclo:** `CropCycle.stage` es texto libre; `Placement.stage` es `seedling|vegetative|mature` y se elige en el Studio. El ciclo vinculado se muestra en el panel.
- **Studio como ruta propia con pestaña-enlace:** `/app/projects/:id/studio` es una página a pantalla completa; en el detalle del proyecto se añade la entrada "Studio" al arreglo de pestañas que trae V3 (o, si V3 aún no está en la base, una píldora-enlace junto a "Editar"). La prueba solo exige un enlace "Studio" a esa ruta, así pasa en ambos casos.
- **Miniaturas del catálogo = PNG desde un renderer compartido fuera del DOM** (no un canvas por tarjeta ni un canvas superpuesto): ver la justificación en Task 3.
- **Callouts 3D en la ficha sin imagen:** la planta procedural muestra hasta 3 callouts (temperatura arriba, humedad en una hoja, pH en la base) con el valor de la afirmación o "Desconocido", usando el `Callout`/`CalloutProjector` de V2. Es la dependencia "V2 (Callout 3D)" del mapa de fases.
- **`SpeciesMedia` sin PATCH:** el spec solo lista POST y DELETE; cambiar callouts o licencia = subir de nuevo y borrar la anterior. La primera imagen de una especie queda como héroe aunque no se marque (como en prototipos); borrar el héroe no promueve otra (la ficha vuelve a la planta 3D).
- **Archivo de medio con sesión:** `GET /plants/{id}/media/{mid}/file` exige sesión de cualquier miembro (el catálogo entero es interno) y responde `Cache-Control: private, max-age=86400` + `ETag` (checksum) con 304. Costo si debe ser público: cambiar una dependencia y la política de caché.
- **UI de carga mínima:** el spec no define pantalla para subir medios; se añade una tarjeta "Medios con licencia" en la ficha, visible solo para superadmin, con colocación de callouts por clic sobre la vista previa.
- **Módulo `app/modules/studio`:** zonas y plantas viven en un módulo propio (el spec no lo fija) para no mezclar el Studio con proyectos ni chocar con los archivos de V3.

## Mapa de archivos

| Archivo | Tarea | Responsabilidad |
|---|---|---|
| `frontend/src/features/three/webgl.ts` | 1 | `webglAvailable()` sin three |
| `frontend/src/features/prototypes/StlViewer.tsx` | 1 | usa `webglAvailable` compartido |
| `frontend/src/features/three/plants/random.ts` | 1 | `hashString`, `mulberry32`, `seededRandom`, `between` |
| `frontend/src/features/three/plants/types.ts` | 1 | tipos sin three, `plantKindFor`, `variantFor`, etiquetas, `ILLUSTRATIVE_NOTICE` |
| `frontend/src/features/three/plants/palette.ts` | 1 | colores por especie y parte, `cssHex` |
| `frontend/src/features/three/plants/instances.ts` | 1 | `PlantInstance`, `groupInstances` (sin three) |
| `frontend/src/features/three/plants/shapes.ts` | 1 | `leafGeometry`, `leafTip`, `stemGeometry` |
| `frontend/src/features/three/plants/generators.ts` | 1 | lechuga, tomate, albahaca, genérico |
| `frontend/src/features/three/plants/model.ts` | 1 | `buildPlantModel`, caché, materiales, `createPlantObject` |
| `frontend/src/features/three/plants/instancedPlants.ts` | 1 | `buildInstancedPlants` (instancing + pick) |
| `frontend/src/features/three/plants/scene.ts` | 1 | luces y encuadre |
| `frontend/src/features/three/plants/plants.test.ts` | 1 | pruebas de generadores, caché, instancing, encuadre |
| `frontend/src/features/three/lazyBoundary.test.ts` | 1, 2, 3, 5 | frontera del chunk de three |
| `frontend/src/features/three/plants/PlantViewer.tsx` | 2 | visor de una planta con callouts |
| `frontend/src/features/three/plants/LazyPlantViewer.tsx` | 2 | envoltorio perezoso |
| `frontend/src/features/catalog/traitCallouts.ts` | 2 | valor de rasgo para callouts, `plantViewerCallouts` |
| `frontend/src/features/catalog/traitCallouts.test.ts` | 2 | pruebas |
| `frontend/src/features/catalog/PlantIllustration.tsx` | 2 | planta 3D + ILUSTRATIVO + aviso |
| `frontend/src/features/catalog/PlantDetailPage.tsx` | 2, 7 | héroe 3D / imagen; panel de medios |
| `frontend/src/features/catalog/catalog.test.tsx` | 2, 3, 7 | mocks y pruebas de ficha y tarjetas |
| `frontend/src/features/three/plants/thumbnails.ts` | 3 | renderer compartido → PNG |
| `frontend/src/features/catalog/plantThumbnails.ts` | 3 | caché/cola de miniaturas y hook (sin three) |
| `frontend/src/features/catalog/plantThumbnails.test.ts` | 3 | pruebas de caché |
| `frontend/src/features/catalog/PlantThumb.tsx` | 3 | miniatura de tarjeta |
| `frontend/src/features/catalog/PlantsPage.tsx` | 3 | tarjetas con miniatura |
| `app/modules/studio/{__init__,models,schemas,service,router}.py` | 4 | `Zone`, `Placement`, layout con versión |
| `app/modules/projects/models.py` | 4 | `Project.layout_version` |
| `alembic/versions/0006_studio_layout_species_media.py` | 4, 6 | tablas y columna |
| `app/models_registry.py`, `app/main.py` | 4 | registro del módulo |
| `app/modules/home/service.py` | 4 | texto de actividad |
| `tests/test_studio.py` | 4 | pruebas backend del layout |
| `frontend/src/features/studio/api.ts` | 5 | tipos y llamadas del layout |
| `frontend/src/features/studio/layout.ts` | 5 | edición pura del layout |
| `frontend/src/features/studio/layout.test.ts` | 5 | pruebas |
| `frontend/src/features/studio/sceneTypes.ts` | 5 | props compartidas 3D/2D |
| `frontend/src/features/studio/StudioTopView.tsx` | 5 | respaldo SVG |
| `frontend/src/features/studio/StudioScene.tsx` | 5 | escena 3D (chunk perezoso) |
| `frontend/src/features/studio/LazyStudioScene.tsx` | 5 | envoltorio perezoso |
| `frontend/src/features/studio/SidePanel.tsx` | 5 | panel de selección y edición |
| `frontend/src/features/studio/StudioPage.tsx` | 5 | página |
| `frontend/src/features/studio/studio.test.tsx` | 5 | pruebas de la página |
| `frontend/src/App.tsx` | 5 | ruta |
| `frontend/src/features/projects/ProjectDetailPage.tsx` | 5 | entrada "Studio" |
| `frontend/src/features/projects/projects.test.tsx` | 5 | prueba del enlace |
| `app/modules/catalog/{models,schemas,service,router}.py` | 6 | `SpeciesMedia`, `media[]`, rutas |
| `app/modules/catalog/media.py` | 6 | subida, dimensiones, borrado, auditoría |
| `tests/test_species_media.py` | 6 | pruebas backend de medios |
| `frontend/src/features/catalog/api.ts` | 7 | tipos y llamadas de medios |
| `frontend/src/features/catalog/mediaPoint.ts` | 7 | `relativePoint` |
| `frontend/src/features/catalog/SpeciesHero.tsx` | 7 | imagen héroe con crédito y callouts 2D |
| `frontend/src/features/catalog/MediaAdmin.tsx` | 7 | carga y borrado (superadmin) |
| `frontend/src/features/catalog/media.test.tsx` | 7 | pruebas |
| `README.md` | 8 | checklist real / simulado / pendiente |

**Paralelismo (carriles):**

- **Carril A — frontend procedural (demo):** Task 1 → {Task 2, Task 3}. Tasks 2 y 3 no comparten archivos salvo `catalog.test.tsx` y `lazyBoundary.test.ts`, donde cada una solo añade líneas (mocks y pares); si corren en paralelo, el segundo en integrar resuelve agregando ambas.
- **Carril B — backend:** Task 4 → Task 6 (Task 6 edita la migración `0006` creada en Task 4). Independiente del carril A.
- **Task 5** necesita Task 1 (generadores) y el contrato de Task 4 (las pruebas mockean la API, así que puede empezar cuando T1 esté y T4 esté en curso; el smoke necesita T4).
- **Task 7** necesita Task 2 (ficha) y Task 6 (API de medios).
- **Task 8** al final.

**Corte mínimo de demo:** después de la Task 3 (ficha y catálogo con plantas 3D; sin base de datos).
**Línea de corte de la demo:** después de la Task 5. Las Tasks 6 y 7 (medios con licencia) son opcionales para la demo; la Task 8 cierra la fase.

### Cobertura de las pruebas V4 de la sección 9 del spec

| Prueba del spec | Prueba concreta | Task |
|---|---|---|
| Layout fuera de límites | `test_zone_outside_project_area_is_422_with_path`, `test_plant_outside_its_zone_is_422` | 4 |
| Versión 409 | `test_stale_version_conflicts_and_keeps_layout` | 4 |
| `SpeciesMedia` exige licencia y atribución | `test_license_and_attribution_are_required` (4 casos) | 6 |
| Permisos superadmin | `test_only_superadmin_writes` | 6 |
| Fallback 2D del Studio (vitest) | `sin WebGL muestra la vista superior SVG con el aviso ilustrativo` | 5 |
| Cierre de fase (tsc, vitest, pytest, build, Docker, visual, README) | Task 8 | 8 |

---

### Task 1: Generadores procedurales, caché, instancing y frontera del chunk de three

**Files:**
- Create: `frontend/src/features/three/webgl.ts`
- Modify: `frontend/src/features/prototypes/StlViewer.tsx`
- Create: `frontend/src/features/three/plants/random.ts`
- Create: `frontend/src/features/three/plants/types.ts`
- Create: `frontend/src/features/three/plants/palette.ts`
- Create: `frontend/src/features/three/plants/instances.ts`
- Create: `frontend/src/features/three/plants/shapes.ts`
- Create: `frontend/src/features/three/plants/generators.ts`
- Create: `frontend/src/features/three/plants/model.ts`
- Create: `frontend/src/features/three/plants/instancedPlants.ts`
- Create: `frontend/src/features/three/plants/scene.ts`
- Test: `frontend/src/features/three/plants/plants.test.ts`
- Test: `frontend/src/features/three/lazyBoundary.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores (solo three 0.170 y `BufferGeometryUtils.mergeGeometries`).
- Produces:
  - `webgl.ts`: `webglAvailable(): boolean`.
  - `random.ts`: `hashString(text) -> number`, `mulberry32(seed) -> () => number`, `seededRandom(key) -> () => number`, `between(rand, min, max) -> number`.
  - `types.ts`: `PlantKind = 'lettuce' | 'tomato' | 'basil' | 'generic'`, `PlantStage = 'seedling' | 'vegetative' | 'mature'`, `PLANT_STAGES`, `PLANT_STAGE_LABELS`, `PLANT_VARIANTS = 3`, `ILLUSTRATIVE_NOTICE`, `PlantAnchorKey`, `PlantAnchor`, `PlantViewerCallout`, `PlantViewerProps`, `plantKindFor(scientificName)`, `variantFor(key)`.
  - `palette.ts`: `PLANT_COLORS: Record<PlantKind, {leaf, stem, fruit, flower}>`, `cssHex(color)`.
  - `instances.ts`: `PlantInstance {index, kind, stage, variant, x, z, rotationDeg}`, `InstanceGroup`, `groupInstances(list)`.
  - `generators.ts`: `PlantParts`, `Rand`, `GOLDEN_ANGLE`, `generateLettuce|generateTomato|generateBasil|generateGeneric(stage, rand) -> PlantParts`.
  - `model.ts`: `PART_NAMES`, `PartName`, `PlantModel {key, kind, stage, seed, parts, height, radius, anchors}`, `plantKey`, `buildPlantModel`, `getPlantModel(kind, stage, seed = 0)`, `plantCacheSize()`, `clearPlantCache()`, `getPlantMaterial(kind, part)`, `createPlantObject(model) -> THREE.Group`.
  - `instancedPlants.ts`: `InstancedPlants {group, pick(object, instanceId) -> number | null, dispose()}`, `buildInstancedPlants(list)`.
  - `scene.ts`: `addPlantLights(scene)`, `frameCamera(camera, model) -> THREE.Vector3` (objetivo de la cámara).

- [ ] **Step 1: Pruebas que fallan**

Crear `frontend/src/features/three/plants/plants.test.ts`:

```ts
import * as THREE from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { generateBasil } from './generators'
import { buildInstancedPlants } from './instancedPlants'
import { groupInstances, PlantInstance } from './instances'
import { buildPlantModel, clearPlantCache, getPlantModel, plantCacheSize } from './model'
import { hashString, mulberry32, seededRandom } from './random'
import { frameCamera } from './scene'
import { leafTip } from './shapes'
import { PLANT_STAGES, PlantKind, plantKindFor, variantFor } from './types'

const KINDS: PlantKind[] = ['lettuce', 'tomato', 'basil', 'generic']

function values(g: THREE.BufferGeometry | undefined, name: 'position' | 'normal' = 'position'): number[] {
  return Array.from((g!.getAttribute(name) as THREE.BufferAttribute).array)
}

beforeEach(() => clearPlantCache())

describe('azar con semilla', () => {
  it('misma semilla, misma serie; otra semilla, otra serie', () => {
    const a = mulberry32(hashString('lettuce:mature:0'))
    const b = mulberry32(hashString('lettuce:mature:0'))
    const c = mulberry32(hashString('lettuce:mature:1'))
    const serie = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(serie)
    expect([c(), c(), c()]).not.toEqual(serie)
    for (const n of serie) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })
})

describe('especie → generador', () => {
  it.each([
    ['Lactuca sativa L.', 'lettuce'],
    ['Solanum lycopersicum L.', 'tomato'],
    ['Ocimum basilicum L.', 'basil'],
    ['Solanum tuberosum L.', 'generic'],
    ['Capsicum annuum L.', 'generic'],
  ])('%s → %s', (name, kind) => {
    expect(plantKindFor(name)).toBe(kind)
  })

  it('la variante es estable y está en 0..2', () => {
    expect(variantFor('0:1.20:0.40')).toBe(variantFor('0:1.20:0.40'))
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) expect([0, 1, 2]).toContain(variantFor(key))
  })
})

describe('generadores', () => {
  it('son deterministas por (especie, etapa, semilla) y varían con la semilla', () => {
    for (const kind of KINDS) {
      const a = buildPlantModel(kind, 'mature', 0)
      const b = buildPlantModel(kind, 'mature', 0)
      const c = buildPlantModel(kind, 'mature', 1)
      expect(values(a.parts.leaf)).toEqual(values(b.parts.leaf))
      expect(values(a.parts.leaf)).not.toEqual(values(c.parts.leaf))
    }
  })

  it('cada etapa es más alta que la anterior', () => {
    for (const kind of KINDS) {
      const [seedling, vegetative, mature] = PLANT_STAGES.map((stage) => buildPlantModel(kind, stage, 0))
      expect(vegetative.height).toBeGreaterThan(seedling.height)
      expect(mature.height).toBeGreaterThan(vegetative.height)
    }
  })

  it('ninguna geometría tiene valores no finitos', () => {
    for (const kind of KINDS) {
      for (const stage of PLANT_STAGES) {
        const model = buildPlantModel(kind, stage, 7)
        for (const geometry of Object.values(model.parts)) {
          expect(values(geometry).every(Number.isFinite)).toBe(true)
          expect(values(geometry, 'normal').every(Number.isFinite)).toBe(true)
        }
      }
    }
  })

  it('el tomate tiene tallo y solo da frutos en la etapa madura', () => {
    expect(buildPlantModel('tomato', 'seedling', 0).parts.fruit).toBeUndefined()
    expect(buildPlantModel('tomato', 'vegetative', 0).parts.fruit).toBeUndefined()
    const mature = buildPlantModel('tomato', 'mature', 0)
    expect(mature.parts.fruit).toBeDefined()
    expect(mature.parts.stem).toBeDefined()
  })

  it('la lechuga es una roseta: sin tallo y más ancha que alta', () => {
    const model = buildPlantModel('lettuce', 'mature', 0)
    expect(model.parts.stem).toBeUndefined()
    expect(model.radius).toBeGreaterThan(model.height)
  })

  it('la albahaca tiene hojas en pares opuestos y cada par gira 90° respecto al anterior', () => {
    const parts = generateBasil('vegetative', seededRandom('prueba'))
    expect(parts.leaf).toHaveLength(8) // 4 pares
    const tips = parts.leaf.map(leafTip)
    for (let i = 0; i < tips.length; i += 2) {
      expect(tips[i].x).toBeCloseTo(-tips[i + 1].x, 6)
      expect(tips[i].z).toBeCloseTo(-tips[i + 1].z, 6)
      expect(tips[i].y).toBeCloseTo(tips[i + 1].y, 6)
    }
    const angle = (i: number) => Math.atan2(tips[i].z, tips[i].x)
    for (let i = 0; i + 2 < tips.length; i += 2) {
      expect(Math.abs(Math.cos(angle(i) - angle(i + 2)))).toBeLessThan(0.3)
    }
  })

  it('cada modelo expone anclas arriba, en una hoja y en la base', () => {
    for (const kind of KINDS) {
      const model = buildPlantModel(kind, 'mature', 0)
      expect(model.anchors.map((a) => a.key)).toEqual(['top', 'leaf', 'base'])
      expect(model.anchors[0].y).toBeCloseTo(model.height)
    }
  })
})

describe('caché e instancing', () => {
  it('getPlantModel genera una vez por clave y reutiliza el objeto', () => {
    const a = getPlantModel('basil', 'vegetative', 2)
    expect(getPlantModel('basil', 'vegetative', 2)).toBe(a)
    expect(plantCacheSize()).toBe(1)
    getPlantModel('basil', 'vegetative', 1)
    expect(plantCacheSize()).toBe(2)
  })

  it('30 lechugas en 3 variantes se dibujan con 3 InstancedMesh y el pick devuelve el índice', () => {
    const list: PlantInstance[] = Array.from({ length: 30 }, (_, i) => ({
      index: i,
      kind: 'lettuce',
      stage: 'mature',
      variant: i % 3,
      x: i * 0.3,
      z: 0,
      rotationDeg: i * 10,
    }))
    expect(groupInstances(list)).toHaveLength(3)
    const plants = buildInstancedPlants(list)
    const meshes = plants.group.children as THREE.InstancedMesh[]
    expect(meshes).toHaveLength(3)
    expect(meshes.every((m) => m instanceof THREE.InstancedMesh && m.count === 10)).toBe(true)
    // La variante 1 agrupa los índices 1, 4, 7, 10, 13…: la instancia 4 es la planta 13
    expect(plants.pick(meshes[1], 4)).toBe(13)
    expect(plants.pick(new THREE.Mesh(), 0)).toBeNull()
    expect(plants.pick(meshes[0], undefined)).toBeNull()
    // Comparten la geometría de la caché: no se genera una por planta
    expect(meshes[0].geometry).toBe(getPlantModel('lettuce', 'mature', 0).parts.leaf)
    plants.dispose()
  })
})

describe('encuadre', () => {
  it('la planta madura completa queda dentro de la vista', () => {
    for (const kind of KINDS) {
      const model = buildPlantModel(kind, 'mature', 0)
      const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
      frameCamera(camera, model)
      camera.updateMatrixWorld()
      const r = model.radius
      const h = model.height
      const corners: Array<[number, number, number]> = [
        [-r, 0, -r],
        [r, 0, r],
        [-r, h, r],
        [r, h, -r],
      ]
      for (const [x, y, z] of corners) {
        const p = new THREE.Vector3(x, y, z).project(camera)
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1)
      }
    }
  })
})
```

Crear `frontend/src/features/three/lazyBoundary.test.ts`:

```ts
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
```

- [ ] **Step 2: Verificar que fallan**

Run (en `frontend/`): `npx vitest run src/features/three`
Expected: FAIL en `plants.test.ts` (no existen los módulos). `lazyBoundary.test.ts` ya pasa (fija el estado actual; las tareas siguientes le añaden pares).

- [ ] **Step 3: `webglAvailable` compartido**

Crear `frontend/src/features/three/webgl.ts`:

```ts
/** ¿El navegador puede crear un contexto WebGL? Sin importar three: las páginas lo usan para elegir 3D o 2D. */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}
```

En `frontend/src/features/prototypes/StlViewer.tsx`, borrar la función local `webglAvailable` (las 8 líneas desde `function webglAvailable(): boolean {` hasta su `}`) y añadir a las importaciones:

```ts
import { webglAvailable } from '@/features/three/webgl'
```

- [ ] **Step 4: Azar, tipos, paleta e instancias (sin three)**

Crear `frontend/src/features/three/plants/random.ts`:

```ts
// Sin three: lo usan páginas (variantes) y generadores.

/** FNV-1a de 32 bits: misma cadena → mismo entero en cualquier navegador. */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Generador pseudoaleatorio determinista en [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededRandom(key: string): () => number {
  return mulberry32(hashString(key))
}

export function between(rand: () => number, min: number, max: number): number {
  return min + (max - min) * rand()
}
```

Crear `frontend/src/features/three/plants/types.ts`:

```ts
// Sin three: las páginas importan estos tipos y helpers sin arrastrar el chunk 3D.
import { hashString } from './random'

export type PlantKind = 'lettuce' | 'tomato' | 'basil' | 'generic'
export type PlantStage = 'seedling' | 'vegetative' | 'mature'

export const PLANT_STAGES: PlantStage[] = ['seedling', 'vegetative', 'mature']

export const PLANT_STAGE_LABELS: Record<PlantStage, string> = {
  seedling: 'Plántula',
  vegetative: 'Vegetativa',
  mature: 'Madura',
}

/** Variantes de semilla por especie y etapa: pocas para que el instancing agrupe. */
export const PLANT_VARIANTS = 3

export const ILLUSTRATIVE_NOTICE = 'Representación ilustrativa; no predice crecimiento'

export type PlantAnchorKey = 'top' | 'leaf' | 'base'

export interface PlantAnchor {
  key: PlantAnchorKey
  x: number
  y: number
  z: number
}

export interface PlantViewerCallout {
  key: string
  anchor: PlantAnchorKey
  label: string
}

export interface PlantViewerProps {
  kind: PlantKind
  stage?: PlantStage
  seed?: number
  label: string
  callouts?: PlantViewerCallout[]
  className?: string
}

const KIND_BY_NAME: Array<[RegExp, PlantKind]> = [
  [/^lactuca\b/i, 'lettuce'],
  [/^solanum lycopersicum\b/i, 'tomato'],
  [/^ocimum\b/i, 'basil'],
]

/** Generador para una especie del catálogo; sin generador propio → genérico. */
export function plantKindFor(scientificName: string): PlantKind {
  const name = scientificName.trim()
  return KIND_BY_NAME.find(([re]) => re.test(name))?.[1] ?? 'generic'
}

/** Variante 0..PLANT_VARIANTS-1 estable para una clave (id de especie, posición de una planta…). */
export function variantFor(key: string): number {
  return hashString(key) % PLANT_VARIANTS
}
```

Crear `frontend/src/features/three/plants/palette.ts`:

```ts
// Sin three: también la usa la vista superior SVG del Studio.
import type { PlantKind } from './types'

export interface PlantColors {
  leaf: number
  stem: number
  fruit: number
  flower: number
}

export const PLANT_COLORS: Record<PlantKind, PlantColors> = {
  lettuce: { leaf: 0x8cc63f, stem: 0xc5df8a, fruit: 0xc8402a, flower: 0xf3f0e4 },
  tomato: { leaf: 0x3f7d2c, stem: 0x5b8a3a, fruit: 0xd2452f, flower: 0xf2cf3a },
  basil: { leaf: 0x4f9a30, stem: 0x6a9c45, fruit: 0xc8402a, flower: 0xf3f0e4 },
  generic: { leaf: 0x6b9e4a, stem: 0x7a8f5a, fruit: 0xc8402a, flower: 0xf3f0e4 },
}

export function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}
```

Crear `frontend/src/features/three/plants/instances.ts`:

```ts
// Sin three: el Studio calcula las instancias en la página y la escena 3D las dibuja.
import type { PlantKind, PlantStage } from './types'

export interface PlantInstance {
  /** Índice plano de la planta en el layout (para traducir un pick a selección). */
  index: number
  kind: PlantKind
  stage: PlantStage
  variant: number
  /** Posición en el piso (m): x → X de three, z → Z de three. */
  x: number
  z: number
  rotationDeg: number
}

export interface InstanceGroup {
  key: string
  kind: PlantKind
  stage: PlantStage
  variant: number
  items: PlantInstance[]
}

/** Agrupa por (especie, etapa, variante): un grupo = una geometría = un InstancedMesh por parte. */
export function groupInstances(list: PlantInstance[]): InstanceGroup[] {
  const groups = new Map<string, InstanceGroup>()
  for (const item of list) {
    const key = `${item.kind}:${item.stage}:${item.variant}`
    let group = groups.get(key)
    if (!group) {
      group = { key, kind: item.kind, stage: item.stage, variant: item.variant, items: [] }
      groups.set(key, group)
    }
    group.items.push(item)
  }
  return [...groups.values()]
}
```

- [ ] **Step 5: Formas básicas**

Crear `frontend/src/features/three/plants/shapes.ts`:

```ts
import * as THREE from 'three'

export interface LeafOptions {
  length: number
  width: number
  /** Profundidad del pliegue en V a lo largo de la nervadura (fracción del medio ancho). */
  fold?: number
  /** Arqueo de la punta hacia +Z (fracción del largo). */
  curl?: number
  /** Ondulado del borde (lechuga). */
  ruffle?: number
  /** Exponente del perfil: < 1 ensancha la base, > 1 la afina. */
  taper?: number
}

/**
 * Hoja con la base en el origen que crece hacia +Y; la lámina está en el plano XY y se arquea hacia +Z.
 * Se deforma un PlaneGeometry: u (0..1) a lo largo, v (−0.5..0.5) a lo ancho.
 */
export function leafGeometry({ length, width, fold = 0.25, curl = 0.2, ruffle = 0, taper = 0.8 }: LeafOptions) {
  const geometry = new THREE.PlaneGeometry(1, 1, 6, 10)
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getX(i)
    const u = pos.getY(i) + 0.5
    const profile = Math.sin(Math.PI * Math.pow(u, taper)) // 0 en base y punta
    const half = profile * width * 0.5
    const edge = Math.abs(v) * 2 // 0 en la nervadura, 1 en el borde
    const wave = ruffle * Math.sin(u * 18 + v * 9) * edge * width * profile
    const z = curl * length * u * u + fold * half * edge + wave
    pos.setXYZ(i, v * 2 * half, u * length, z)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** PlaneGeometry emite primero la fila superior (u = 1), donde todo el borde converge en la punta. */
export function leafTip(leaf: THREE.BufferGeometry): THREE.Vector3 {
  return new THREE.Vector3().fromBufferAttribute(leaf.getAttribute('position') as THREE.BufferAttribute, 0)
}

/** Tallo recto desde el suelo (y = 0) hasta `height`. */
export function stemGeometry(height: number, radiusBottom: number, radiusTop = radiusBottom * 0.6) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 6, 1)
  geometry.translate(0, height / 2, 0)
  return geometry
}
```

- [ ] **Step 6: Generadores**

Crear `frontend/src/features/three/plants/generators.ts`:

```ts
import * as THREE from 'three'
import { between } from './random'
import { leafGeometry, leafTip, stemGeometry } from './shapes'
import type { PlantAnchor, PlantStage } from './types'

export type Rand = () => number

export interface PlantParts {
  leaf: THREE.BufferGeometry[]
  stem: THREE.BufferGeometry[]
  fruit: THREE.BufferGeometry[]
  flower: THREE.BufferGeometry[]
  /** Anclas propias de la especie (la punta de una hoja representativa). */
  anchors: PlantAnchor[]
}

/** Ángulo áureo (≈ 137,5°): filotaxis en espiral. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const STAGE: Record<PlantStage, 0 | 1 | 2> = { seedling: 0, vegetative: 1, mature: 2 }

function emptyParts(): PlantParts {
  return { leaf: [], stem: [], fruit: [], flower: [], anchors: [] }
}

function tipAnchor(leaf: THREE.BufferGeometry): PlantAnchor {
  const tip = leafTip(leaf)
  return { key: 'leaf', x: tip.x, y: tip.y, z: tip.z }
}

/** Lechuga: roseta en espiral; hojas exteriores grandes y abiertas, interiores pequeñas y erguidas. */
export function generateLettuce(stage: PlantStage, rand: Rand): PlantParts {
  const out = emptyParts()
  const s = STAGE[stage]
  const count = [4, 11, 22][s]
  const outer = [0.05, 0.13, 0.19][s]
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1) // 0 = exterior, 1 = interior
    const length = outer * (1 - 0.45 * t) * between(rand, 0.9, 1.1)
    const leaf = leafGeometry({
      length,
      width: length * between(rand, 0.75, 0.95),
      taper: 0.6,
      fold: 0.15,
      curl: s === 0 ? 0.1 : 0.35 - 0.2 * t,
      ruffle: s === 0 ? 0 : 0.06,
    })
    const tilt = (s === 0 ? 0.5 : 1.25 - 0.95 * t) + between(rand, -0.08, 0.08) // desde la vertical
    leaf.rotateX(tilt)
    leaf.rotateY(i * GOLDEN_ANGLE + between(rand, -0.15, 0.15))
    leaf.translate(0, 0.004 + 0.01 * t, 0)
    out.leaf.push(leaf)
  }
  out.anchors.push(tipAnchor(out.leaf[0]))
  return out
}

/** Hoja compuesta de tomate en su marco local: raquis sobre +X, folíolos en pares y uno terminal. */
function compoundLeaf(length: number, pairs: number, rand: Rand): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  const rachis = new THREE.CylinderGeometry(length * 0.012, length * 0.02, length, 4, 1)
  rachis.rotateZ(-Math.PI / 2) // eje Y → +X
  rachis.translate(length / 2, 0, 0)
  parts.push(rachis)
  const leaflet = (len: number) => leafGeometry({ length: len, width: len * 0.55, fold: 0.3, curl: 0.15, taper: 0.9 })
  for (let p = 0; p < pairs; p++) {
    const t = pairs === 1 ? 0.5 : 0.3 + (0.5 * p) / (pairs - 1)
    const len = length * between(rand, 0.3, 0.38)
    const right = leaflet(len) // hacia +Z, barrido hacia la punta
    right.rotateX(Math.PI / 2)
    right.rotateY(0.5)
    right.translate(length * t, 0, 0)
    const left = leaflet(len) // espejo hacia −Z (mismo arqueo hacia abajo)
    left.rotateX(Math.PI / 2)
    left.rotateY(Math.PI - 0.5)
    left.translate(length * t, 0, 0)
    parts.push(right, left)
  }
  const tip = leaflet(length * 0.42)
  tip.rotateX(Math.PI / 2)
  tip.rotateY(Math.PI / 2) // +Z → +X
  tip.translate(length, 0, 0)
  parts.push(tip) // el folíolo terminal queda al final
  return parts
}

/** Tomate: tallo con leve zigzag, hojas compuestas en espiral y racimos de frutos en la etapa madura. */
export function generateTomato(stage: PlantStage, rand: Rand): PlantParts {
  const out = emptyParts()
  const s = STAGE[stage]
  const height = [0.12, 0.65, 1.25][s]
  const nodes = [2, 6, 10][s]
  const sway = [0.004, 0.02, 0.035][s]
  const points = [new THREE.Vector3(0, 0, 0)]
  for (let i = 1; i <= nodes; i++) {
    points.push(new THREE.Vector3(between(rand, -sway, sway), (height * i) / nodes, between(rand, -sway, sway)))
  }
  const curve = new THREE.CatmullRomCurve3(points)
  out.stem.push(new THREE.TubeGeometry(curve, nodes * 6, [0.003, 0.008, 0.012][s], 6, false))

  const leafLength = [0.06, 0.22, 0.3][s]
  const pairs = [1, 2, 3][s]
  for (let k = 1; k <= nodes; k++) {
    const t = k / nodes
    const at = curve.getPointAt(t)
    const length = leafLength * (1.15 - 0.5 * t) * between(rand, 0.9, 1.1)
    const lift = 0.55 - 0.7 * (1 - t) + between(rand, -0.1, 0.1) // abajo cuelgan, arriba suben
    const yaw = k * GOLDEN_ANGLE + between(rand, -0.2, 0.2)
    const leaf = compoundLeaf(length, pairs, rand)
    for (const g of leaf) {
      g.rotateZ(lift)
      g.rotateY(yaw)
      g.translate(at.x, at.y, at.z)
      out.leaf.push(g)
    }
    if (k === Math.ceil(nodes / 2)) out.anchors.push(tipAnchor(leaf[leaf.length - 1]))
  }

  if (s === 2) {
    for (let j = 0; j < 3; j++) {
      const at = curve.getPointAt(0.3 + 0.18 * j)
      const yaw = j * 2.1 + between(rand, -0.3, 0.3)
      const count = 3 + Math.floor(rand() * 3)
      for (let f = 0; f < count; f++) {
        const r = between(rand, 0.022, 0.034)
        const fruit = new THREE.SphereGeometry(r, 14, 10)
        fruit.scale(1, 0.85, 1)
        const a = yaw + (f - (count - 1) / 2) * 0.55
        const d = 0.05 + 0.025 * (f % 2)
        fruit.translate(at.x + Math.cos(a) * d, at.y - 0.04 - 0.03 * (f % 3), at.z + Math.sin(a) * d)
        out.fruit.push(fruit)
      }
    }
  }
  return out
}

/** Albahaca: tallo recto con pares de hojas opuestas, cada par girado 90° (decusado); espiga floral al madurar. */
export function generateBasil(stage: PlantStage, rand: Rand): PlantParts {
  const out = emptyParts()
  const s = STAGE[stage]
  const height = [0.06, 0.22, 0.4][s]
  const pairs = [2, 4, 7][s]
  const leafLength = [0.025, 0.06, 0.075][s]
  out.stem.push(stemGeometry(height, [0.0025, 0.004, 0.006][s]))
  for (let k = 0; k < pairs; k++) {
    const t = (k + 1) / (pairs + 0.5)
    const length = leafLength * (1.1 - 0.5 * (k / pairs)) * between(rand, 0.9, 1.1)
    const lift = between(rand, 0.25, 0.45)
    const yaw = (k % 2) * (Math.PI / 2) + between(rand, -0.12, 0.12)
    for (const side of [0, Math.PI]) {
      const leaf = leafGeometry({ length, width: length * 0.62, fold: 0.4, curl: 0.2, taper: 0.9 })
      leaf.rotateX(Math.PI / 2 - lift) // casi horizontal, un poco hacia arriba
      leaf.rotateY(yaw + side)
      leaf.translate(0, height * t, 0)
      out.leaf.push(leaf)
    }
  }
  out.anchors.push(tipAnchor(out.leaf[0]))
  if (s === 2) {
    const spike = new THREE.ConeGeometry(0.012, 0.06, 8)
    spike.translate(0, height + 0.03, 0)
    out.flower.push(spike)
  }
  return out
}

/** Genérico: tallo con hojas simples alternas en espiral (especies sin generador propio). */
export function generateGeneric(stage: PlantStage, rand: Rand): PlantParts {
  const out = emptyParts()
  const s = STAGE[stage]
  const height = [0.05, 0.18, 0.32][s]
  const count = [2, 6, 10][s]
  const leafLength = [0.03, 0.07, 0.09][s]
  out.stem.push(stemGeometry(height, [0.002, 0.004, 0.006][s]))
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const length = leafLength * (1 - 0.35 * t) * between(rand, 0.9, 1.1)
    const leaf = leafGeometry({ length, width: length * 0.45, fold: 0.2, curl: 0.25, taper: 1 })
    leaf.rotateX(Math.PI / 2 - between(rand, 0.35, 0.6))
    leaf.rotateY(i * GOLDEN_ANGLE + between(rand, -0.2, 0.2))
    leaf.translate(0, height * (0.25 + 0.7 * t), 0)
    out.leaf.push(leaf)
  }
  out.anchors.push(tipAnchor(out.leaf[0]))
  return out
}
```

- [ ] **Step 7: Modelo, caché y materiales**

Crear `frontend/src/features/three/plants/model.ts`:

```ts
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { generateBasil, generateGeneric, generateLettuce, generateTomato, PlantParts, Rand } from './generators'
import { PLANT_COLORS } from './palette'
import { seededRandom } from './random'
import type { PlantAnchor, PlantKind, PlantStage } from './types'

export const PART_NAMES = ['leaf', 'stem', 'fruit', 'flower'] as const
export type PartName = (typeof PART_NAMES)[number]

export interface PlantModel {
  key: string
  kind: PlantKind
  stage: PlantStage
  seed: number
  /** Una geometría unida por parte (una llamada de dibujo por parte). */
  parts: Partial<Record<PartName, THREE.BufferGeometry>>
  height: number
  /** Radio horizontal máximo desde el eje del tallo. */
  radius: number
  /** top, leaf, base: puntos para callouts. */
  anchors: PlantAnchor[]
}

const GENERATORS: Record<PlantKind, (stage: PlantStage, rand: Rand) => PlantParts> = {
  lettuce: generateLettuce,
  tomato: generateTomato,
  basil: generateBasil,
  generic: generateGeneric,
}

export function plantKey(kind: PlantKind, stage: PlantStage, seed: number): string {
  return `${kind}:${stage}:${seed}`
}

/** Genera y une las piezas. Costoso: fuera de las pruebas se usa getPlantModel (caché). */
export function buildPlantModel(kind: PlantKind, stage: PlantStage, seed: number): PlantModel {
  const key = plantKey(kind, stage, seed)
  const raw = GENERATORS[kind](stage, seededRandom(key))
  const parts: PlantModel['parts'] = {}
  const box = new THREE.Box3()
  for (const name of PART_NAMES) {
    const list = raw[name]
    if (list.length === 0) continue
    const merged = mergeGeometries(list, false)
    list.forEach((g) => g.dispose())
    if (!merged) throw new Error(`No se pudo unir la parte ${name} de ${key}`)
    merged.computeBoundingBox()
    merged.computeBoundingSphere()
    box.union(merged.boundingBox!)
    parts[name] = merged
  }
  const height = box.max.y
  const radius = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)
  const anchors: PlantAnchor[] = [
    { key: 'top', x: 0, y: height, z: 0 },
    ...raw.anchors,
    { key: 'base', x: 0, y: Math.min(0.01, height * 0.1), z: 0 },
  ]
  return { key, kind, stage, seed, parts, height, radius, anchors }
}

const models = new Map<string, PlantModel>()

/** Una sola generación por (especie, etapa, semilla) en toda la sesión. No desechar sus geometrías. */
export function getPlantModel(kind: PlantKind, stage: PlantStage, seed = 0): PlantModel {
  const key = plantKey(kind, stage, seed)
  let model = models.get(key)
  if (!model) {
    model = buildPlantModel(kind, stage, seed)
    models.set(key, model)
  }
  return model
}

export function plantCacheSize(): number {
  return models.size
}

/** Solo para pruebas. */
export function clearPlantCache(): void {
  models.forEach((m) => Object.values(m.parts).forEach((g) => g?.dispose()))
  models.clear()
}

const materials = new Map<string, THREE.MeshStandardMaterial>()

/** Material compartido por especie y parte (caché de sesión; los visores no lo desechan). */
export function getPlantMaterial(kind: PlantKind, part: PartName): THREE.MeshStandardMaterial {
  const key = `${kind}:${part}`
  let material = materials.get(key)
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: PLANT_COLORS[kind][part],
      roughness: part === 'fruit' ? 0.35 : 0.7,
      metalness: 0,
      side: part === 'leaf' ? THREE.DoubleSide : THREE.FrontSide,
    })
    materials.set(key, material)
  }
  return material
}

/** Un Group con una malla por parte (sin instancing): ficha y miniaturas. Cada malla se llama como su parte. */
export function createPlantObject(model: PlantModel): THREE.Group {
  const group = new THREE.Group()
  for (const name of PART_NAMES) {
    const geometry = model.parts[name]
    if (!geometry) continue
    const mesh = new THREE.Mesh(geometry, getPlantMaterial(model.kind, name))
    mesh.name = name
    group.add(mesh)
  }
  return group
}
```

- [ ] **Step 8: Instancing, luces y encuadre**

Crear `frontend/src/features/three/plants/instancedPlants.ts`:

```ts
import * as THREE from 'three'
import { groupInstances, PlantInstance } from './instances'
import { getPlantMaterial, getPlantModel, PART_NAMES } from './model'

export interface InstancedPlants {
  group: THREE.Group
  /** Índice plano de la planta bajo el puntero, o null. */
  pick(object: THREE.Object3D, instanceId: number | undefined): number | null
  /** Desecha solo los InstancedMesh: geometrías y materiales son de la caché. */
  dispose(): void
}

export function buildInstancedPlants(list: PlantInstance[]): InstancedPlants {
  const group = new THREE.Group()
  const owners = new Map<THREE.Object3D, number[]>()
  const matrix = new THREE.Matrix4()
  const rotation = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const scale = new THREE.Vector3(1, 1, 1)
  const position = new THREE.Vector3()

  for (const g of groupInstances(list)) {
    const model = getPlantModel(g.kind, g.stage, g.variant)
    for (const part of PART_NAMES) {
      const geometry = model.parts[part]
      if (!geometry) continue
      const mesh = new THREE.InstancedMesh(geometry, getPlantMaterial(g.kind, part), g.items.length)
      g.items.forEach((item, i) => {
        rotation.setFromAxisAngle(up, (item.rotationDeg * Math.PI) / 180)
        position.set(item.x, 0, item.z)
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale))
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere() // necesario para raycast y culling con instancias movidas
      owners.set(mesh, g.items.map((item) => item.index))
      group.add(mesh)
    }
  }

  return {
    group,
    pick(object, instanceId) {
      const ids = owners.get(object)
      if (!ids || instanceId === undefined) return null
      return ids[instanceId] ?? null
    },
    dispose() {
      owners.forEach((_, mesh) => (mesh as THREE.InstancedMesh).dispose())
      owners.clear()
      group.clear()
    },
  }
}
```

Crear `frontend/src/features/three/plants/scene.ts`:

```ts
import * as THREE from 'three'
import type { PlantModel } from './model'

/** Cielo verdoso, sol y contraluz lima (misma paleta que el visor STL). */
export function addPlantLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xf4fbe8, 0x4a5a3a, 1.1))
  const sun = new THREE.DirectionalLight(0xffffff, 1.8)
  sun.position.set(2, 4, 3)
  scene.add(sun)
  const rim = new THREE.DirectionalLight(0xa6e22e, 0.6)
  rim.position.set(-3, 2, -3)
  scene.add(rim)
}

/**
 * Coloca la cámara para que la caja (radio horizontal × altura) quepa entera: la esfera que la envuelve
 * cabe en el menor de los dos campos de visión. Devuelve el punto al que mira.
 */
export function frameCamera(camera: THREE.PerspectiveCamera, model: Pick<PlantModel, 'height' | 'radius'>): THREE.Vector3 {
  const target = new THREE.Vector3(0, model.height / 2, 0)
  const sphere = Math.max(Math.sqrt(2 * model.radius ** 2 + (model.height / 2) ** 2), 0.02)
  const vfov = (camera.fov * Math.PI) / 180
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect)
  const distance = (sphere / Math.sin(Math.min(vfov, hfov) / 2)) * 1.05
  camera.position.copy(target).add(new THREE.Vector3(0.75, 0.45, 0.9).normalize().multiplyScalar(distance))
  camera.near = distance / 50
  camera.far = distance * 20
  camera.lookAt(target)
  camera.updateProjectionMatrix()
  return target
}
```

- [ ] **Step 9: Correr pruebas**

Run (en `frontend/`): `npx vitest run src/features/three` → PASS (incluye `three.test.ts` de V2). Luego `npx tsc -b` → sin errores y `npx vitest run` → todo PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/three frontend/src/features/prototypes/StlViewer.tsx
git commit -m "feat(three): plantas procedurales con semilla (lechuga, tomate, albahaca, genérica), caché, instancing y prueba de frontera del chunk"
```

---

### Task 2: Ficha sin imagen — planta 3D procedural madura con callouts y etiqueta ILUSTRATIVO

**Files:**
- Create: `frontend/src/features/three/plants/PlantViewer.tsx`
- Create: `frontend/src/features/three/plants/LazyPlantViewer.tsx`
- Create: `frontend/src/features/catalog/traitCallouts.ts`
- Test: `frontend/src/features/catalog/traitCallouts.test.ts`
- Create: `frontend/src/features/catalog/PlantIllustration.tsx`
- Modify: `frontend/src/features/catalog/PlantDetailPage.tsx`
- Modify: `frontend/src/features/catalog/catalog.test.tsx`
- Modify: `frontend/src/features/three/lazyBoundary.test.ts`

**Interfaces:**
- Consumes: Task 1 (`getPlantModel`, `createPlantObject`, `addPlantLights`, `frameCamera`, `webglAvailable`, `plantKindFor`, `PlantViewerProps`, `PlantViewerCallout`, `ILLUSTRATIVE_NOTICE`); V2 (`useProjectedCallouts`, `Callout`).
- Produces:
  - `LazyPlantViewer.tsx`: `PlantViewer(props: PlantViewerProps)` (envoltorio con `Suspense`); `PlantViewer.tsx`: `export default` del visor.
  - `traitCallouts.ts`: `formatAssertionValue(a) -> string | null` (movida desde `PlantDetailPage`), `TraitCallout {variable, label, value, origin}`, `traitCallout(assertions, variable)`, `plantViewerCallouts(assertions) -> PlantViewerCallout[]` (máximo 3, uno por ancla).
  - `PlantIllustration.tsx`: `PlantIllustration({ species })`.

- [ ] **Step 1: Pruebas que fallan**

Crear `frontend/src/features/catalog/traitCallouts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { TraitAssertion } from './api'
import { plantViewerCallouts, traitCallout } from './traitCallouts'

function assertion(variable: string, extra: Partial<TraitAssertion> = {}): TraitAssertion {
  return {
    id: `a-${variable}-${extra.subject_type ?? 'species'}`,
    subject_type: 'species',
    subject_id: 's1',
    variable,
    value_min: null,
    value_max: null,
    unit: null,
    growth_stage: 'unknown',
    cultivation_system: 'unknown',
    origin: 'missing',
    review_status: 'unreviewed',
    evidence_refs: [],
    notes: null,
    sources: [],
    ...extra,
  }
}

describe('traitCallout', () => {
  it('sin afirmación o sin valor muestra Desconocido con origen missing', () => {
    expect(traitCallout([], 'ph')).toEqual({ variable: 'ph', label: 'pH', value: 'Desconocido', origin: 'missing' })
    expect(traitCallout([assertion('ph', { origin: 'sourced' })], 'ph').value).toBe('Desconocido')
    expect(traitCallout([assertion('ph', { origin: 'sourced' })], 'ph').origin).toBe('missing')
  })

  it('usa la afirmación de la especie antes que la de una variedad, con unidad', () => {
    const list = [
      assertion('air_temperature', { subject_type: 'cultivar', value_min: 10, value_max: 12, unit: 'Cel', origin: 'measured' }),
      assertion('air_temperature', { value_min: 18, value_max: 24, unit: 'Cel', origin: 'sourced' }),
    ]
    expect(traitCallout(list, 'air_temperature')).toEqual({
      variable: 'air_temperature',
      label: 'Temperatura del aire',
      value: '18 – 24 °C',
      origin: 'sourced',
    })
  })
})

describe('plantViewerCallouts', () => {
  it('con las 4 variables del seed da 3 callouts, uno por ancla', () => {
    const list = ['air_temperature', 'ph', 'photoperiod', 'relative_humidity'].map((v) => assertion(v))
    expect(plantViewerCallouts(list)).toEqual([
      { key: 'air_temperature', anchor: 'top', label: 'Temperatura del aire: Desconocido' },
      { key: 'ph', anchor: 'base', label: 'pH: Desconocido' },
      { key: 'relative_humidity', anchor: 'leaf', label: 'Humedad relativa: Desconocido' },
    ])
  })

  it('sin afirmaciones no hay callouts', () => {
    expect(plantViewerCallouts([])).toEqual([])
  })
})
```

En `frontend/src/features/catalog/catalog.test.tsx`, añadir después del `vi.mock('./api', …)` existente:

```tsx
vi.mock('@/features/three/plants/LazyPlantViewer', () => ({
  PlantViewer: ({ kind, stage, label, callouts }: PlantViewerProps) => (
    <div data-testid="plant-viewer" data-kind={kind} data-stage={stage} aria-label={label}>
      {(callouts ?? []).map((c) => c.label).join('|')}
    </div>
  ),
}))
```

con la importación `import type { PlantViewerProps } from '@/features/three/plants/types'`, y al final del archivo:

```tsx
it('sin imagen, la ficha muestra la planta procedural madura etiquetada como ilustrativa', async () => {
  mocked.getPlant.mockResolvedValue(detail)
  renderDetail()
  const viewer = await screen.findByTestId('plant-viewer')
  expect(viewer).toHaveAttribute('data-kind', 'lettuce')
  expect(viewer).toHaveAttribute('data-stage', 'mature')
  expect(viewer).toHaveTextContent('pH: Desconocido')
  expect(screen.getByText('Ilustrativo')).toBeInTheDocument()
  expect(screen.getByText(/Representación ilustrativa; no predice crecimiento/)).toBeInTheDocument()
})

it('una especie sin generador propio usa la forma genérica y lo dice', async () => {
  mocked.getPlant.mockResolvedValue({ ...detail, scientific_name: 'Capsicum annuum L.' })
  renderDetail()
  expect(await screen.findByTestId('plant-viewer')).toHaveAttribute('data-kind', 'generic')
  expect(screen.getByText(/Forma genérica/)).toBeInTheDocument()
})
```

En `frontend/src/features/three/lazyBoundary.test.ts`, añadir al arreglo `LAZY_PAIRS`:

```ts
  ['/src/features/three/plants/LazyPlantViewer.tsx', '/src/features/three/plants/PlantViewer.tsx'],
```

Run (en `frontend/`): `npx vitest run src/features/catalog src/features/three/lazyBoundary.test.ts`
Expected: FAIL (no existen `traitCallouts`, `LazyPlantViewer` ni la ilustración en la ficha).

- [ ] **Step 2: Valores para callouts**

Crear `frontend/src/features/catalog/traitCallouts.ts`:

```ts
import type { PlantAnchorKey, PlantViewerCallout } from '@/features/three/plants/types'
import type { TraitAssertion } from './api'
import { label, UNIT_LABELS, VARIABLE_LABELS } from './labels'

/** Rango legible de una afirmación, o null si no tiene valor. */
export function formatAssertionValue(a: TraitAssertion): string | null {
  const { value_min: min, value_max: max } = a
  if (min == null && max == null) return null
  const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 })
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`
  return min != null ? `≥ ${fmt(min)}` : `≤ ${fmt(max as number)}`
}

export interface TraitCallout {
  variable: string
  label: string
  /** Valor con unidad, o «Desconocido». Nunca un número supuesto. */
  value: string
  origin: string
}

/** Afirmación de la especie (o, si no hay, de una variedad) para un rasgo; sin valor → «Desconocido» / missing. */
export function traitCallout(assertions: TraitAssertion[], variable: string): TraitCallout {
  const candidates = assertions.filter((a) => a.variable === variable)
  const a = candidates.find((x) => x.subject_type === 'species') ?? candidates[0]
  const value = a ? formatAssertionValue(a) : null
  return {
    variable,
    label: label(VARIABLE_LABELS, variable),
    value: value ? `${value}${a?.unit ? ` ${label(UNIT_LABELS, a.unit)}` : ''}` : 'Desconocido',
    origin: value && a ? a.origin : 'missing',
  }
}

const ANCHOR_BY_VARIABLE: Record<string, PlantAnchorKey> = {
  air_temperature: 'top',
  photoperiod: 'top',
  relative_humidity: 'leaf',
  ph: 'base',
}
const ANCHOR_ORDER: PlantAnchorKey[] = ['top', 'leaf', 'base']

/** Hasta 3 callouts para la planta 3D: uno por ancla, en el orden de variables de la ficha. */
export function plantViewerCallouts(assertions: TraitAssertion[]): PlantViewerCallout[] {
  const used = new Set<PlantAnchorKey>()
  const out: PlantViewerCallout[] = []
  for (const variable of Array.from(new Set(assertions.map((a) => a.variable)))) {
    const anchor = ANCHOR_BY_VARIABLE[variable] ?? ANCHOR_ORDER.find((k) => !used.has(k))
    if (!anchor || used.has(anchor)) continue
    used.add(anchor)
    const t = traitCallout(assertions, variable)
    out.push({ key: variable, anchor, label: `${t.label}: ${t.value}` })
    if (out.length === ANCHOR_ORDER.length) break
  }
  return out
}
```

En `frontend/src/features/catalog/PlantDetailPage.tsx`: borrar la función local `formatValue` y añadir `import { formatAssertionValue } from './traitCallouts'`; en la tabla de afirmaciones cambiar `const value = formatValue(a)` por `const value = formatAssertionValue(a)`.

- [ ] **Step 3: Visor de una planta (chunk perezoso)**

Crear `frontend/src/features/three/plants/PlantViewer.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Callout } from '@/components/ui'
import { useTheme } from '@/store/theme'
import { useProjectedCallouts } from '../useProjectedCallouts'
import { webglAvailable } from '../webgl'
import { createPlantObject, getPlantModel } from './model'
import { addPlantLights, frameCamera } from './scene'
import type { PlantViewerCallout, PlantViewerProps } from './types'

const SOIL = { light: 0x8a7457, dark: 0x4a3f31 }

/** Una planta procedural con giro automático y callouts. Cargar con LazyPlantViewer: importa three. */
export default function PlantViewer({ kind, stage = 'mature', seed = 0, label, callouts = [], className = '' }: PlantViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const soilRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const [noWebgl, setNoWebgl] = useState(false)
  const theme = useTheme((s) => s.theme)
  const { projected, projector } = useProjectedCallouts()
  const calloutsKey = JSON.stringify(callouts)

  useEffect(() => {
    soilRef.current?.color.setHex(theme === 'dark' ? SOIL.dark : SOIL.light)
  }, [theme])

  useEffect(() => {
    const model = getPlantModel(kind, stage, seed)
    const list: PlantViewerCallout[] = JSON.parse(calloutsKey)
    projector.setPoints(
      list.flatMap((c, i) => {
        const a = model.anchors.find((x) => x.key === c.anchor)
        return a ? [{ key: c.key, label: c.label, index: i + 1, x: a.x, y: a.y, z: a.z }] : []
      }),
    )
  }, [calloutsKey, kind, stage, seed, projector])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    if (!webglAvailable()) {
      setNoWebgl(true)
      return
    }
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setNoWebgl(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.touchAction = 'none'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    addPlantLights(scene)
    const model = getPlantModel(kind, stage, seed)
    const plant = createPlantObject(model)
    scene.add(plant)
    // Las hojas son el oclusor principal; su transformación es la identidad, igual que la del grupo.
    const occluder = plant.getObjectByName('leaf') ?? plant

    const soilGeometry = new THREE.CircleGeometry(Math.max(model.radius * 1.25, 0.05), 48)
    soilGeometry.rotateX(-Math.PI / 2)
    const soilMaterial = new THREE.MeshStandardMaterial({
      color: useTheme.getState().theme === 'dark' ? SOIL.dark : SOIL.light,
      roughness: 1,
    })
    soilRef.current = soilMaterial
    scene.add(new THREE.Mesh(soilGeometry, soilMaterial))

    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.autoRotateSpeed = 0.8
    let interacting = false
    const onStart = () => {
      interacting = true
    }
    const onEnd = () => {
      interacting = false
    }
    controls.addEventListener('start', onStart)
    controls.addEventListener('end', onEnd)

    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      const target = frameCamera(camera, model)
      const distance = camera.position.distanceTo(target)
      controls.target.copy(target)
      controls.minDistance = distance * 0.4
      controls.maxDistance = distance * 2.5
      controls.update()
      projector.invalidate()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      controls.autoRotate = !interacting
      controls.update()
      projector.update(camera, occluder, mount.clientWidth || 1, mount.clientHeight || 1, performance.now())
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
      controls.dispose()
      soilGeometry.dispose()
      soilMaterial.dispose()
      soilRef.current = null
      scene.clear() // geometría y materiales de la planta son de la caché: no se desechan
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [kind, stage, seed, projector])

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={mountRef} className="absolute inset-0" role="img" aria-label={label} />
      {!noWebgl && projected.length > 0 && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {projected.map((c) =>
            c.hidden ? null : <Callout key={c.key} x={c.x} y={c.y} side={c.side} dimmed={c.dimmed} label={c.label} />,
          )}
        </div>
      )}
      {noWebgl && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-muted">
          Tu navegador no admite WebGL, necesario para la ilustración 3D.
        </div>
      )}
    </div>
  )
}
```

Crear `frontend/src/features/three/plants/LazyPlantViewer.tsx`:

```tsx
import { lazy, Suspense } from 'react'
import type { PlantViewerProps } from './types'

// three vive solo en el chunk de PlantViewer.
const PlantViewerImpl = lazy(() => import('./PlantViewer'))

export function PlantViewer(props: PlantViewerProps) {
  return (
    <Suspense
      fallback={
        <div role="status" className={`flex items-center justify-center text-xs font-medium text-muted ${props.className ?? ''}`}>
          Preparando ilustración 3D…
        </div>
      }
    >
      <PlantViewerImpl {...props} />
    </Suspense>
  )
}
```

- [ ] **Step 4: Ilustración en la ficha**

Crear `frontend/src/features/catalog/PlantIllustration.tsx`:

```tsx
import { OriginBadge } from '@/components/ui'
import { PlantViewer } from '@/features/three/plants/LazyPlantViewer'
import { ILLUSTRATIVE_NOTICE, plantKindFor } from '@/features/three/plants/types'
import type { SpeciesDetail } from './api'
import { plantViewerCallouts } from './traitCallouts'

/** Planta 3D procedural madura de la especie, con sus rasgos como callouts. Siempre etiquetada ILUSTRATIVO. */
export function PlantIllustration({ species }: { species: SpeciesDetail }) {
  const kind = plantKindFor(species.scientific_name)
  return (
    <figure className="relative">
      <PlantViewer
        kind={kind}
        stage="mature"
        label={`Ilustración 3D de ${species.scientific_name}`}
        callouts={plantViewerCallouts(species.trait_assertions)}
        className="h-72 w-full rounded-[22px] bg-gradient-to-b from-lime/15 to-transparent"
      />
      <OriginBadge origin="illustrative" className="absolute left-3 top-3" />
      <figcaption className="mt-2 text-[11px] text-muted">
        {ILLUSTRATIVE_NOTICE}
        {kind === 'generic' && ' · Forma genérica: aún no hay generador para esta especie.'}
      </figcaption>
    </figure>
  )
}
```

En `frontend/src/features/catalog/PlantDetailPage.tsx`, añadir `import { PlantIllustration } from './PlantIllustration'` y reemplazar el bloque del héroe:

```tsx
      <Card className="relative mb-8 overflow-hidden p-6 sm:p-8">
        <div className="flex items-start justify-between gap-6">
```

…hasta el `</Card>` que lo cierra (incluido el círculo con la inicial `aria-hidden`), por:

```tsx
      <Card className="relative mb-8 overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {s.family && <p className="eyebrow">{s.family}</p>}
            <h1 className="display mt-2 text-4xl normal-case">
              <ScientificName name={s.scientific_name} authorship={s.authorship} />
            </h1>
            <p className="mt-2 text-sm text-muted">
              {s.common_names.filter((n) => n.lang === 'es').map((n) => n.name).join(', ') || 'Sin nombre común registrado'}
              {s.family && <> · Familia {s.family}</>}
            </p>
            {canEdit && (
              <div className="mt-4">
                <Button onClick={() => setAdding(true)}>Añadir a proyecto</Button>
              </div>
            )}
          </div>
          <div className="w-full shrink-0 sm:w-[22rem]">
            <PlantIllustration species={s} />
          </div>
        </div>
      </Card>
```

- [ ] **Step 5: Verificar**

Run (en `frontend/`): `npx vitest run && npx tsc -b && npm run build`
Expected: todo PASS. Luego:

```bash
grep -l "WebGLRenderer" dist/assets/index-*.js || echo "OK: three fuera del bundle principal"
```

Expected: `OK: three fuera del bundle principal`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features
git commit -m "feat(catalog): la ficha sin imagen muestra la planta 3D procedural madura con callouts de rasgos y etiqueta ILUSTRATIVO"
```

---

### Task 3: Miniaturas procedurales en las tarjetas del catálogo

**Decisión — un renderer compartido fuera del DOM que produce PNG en caché** (y no un canvas WebGL por tarjeta, ni un canvas único superpuesto con scissor):

- Un canvas por tarjeta abre un contexto WebGL por tarjeta; con 24 tarjetas por página se supera el límite del navegador (~16 contextos) y se pierden contextos, además de un bucle de render por tarjeta.
- Un canvas único superpuesto con `setScissor` por tarjeta exige sincronizar posiciones con el scroll y el layout en cada frame, y re-renderizar todo mientras se desplaza.
- El renderer compartido abre **un solo contexto** (creado la primera vez que se pide una miniatura, dentro del chunk perezoso), dibuja cada planta una vez a 256 × 256 y devuelve `toDataURL('image/png')`. La caché es por (generador, variante): como máximo 4 × 3 = 12 dibujos por sesión, sin importar cuántas especies haya. Las tarjetas son `<img>` normales: cero costo por frame, el scroll no hace nada en GPU, y al volver al catálogo la imagen sale de memoria al instante. Las miniaturas se dibujan en cola, cediendo el hilo entre una y otra (`setTimeout 0`).
- three sigue perezoso: la página solo importa `catalog/plantThumbnails.ts` (sin three), que carga `three/plants/thumbnails.ts` con `import()` dinámico.

**Files:**
- Create: `frontend/src/features/three/plants/thumbnails.ts`
- Create: `frontend/src/features/catalog/plantThumbnails.ts`
- Test: `frontend/src/features/catalog/plantThumbnails.test.ts`
- Create: `frontend/src/features/catalog/PlantThumb.tsx`
- Modify: `frontend/src/features/catalog/PlantsPage.tsx`
- Modify: `frontend/src/features/catalog/catalog.test.tsx`
- Modify: `frontend/src/features/three/lazyBoundary.test.ts`

**Interfaces:**
- Consumes: Task 1 (`getPlantModel`, `createPlantObject`, `addPlantLights`, `frameCamera`, `webglAvailable`, `plantKindFor`, `variantFor`).
- Produces:
  - `three/plants/thumbnails.ts`: `THUMBNAIL_PX = 256`, `renderPlantThumbnail(kind, seed = 0, stage = 'mature') -> string | null` (null sin WebGL).
  - `catalog/plantThumbnails.ts`: `ThumbnailRenderer`, `createThumbnailCache(load) -> { get(kind, seed): Promise<string | null>; size(); clear() }`, `plantThumbnails` (instancia de la app), `usePlantThumbnail(kind, seed) -> string | null`.
  - `PlantThumb({ speciesId, scientificName })`.

- [ ] **Step 1: Pruebas que fallan**

Crear `frontend/src/features/catalog/plantThumbnails.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createThumbnailCache } from './plantThumbnails'

describe('miniaturas', () => {
  it('dibuja una vez por (especie, variante) y carga el renderer una sola vez', async () => {
    const render = vi.fn((kind: string, seed: number) => `data:${kind}:${seed}`)
    const load = vi.fn(async () => render)
    const cache = createThumbnailCache(load)
    const [a, b, c] = await Promise.all([cache.get('lettuce', 0), cache.get('lettuce', 0), cache.get('tomato', 1)])
    expect(a).toBe('data:lettuce:0')
    expect(b).toBe(a)
    expect(c).toBe('data:tomato:1')
    expect(render).toHaveBeenCalledTimes(2)
    expect(load).toHaveBeenCalledTimes(1)
    expect(cache.size()).toBe(2)
  })

  it('sin WebGL, si falla la carga del chunk o si falla el dibujo devuelve null', async () => {
    expect(await createThumbnailCache(async () => () => null).get('basil', 0)).toBeNull()
    expect(await createThumbnailCache(() => Promise.reject(new Error('chunk'))).get('basil', 0)).toBeNull()
    const broken = createThumbnailCache(async () => () => {
      throw new Error('gl')
    })
    expect(await broken.get('basil', 0)).toBeNull()
    // Un fallo no bloquea la cola: la siguiente miniatura se resuelve
    expect(await broken.get('tomato', 0)).toBeNull()
  })
})
```

En `frontend/src/features/catalog/catalog.test.tsx`, añadir junto a los otros `vi.mock`:

```tsx
vi.mock('@/features/three/plants/thumbnails', () => ({
  renderPlantThumbnail: vi.fn(() => 'data:image/png;base64,iVBORw0KGgo='),
}))
```

y al final:

```tsx
it('las tarjetas muestran una miniatura procedural etiquetada como ilustrativa', async () => {
  mocked.listFamilies.mockResolvedValue([])
  mocked.listPlants.mockResolvedValue({ items: [lettuce], total: 1, page: 1, page_size: 24 })
  render(
    <MemoryRouter initialEntries={['/app/plants']}>
      <PlantsPage />
    </MemoryRouter>,
  )
  const img = await screen.findByRole('img', { name: 'Ilustración de Lactuca sativa L.' })
  expect(img).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=')
  expect(screen.getByText('Ilustrativo')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Lactuca sativa/ })).toHaveAttribute('href', '/app/plants/s1')
})
```

En `frontend/src/features/three/lazyBoundary.test.ts`, añadir a `LAZY_PAIRS`:

```ts
  ['/src/features/catalog/plantThumbnails.ts', '/src/features/three/plants/thumbnails.ts'],
```

Run (en `frontend/`): `npx vitest run src/features/catalog src/features/three/lazyBoundary.test.ts` → FAIL.

- [ ] **Step 2: Renderer compartido (chunk perezoso)**

Crear `frontend/src/features/three/plants/thumbnails.ts`:

```ts
import * as THREE from 'three'
import { webglAvailable } from '../webgl'
import { createPlantObject, getPlantModel } from './model'
import { addPlantLights, frameCamera } from './scene'
import type { PlantKind, PlantStage } from './types'

export const THUMBNAIL_PX = 256

// undefined = aún no se intentó; null = sin WebGL. Un único contexto para todas las miniaturas.
let renderer: THREE.WebGLRenderer | null | undefined

function sharedRenderer(): THREE.WebGLRenderer | null {
  if (renderer !== undefined) return renderer
  renderer = null
  if (!webglAvailable()) return renderer
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    r.setPixelRatio(1)
    r.setSize(THUMBNAIL_PX, THUMBNAIL_PX, false)
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.setClearColor(0x000000, 0)
    renderer = r
  } catch {
    renderer = null
  }
  return renderer
}

/** Dibuja la planta fuera del DOM y devuelve un PNG (data URL); null si no hay WebGL. */
export function renderPlantThumbnail(kind: PlantKind, seed = 0, stage: PlantStage = 'mature'): string | null {
  const r = sharedRenderer()
  if (!r) return null
  const model = getPlantModel(kind, stage, seed)
  const scene = new THREE.Scene()
  addPlantLights(scene)
  scene.add(createPlantObject(model))
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100)
  frameCamera(camera, model)
  r.clear()
  r.render(scene, camera)
  const url = r.domElement.toDataURL('image/png')
  scene.clear() // geometrías y materiales son de la caché
  return url
}
```

- [ ] **Step 3: Caché y cola sin three**

Crear `frontend/src/features/catalog/plantThumbnails.ts`:

```ts
import { useEffect, useState } from 'react'
import type { PlantKind } from '@/features/three/plants/types'

export type ThumbnailRenderer = (kind: PlantKind, seed: number) => string | null

/**
 * Una promesa por (especie, variante): cada miniatura se dibuja una sola vez por sesión. Los dibujos van en
 * cola y ceden el hilo entre uno y otro para no trabar el scroll. Cualquier fallo resuelve a null.
 */
export function createThumbnailCache(load: () => Promise<ThumbnailRenderer>) {
  const cache = new Map<string, Promise<string | null>>()
  let renderer: Promise<ThumbnailRenderer | null> | null = null
  let queue: Promise<unknown> = Promise.resolve()
  return {
    get(kind: PlantKind, seed: number): Promise<string | null> {
      const key = `${kind}:${seed}`
      let hit = cache.get(key)
      if (!hit) {
        if (!renderer) renderer = load().catch(() => null)
        const loaded = renderer
        hit = queue
          .then(() => loaded)
          .then(
            (render) =>
              new Promise<string | null>((resolve) => {
                setTimeout(() => {
                  if (!render) return resolve(null)
                  try {
                    resolve(render(kind, seed))
                  } catch {
                    resolve(null)
                  }
                }, 0)
              }),
          )
        queue = hit
        cache.set(key, hit)
      }
      return hit
    },
    size: () => cache.size,
    clear: () => {
      cache.clear()
      renderer = null
    },
  }
}

// three entra solo por este import() dinámico.
export const plantThumbnails = createThumbnailCache(() =>
  import('@/features/three/plants/thumbnails').then((m) => m.renderPlantThumbnail),
)

export function usePlantThumbnail(kind: PlantKind, seed: number): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    plantThumbnails.get(kind, seed).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [kind, seed])
  return url
}
```

- [ ] **Step 4: Tarjeta**

Crear `frontend/src/features/catalog/PlantThumb.tsx`:

```tsx
import { OriginBadge } from '@/components/ui'
import { plantKindFor, variantFor } from '@/features/three/plants/types'
import { usePlantThumbnail } from './plantThumbnails'

/** Miniatura procedural de la especie (PNG en caché); sin WebGL, la inicial. Siempre ILUSTRATIVO. */
export function PlantThumb({ speciesId, scientificName }: { speciesId: string; scientificName: string }) {
  const url = usePlantThumbnail(plantKindFor(scientificName), variantFor(speciesId))
  return (
    <div className="relative flex h-36 items-end justify-center overflow-hidden rounded-[18px] bg-gradient-to-b from-lime/20 to-transparent">
      {url ? (
        <img
          src={url}
          alt={`Ilustración de ${scientificName}`}
          width={144}
          height={144}
          className="h-36 w-36 object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-lime/30 text-3xl font-semibold text-ink"
        >
          {scientificName.charAt(0).toUpperCase()}
        </span>
      )}
      <OriginBadge origin="illustrative" className="absolute right-2 top-2" />
    </div>
  )
}
```

En `frontend/src/features/catalog/PlantsPage.tsx`, añadir `import { PlantThumb } from './PlantThumb'` y, dentro de cada tarjeta, como primer hijo de `<Card className="flex h-full flex-col gap-3 p-5 …">`:

```tsx
                      <PlantThumb speciesId={s.id} scientificName={s.scientific_name} />
```

- [ ] **Step 5: Verificar**

Run (en `frontend/`): `npx vitest run && npx tsc -b && npm run build`
Expected: todo PASS.

```bash
grep -l "WebGLRenderer" dist/assets/index-*.js || echo "OK: three fuera del bundle principal"
```

Expected: `OK: three fuera del bundle principal`.

Revisión rápida en navegador (`npm run dev` con la API local): `/app/plants` muestra lechuga, tomate con frutos y albahaca en sus tarjetas; `/app/plants/<id>` muestra la planta girando con 3 callouts "Desconocido". La pestaña Rendimiento de las DevTools no debe mostrar trabajo de GPU al hacer scroll del catálogo.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features
git commit -m "feat(catalog): miniaturas procedurales de cada especie desde un renderer compartido, en caché y etiquetadas ILUSTRATIVO"
```

> **Corte mínimo de demo.** Hasta aquí todo es frontend, sin migraciones: se puede desplegar solo.

---

### Task 4: Layout del Studio — modelos, migración 0006 y `GET/PUT /projects/{id}/layout`

**Files:**
- Create: `app/modules/studio/__init__.py` (vacío)
- Create: `app/modules/studio/models.py`
- Create: `app/modules/studio/schemas.py`
- Create: `app/modules/studio/service.py`
- Create: `app/modules/studio/router.py`
- Modify: `app/modules/projects/models.py`
- Create: `alembic/versions/0006_studio_layout_species_media.py`
- Modify: `app/models_registry.py`
- Modify: `app/main.py`
- Modify: `app/modules/home/service.py`
- Test: `tests/test_studio.py`

**Interfaces:**
- Consumes: `projects.service.get_project`, `scoped`, `record`, `conflict`, `unprocessable`, `AppError`, `Species`, `CropCycle`.
- Produces: `Zone`, `Placement`, `MAX_ZONES = 20`, `MAX_PLACEMENTS = 400`, `STAGES`, `Project.layout_version`, `service.floor_bounds(project)`, `service.get_layout(db, ctx, project) -> LayoutOut`, `service.replace_layout(db, ctx, project, data) -> LayoutOut`, rutas `GET/PUT /api/v1/projects/{id}/layout`. JSON de `LayoutOut`: `{project_id, version, area_m2, floor: {width, depth, illustrative}, zones: [{id, name, x, y, width, depth, placements: [{id, zone_id, species_id, species_name, crop_cycle_id, stage, x, y, rotation}]}]}`. Cuerpo del PUT: `{version, zones: [{name, x, y, width, depth, placements: [{species_id, crop_cycle_id?, stage, x, y, rotation}]}]}`. Errores: 409 `version_conflict`; 422 `layout_out_of_bounds` con `details {path, bounds}`; 422 `layout_limit`; 422 `invalid_input` con `details {path, field}` para especie/ciclo.

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/test_studio.py`:

```python
import pytest
from sqlalchemy import func, select

from app.modules.audit.models import AuditEvent
from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Species
from app.modules.home.service import activity_text
from app.modules.studio.models import MAX_PLACEMENTS, MAX_ZONES, Placement, Zone

API = "/api/v1"


@pytest.fixture
def species(db):
    catalog_seed.seed(db)
    db.commit()
    # {"lactuca": id, "solanum": id, "ocimum": id}
    return {s.scientific_name.split()[0].lower(): s.id for s in db.scalars(select(Species))}


def make_project(client, headers, **extra):
    body = {"name": "Invernadero norte", "system": "hydroponic", "area_m2": 100.0, **extra}
    res = client.post(f"{API}/projects", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def put(client, headers, project_id, version, zones):
    return client.put(f"{API}/projects/{project_id}/layout", json={"version": version, "zones": zones}, headers=headers)


def get(client, headers, project_id):
    return client.get(f"{API}/projects/{project_id}/layout", headers=headers)


def zone(name="Mesa A", x=0.0, y=0.0, width=4.0, depth=2.0, plants=()):
    return {"name": name, "x": x, "y": y, "width": width, "depth": depth, "placements": list(plants)}


def plant(species_id, x=0.5, y=0.5, stage="vegetative", **extra):
    return {"species_id": species_id, "x": x, "y": y, "stage": stage, **extra}


def test_empty_layout_has_version_zero_and_square_floor(client, tenants):
    p = make_project(client, tenants["alfa_editor"])
    res = get(client, tenants["alfa_viewer"], p["id"])
    assert res.status_code == 200
    body = res.json()
    assert body["version"] == 0 and body["zones"] == [] and body["area_m2"] == 100.0
    assert body["floor"] == {"width": 10.0, "depth": 10.0, "illustrative": False}


def test_replace_reload_and_audit(client, tenants, species, db):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    res = put(
        client,
        h,
        p["id"],
        0,
        [
            zone(plants=[plant(species["lactuca"], 0.3, 0.4, rotation=45), plant(species["ocimum"], 1.0, 1.0, stage="mature")]),
            zone("Mesa B", x=5.0, plants=[plant(species["solanum"], 2.0, 1.5, stage="seedling")]),
        ],
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["version"] == 1
    assert [z["name"] for z in body["zones"]] == ["Mesa A", "Mesa B"]
    first = body["zones"][0]["placements"]
    assert [x["species_name"] for x in first] == ["Lactuca sativa L.", "Ocimum basilicum L."]
    assert first[0]["rotation"] == 45 and first[1]["stage"] == "mature" and first[0]["crop_cycle_id"] is None
    # Recargar reconstruye exactamente lo guardado
    assert get(client, h, p["id"]).json() == body

    res = put(client, h, p["id"], 1, [zone("Única", plants=[plant(species["lactuca"])])])
    assert res.status_code == 200 and res.json()["version"] == 2
    assert [z["name"] for z in res.json()["zones"]] == ["Única"]
    assert db.scalar(select(func.count()).select_from(Zone).where(Zone.deleted_at.is_(None))) == 1
    assert db.scalar(select(func.count()).select_from(Placement).where(Placement.deleted_at.is_(None))) == 1
    assert db.scalar(select(func.count()).select_from(Zone)) == 3  # las anteriores quedan con borrado lógico
    ops = [e.operation for e in db.query(AuditEvent).filter_by(resource_type="studio_layout", resource_id=p["id"])]
    assert ops == ["replace", "replace"]


def test_stale_version_conflicts_and_keeps_layout(client, tenants, species):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    assert put(client, h, p["id"], 0, [zone(plants=[plant(species["lactuca"])])]).status_code == 200
    res = put(client, h, p["id"], 0, [zone("Otra")])
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "version_conflict"
    layout = get(client, h, p["id"]).json()
    assert layout["version"] == 1
    assert [z["name"] for z in layout["zones"]] == ["Mesa A"]
    assert len(layout["zones"][0]["placements"]) == 1


def test_zone_outside_project_area_is_422_with_path(client, tenants):
    h = tenants["alfa_editor"]
    p = make_project(client, h, area_m2=100.0)  # piso de 10 × 10 m
    assert put(client, h, p["id"], 0, [zone(x=6.0, width=4.0, depth=10.0)]).status_code == 200  # justo en el borde
    res = put(client, h, p["id"], 1, [zone(), zone("Fuera", x=8.0, width=4.0)])
    assert res.status_code == 422
    err = res.json()["error"]
    assert err["code"] == "layout_out_of_bounds"
    assert err["details"]["path"] == "zones.1"
    assert err["details"]["bounds"] == {"width": 10.0, "depth": 10.0}
    assert "Fuera" in err["message"]


def test_plant_outside_its_zone_is_422(client, tenants, species):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    ok = put(client, h, p["id"], 0, [zone(width=4.0, depth=2.0, plants=[plant(species["lactuca"], 4.0, 2.0)])])
    assert ok.status_code == 200  # el borde de la zona cuenta como dentro
    res = put(
        client,
        h,
        p["id"],
        1,
        [zone(width=4.0, depth=2.0, plants=[plant(species["lactuca"]), plant(species["lactuca"], 4.5, 1.0)])],
    )
    assert res.status_code == 422
    err = res.json()["error"]
    assert err["code"] == "layout_out_of_bounds"
    assert err["details"]["path"] == "zones.0.placements.1"
    assert err["details"]["bounds"] == {"width": 4.0, "depth": 2.0}
    assert get(client, h, p["id"]).json()["version"] == 1


def test_project_without_area_has_illustrative_floor_that_grows(client, tenants):
    h = tenants["alfa_editor"]
    p = make_project(client, h, area_m2=None)
    res = put(client, h, p["id"], 0, [zone(x=50.0, y=2.0, width=4.0, depth=3.0)])
    assert res.status_code == 200, res.text
    assert res.json()["floor"] == {"width": 54.0, "depth": 10.0, "illustrative": True}


@pytest.mark.parametrize(
    "bad_zone,bad_plant",
    [
        ({"x": -1.0}, {}),
        ({"width": 0}, {}),
        ({"name": "   "}, {}),
        ({"name": "x" * 81}, {}),
        ({"depth": "nan"}, {}),
        ({}, {"stage": "flowering"}),
        ({}, {"x": -0.1}),
        ({}, {"rotation": 720}),
    ],
)
def test_rejects_invalid_fields(client, tenants, species, bad_zone, bad_plant):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    z = {**zone(plants=[{**plant(species["lactuca"]), **bad_plant}]), **bad_zone}
    assert put(client, h, p["id"], 0, [z]).status_code == 422


def test_species_and_crop_cycle_must_match_project(client, tenants, species):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    other = make_project(client, h, name="Otro")
    cycle = client.post(f"{API}/projects/{p['id']}/crop-cycles", json={"species_id": species["lactuca"]}, headers=h).json()
    foreign = client.post(f"{API}/projects/{other['id']}/crop-cycles", json={"species_id": species["lactuca"]}, headers=h).json()

    res = put(client, h, p["id"], 0, [zone(plants=[plant("no-existe")])])
    assert res.status_code == 422
    assert res.json()["error"]["details"] == {"path": "zones.0.placements.0", "field": "species_id"}
    res = put(client, h, p["id"], 0, [zone(plants=[plant(species["ocimum"], crop_cycle_id=cycle["id"])])])
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "species_id"
    res = put(client, h, p["id"], 0, [zone(plants=[plant(species["lactuca"], crop_cycle_id=foreign["id"])])])
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "crop_cycle_id"
    res = put(client, h, p["id"], 0, [zone(plants=[plant(species["lactuca"], crop_cycle_id=cycle["id"])])])
    assert res.status_code == 200
    assert res.json()["zones"][0]["placements"][0]["crop_cycle_id"] == cycle["id"]


def test_limits(client, tenants, species):
    h = tenants["alfa_editor"]
    p = make_project(client, h, area_m2=None)
    res = put(client, h, p["id"], 0, [zone(f"Z{i}", x=float(i * 5)) for i in range(MAX_ZONES + 1)])
    assert res.status_code == 422 and res.json()["error"]["code"] == "layout_limit"
    many = [plant(species["lactuca"], 0.1, 0.1)] * (MAX_PLACEMENTS + 1)
    res = put(client, h, p["id"], 0, [zone(plants=many)])
    assert res.status_code == 422 and res.json()["error"]["code"] == "layout_limit"


def test_viewer_reads_but_cannot_write_and_tenants_are_isolated(client, tenants):
    p = make_project(client, tenants["alfa_editor"])
    assert put(client, tenants["alfa_viewer"], p["id"], 0, []).status_code == 403
    assert get(client, tenants["beta_viewer"], p["id"]).status_code == 404
    assert put(client, tenants["beta_editor"], p["id"], 0, []).status_code == 404


def test_activity_text():
    event = AuditEvent(resource_type="studio_layout", resource_id="x", operation="replace", data={})
    assert activity_text(event) == "Layout del Studio actualizado"
```

- [ ] **Step 2: Verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_studio.py -q -p no:warnings`
Expected: FAIL (`ModuleNotFoundError: app.modules.studio`).

- [ ] **Step 3: Modelos**

En `app/modules/projects/models.py`, añadir a `Project` (después de `version`):

```python
    # Versión del layout del Studio (independiente de `version` del proyecto). 0 = sin layout guardado.
    layout_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
```

Crear `app/modules/studio/__init__.py` vacío y `app/modules/studio/models.py`:

```python
"""Layout del Studio: zonas y plantas colocadas. Ilustrativo: no predice crecimiento."""
from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, TenantMixin, UUIDMixin

STAGES = ("seedling", "vegetative", "mature")
MAX_ZONES = 20
MAX_PLACEMENTS = 400


class Zone(UUIDMixin, TenantMixin, AuditMixin, Base):
    """Rectángulo del piso del proyecto (m): x, y desde el origen del piso."""

    __tablename__ = "studio_zones"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    width: Mapped[float] = mapped_column(Float, nullable=False)
    depth: Mapped[float] = mapped_column(Float, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Placement(UUIDMixin, TenantMixin, AuditMixin, Base):
    """Planta colocada en una zona: x, y relativos a la zona (m); rotation en grados."""

    __tablename__ = "studio_placements"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    zone_id: Mapped[str] = mapped_column(String(36), ForeignKey("studio_zones.id"), nullable=False, index=True)
    crop_cycle_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("crop_cycles.id"), nullable=True)
    species_id: Mapped[str] = mapped_column(String(36), ForeignKey("species.id"), nullable=False, index=True)
    stage: Mapped[str] = mapped_column(String(20), nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    rotation: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

En `app/models_registry.py`, añadir:

```python
from app.modules.studio import models as studio_models  # noqa: F401
```

- [ ] **Step 4: Migración**

Crear `alembic/versions/0006_studio_layout_species_media.py` (la Task 6 le añade `species_media`):

```python
"""Studio (zonas y plantas colocadas) y medios de especie

Revision ID: 0006
Revises: 0005
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"  # 0005_simulation_telemetry (V3): V4 se integra después de V3
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    op.add_column("projects", sa.Column("layout_version", sa.Integer(), nullable=False, server_default="0"))
    op.create_table(
        "studio_zones",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("width", sa.Float(), nullable=False),
        sa.Column("depth", sa.Float(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        *_timestamps(),
    )
    op.create_table(
        "studio_placements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("zone_id", sa.String(36), sa.ForeignKey("studio_zones.id"), nullable=False, index=True),
        sa.Column("crop_cycle_id", sa.String(36), sa.ForeignKey("crop_cycles.id"), nullable=True),
        sa.Column("species_id", sa.String(36), sa.ForeignKey("species.id"), nullable=False, index=True),
        sa.Column("stage", sa.String(20), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("rotation", sa.Float(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        *_timestamps(),
    )


def downgrade() -> None:
    op.drop_table("studio_placements")
    op.drop_table("studio_zones")
    op.drop_column("projects", "layout_version")
```

- [ ] **Step 5: Esquemas**

Crear `app/modules/studio/schemas.py`:

```python
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

Meters = Annotated[float, Field(ge=0, le=1000, allow_inf_nan=False)]
Size = Annotated[float, Field(gt=0, le=1000, allow_inf_nan=False)]
StageLiteral = Literal["seedling", "vegetative", "mature"]


class PlacementIn(BaseModel):
    species_id: str = Field(min_length=1, max_length=36)
    crop_cycle_id: str | None = Field(default=None, max_length=36)
    stage: StageLiteral = "vegetative"
    x: Meters
    y: Meters
    rotation: float = Field(default=0.0, ge=-360, le=360, allow_inf_nan=False)

    @field_validator("crop_cycle_id", mode="before")
    @classmethod
    def _blank(cls, v):
        return None if isinstance(v, str) and not v.strip() else v


class ZoneIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    x: Meters
    y: Meters
    width: Size
    depth: Size
    placements: list[PlacementIn] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El nombre de la zona es obligatorio")
        return v


class LayoutIn(BaseModel):
    version: int = Field(ge=0)
    zones: list[ZoneIn] = Field(default_factory=list)


class PlacementOut(BaseModel):
    id: str
    zone_id: str
    species_id: str
    species_name: str
    crop_cycle_id: str | None
    stage: str
    x: float
    y: float
    rotation: float


class ZoneOut(BaseModel):
    id: str
    name: str
    x: float
    y: float
    width: float
    depth: float
    placements: list[PlacementOut]


class FloorOut(BaseModel):
    width: float
    depth: float
    # true: el proyecto no tiene área; el piso es solo un lienzo de dibujo
    illustrative: bool


class LayoutOut(BaseModel):
    project_id: str
    version: int
    area_m2: float | None
    floor: FloorOut
    zones: list[ZoneOut]
```

- [ ] **Step 6: Servicio**

Crear `app/modules/studio/service.py`:

```python
"""Layout del Studio: lectura y reemplazo completo con versión (409 si no coincide)."""
import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.deps import RequestContext
from app.core.errors import AppError, conflict, unprocessable
from app.core.mixins import utcnow
from app.core.tenant import scoped
from app.modules.catalog.models import Species
from app.modules.projects.models import CropCycle, Project
from app.modules.studio.models import MAX_PLACEMENTS, MAX_ZONES, Placement, Zone
from app.modules.studio.schemas import FloorOut, LayoutIn, LayoutOut, PlacementOut, ZoneOut

RESOURCE = "studio_layout"
EPS = 1e-6
ILLUSTRATIVE_FLOOR_M = 10.0


def floor_bounds(project: Project) -> tuple[float, float] | None:
    """Piso del proyecto: cuadrado de lado √área anclado en (0, 0). Sin área no hay límite."""
    if project.area_m2 is None:
        return None
    side = math.sqrt(project.area_m2)
    return side, side


def _out_of_bounds(message: str, path: str, width: float, depth: float) -> AppError:
    return AppError(422, "layout_out_of_bounds", message, {"path": path, "bounds": {"width": width, "depth": depth}})


def _zones(db: Session, ctx: RequestContext, project: Project) -> list[Zone]:
    stmt = scoped(Zone, ctx).where(Zone.project_id == project.id).order_by(Zone.sort_order, Zone.created_at)
    return list(db.scalars(stmt))


def _placements(db: Session, ctx: RequestContext, project: Project) -> list[Placement]:
    stmt = (
        scoped(Placement, ctx)
        .where(Placement.project_id == project.id)
        .order_by(Placement.sort_order, Placement.created_at)
    )
    return list(db.scalars(stmt))


def get_layout(db: Session, ctx: RequestContext, project: Project) -> LayoutOut:
    zones = _zones(db, ctx, project)
    placements = _placements(db, ctx, project)
    species_ids = {p.species_id for p in placements}
    names = (
        {s.id: s.scientific_name for s in db.scalars(select(Species).where(Species.id.in_(species_ids)))}
        if species_ids
        else {}
    )
    by_zone: dict[str, list[PlacementOut]] = {}
    for p in placements:
        by_zone.setdefault(p.zone_id, []).append(
            PlacementOut(
                id=p.id,
                zone_id=p.zone_id,
                species_id=p.species_id,
                species_name=names.get(p.species_id, ""),
                crop_cycle_id=p.crop_cycle_id,
                stage=p.stage,
                x=p.x,
                y=p.y,
                rotation=p.rotation,
            )
        )
    bounds = floor_bounds(project)
    if bounds:
        floor = FloorOut(width=bounds[0], depth=bounds[1], illustrative=False)
    else:
        floor = FloorOut(
            width=max([ILLUSTRATIVE_FLOOR_M] + [z.x + z.width for z in zones]),
            depth=max([ILLUSTRATIVE_FLOOR_M] + [z.y + z.depth for z in zones]),
            illustrative=True,
        )
    return LayoutOut(
        project_id=project.id,
        version=project.layout_version,
        area_m2=project.area_m2,
        floor=floor,
        zones=[
            ZoneOut(id=z.id, name=z.name, x=z.x, y=z.y, width=z.width, depth=z.depth, placements=by_zone.get(z.id, []))
            for z in zones
        ],
    )


def _validate(db: Session, ctx: RequestContext, project: Project, data: LayoutIn) -> None:
    total = sum(len(z.placements) for z in data.zones)
    if len(data.zones) > MAX_ZONES or total > MAX_PLACEMENTS:
        raise AppError(
            422,
            "layout_limit",
            f"Máximo {MAX_ZONES} zonas y {MAX_PLACEMENTS} plantas por layout",
            {"max_zones": MAX_ZONES, "max_placements": MAX_PLACEMENTS},
        )
    bounds = floor_bounds(project)
    cycles = {c.id: c for c in db.scalars(scoped(CropCycle, ctx).where(CropCycle.project_id == project.id)).unique()}
    wanted = {p.species_id for z in data.zones for p in z.placements}
    known = (
        set(db.scalars(select(Species.id).where(Species.id.in_(wanted), Species.deleted_at.is_(None))))
        if wanted
        else set()
    )
    for i, zone in enumerate(data.zones):
        if bounds and (zone.x + zone.width > bounds[0] + EPS or zone.y + zone.depth > bounds[1] + EPS):
            raise _out_of_bounds(
                f"La zona «{zone.name}» queda fuera del área del proyecto ({bounds[0]:.2f} × {bounds[1]:.2f} m)",
                f"zones.{i}",
                bounds[0],
                bounds[1],
            )
        for j, p in enumerate(zone.placements):
            path = f"zones.{i}.placements.{j}"
            if p.x > zone.width + EPS or p.y > zone.depth + EPS:
                raise _out_of_bounds(f"Una planta queda fuera de la zona «{zone.name}»", path, zone.width, zone.depth)
            if p.species_id not in known:
                raise unprocessable("La especie no existe", {"path": path, "field": "species_id"})
            if p.crop_cycle_id is not None:
                cycle = cycles.get(p.crop_cycle_id)
                if cycle is None:
                    raise unprocessable("El ciclo no pertenece a este proyecto", {"path": path, "field": "crop_cycle_id"})
                if cycle.species_id != p.species_id:
                    raise unprocessable("La especie no coincide con la del ciclo", {"path": path, "field": "species_id"})


def replace_layout(db: Session, ctx: RequestContext, project: Project, data: LayoutIn) -> LayoutOut:
    # Bloquea la fila del proyecto (Postgres) para que dos PUT con la misma versión no pasen ambos.
    project = db.scalar(
        select(Project).where(Project.id == project.id).with_for_update().execution_options(populate_existing=True)
    )
    if data.version != project.layout_version:
        raise conflict("El layout cambió en otra sesión; recarga para ver la versión actual")
    _validate(db, ctx, project, data)

    now = utcnow()
    for old in _placements(db, ctx, project):
        old.deleted_at = now
    for old in _zones(db, ctx, project):
        old.deleted_at = now
    for i, zone in enumerate(data.zones):
        row = Zone(
            organization_id=ctx.organization_id,
            project_id=project.id,
            name=zone.name,
            x=zone.x,
            y=zone.y,
            width=zone.width,
            depth=zone.depth,
            sort_order=i,
        )
        db.add(row)
        db.flush()
        for j, p in enumerate(zone.placements):
            db.add(
                Placement(
                    organization_id=ctx.organization_id,
                    project_id=project.id,
                    zone_id=row.id,
                    crop_cycle_id=p.crop_cycle_id,
                    species_id=p.species_id,
                    stage=p.stage,
                    x=p.x,
                    y=p.y,
                    rotation=p.rotation,
                    sort_order=j,
                )
            )
    project.layout_version += 1
    record(
        db,
        ctx,
        RESOURCE,
        project.id,
        "replace",
        {"version": project.layout_version, "zones": len(data.zones), "placements": sum(len(z.placements) for z in data.zones)},
    )
    db.commit()
    return get_layout(db, ctx, project)
```

- [ ] **Step 7: Rutas, registro y texto de actividad**

Crear `app/modules/studio/router.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context, require_role
from app.modules.identity.models import ROLE_EDITOR
from app.modules.projects import service as projects
from app.modules.studio import service
from app.modules.studio.schemas import LayoutIn, LayoutOut

router = APIRouter(prefix="/projects", tags=["studio"])
editor = require_role(ROLE_EDITOR)


@router.get("/{project_id}/layout", response_model=LayoutOut)
def get_layout(project_id: str, ctx: RequestContext = Depends(get_context), db: Session = Depends(get_db)):
    return service.get_layout(db, ctx, projects.get_project(db, ctx, project_id))


@router.put("/{project_id}/layout", response_model=LayoutOut)
def put_layout(project_id: str, data: LayoutIn, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)):
    return service.replace_layout(db, ctx, projects.get_project(db, ctx, project_id), data)
```

En `app/main.py`, añadir `from app.modules.studio.router import router as studio_router` junto a los otros routers y agregar `studio_router` al final de la tupla del `for router in (…)` (si V3 ya añadió los suyos, conservar ambos).

En `app/modules/home/service.py`, añadir al diccionario `_TEXTS`:

```python
    ("studio_layout", "replace"): "Layout del Studio actualizado",
```

- [ ] **Step 8: Correr pruebas**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_studio.py -q -p no:warnings` → PASS. Luego la suite completa: `~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings` → todo PASS (`ProjectOut` no expone `layout_version`, así que las pruebas de proyectos no cambian).

- [ ] **Step 9: Migración en Postgres 17**

Requiere `0005` en `alembic/versions/` (V3 integrado: rebase sobre `main` con V3, o rama de integración local). Si aún no existe, dejar este paso pendiente y repetirlo en la Task 8; **no** cambiar `down_revision`.

```bash
docker run -d --rm --name hvt-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=hvt -p 55432:5432 postgres:17
sleep 5
export DATABASE_URL=postgresql://postgres:pg@localhost:55432/hvt
~/.venvs/harvestt/bin/python -m alembic upgrade head
~/.venvs/harvestt/bin/python -m alembic check
~/.venvs/harvestt/bin/python -m alembic downgrade 0005
~/.venvs/harvestt/bin/python -m alembic upgrade head
docker stop hvt-pg
```

Expected: `alembic check` imprime "No new upgrade operations detected."

- [ ] **Step 10: Commit**

```bash
git add app alembic/versions/0006_studio_layout_species_media.py tests/test_studio.py
git commit -m "feat(studio): zonas y plantas colocadas con GET/PUT de layout versionado, límites del piso y migración 0006"
```

---

### Task 5: Studio — escena 3D con instancing, respaldo SVG, selección y modo edición

**Files:**
- Create: `frontend/src/features/studio/api.ts`
- Create: `frontend/src/features/studio/layout.ts`
- Test: `frontend/src/features/studio/layout.test.ts`
- Create: `frontend/src/features/studio/sceneTypes.ts`
- Create: `frontend/src/features/studio/StudioTopView.tsx`
- Create: `frontend/src/features/studio/StudioScene.tsx`
- Create: `frontend/src/features/studio/LazyStudioScene.tsx`
- Create: `frontend/src/features/studio/SidePanel.tsx`
- Create: `frontend/src/features/studio/StudioPage.tsx`
- Test: `frontend/src/features/studio/studio.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/features/projects/ProjectDetailPage.tsx`
- Modify: `frontend/src/features/projects/projects.test.tsx`
- Modify: `frontend/src/features/three/lazyBoundary.test.ts`

**Interfaces:**
- Consumes: Task 1 (`buildInstancedPlants`, `getPlantModel`, `addPlantLights`, `PlantInstance`, `plantKindFor`, `variantFor`, `PLANT_COLORS`, `cssHex`, `PLANT_STAGE_LABELS`, `ILLUSTRATIVE_NOTICE`, `webglAvailable`); Task 4 (contrato JSON del layout); V2 (`isClick`, `useProjectedCallouts`, `Callout`); `projects/api` (`getProject`, `ProjectDetail`, `CropCycle`), `projects/labels` (`CYCLE_STATUS_LABELS`).
- Produces:
  - `api.ts`: `LayoutPlacement`, `LayoutZone`, `Layout`, `getLayout(projectId)`, `saveLayout(projectId, version, zones)`.
  - `layout.ts`: `Selection {zone, plant: number | null}`, `Floor`, `ILLUSTRATIVE_FLOOR_M`, `MAX_ZONES`, `MAX_PLACEMENTS`, `FILL_SPACING_M`, `clamp`, `floorFor`, `plantCount`, `layoutPayload`, `addZone`, `moveZone`, `removeZone`, `addPlant`, `fillZone`, `movePlant`, `movePlantToFloor`, `updatePlant`, `removePlant`, `footprint`, `instancesFor`, `selectionFromIndex`, `indexFromSelection`, `selectedPlant`.
  - `sceneTypes.ts`: `StudioSceneProps`.
  - `StudioTopView(props)`, `StudioScene` (default export perezoso + envoltorio `LazyStudioScene.StudioScene`), `SidePanel`, `StudioPage`.
  - Ruta `/app/projects/:id/studio`; enlace "Studio" en el detalle del proyecto.

- [ ] **Step 1: Pruebas que fallan**

Crear `frontend/src/features/studio/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { groupInstances } from '@/features/three/plants/instances'
import type { LayoutZone } from './api'
import {
  addPlant,
  addZone,
  fillZone,
  floorFor,
  indexFromSelection,
  instancesFor,
  layoutPayload,
  MAX_PLACEMENTS,
  movePlant,
  movePlantToFloor,
  moveZone,
  selectionFromIndex,
} from './layout'

const cycle = { id: 'c1', species_id: 's1', species_name: 'Lactuca sativa L.' }
const floor = { width: 10, depth: 10, illustrative: false }

function zones(): LayoutZone[] {
  return [
    {
      id: 'z1',
      name: 'Mesa A',
      x: 1,
      y: 2,
      width: 4,
      depth: 2,
      placements: [
        { id: 'p1', species_id: 's1', species_name: 'Lactuca sativa L.', crop_cycle_id: 'c1', stage: 'mature', x: 0.5, y: 0.5, rotation: 0 },
        { id: 'p2', species_id: 's2', species_name: 'Ocimum basilicum L.', crop_cycle_id: null, stage: 'seedling', x: 1.5, y: 1, rotation: 90 },
      ],
    },
    { id: 'z2', name: 'Mesa B', x: 6, y: 2, width: 2, depth: 2, placements: [] },
  ]
}

describe('piso', () => {
  it('con área usa el del servidor; sin área crece con las zonas', () => {
    expect(floorFor({ floor }, zones())).toEqual(floor)
    const illustrative = { floor: { width: 10, depth: 10, illustrative: true } }
    expect(floorFor(illustrative, [{ ...zones()[1], x: 12 }])).toEqual({ width: 14, depth: 10, illustrative: true })
  })
})

describe('edición', () => {
  it('addZone apila zonas sin salirse del piso', () => {
    let list: LayoutZone[] = []
    for (let i = 0; i < 6; i++) list = addZone(list, floor)
    expect(list.map((z) => z.name)).toEqual(['Zona 1', 'Zona 2', 'Zona 3', 'Zona 4', 'Zona 5', 'Zona 6'])
    for (const z of list) {
      expect(z.x + z.width).toBeLessThanOrEqual(floor.width)
      expect(z.y + z.depth).toBeLessThanOrEqual(floor.depth)
    }
  })

  it('addPlant coloca la planta del ciclo dentro de la zona; fillZone llena con cuadrícula', () => {
    const added = addPlant(zones(), 1, cycle, 'vegetative')
    expect(added[1].placements[0]).toMatchObject({ species_id: 's1', crop_cycle_id: 'c1', stage: 'vegetative', rotation: 0 })
    const filled = fillZone(zones(), 0, cycle, 'mature')
    expect(filled[0].placements).toHaveLength(13 * 7) // 4 × 2 m cada 0,3 m: 13 columnas × 7 filas
    for (const p of filled[0].placements) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(4)
      expect(p.y).toBeLessThanOrEqual(2)
    }
    const huge = [{ ...zones()[0], width: 1000, depth: 1000, placements: [] }]
    expect(fillZone(huge, 0, cycle, 'mature')[0].placements).toHaveLength(MAX_PLACEMENTS)
  })

  it('mover una planta la mantiene dentro de su zona', () => {
    const sel = { zone: 0, plant: 0 }
    expect(movePlant(zones(), sel, 9, -3)[0].placements[0]).toMatchObject({ x: 4, y: 0 })
    // Coordenadas de piso → relativas a la zona (origen en 1, 2)
    expect(movePlantToFloor(zones(), sel, 2.25, 3.5)[0].placements[0]).toMatchObject({ x: 1.25, y: 1.5 })
  })

  it('mover una zona la mantiene dentro del piso con área', () => {
    expect(moveZone(zones(), 0, 9, 9, floor)[0]).toMatchObject({ x: 6, y: 8 })
    expect(moveZone(zones(), 0, 30, 1, { ...floor, illustrative: true })[0]).toMatchObject({ x: 30, y: 1 })
  })

  it('layoutPayload quita ids y nombres derivados', () => {
    const body = layoutPayload(3, zones())
    expect(body.version).toBe(3)
    expect(body.zones[0]).toEqual({
      name: 'Mesa A',
      x: 1,
      y: 2,
      width: 4,
      depth: 2,
      placements: [
        { species_id: 's1', crop_cycle_id: 'c1', stage: 'mature', x: 0.5, y: 0.5, rotation: 0 },
        { species_id: 's2', crop_cycle_id: null, stage: 'seedling', x: 1.5, y: 1, rotation: 90 },
      ],
    })
  })
})

describe('instancias', () => {
  it('posición en el piso = zona + planta, con especie y etapa', () => {
    const list = instancesFor(zones())
    expect(list[1]).toMatchObject({ index: 1, kind: 'basil', stage: 'seedling', x: 2.5, z: 3, rotationDeg: 90 })
  })

  it('instancesFor: la variante sobrevive a guardar (los ids cambian en cada PUT)', () => {
    const saved = zones().map((z) => ({ ...z, id: `nuevo-${z.id}`, placements: z.placements.map((p) => ({ ...p, id: `n-${p.id}` })) }))
    expect(instancesFor(saved).map((i) => i.variant)).toEqual(instancesFor(zones()).map((i) => i.variant))
  })

  it('una zona llena de lechugas se dibuja con 3 grupos como máximo', () => {
    const filled = fillZone(zones(), 0, cycle, 'mature')
    expect(groupInstances(instancesFor(filled)).length).toBeLessThanOrEqual(3)
  })

  it('índice plano ↔ selección', () => {
    const list = zones()
    expect(selectionFromIndex(list, 1)).toEqual({ zone: 0, plant: 1 })
    expect(selectionFromIndex(list, 2)).toBeNull()
    expect(indexFromSelection(list, { zone: 0, plant: 1 })).toBe(1)
    expect(indexFromSelection(list, { zone: 1, plant: null })).toBeNull()
  })
})
```

Crear `frontend/src/features/studio/studio.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import * as projectsApi from '@/features/projects/api'
import * as webgl from '@/features/three/webgl'
import { useAuth } from '@/store/auth'
import * as api from './api'
import { StudioPage } from './StudioPage'

vi.mock('./api', () => ({ getLayout: vi.fn(), saveLayout: vi.fn() }))
vi.mock('@/features/projects/api', () => ({ getProject: vi.fn() }))
vi.mock('@/features/three/webgl', () => ({ webglAvailable: vi.fn(() => false) }))
vi.mock('./LazyStudioScene', () => ({
  StudioScene: ({ label, zones }: { label: string; zones: unknown[] }) => (
    <div data-testid="studio-3d" aria-label={label}>
      {zones.length}
    </div>
  ),
}))

const mocked = vi.mocked(api)

function setRole(role: 'viewer' | 'editor') {
  const org = { id: 'o1', name: 'Alfa', slug: 'alfa' }
  useAuth.setState({
    token: 't',
    organizationId: 'o1',
    user: { id: 'u1', email: 'a@a.test', full_name: 'A', is_superadmin: false },
    memberships: [{ organization: org, role }],
  })
}

const project: projectsApi.ProjectDetail = {
  id: 'p1',
  name: 'Invernadero norte',
  objectives: null,
  area_m2: 100,
  system: 'hydroponic',
  location: null,
  version: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  crop_cycles: [
    {
      id: 'c1',
      project_id: 'p1',
      species_id: 's1',
      species_name: 'Lactuca sativa L.',
      cultivar_id: null,
      cultivar_name: null,
      started_on: '2026-10-01',
      stage: 'unknown',
      status: 'active',
      created_at: '2026-10-01T00:00:00Z',
    },
  ],
}

const layout: api.Layout = {
  project_id: 'p1',
  version: 3,
  area_m2: 100,
  floor: { width: 10, depth: 10, illustrative: false },
  zones: [
    {
      id: 'z1',
      name: 'Mesa A',
      x: 0,
      y: 0,
      width: 4,
      depth: 2,
      placements: [
        { id: 'pl1', species_id: 's1', species_name: 'Lactuca sativa L.', crop_cycle_id: 'c1', stage: 'mature', x: 0.5, y: 0.5, rotation: 0 },
      ],
    },
  ],
}

function renderStudio() {
  return render(
    <MemoryRouter initialEntries={['/app/projects/p1/studio']}>
      <Routes>
        <Route path="/app/projects/:id/studio" element={<StudioPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(webgl.webglAvailable).mockReturnValue(false)
  vi.mocked(projectsApi.getProject).mockResolvedValue(project)
  mocked.getLayout.mockResolvedValue(layout)
  setRole('editor')
})

it('sin WebGL muestra la vista superior SVG con el aviso ilustrativo', async () => {
  renderStudio()
  const view = await screen.findByRole('img', { name: 'Studio de Invernadero norte' })
  expect(view.tagName.toLowerCase()).toBe('svg')
  expect(screen.getByRole('note')).toHaveTextContent('Representación ilustrativa; no predice crecimiento')
  expect(screen.getByText(/Vista superior 2D/)).toBeInTheDocument()
  expect(screen.queryByTestId('studio-3d')).toBeNull()
})

it('con WebGL usa la escena 3D', async () => {
  vi.mocked(webgl.webglAvailable).mockReturnValue(true)
  renderStudio()
  expect(await screen.findByTestId('studio-3d')).toHaveTextContent('1')
})

it('seleccionar una planta muestra especie, etapa, ciclo y posición', async () => {
  setRole('viewer')
  renderStudio()
  fireEvent.click(await screen.findByRole('button', { name: 'Lactuca sativa L. · Madura' }))
  expect(screen.getByRole('heading', { name: 'Planta seleccionada' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Lactuca sativa L.' })).toHaveAttribute('href', '/app/plants/s1')
  expect(screen.getByText('Madura')).toBeInTheDocument()
  expect(screen.getByText(/Activo · inicio 2026-10-01/)).toBeInTheDocument()
  expect(screen.getByText('0.50 × 0.50 m')).toBeInTheDocument()
  // El viewer no tiene modo edición
  expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  expect(screen.queryByLabelText('X en la zona (m)')).toBeNull()
})

it('editar: agregar una planta del ciclo, moverla y guardar con la versión', async () => {
  mocked.saveLayout.mockResolvedValue({ ...layout, version: 4 })
  renderStudio()
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Zona Mesa A' }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar planta' }))
  // La planta nueva queda seleccionada; X se limita al ancho de la zona
  fireEvent.change(screen.getByLabelText('X en la zona (m)'), { target: { value: '9' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar layout' }))
  await waitFor(() => expect(mocked.saveLayout).toHaveBeenCalled())
  const [projectId, version, zones] = mocked.saveLayout.mock.calls[0]
  expect(projectId).toBe('p1')
  expect(version).toBe(3)
  expect(zones[0].placements).toHaveLength(2)
  expect(zones[0].placements[1]).toMatchObject({ species_id: 's1', crop_cycle_id: 'c1', stage: 'vegetative', x: 4 })
  expect(await screen.findByText('Layout guardado (versión 4).')).toBeInTheDocument()
})

it('un 409 al guardar muestra el aviso y recarga', async () => {
  mocked.saveLayout.mockRejectedValue(
    new AxiosError('conflict', 'ERR', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      data: { error: { code: 'version_conflict', message: 'x' } },
      headers: {},
      config: { headers: new AxiosHeaders() },
    }),
  )
  renderStudio()
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar zona' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar layout' }))
  expect(await screen.findByText(/Otra persona guardó el layout/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cargar versión actual' }))
  await waitFor(() => expect(mocked.getLayout).toHaveBeenCalledTimes(2))
})
```

En `frontend/src/features/projects/projects.test.tsx`, añadir al final:

```tsx
it('el detalle del proyecto enlaza al Studio', async () => {
  mocked.getProject.mockResolvedValue(project)
  mocked.listObservations.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
  render(
    <MemoryRouter initialEntries={['/app/projects/p1']}>
      <Routes>
        <Route path="/app/projects/:id" element={<ProjectDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(await screen.findByRole('link', { name: 'Studio' })).toHaveAttribute('href', '/app/projects/p1/studio')
})
```

En `frontend/src/features/three/lazyBoundary.test.ts`, añadir a `LAZY_PAIRS`:

```ts
  ['/src/features/studio/LazyStudioScene.tsx', '/src/features/studio/StudioScene.tsx'],
```

Run (en `frontend/`): `npx vitest run src/features/studio src/features/projects src/features/three/lazyBoundary.test.ts` → FAIL.

- [ ] **Step 2: API cliente**

Crear `frontend/src/features/studio/api.ts`:

```ts
import { api } from '@/api/client'
import type { PlantStage } from '@/features/three/plants/types'
import { layoutPayload } from './layout'

export interface LayoutPlacement {
  id?: string
  species_id: string
  species_name: string
  crop_cycle_id: string | null
  stage: PlantStage
  /** Metros, relativos a la zona. */
  x: number
  y: number
  /** Grados. */
  rotation: number
}

export interface LayoutZone {
  id?: string
  name: string
  x: number
  y: number
  width: number
  depth: number
  placements: LayoutPlacement[]
}

export interface Layout {
  project_id: string
  version: number
  area_m2: number | null
  floor: { width: number; depth: number; illustrative: boolean }
  zones: LayoutZone[]
}

export async function getLayout(projectId: string): Promise<Layout> {
  const res = await api.get<Layout>(`/projects/${encodeURIComponent(projectId)}/layout`)
  return res.data
}

export async function saveLayout(projectId: string, version: number, zones: LayoutZone[]): Promise<Layout> {
  const res = await api.put<Layout>(`/projects/${encodeURIComponent(projectId)}/layout`, layoutPayload(version, zones))
  return res.data
}
```

(`layout.ts` solo importa tipos de `api.ts`, así que no hay ciclo en tiempo de ejecución; ninguno de los dos importa three.)

- [ ] **Step 3: Edición pura del layout**

Crear `frontend/src/features/studio/layout.ts`:

```ts
import type { CropCycle } from '@/features/projects/api'
import type { PlantInstance } from '@/features/three/plants/instances'
import { plantKindFor, PlantStage, variantFor } from '@/features/three/plants/types'
import type { Layout, LayoutPlacement, LayoutZone } from './api'

export interface Selection {
  zone: number
  /** null = la zona está seleccionada. */
  plant: number | null
}

export interface Floor {
  width: number
  depth: number
  illustrative: boolean
}

export const ILLUSTRATIVE_FLOOR_M = 10
export const MAX_ZONES = 20
export const MAX_PLACEMENTS = 400
/** Espaciado de dibujo de «Llenar zona»: no es una recomendación de marco de plantación. */
export const FILL_SPACING_M = 0.3

type CycleRef = Pick<CropCycle, 'id' | 'species_id' | 'species_name'>

const round = (n: number) => Math.round(n * 100) / 100

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Piso vigente: el del servidor si el proyecto tiene área; si no, crece con las zonas (ilustrativo). */
export function floorFor(layout: Pick<Layout, 'floor'>, zones: LayoutZone[]): Floor {
  if (!layout.floor.illustrative) return layout.floor
  return {
    width: Math.max(ILLUSTRATIVE_FLOOR_M, ...zones.map((z) => z.x + z.width)),
    depth: Math.max(ILLUSTRATIVE_FLOOR_M, ...zones.map((z) => z.y + z.depth)),
    illustrative: true,
  }
}

export function plantCount(zones: LayoutZone[]): number {
  return zones.reduce((n, z) => n + z.placements.length, 0)
}

/** Cuerpo del PUT: sin ids ni nombres derivados. */
export function layoutPayload(version: number, zones: LayoutZone[]) {
  return {
    version,
    zones: zones.map((z) => ({
      name: z.name,
      x: z.x,
      y: z.y,
      width: z.width,
      depth: z.depth,
      placements: z.placements.map((p) => ({
        species_id: p.species_id,
        crop_cycle_id: p.crop_cycle_id,
        stage: p.stage,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
      })),
    })),
  }
}

export function addZone(zones: LayoutZone[], floor: Floor): LayoutZone[] {
  if (zones.length >= MAX_ZONES) return zones
  const width = Math.min(3, floor.width)
  const depth = Math.min(1.2, floor.depth)
  const nextY = zones.reduce((y, z) => Math.max(y, z.y + z.depth + 0.6), 0)
  const y = floor.illustrative || nextY + depth <= floor.depth ? nextY : 0
  return [...zones, { name: `Zona ${zones.length + 1}`, x: 0, y: round(y), width, depth, placements: [] }]
}

export function moveZone(zones: LayoutZone[], index: number, x: number, y: number, floor: Floor): LayoutZone[] {
  return zones.map((z, i) => {
    if (i !== index) return z
    const maxX = floor.illustrative ? Infinity : floor.width - z.width
    const maxY = floor.illustrative ? Infinity : floor.depth - z.depth
    return { ...z, x: round(clamp(x, 0, maxX)), y: round(clamp(y, 0, maxY)) }
  })
}

export function removeZone(zones: LayoutZone[], index: number): LayoutZone[] {
  return zones.filter((_, i) => i !== index)
}

function plantFrom(cycle: CycleRef, stage: PlantStage, x: number, y: number, rotation = 0): LayoutPlacement {
  return {
    species_id: cycle.species_id,
    species_name: cycle.species_name,
    crop_cycle_id: cycle.id,
    stage,
    x: round(x),
    y: round(y),
    rotation,
  }
}

export function addPlant(zones: LayoutZone[], zoneIndex: number, cycle: CycleRef, stage: PlantStage): LayoutZone[] {
  if (plantCount(zones) >= MAX_PLACEMENTS) return zones
  return zones.map((z, i) => {
    if (i !== zoneIndex) return z
    const n = z.placements.length
    const perRow = Math.max(1, Math.floor(z.width / FILL_SPACING_M))
    const x = clamp(FILL_SPACING_M / 2 + (n % perRow) * FILL_SPACING_M, 0, z.width)
    const y = clamp(FILL_SPACING_M / 2 + Math.floor(n / perRow) * FILL_SPACING_M, 0, z.depth)
    return { ...z, placements: [...z.placements, plantFrom(cycle, stage, x, y)] }
  })
}

/** Reemplaza las plantas de la zona por una cuadrícula (espaciado de dibujo) sin pasar del máximo. */
export function fillZone(zones: LayoutZone[], zoneIndex: number, cycle: CycleRef, stage: PlantStage): LayoutZone[] {
  const room = MAX_PLACEMENTS - (plantCount(zones) - zones[zoneIndex].placements.length)
  return zones.map((z, i) => {
    if (i !== zoneIndex) return z
    const placements: LayoutPlacement[] = []
    for (let row = 0; FILL_SPACING_M / 2 + row * FILL_SPACING_M <= z.depth && placements.length < room; row++) {
      for (let col = 0; FILL_SPACING_M / 2 + col * FILL_SPACING_M <= z.width && placements.length < room; col++) {
        const x = FILL_SPACING_M / 2 + col * FILL_SPACING_M
        const y = FILL_SPACING_M / 2 + row * FILL_SPACING_M
        placements.push(plantFrom(cycle, stage, x, y, (col * 97 + row * 41) % 360))
      }
    }
    return { ...z, placements }
  })
}

function mapPlant(zones: LayoutZone[], sel: Selection, fn: (p: LayoutPlacement, z: LayoutZone) => LayoutPlacement): LayoutZone[] {
  if (sel.plant === null) return zones
  return zones.map((z, zi) =>
    zi !== sel.zone ? z : { ...z, placements: z.placements.map((p, pi) => (pi === sel.plant ? fn(p, z) : p)) },
  )
}

export function movePlant(zones: LayoutZone[], sel: Selection, x: number, y: number): LayoutZone[] {
  return mapPlant(zones, sel, (p, z) => ({ ...p, x: round(clamp(x, 0, z.width)), y: round(clamp(y, 0, z.depth)) }))
}

/** Clic sobre el piso (coordenadas del piso) → posición relativa a la zona de la planta, limitada a ella. */
export function movePlantToFloor(zones: LayoutZone[], sel: Selection, floorX: number, floorY: number): LayoutZone[] {
  const zone = zones[sel.zone]
  return zone ? movePlant(zones, sel, floorX - zone.x, floorY - zone.y) : zones
}

export function updatePlant(
  zones: LayoutZone[],
  sel: Selection,
  patch: Partial<Pick<LayoutPlacement, 'stage' | 'rotation'>>,
): LayoutZone[] {
  return mapPlant(zones, sel, (p) => ({ ...p, ...patch }))
}

export function removePlant(zones: LayoutZone[], sel: Selection): LayoutZone[] {
  if (sel.plant === null) return zones
  return zones.map((z, zi) => (zi !== sel.zone ? z : { ...z, placements: z.placements.filter((_, pi) => pi !== sel.plant) }))
}

const FOOTPRINT_M = { lettuce: 0.15, tomato: 0.25, basil: 0.1, generic: 0.1 } as const
const STAGE_FACTOR: Record<PlantStage, number> = { seedling: 0.35, vegetative: 0.7, mature: 1 }

/** Radio de dibujo en la vista superior (escala de dibujo, no un dato agronómico). */
export function footprint(speciesName: string, stage: PlantStage): number {
  return FOOTPRINT_M[plantKindFor(speciesName)] * STAGE_FACTOR[stage]
}

/** Instancias para la escena: posición de piso y variante estable por zona y posición (no por id). */
export function instancesFor(zones: LayoutZone[]): PlantInstance[] {
  const out: PlantInstance[] = []
  zones.forEach((z, zi) =>
    z.placements.forEach((p) => {
      out.push({
        index: out.length,
        kind: plantKindFor(p.species_name),
        stage: p.stage,
        variant: variantFor(`${zi}:${p.x.toFixed(2)}:${p.y.toFixed(2)}`),
        x: z.x + p.x,
        z: z.y + p.y,
        rotationDeg: p.rotation,
      })
    }),
  )
  return out
}

export function selectionFromIndex(zones: LayoutZone[], flat: number): Selection | null {
  let start = 0
  for (let zi = 0; zi < zones.length; zi++) {
    const n = zones[zi].placements.length
    if (flat < start + n) return { zone: zi, plant: flat - start }
    start += n
  }
  return null
}

export function indexFromSelection(zones: LayoutZone[], sel: Selection | null): number | null {
  if (!sel || sel.plant === null) return null
  let start = 0
  for (let zi = 0; zi < sel.zone; zi++) start += zones[zi].placements.length
  return start + sel.plant
}

export function selectedPlant(zones: LayoutZone[], sel: Selection | null): LayoutPlacement | null {
  if (!sel || sel.plant === null) return null
  return zones[sel.zone]?.placements[sel.plant] ?? null
}
```

Corrida parcial: `npx vitest run src/features/studio/layout.test.ts` → PASS.

- [ ] **Step 4: Props compartidas y vista superior SVG**

Crear `frontend/src/features/studio/sceneTypes.ts`:

```ts
import type { LayoutZone } from './api'
import type { Floor, Selection } from './layout'

/** Mismas props para la escena 3D y el respaldo 2D. */
export interface StudioSceneProps {
  floor: Floor
  zones: LayoutZone[]
  selection: Selection | null
  editing: boolean
  onSelect: (selection: Selection | null) => void
  /** En modo edición, clic en el piso con una planta seleccionada (metros del piso). */
  onFloorClick: (x: number, y: number) => void
  label: string
  className?: string
}
```

Crear `frontend/src/features/studio/StudioTopView.tsx`:

```tsx
import { MouseEvent } from 'react'
import { cssHex, PLANT_COLORS } from '@/features/three/plants/palette'
import { PLANT_STAGE_LABELS, plantKindFor } from '@/features/three/plants/types'
import { footprint } from './layout'
import type { StudioSceneProps } from './sceneTypes'

const PAD = 0.5

/** Vista superior en SVG (respaldo sin WebGL). Mismas coordenadas que la escena 3D, en metros. */
export function StudioTopView({ floor, zones, selection, editing, onSelect, onFloorClick, label, className = '' }: StudioSceneProps) {
  const toFloor = (e: MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const ctm = svg.getScreenCTM?.()
    if (!ctm || typeof svg.createSVGPoint !== 'function') return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  const onBackground = (e: MouseEvent<SVGSVGElement>) => {
    if (editing && selection?.plant != null) {
      const p = toFloor(e)
      if (p) onFloorClick(p.x, p.y)
      return
    }
    onSelect(null)
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-PAD} ${-PAD} ${floor.width + 2 * PAD} ${floor.depth + 2 * PAD}`}
      preserveAspectRatio="xMidYMid meet"
      className={`h-full w-full ${className}`}
      onClick={onBackground}
    >
      <rect
        x={0}
        y={0}
        width={floor.width}
        height={floor.depth}
        rx={0.08}
        className="fill-surface/60 stroke-border"
        strokeWidth={0.03}
        strokeDasharray={floor.illustrative ? '0.15 0.1' : undefined}
      />
      {zones.map((z, zi) => {
        const zoneSelected = selection?.zone === zi && selection.plant === null
        return (
          <g key={zi}>
            <rect
              role="button"
              aria-label={`Zona ${z.name}`}
              aria-pressed={zoneSelected}
              x={z.x}
              y={z.y}
              width={z.width}
              height={z.depth}
              rx={0.05}
              className={zoneSelected ? 'fill-lime/40 stroke-accent' : 'fill-lime/20 stroke-accent/60'}
              strokeWidth={0.03}
              onClick={(e) => {
                if (editing && selection?.plant != null) return // deja pasar el clic: mover la planta
                e.stopPropagation()
                onSelect({ zone: zi, plant: null })
              }}
            />
            <text x={z.x + 0.08} y={z.y + 0.22} fontSize={0.18} className="pointer-events-none fill-muted">
              {z.name}
            </text>
            {z.placements.map((p, pi) => {
              const selected = selection?.zone === zi && selection.plant === pi
              const choose = () => onSelect({ zone: zi, plant: pi })
              return (
                <circle
                  key={pi}
                  role="button"
                  tabIndex={0}
                  aria-label={`${p.species_name} · ${PLANT_STAGE_LABELS[p.stage]}`}
                  aria-pressed={selected}
                  cx={z.x + p.x}
                  cy={z.y + p.y}
                  r={footprint(p.species_name, p.stage)}
                  fill={cssHex(PLANT_COLORS[plantKindFor(p.species_name)].leaf)}
                  stroke={selected ? '#a6e22e' : 'rgba(0,0,0,0.25)'}
                  strokeWidth={selected ? 0.05 : 0.015}
                  onClick={(e) => {
                    e.stopPropagation()
                    choose()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      choose()
                    }
                  }}
                />
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 5: Escena 3D (chunk perezoso)**

Crear `frontend/src/features/studio/StudioScene.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Callout } from '@/components/ui'
import { isClick } from '@/features/prototypes/pick'
import { buildInstancedPlants, InstancedPlants } from '@/features/three/plants/instancedPlants'
import { getPlantModel } from '@/features/three/plants/model'
import { addPlantLights } from '@/features/three/plants/scene'
import { PLANT_STAGE_LABELS } from '@/features/three/plants/types'
import { useProjectedCallouts } from '@/features/three/useProjectedCallouts'
import { useTheme } from '@/store/theme'
import { footprint, indexFromSelection, instancesFor, selectedPlant, selectionFromIndex } from './layout'
import type { StudioSceneProps } from './sceneTypes'

const BED_HEIGHT = 0.04
const PALETTE = {
  light: { floor: 0xdfe6da, grid: 0xc4d0c0, bed: 0xa6e22e, edge: 0x446a0e },
  dark: { floor: 0x1d231c, grid: 0x2a3229, bed: 0x4f7a12, edge: 0xb9ec5a },
}

interface SceneState {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  content: THREE.Group
  plants: InstancedPlants | null
  zoneMeshes: THREE.Mesh[]
  ring: THREE.Mesh
  disposables: Array<{ dispose(): void }>
}

/** Escena del Studio: piso, zonas como camas y plantas instanciadas. Cargar con LazyStudioScene. */
export default function StudioScene({ floor, zones, selection, editing, onSelect, onFloorClick, label, className = '' }: StudioSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<SceneState | null>(null)
  const framedFor = useRef('')
  const [ready, setReady] = useState(0)
  const [failed, setFailed] = useState(false)
  const theme = useTheme((s) => s.theme)
  const { projected, projector } = useProjectedCallouts()
  // Lo último de React, leído por los manejadores de three sin recrear la escena.
  const latest = useRef({ zones, selection, editing, onSelect, onFloorClick })
  latest.current = { zones, selection, editing, onSelect, onFloorClick }

  // 1) Renderer, cámara, luces, controles y picking: una sola vez.
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.touchAction = 'none'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    addPlantLights(scene)
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2 - 0.05 // no mirar por debajo del piso
    const content = new THREE.Group()
    scene.add(content)
    const ringGeometry = new THREE.RingGeometry(0.85, 1, 40)
    ringGeometry.rotateX(-Math.PI / 2)
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xa6e22e, transparent: true, opacity: 0.9, depthWrite: false })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.visible = false
    scene.add(ring)
    stateRef.current = { scene, camera, controls, content, plants: null, zoneMeshes: [], ring, disposables: [] }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const bedPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BED_HEIGHT)
    let downAt: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => {
      downAt = e.button === 0 ? { x: e.clientX, y: e.clientY } : null
    }
    const onUp = (e: PointerEvent) => {
      const start = downAt
      downAt = null
      const s = stateRef.current
      if (!s || !isClick(start, { x: e.clientX, y: e.clientY })) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const { zones: zs, selection: sel, editing: ed, onSelect: select, onFloorClick: floorClick } = latest.current
      const plantHit = s.plants ? raycaster.intersectObject(s.plants.group, true)[0] : undefined
      if (plantHit && s.plants) {
        const flat = s.plants.pick(plantHit.object, plantHit.instanceId)
        if (flat !== null) return select(selectionFromIndex(zs, flat))
      }
      if (ed && sel?.plant != null) {
        const point = raycaster.ray.intersectPlane(bedPlane, new THREE.Vector3())
        if (point) floorClick(point.x, point.z)
        return
      }
      const zoneHit = raycaster.intersectObjects(s.zoneMeshes, false)[0]
      select(zoneHit ? { zone: zoneHit.object.userData.zoneIndex as number, plant: null } : null)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      projector.invalidate()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      controls.update()
      projector.update(camera, content, mount.clientWidth || 1, mount.clientHeight || 1, performance.now())
      renderer.render(scene, camera)
    }
    tick()
    setReady((n) => n + 1)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      const s = stateRef.current
      s?.plants?.dispose()
      s?.disposables.forEach((d) => d.dispose())
      stateRef.current = null
      framedFor.current = ''
      ringGeometry.dispose()
      ringMaterial.dispose()
      controls.dispose()
      scene.clear()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [projector])

  // 2) Contenido: piso, camas y plantas; se reconstruye cuando cambian el layout o el tema.
  const contentKey = JSON.stringify({ floor, zones })
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    const { floor: f, zones: zs } = JSON.parse(contentKey) as Pick<StudioSceneProps, 'floor' | 'zones'>
    s.plants?.dispose()
    s.plants = null
    s.disposables.forEach((d) => d.dispose())
    s.disposables = []
    s.content.clear()
    s.zoneMeshes = []

    const palette = theme === 'dark' ? PALETTE.dark : PALETTE.light
    const floorGeometry = new THREE.PlaneGeometry(f.width, f.depth)
    floorGeometry.rotateX(-Math.PI / 2)
    floorGeometry.translate(f.width / 2, 0, f.depth / 2)
    const floorMaterial = new THREE.MeshStandardMaterial({ color: palette.floor, roughness: 1 })
    s.content.add(new THREE.Mesh(floorGeometry, floorMaterial))
    const size = Math.max(f.width, f.depth)
    const grid = new THREE.GridHelper(size, Math.max(1, Math.round(size)), palette.grid, palette.grid)
    grid.position.set(size / 2, 0.002, size / 2)
    const gridMaterial = grid.material as THREE.Material
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.5
    s.content.add(grid)
    const bedMaterial = new THREE.MeshStandardMaterial({ color: palette.bed, roughness: 0.9, transparent: true, opacity: 0.55 })
    const edgeMaterial = new THREE.LineBasicMaterial({ color: palette.edge })
    s.disposables.push(floorGeometry, floorMaterial, grid.geometry, gridMaterial, bedMaterial, edgeMaterial)

    zs.forEach((z, zi) => {
      const geometry = new THREE.BoxGeometry(z.width, BED_HEIGHT, z.depth)
      const mesh = new THREE.Mesh(geometry, bedMaterial)
      mesh.position.set(z.x + z.width / 2, BED_HEIGHT / 2, z.y + z.depth / 2)
      mesh.userData.zoneIndex = zi
      const edgesGeometry = new THREE.EdgesGeometry(geometry)
      mesh.add(new THREE.LineSegments(edgesGeometry, edgeMaterial))
      s.content.add(mesh)
      s.zoneMeshes.push(mesh)
      s.disposables.push(geometry, edgesGeometry)
    })

    const plants = buildInstancedPlants(instancesFor(zs))
    plants.group.position.y = BED_HEIGHT
    s.content.add(plants.group)
    s.plants = plants

    // Encuadre solo cuando cambia el tamaño del piso, para no saltar mientras se edita.
    const frameKey = `${f.width}x${f.depth}`
    if (framedFor.current !== frameKey) {
      framedFor.current = frameKey
      const center = new THREE.Vector3(f.width / 2, 0, f.depth / 2)
      const distance = size * 1.1 + 1
      s.camera.position.set(center.x + distance * 0.55, distance * 0.75, center.z + distance * 0.95)
      s.camera.far = distance * 10
      s.camera.updateProjectionMatrix()
      s.controls.target.copy(center)
      s.controls.minDistance = 0.3
      s.controls.maxDistance = distance * 3
      s.controls.update()
    }
    projector.invalidate()
  }, [contentKey, theme, ready, projector])

  // 3) Selección: anillo bajo la planta y callout con especie y etapa.
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    const plant = selectedPlant(zones, selection)
    const flat = indexFromSelection(zones, selection)
    if (!plant || !selection || flat === null) {
      s.ring.visible = false
      projector.setPoints([])
      return
    }
    const instance = instancesFor(zones)[flat]
    const height = getPlantModel(instance.kind, instance.stage, instance.variant).height
    s.ring.position.set(instance.x, BED_HEIGHT + 0.005, instance.z)
    s.ring.scale.setScalar(footprint(plant.species_name, plant.stage) * 1.3)
    s.ring.visible = true
    projector.setPoints([
      {
        key: 'seleccion',
        label: `${plant.species_name} · ${PLANT_STAGE_LABELS[plant.stage]}`,
        index: 1,
        x: instance.x,
        y: BED_HEIGHT + height,
        z: instance.z,
      },
    ])
  }, [zones, selection, ready, projector])

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={mountRef} className="absolute inset-0" role="img" aria-label={label} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {projected.map((c) => (c.hidden ? null : <Callout key={c.key} x={c.x} y={c.y} side={c.side} label={c.label} />))}
      </div>
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
          No se pudo iniciar la escena 3D en este navegador.
        </div>
      )}
      <p className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-muted">
        {editing
          ? 'Clic en una planta para elegirla y luego en su zona para moverla'
          : 'Arrastra para girar · rueda para acercar · clic para seleccionar'}
      </p>
    </div>
  )
}
```

Crear `frontend/src/features/studio/LazyStudioScene.tsx`:

```tsx
import { lazy, Suspense } from 'react'
import type { StudioSceneProps } from './sceneTypes'

// three vive solo en el chunk de StudioScene.
const StudioSceneImpl = lazy(() => import('./StudioScene'))

export function StudioScene(props: StudioSceneProps) {
  return (
    <Suspense
      fallback={
        <div role="status" className="flex h-full w-full items-center justify-center text-xs font-medium text-muted">
          Preparando escena 3D…
        </div>
      }
    >
      <StudioSceneImpl {...props} />
    </Suspense>
  )
}
```

- [ ] **Step 6: Panel lateral**

Crear `frontend/src/features/studio/SidePanel.tsx`:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Field, Input, OriginBadge, Select } from '@/components/ui'
import type { CropCycle } from '@/features/projects/api'
import { CYCLE_STATUS_LABELS } from '@/features/projects/labels'
import { PLANT_STAGE_LABELS, PLANT_STAGES, PlantStage } from '@/features/three/plants/types'
import type { LayoutZone } from './api'
import {
  addPlant,
  addZone,
  FILL_SPACING_M,
  fillZone,
  Floor,
  MAX_PLACEMENTS,
  MAX_ZONES,
  movePlant,
  moveZone,
  plantCount,
  removePlant,
  removeZone,
  selectedPlant,
  Selection,
  updatePlant,
} from './layout'

interface Props {
  zones: LayoutZone[]
  floor: Floor
  selection: Selection | null
  editing: boolean
  cycles: CropCycle[]
  onZones: (zones: LayoutZone[]) => void
  onSelect: (selection: Selection | null) => void
}

function NumberField({ label, value, onChange, step = 0.05 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <Field label={label}>
      {(id) => (
        <Input
          id={id}
          type="number"
          step={step}
          value={value}
          onChange={(e) => {
            if (e.target.value === '') return
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange(n)
          }}
        />
      )}
    </Field>
  )
}

function cycleLabel(c: CropCycle): string {
  return `${c.species_name}${c.cultivar_name ? ` ‘${c.cultivar_name}’` : ''} · ${CYCLE_STATUS_LABELS[c.status] ?? c.status}`
}

export function SidePanel({ zones, floor, selection, editing, cycles, onZones, onSelect }: Props) {
  const [cycleId, setCycleId] = useState(cycles[0]?.id ?? '')
  const [stage, setStage] = useState<PlantStage>('vegetative')
  const plant = selectedPlant(zones, selection)
  const zone = selection ? zones[selection.zone] : undefined
  const cycle = cycles.find((c) => c.id === cycleId)
  const total = plantCount(zones)

  if (plant && selection && zone) {
    const linked = cycles.find((c) => c.id === plant.crop_cycle_id)
    return (
      <Card className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="eyebrow">Planta seleccionada</h2>
          <OriginBadge origin="illustrative" />
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Especie</dt>
            <dd>
              <Link to={`/app/plants/${plant.species_id}`} className="italic hover:text-accent">
                {plant.species_name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Etapa ilustrada</dt>
            <dd>{PLANT_STAGE_LABELS[plant.stage]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Ciclo</dt>
            <dd>
              {linked
                ? `${CYCLE_STATUS_LABELS[linked.status] ?? linked.status} · inicio ${linked.started_on ?? 'sin fecha'}`
                : 'Sin ciclo vinculado'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Posición en {zone.name}</dt>
            <dd className="font-mono">
              {plant.x.toFixed(2)} × {plant.y.toFixed(2)} m
            </dd>
          </div>
        </dl>
        {editing && (
          <div className="space-y-3 border-t border-border pt-4">
            <Field label="Etapa">
              {(id) => (
                <Select
                  id={id}
                  value={plant.stage}
                  onChange={(e) => onZones(updatePlant(zones, selection, { stage: e.target.value as PlantStage }))}
                >
                  {PLANT_STAGES.map((st) => (
                    <option key={st} value={st}>
                      {PLANT_STAGE_LABELS[st]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="X en la zona (m)" value={plant.x} onChange={(x) => onZones(movePlant(zones, selection, x, plant.y))} />
              <NumberField label="Y en la zona (m)" value={plant.y} onChange={(y) => onZones(movePlant(zones, selection, plant.x, y))} />
            </div>
            <NumberField
              label="Rotación (°)"
              step={15}
              value={plant.rotation}
              onChange={(r) => onZones(updatePlant(zones, selection, { rotation: Math.max(-360, Math.min(360, r)) }))}
            />
            <Button
              variant="ghost"
              onClick={() => {
                onZones(removePlant(zones, selection))
                onSelect({ zone: selection.zone, plant: null })
              }}
            >
              Quitar planta
            </Button>
          </div>
        )}
      </Card>
    )
  }

  if (zone && selection) {
    return (
      <Card className="space-y-4 p-5">
        <h2 className="eyebrow">{zone.name}</h2>
        <p className="text-sm">
          <span className="font-mono">
            {zone.width.toFixed(2)} × {zone.depth.toFixed(2)} m
          </span>{' '}
          · {zone.placements.length} {zone.placements.length === 1 ? 'planta' : 'plantas'}
        </p>
        {editing && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="X de la zona (m)" value={zone.x} onChange={(x) => onZones(moveZone(zones, selection.zone, x, zone.y, floor))} />
              <NumberField label="Y de la zona (m)" value={zone.y} onChange={(y) => onZones(moveZone(zones, selection.zone, zone.x, y, floor))} />
            </div>
            {cycles.length === 0 ? (
              <p className="text-sm text-muted">
                Este proyecto no tiene cultivos. Añade uno desde el{' '}
                <Link to="/app/plants" className="text-accent hover:underline">
                  explorador vegetal
                </Link>{' '}
                para colocar plantas.
              </p>
            ) : (
              <>
                <Field label="Cultivo">
                  {(id) => (
                    <Select id={id} value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                      {cycles.map((c) => (
                        <option key={c.id} value={c.id}>
                          {cycleLabel(c)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Etapa ilustrada">
                  {(id) => (
                    <Select id={id} value={stage} onChange={(e) => setStage(e.target.value as PlantStage)}>
                      {PLANT_STAGES.map((st) => (
                        <option key={st} value={st}>
                          {PLANT_STAGE_LABELS[st]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!cycle || total >= MAX_PLACEMENTS}
                    onClick={() => {
                      if (!cycle) return
                      onZones(addPlant(zones, selection.zone, cycle, stage))
                      onSelect({ zone: selection.zone, plant: zone.placements.length })
                    }}
                  >
                    Agregar planta
                  </Button>
                  <Button variant="secondary" disabled={!cycle} onClick={() => cycle && onZones(fillZone(zones, selection.zone, cycle, stage))}>
                    Llenar zona
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  «Llenar zona» dibuja una cuadrícula cada {FILL_SPACING_M * 100} cm; no es una recomendación de marco de plantación.
                </p>
              </>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                onZones(removeZone(zones, selection.zone))
                onSelect(null)
              }}
            >
              Quitar zona
            </Button>
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="eyebrow">Resumen</h2>
      <p className="text-sm">
        {zones.length} {zones.length === 1 ? 'zona' : 'zonas'} · {total} {total === 1 ? 'planta' : 'plantas'}
      </p>
      <p className="text-xs text-muted">
        {floor.illustrative
          ? 'Piso ilustrativo: el proyecto no tiene área registrada.'
          : `Piso de ${floor.width.toFixed(1)} × ${floor.depth.toFixed(1)} m (área del proyecto).`}
      </p>
      <p className="text-sm text-muted">Selecciona una planta o una zona.</p>
      {editing && (
        <Button
          disabled={zones.length >= MAX_ZONES}
          onClick={() => {
            onZones(addZone(zones, floor))
            onSelect({ zone: zones.length, plant: null })
          }}
        >
          Agregar zona
        </Button>
      )}
    </Card>
  )
}
```

- [ ] **Step 7: Página, ruta y entrada en el proyecto**

Crear `frontend/src/features/studio/StudioPage.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import { Button, Card, Empty, ErrorState, Forbidden, Loading, OriginBadge } from '@/components/ui'
import { getProject, ProjectDetail } from '@/features/projects/api'
import { ILLUSTRATIVE_NOTICE } from '@/features/three/plants/types'
import { webglAvailable } from '@/features/three/webgl'
import { useHasRole } from '@/store/auth'
import { getLayout, Layout, LayoutZone, saveLayout } from './api'
import { StudioScene } from './LazyStudioScene'
import { floorFor, movePlantToFloor, Selection } from './layout'
import type { StudioSceneProps } from './sceneTypes'
import { SidePanel } from './SidePanel'
import { StudioTopView } from './StudioTopView'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; code?: number }
  | { status: 'ready'; project: ProjectDetail; layout: Layout }

type Notice = { kind: 'saved' | 'conflict' | 'error'; message: string }

export function StudioPage() {
  const { id = '' } = useParams()
  const canEdit = useHasRole('editor')
  const webgl = useMemo(() => webglAvailable(), [])
  const [state, setState] = useState<State>({ status: 'loading' })
  const [zones, setZones] = useState<LayoutZone[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    setNotice(null)
    return Promise.all([getProject(id), getLayout(id)])
      .then(([project, layout]) => {
        setState({ status: 'ready', project, layout })
        setZones(layout.zones)
        setSelection(null)
        setDirty(false)
      })
      .catch((err) =>
        setState({ status: 'error', message: errorMessage(err, 'No se pudo cargar el Studio'), code: errorStatus(err) }),
      )
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const back = (
    <Link to={`/app/projects/${id}`} className="mb-4 inline-block text-sm text-muted hover:text-fg">
      ← Proyecto
    </Link>
  )

  if (state.status === 'loading') return <>{back}<Loading label="Cargando Studio…" /></>
  if (state.status === 'error') {
    return (
      <>
        {back}
        {state.code === 404 ? (
          <Empty title="Proyecto no encontrado" description="No existe o no pertenece a tu organización activa." />
        ) : state.code === 403 ? (
          <Forbidden />
        ) : (
          <ErrorState message={state.message} onRetry={() => load()} />
        )}
      </>
    )
  }

  const { project, layout } = state
  const floor = floorFor(layout, zones)

  const change = (next: LayoutZone[]) => {
    setZones(next)
    setDirty(true)
    setNotice(null)
  }

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const saved = await saveLayout(id, layout.version, zones)
      setState({ status: 'ready', project, layout: saved })
      setZones(saved.zones)
      setDirty(false)
      setNotice({ kind: 'saved', message: `Layout guardado (versión ${saved.version}).` })
    } catch (err) {
      if (errorStatus(err) === 409) {
        setNotice({ kind: 'conflict', message: 'Otra persona guardó el layout mientras editabas. Tus cambios no se guardaron.' })
      } else {
        setNotice({ kind: 'error', message: errorMessage(err, 'No se pudo guardar el layout') })
      }
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    setZones(layout.zones)
    setSelection(null)
    setDirty(false)
    setNotice(null)
  }

  const sceneProps: StudioSceneProps = {
    floor,
    zones,
    selection,
    editing,
    onSelect: setSelection,
    onFloorClick: (x, y) => {
      if (selection?.plant != null) change(movePlantToFloor(zones, selection, x, y))
    },
    label: `Studio de ${project.name}`,
    className: 'h-full w-full',
  }

  const pill = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${active ? 'bg-ink text-ink-fg' : 'text-muted hover:text-fg'}`

  return (
    <>
      {back}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Studio</p>
          <h1 className="display text-3xl">{project.name}</h1>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Modo" className="glass inline-flex !rounded-full p-1">
              <button type="button" aria-pressed={!editing} className={pill(!editing)} onClick={() => setEditing(false)}>
                Ver
              </button>
              <button type="button" aria-pressed={editing} className={pill(editing)} onClick={() => setEditing(true)}>
                Editar
              </button>
            </div>
            {dirty && (
              <>
                <Button variant="ghost" onClick={discard}>
                  Descartar
                </Button>
                <Button onClick={save} loading={saving}>
                  Guardar layout
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div role="note" className="mb-4 flex flex-wrap items-center gap-3 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-ink-fg">
        <OriginBadge origin="illustrative" />
        {ILLUSTRATIVE_NOTICE}
      </div>

      {notice && (
        <div
          role={notice.kind === 'saved' ? 'status' : 'alert'}
          className={`mb-4 flex flex-wrap items-center gap-3 rounded-2xl p-3 text-sm ${
            notice.kind === 'saved' ? 'bg-accent/15 text-accent' : 'border border-warning/40 bg-warning/10'
          }`}
        >
          <span>{notice.message}</span>
          {notice.kind === 'conflict' && (
            <Button variant="secondary" onClick={() => load()}>
              Cargar versión actual
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="relative h-[60vh] min-h-[360px] overflow-hidden p-0">
          {webgl ? <StudioScene {...sceneProps} /> : <StudioTopView {...sceneProps} />}
          {!webgl && (
            <p className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-muted">
              Vista superior 2D: tu navegador no admite WebGL.
            </p>
          )}
          {zones.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
              {canEdit ? 'Sin zonas todavía. Entra a «Editar» y agrega la primera.' : 'Este proyecto aún no tiene layout.'}
            </div>
          )}
        </Card>
        <SidePanel
          zones={zones}
          floor={floor}
          selection={selection}
          editing={editing && canEdit}
          cycles={project.crop_cycles}
          onZones={change}
          onSelect={setSelection}
        />
      </div>
    </>
  )
}
```

En `frontend/src/App.tsx`, añadir `import { StudioPage } from '@/features/studio/StudioPage'` y, junto a la ruta `projects/:id` (añadir la entrada a la lista de rutas; si V3 ya puso `projects/:id/operations`, dejar ambas):

```tsx
        <Route path="projects/:id/studio" element={<StudioPage />} />
```

En `frontend/src/features/projects/ProjectDetailPage.tsx`, **añadir una entrada "Studio"**:

- **Si V3 ya está en la rama** (el archivo tiene el arreglo de pestañas en píldora con «Operaciones»): agregar al final de ese arreglo la entrada que apunta a `` `/app/projects/${p.id}/studio` `` con etiqueta `'Studio'`, usando los mismos nombres de campo que el arreglo de V3 (p. ej. `{ to: \`/app/projects/${p.id}/studio\`, label: 'Studio' }`). Nada más cambia.
- **Si V3 aún no está:** reemplazar en la cabecera

```tsx
        {canEdit && !editing && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
```

por

```tsx
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/app/projects/${p.id}/studio`}
            className="glass inline-flex items-center !rounded-full px-5 py-2.5 text-sm font-semibold hover:text-accent"
          >
            Studio
          </Link>
          {canEdit && !editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
        </div>
```

(al integrar V3 después, esta píldora se sustituye por la entrada del arreglo de pestañas; la prueba solo exige el enlace).

- [ ] **Step 8: Verificar**

Run (en `frontend/`): `npx vitest run && npx tsc -b && npm run build`
Expected: todo PASS.

```bash
grep -l "WebGLRenderer" dist/assets/index-*.js || echo "OK: three fuera del bundle principal"
```

Expected: `OK: three fuera del bundle principal`.

Prueba manual (API local con Task 4): crear un proyecto con área 60 m², añadir ciclos de lechuga, tomate y albahaca desde el catálogo, abrir `/app/projects/<id>/studio`, Editar → Agregar zona ×3 → en cada zona «Llenar zona» con una especie y etapa distinta → Guardar layout. Expected: la escena muestra ~100 plantas fluidas (≤ 9 `InstancedMesh` de hojas), girar no recalcula geometría, recargar la página reconstruye la misma escena, y en Chrome con `--disable-webgl` aparece la vista superior SVG.

- [ ] **Step 9: Commit**

```bash
git add frontend/src
git commit -m "feat(studio): Studio del proyecto con plantas instanciadas, selección, modo edición, guardado versionado y vista 2D sin WebGL"
```

> **Línea de corte de la demo.** Las Tasks 6–7 (medios con licencia) son opcionales para la demo. Guion sugerido: catálogo (miniaturas) → ficha de lechuga (planta girando, callouts «Desconocido», ILUSTRATIVO) → proyecto → Studio (zonas llenas, seleccionar un tomate maduro con frutos, cambiar etapa en modo edición, guardar).

---

### Task 6: `SpeciesMedia` — subida con licencia (superadmin), `media[]` en la ficha y archivo con caché

> Opcional para la demo (después de la línea de corte).

**Files:**
- Modify: `app/modules/catalog/models.py`
- Modify: `app/modules/catalog/schemas.py`
- Modify: `app/modules/catalog/service.py`
- Create: `app/modules/catalog/media.py`
- Modify: `app/modules/catalog/router.py`
- Modify: `alembic/versions/0006_studio_layout_species_media.py`
- Test: `tests/test_species_media.py`

**Interfaces:**
- Consumes: `receive_upload` y `MAX_IMAGE_BYTES` de `app/modules/prototypes/validation.py` (magic bytes, 15 MB), `KIND_IMAGE`, `get_storage`, `require_superadmin`, `get_context`, `get_species_or_404`; migración `0006` de la Task 4.
- Produces: `SpeciesMedia`, `MEDIA_KINDS`, `MAX_MEDIA_CALLOUTS = 12`, esquemas `MediaCallout`, `SpeciesMediaMeta`, `SpeciesMediaOut`, `SpeciesDetail.media`, `service.active_media`, `service.media_out`, `media.image_dimensions`, `media.parse_meta`, `media.create_media`, `media.delete_media`, `media.get_media_or_404`. Rutas: `POST /api/v1/plants/{id}/media` (multipart: `file`, `kind`, `license`, `attribution`, `source_url`, `is_hero`, `callouts` JSON), `DELETE /api/v1/plants/{id}/media/{mid}`, `GET /api/v1/plants/{id}/media/{mid}/file`. JSON de medio: `{id, species_id, kind, content_type, license, attribution, source_url, is_hero, width, height, callouts: [{trait_variable, x, y}], url, created_at}` con `url` relativa al cliente `api` (`/plants/{id}/media/{mid}/file`).

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/test_species_media.py`:

```python
import json
import struct

import pytest
from sqlalchemy import func, select

from app.modules.audit.models import AuditEvent
from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.media import image_dimensions
from app.modules.catalog.models import Species, SpeciesMedia
from app.modules.prototypes import validation
from tests.conftest import login_headers, make_member
from tests.test_prototypes import binary_stl

API = "/api/v1"
PNG_640 = (
    b"\x89PNG\r\n\x1a\n"
    + struct.pack(">I", 13)
    + b"IHDR"
    + struct.pack(">II", 640, 480)
    + b"\x08\x02\x00\x00\x00"
    + b"\x00" * 64
)


@pytest.fixture
def lettuce(db):
    catalog_seed.seed(db)
    db.commit()
    return db.scalar(select(Species).where(Species.scientific_name == "Lactuca sativa L.")).id


@pytest.fixture
def root(db, client, tenants):
    make_member(db, "alfa", "root@alfa.test", "viewer", superadmin=True)
    return login_headers(client, "root@alfa.test", tenants["alfa_org"].id)


def meta(**extra):
    return {"license": "CC BY 4.0", "attribution": "Ana Pérez", "source_url": "https://example.org/foto", "kind": "photo", **extra}


def upload(client, headers, species_id, content=PNG_640, filename="lechuga.png", **form):
    data = {k: (str(v).lower() if isinstance(v, bool) else v) for k, v in {**meta(), **form}.items()}
    return client.post(
        f"{API}/plants/{species_id}/media",
        files={"file": (filename, content, "application/octet-stream")},
        data=data,
        headers=headers,
    )


def test_superadmin_uploads_and_detail_lists_media(client, tenants, root, lettuce, db):
    callouts = [{"trait_variable": "ph", "x": 0.25, "y": 0.75}]
    res = upload(client, root, lettuce, callouts=json.dumps(callouts))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["license"] == "CC BY 4.0" and body["attribution"] == "Ana Pérez"
    assert body["source_url"] == "https://example.org/foto" and body["kind"] == "photo"
    assert (body["width"], body["height"]) == (640, 480)
    assert body["is_hero"] is True  # primera imagen de la especie
    assert body["callouts"] == callouts
    assert body["url"] == f"/plants/{lettuce}/media/{body['id']}/file"

    detail = client.get(f"{API}/plants/{lettuce}", headers=tenants["beta_viewer"])
    assert detail.status_code == 200
    assert [m["id"] for m in detail.json()["media"]] == [body["id"]]
    assert "storage_key" not in detail.text and "checksum" not in detail.text

    event = db.scalar(select(AuditEvent).where(AuditEvent.resource_type == "species_media"))
    assert event.operation == "create" and event.organization_id is None and event.actor_id is not None


@pytest.mark.parametrize("field,value", [("license", ""), ("license", "   "), ("attribution", ""), ("attribution", "  ")])
def test_license_and_attribution_are_required(client, root, lettuce, db, tmp_path, field, value):
    res = upload(client, root, lettuce, **{field: value})
    assert res.status_code == 422
    assert res.json()["error"]["details"]["field"] == field
    assert db.scalar(select(func.count()).select_from(SpeciesMedia)) == 0
    assert not any(p.is_file() for p in (tmp_path / "storage").rglob("*"))


def test_only_superadmin_writes(client, tenants, root, lettuce):
    assert upload(client, tenants["alfa_admin"], lettuce).status_code == 403
    media_id = upload(client, root, lettuce).json()["id"]
    assert client.delete(f"{API}/plants/{lettuce}/media/{media_id}", headers=tenants["alfa_admin"]).status_code == 403
    anonymous = client.post(f"{API}/plants/{lettuce}/media", files={"file": ("a.png", PNG_640)}, data=meta())
    assert anonymous.status_code == 401


@pytest.mark.parametrize(
    "content,filename",
    [(binary_stl(), "modelo.stl"), (b"no soy una imagen", "falsa.png"), (b"", "vacia.png"), (PNG_640, "foto.gif")],
)
def test_rejects_non_images(client, root, lettuce, content, filename):
    assert upload(client, root, lettuce, content=content, filename=filename).status_code == 422


def test_rejects_oversize(client, root, lettuce, monkeypatch):
    monkeypatch.setattr(validation, "MAX_IMAGE_BYTES", 32)
    res = upload(client, root, lettuce)
    assert res.status_code == 422
    assert res.json()["error"]["details"]["max_bytes"] == 32


@pytest.mark.parametrize(
    "callouts",
    [
        '[{"trait_variable": "ph", "x": 1.5, "y": 0.2}]',
        '[{"trait_variable": "ph", "x": -0.1, "y": 0.2}]',
        '[{"trait_variable": "", "x": 0.1, "y": 0.2}]',
        '{"no": "lista"}',
        "no es json",
        json.dumps([{"trait_variable": "ph", "x": 0.1, "y": 0.1}] * 13),
    ],
)
def test_callouts_validated(client, root, lettuce, callouts):
    res = upload(client, root, lettuce, callouts=callouts)
    assert res.status_code == 422
    assert res.json()["error"]["details"]["field"] == "callouts"


def test_source_url_must_be_http(client, root, lettuce):
    res = upload(client, root, lettuce, source_url="javascript:alert(1)")
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "source_url"
    assert upload(client, root, lettuce, source_url="").json()["source_url"] is None


def test_new_hero_replaces_previous(client, tenants, root, lettuce):
    first = upload(client, root, lettuce).json()
    second = upload(client, root, lettuce, is_hero=False).json()
    assert second["is_hero"] is False
    third = upload(client, root, lettuce, is_hero=True, kind="render").json()
    media = client.get(f"{API}/plants/{lettuce}", headers=tenants["alfa_viewer"]).json()["media"]
    assert [m["id"] for m in media] == [third["id"], first["id"], second["id"]]
    assert [m["is_hero"] for m in media] == [True, False, False]


def test_file_streams_with_private_cache_and_etag(client, tenants, root, lettuce):
    body = upload(client, root, lettuce).json()
    url = f"{API}/plants/{lettuce}/media/{body['id']}/file"
    res = client.get(url, headers=tenants["beta_viewer"])
    assert res.status_code == 200 and res.content == PNG_640
    assert res.headers["content-type"] == "image/png"
    assert res.headers["cache-control"] == "private, max-age=86400"
    assert res.headers["x-content-type-options"] == "nosniff"
    again = client.get(url, headers={**tenants["beta_viewer"], "If-None-Match": res.headers["etag"]})
    assert again.status_code == 304 and again.content == b""
    assert client.get(url).status_code == 401
    missing = client.get(f"{API}/plants/{lettuce}/media/no-existe/file", headers=tenants["beta_viewer"])
    assert missing.status_code == 404


def test_delete_soft_deletes_and_hides(client, tenants, root, lettuce, db):
    body = upload(client, root, lettuce).json()
    assert client.delete(f"{API}/plants/{lettuce}/media/{body['id']}", headers=root).status_code == 204
    assert client.get(f"{API}/plants/{lettuce}", headers=tenants["alfa_viewer"]).json()["media"] == []
    assert client.get(f"{API}/plants/{lettuce}/media/{body['id']}/file", headers=tenants["alfa_viewer"]).status_code == 404
    assert db.get(SpeciesMedia, body["id"]).deleted_at is not None
    assert client.delete(f"{API}/plants/{lettuce}/media/{body['id']}", headers=root).status_code == 404


def test_media_of_other_species_is_404(client, tenants, root, lettuce, db):
    basil = db.scalar(select(Species).where(Species.scientific_name == "Ocimum basilicum L.")).id
    body = upload(client, root, lettuce).json()
    assert client.get(f"{API}/plants/{basil}/media/{body['id']}/file", headers=tenants["alfa_viewer"]).status_code == 404
    assert client.delete(f"{API}/plants/{basil}/media/{body['id']}", headers=root).status_code == 404


def test_image_dimensions():
    jpeg = (
        b"\xff\xd8"
        + b"\xff\xe0"
        + struct.pack(">H", 16)
        + b"\x00" * 14
        + b"\xff\xc0"
        + struct.pack(">HBHH", 17, 8, 300, 400)
        + b"\x00" * 16
    )
    webp = (
        b"RIFF\x00\x00\x00\x00WEBPVP8X"
        + struct.pack("<I", 10)
        + b"\x00" * 4
        + (799).to_bytes(3, "little")
        + (599).to_bytes(3, "little")
    )
    assert image_dimensions(PNG_640, "png") == (640, 480)
    assert image_dimensions(jpeg, "jpeg") == (400, 300)
    assert image_dimensions(webp, "webp") == (800, 600)
    assert image_dimensions(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, "png") is None
    assert image_dimensions(b"\xff\xd8\xff", "jpeg") is None
```

- [ ] **Step 2: Verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_species_media.py -q -p no:warnings`
Expected: FAIL (`ImportError: cannot import name 'image_dimensions'`).

- [ ] **Step 3: Modelo y migración**

En `app/modules/catalog/models.py`, cambiar la importación de sqlalchemy a:

```python
from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
```

y añadir al final:

```python
MEDIA_KINDS = ("photo", "render")
MAX_MEDIA_CALLOUTS = 12


class SpeciesMedia(UUIDMixin, AuditMixin, Base):
    """Imagen global de una especie. La sube un superadmin con licencia verificada; nunca se descarga sola."""

    __tablename__ = "species_media"

    species_id: Mapped[str] = mapped_column(String(36), ForeignKey("species.id"), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="photo")
    license: Mapped[str] = mapped_column(String(120), nullable=False)
    attribution: Mapped[str] = mapped_column(String(300), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_hero: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # [{"trait_variable": "ph", "x": 0.25, "y": 0.75}] con x, y en 0..1 sobre la imagen
    callouts: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
```

En `alembic/versions/0006_studio_layout_species_media.py`, añadir al final de `upgrade()`:

```python
    op.create_table(
        "species_media",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("species_id", sa.String(36), sa.ForeignKey("species.id"), nullable=False, index=True),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("license", sa.String(120), nullable=False),
        sa.Column("attribution", sa.String(300), nullable=False),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("is_hero", sa.Boolean(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("callouts", sa.JSON(), nullable=False),
        *_timestamps(),
    )
```

y al inicio de `downgrade()`:

```python
    op.drop_table("species_media")
```

- [ ] **Step 4: Esquemas**

En `app/modules/catalog/schemas.py`, cambiar la importación a:

```python
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator
```

Añadir antes de `class SpeciesDetail`:

```python
class MediaCallout(BaseModel):
    trait_variable: str = Field(min_length=1, max_length=60)
    x: float = Field(ge=0, le=1, allow_inf_nan=False)
    y: float = Field(ge=0, le=1, allow_inf_nan=False)

    @field_validator("trait_variable")
    @classmethod
    def _variable(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("La variable del callout es obligatoria")
        return v


class SpeciesMediaMeta(BaseModel):
    kind: Literal["photo", "render"] = "photo"
    license: str = Field(default="", max_length=120)
    attribution: str = Field(default="", max_length=300)
    source_url: str | None = Field(default=None, max_length=500)
    is_hero: bool = False
    callouts: list[MediaCallout] = Field(default_factory=list, max_length=12)

    @field_validator("license")
    @classmethod
    def _license(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("La licencia es obligatoria (identificador SPDX o nombre)")
        return v

    @field_validator("attribution")
    @classmethod
    def _attribution(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("La atribución es obligatoria")
        return v

    @field_validator("source_url")
    @classmethod
    def _source_url(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        if not v:
            return None
        if not v.startswith(("https://", "http://")):
            raise ValueError("La URL de la fuente debe empezar con http:// o https://")
        return v


class SpeciesMediaOut(BaseModel):
    id: str
    species_id: str
    kind: str
    content_type: str
    license: str
    attribution: str
    source_url: str | None
    is_hero: bool
    width: int | None
    height: int | None
    callouts: list[MediaCallout]
    url: str
    created_at: datetime
```

Y en `SpeciesDetail` añadir el campo:

```python
    media: list[SpeciesMediaOut] = []
```

- [ ] **Step 5: Servicio — `media[]` en la ficha**

En `app/modules/catalog/service.py`, cambiar las importaciones de modelos y esquemas a:

```python
from app.modules.catalog.models import SUBJECT_CULTIVAR, SUBJECT_SPECIES, Source, Species, SpeciesMedia, TraitAssertion
from app.modules.catalog.schemas import SourceOut, SpeciesDetail, SpeciesMediaOut, TraitAssertionOut
```

Añadir antes de `species_detail`:

```python
def active_media(db: Session, species_id: str) -> list[SpeciesMedia]:
    stmt = (
        select(SpeciesMedia)
        .where(SpeciesMedia.species_id == species_id, SpeciesMedia.deleted_at.is_(None))
        .order_by(SpeciesMedia.is_hero.desc(), SpeciesMedia.created_at)
    )
    return list(db.scalars(stmt))


def media_out(media: SpeciesMedia) -> SpeciesMediaOut:
    """Sin storage_key ni checksum; la URL es relativa al cliente de la API."""
    return SpeciesMediaOut(
        id=media.id,
        species_id=media.species_id,
        kind=media.kind,
        content_type=media.content_type,
        license=media.license,
        attribution=media.attribution,
        source_url=media.source_url,
        is_hero=media.is_hero,
        width=media.width,
        height=media.height,
        callouts=media.callouts or [],
        url=f"/plants/{media.species_id}/media/{media.id}/file",
        created_at=media.created_at,
    )
```

Y en el `return SpeciesDetail(...)` de `species_detail`, añadir el argumento:

```python
        media=[media_out(m) for m in active_media(db, species.id)],
```

- [ ] **Step 6: Subida, dimensiones y borrado**

Crear `app/modules/catalog/media.py`:

```python
"""Medios globales de especie: subida solo superadmin, licencia y atribución obligatorias, sin descargas automáticas."""
import json
import logging
import struct
from typing import BinaryIO

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.errors import not_found, unprocessable
from app.core.mixins import new_id, utcnow
from app.core.storage import get_storage
from app.modules.audit.models import AuditEvent
from app.modules.catalog.models import SpeciesMedia
from app.modules.catalog.schemas import SpeciesMediaMeta
from app.modules.catalog.service import active_media, get_species_or_404
from app.modules.identity.models import User
from app.modules.prototypes.models import KIND_IMAGE
from app.modules.prototypes.validation import receive_upload

log = logging.getLogger(__name__)

RESOURCE = "species_media"
HEAD_BYTES = 64 * 1024
JPEG_SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def image_dimensions(head: bytes, fmt: str) -> tuple[int, int] | None:
    """(ancho, alto) leídos de la cabecera con stdlib; None si no se pueden leer."""
    width = height = 0
    try:
        if fmt == "png":
            if head[12:16] != b"IHDR":
                return None
            width, height = struct.unpack(">II", head[16:24])
        elif fmt == "jpeg":
            i = 2
            while i + 9 <= len(head):
                if head[i] != 0xFF:
                    return None
                marker = head[i + 1]
                if marker in JPEG_SOF:
                    height, width = struct.unpack(">HH", head[i + 5 : i + 9])
                    break
                (length,) = struct.unpack(">H", head[i + 2 : i + 4])
                i += 2 + length
        elif fmt == "webp":
            chunk = head[12:16]
            if chunk == b"VP8X":
                width = 1 + int.from_bytes(head[24:27], "little")
                height = 1 + int.from_bytes(head[27:30], "little")
            elif chunk == b"VP8 ":
                width = struct.unpack("<H", head[26:28])[0] & 0x3FFF
                height = struct.unpack("<H", head[28:30])[0] & 0x3FFF
            elif chunk == b"VP8L":
                bits = int.from_bytes(head[21:25], "little")
                width = (bits & 0x3FFF) + 1
                height = ((bits >> 14) & 0x3FFF) + 1
            else:
                return None
        else:
            return None
    except (struct.error, IndexError):
        return None
    return (width, height) if width > 0 and height > 0 else None


def parse_meta(kind: str, license: str, attribution: str, source_url: str, is_hero: bool, callouts: str) -> SpeciesMediaMeta:
    """Valida los campos del formulario antes de leer el archivo: sin licencia o atribución no se guarda nada."""
    try:
        raw_callouts = json.loads(callouts or "[]")
    except json.JSONDecodeError:
        raise unprocessable("Los callouts deben ser JSON válido", {"field": "callouts"}) from None
    try:
        return SpeciesMediaMeta(
            kind=kind,
            license=license,
            attribution=attribution,
            source_url=source_url or None,
            is_hero=is_hero,
            callouts=raw_callouts,
        )
    except ValidationError as exc:
        errors = exc.errors()
        first = errors[0]
        field = str(first["loc"][0]) if first.get("loc") else "file"
        message = str(first.get("msg", "Datos inválidos")).removeprefix("Value error, ")
        raise unprocessable(
            message, {"field": field, "errors": [{"loc": list(e["loc"]), "msg": e["msg"]} for e in errors]}
        ) from None


def _audit(db: Session, user: User, media_id: str, operation: str, data: dict) -> None:
    # Recurso global: sin organización (no aparece en la actividad de ningún tenant).
    db.add(
        AuditEvent(
            organization_id=None,
            actor_id=user.id,
            resource_type=RESOURCE,
            resource_id=media_id,
            operation=operation,
            data=data,
        )
    )


def get_media_or_404(db: Session, species_id: str, media_id: str) -> SpeciesMedia:
    media = db.get(SpeciesMedia, media_id)
    if media is None or media.deleted_at is not None or media.species_id != species_id:
        raise not_found("medio")
    return media


def create_media(
    db: Session, user: User, species_id: str, src: BinaryIO, filename: str | None, meta: SpeciesMediaMeta
) -> SpeciesMedia:
    species = get_species_or_404(db, species_id)
    validated = receive_upload(src, filename, KIND_IMAGE)  # misma validación que prototipos: firma y 15 MB
    try:
        dims = image_dimensions(validated.file.read(HEAD_BYTES), validated.fmt)
        validated.file.seek(0)
        media_id = new_id()
        key = f"species/{species.id}/{media_id}.{validated.extension}"
        existing = active_media(db, species.id)
        media = SpeciesMedia(
            id=media_id,
            species_id=species.id,
            storage_key=key,
            filename=validated.filename,
            content_type=validated.content_type,
            size_bytes=validated.size_bytes,
            checksum_sha256=validated.checksum_sha256,
            kind=meta.kind,
            license=meta.license,
            attribution=meta.attribution,
            source_url=meta.source_url,
            # La primera imagen de la especie es héroe aunque no se marque.
            is_hero=meta.is_hero or not any(m.is_hero for m in existing),
            width=dims[0] if dims else None,
            height=dims[1] if dims else None,
            callouts=[c.model_dump() for c in meta.callouts],
        )
        get_storage().put(key, validated.file, validated.content_type)
    finally:
        validated.file.close()
    try:
        if media.is_hero:
            for other in existing:
                other.is_hero = False
        db.add(media)
        _audit(
            db,
            user,
            media.id,
            "create",
            {"species_id": species.id, "license": media.license, "attribution": media.attribution, "filename": media.filename},
        )
        db.commit()
    except Exception:
        db.rollback()
        get_storage().delete(key)
        raise
    return media


def delete_media(db: Session, user: User, species_id: str, media_id: str) -> None:
    media = get_media_or_404(db, species_id, media_id)
    media.deleted_at = utcnow()
    _audit(db, user, media.id, "delete", {"species_id": species_id, "filename": media.filename})
    db.commit()
    try:
        get_storage().delete(media.storage_key)
    except Exception:  # el registro ya quedó borrado; un huérfano en storage no debe romper la respuesta
        log.exception("No se pudo borrar el objeto %s", media.storage_key)
```

- [ ] **Step 7: Rutas**

En `app/modules/catalog/router.py`, reemplazar las importaciones por:

```python
from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context, require_superadmin
from app.core.storage import get_storage
from app.modules.catalog import media, service
from app.modules.catalog.schemas import Page, SourceOut, SpeciesDetail, SpeciesMediaOut, SpeciesSummary
from app.modules.identity.models import User
```

y añadir después de `get_plant`:

```python
@router.post("/plants/{species_id}/media", response_model=SpeciesMediaOut, status_code=201)
def upload_media(
    species_id: str,
    file: UploadFile = File(...),
    kind: str = Form(default="photo"),
    license: str = Form(default=""),
    attribution: str = Form(default=""),
    source_url: str = Form(default=""),
    is_hero: bool = Form(default=False),
    callouts: str = Form(default="[]"),
    user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    meta = media.parse_meta(kind, license, attribution, source_url, is_hero, callouts)
    return service.media_out(media.create_media(db, user, species_id, file.file, file.filename, meta))


@router.delete("/plants/{species_id}/media/{media_id}", status_code=204)
def delete_media(
    species_id: str, media_id: str, user: User = Depends(require_superadmin), db: Session = Depends(get_db)
):
    media.delete_media(db, user, species_id, media_id)
    return Response(status_code=204)


@router.get("/plants/{species_id}/media/{media_id}/file")
def media_file(
    species_id: str,
    media_id: str,
    request: Request,
    _: RequestContext = Depends(get_context),
    db: Session = Depends(get_db),
):
    item = media.get_media_or_404(db, species_id, media_id)
    etag = f'"{item.checksum_sha256}"'
    headers = {"Cache-Control": "private, max-age=86400", "ETag": etag, "X-Content-Type-Options": "nosniff"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    headers["Content-Length"] = str(item.size_bytes)
    headers["Content-Disposition"] = f'inline; filename="{item.filename}"'
    return StreamingResponse(get_storage().open(item.storage_key), media_type=item.content_type, headers=headers)
```

- [ ] **Step 8: Correr pruebas**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_species_media.py -q -p no:warnings` → PASS. Luego la suite completa → todo PASS (`test_catalog.py` sigue igual: `media` es `[]` en las fichas del seed).

- [ ] **Step 9: Migración en Postgres 17**

Repetir el Step 9 de la Task 4 (mismos comandos, requiere `0005`). Expected: "No new upgrade operations detected."; `downgrade 0005` elimina `species_media`, `studio_placements`, `studio_zones` y `projects.layout_version`.

- [ ] **Step 10: Commit**

```bash
git add app alembic/versions/0006_studio_layout_species_media.py tests/test_species_media.py
git commit -m "feat(catalog): medios de especie con licencia y atribución obligatorias, solo superadmin, media[] en la ficha y archivo con ETag"
```

---

### Task 7: Ficha con imagen héroe, crédito visible, callouts 2D y panel de medios

> Opcional para la demo.

**Files:**
- Modify: `frontend/src/features/catalog/api.ts`
- Create: `frontend/src/features/catalog/mediaPoint.ts`
- Create: `frontend/src/features/catalog/SpeciesHero.tsx`
- Create: `frontend/src/features/catalog/MediaAdmin.tsx`
- Modify: `frontend/src/features/catalog/PlantDetailPage.tsx`
- Modify: `frontend/src/features/catalog/catalog.test.tsx`
- Test: `frontend/src/features/catalog/media.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`PlantIllustration`, `traitCallout`), Task 6 (API de medios), `AuthedImage` de `features/prototypes/shared`, `Callout`, `OriginBadge`.
- Produces: `MediaCallout`, `SpeciesMedia`, `MediaUploadInput`, `SpeciesDetail.media`, `uploadSpeciesMedia(speciesId, input)`, `deleteSpeciesMedia(speciesId, mediaId)`, `relativePoint(clientX, clientY, rect)`, `SpeciesHero({ species, media })`, `MediaAdmin({ species, onChanged })`.

- [ ] **Step 1: Pruebas que fallan**

Crear `frontend/src/features/catalog/media.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/store/auth'
import * as api from './api'
import { relativePoint } from './mediaPoint'
import { PlantDetailPage } from './PlantDetailPage'

vi.mock('./api', () => ({
  listPlants: vi.fn(),
  listFamilies: vi.fn(),
  getPlant: vi.fn(),
  getSource: vi.fn(),
  uploadSpeciesMedia: vi.fn(),
  deleteSpeciesMedia: vi.fn(),
}))
vi.mock('@/features/prototypes/shared', () => ({
  AuthedImage: ({ alt, className }: { alt: string; className?: string }) => <img alt={alt} className={className} />,
}))
vi.mock('@/features/three/plants/LazyPlantViewer', () => ({
  PlantViewer: () => <div data-testid="plant-viewer" />,
}))

const mocked = vi.mocked(api)

function setUser(superadmin: boolean) {
  const org = { id: 'o1', name: 'Alfa', slug: 'alfa' }
  useAuth.setState({
    token: 't',
    organizationId: 'o1',
    user: { id: 'u1', email: 'a@a.test', full_name: 'A', is_superadmin: superadmin },
    memberships: [{ organization: org, role: 'viewer' }],
  })
}

function assertion(variable: string, extra: Partial<api.TraitAssertion> = {}): api.TraitAssertion {
  return {
    id: `a-${variable}`,
    subject_type: 'species',
    subject_id: 's1',
    variable,
    value_min: null,
    value_max: null,
    unit: null,
    growth_stage: 'unknown',
    cultivation_system: 'unknown',
    origin: 'missing',
    review_status: 'unreviewed',
    evidence_refs: [],
    notes: null,
    sources: [],
    ...extra,
  }
}

const hero: api.SpeciesMedia = {
  id: 'm1',
  species_id: 's1',
  kind: 'photo',
  content_type: 'image/png',
  license: 'CC BY 4.0',
  attribution: 'Ana Pérez',
  source_url: 'https://example.org/foto',
  is_hero: true,
  width: 640,
  height: 480,
  callouts: [
    { trait_variable: 'ph', x: 0.2, y: 0.3 },
    { trait_variable: 'air_temperature', x: 0.8, y: 0.5 },
  ],
  url: '/plants/s1/media/m1/file',
  created_at: '2026-10-20T00:00:00Z',
}

const species: api.SpeciesDetail = {
  id: 's1',
  scientific_name: 'Lactuca sativa L.',
  authorship: 'L.',
  family: 'Asteraceae',
  common_names: [{ lang: 'es', name: 'lechuga' }],
  summary: null,
  external_ids: null,
  cultivars: [],
  sources: [],
  trait_assertions: [
    assertion('ph', { unit: '[pH]' }),
    assertion('air_temperature', { value_min: 18, value_max: 24, unit: 'Cel', origin: 'sourced' }),
  ],
  media: [hero],
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/app/plants/s1']}>
      <Routes>
        <Route path="/app/plants/:id" element={<PlantDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setUser(false)
})

describe('héroe con imagen', () => {
  it('muestra la imagen, el crédito y callouts con valor u «Desconocido» y su origen', async () => {
    mocked.getPlant.mockResolvedValue(species)
    renderDetail()
    expect(await screen.findByRole('img', { name: 'Imagen de Lactuca sativa L.' })).toBeInTheDocument()
    const credit = screen.getByText(/Ana Pérez/).closest('figcaption')!
    expect(credit).toHaveTextContent('Foto: Ana Pérez · Licencia CC BY 4.0 · Fuente')
    expect(within(credit).getByRole('link', { name: 'Fuente' })).toHaveAttribute('href', 'https://example.org/foto')
    const callouts = screen.getAllByTestId('media-callout')
    expect(callouts).toHaveLength(2)
    expect(callouts[0].style.left).toBe('20%')
    expect(callouts[0].style.top).toBe('30%')
    expect(callouts[0]).toHaveTextContent('pH: Desconocido')
    expect(within(callouts[0]).getByText('Desconocido', { selector: 'span.inline-flex' })).toBeInTheDocument()
    expect(callouts[1]).toHaveTextContent('Temperatura del aire: 18 – 24 °C')
    expect(within(callouts[1]).getByText('Fuente')).toBeInTheDocument()
    expect(screen.queryByTestId('plant-viewer')).toBeNull()
  })

  it('sin imagen héroe vuelve a la planta 3D ilustrativa', async () => {
    mocked.getPlant.mockResolvedValue({ ...species, media: [{ ...hero, is_hero: false }] })
    renderDetail()
    expect(await screen.findByTestId('plant-viewer')).toBeInTheDocument()
    expect(screen.queryAllByTestId('media-callout')).toHaveLength(0)
  })
})

describe('panel de medios', () => {
  it('solo el superadmin lo ve', async () => {
    mocked.getPlant.mockResolvedValue(species)
    renderDetail()
    await screen.findByRole('img', { name: 'Imagen de Lactuca sativa L.' })
    expect(screen.queryByRole('form', { name: 'Subir medio' })).toBeNull()
  })

  it('el superadmin sube una imagen con licencia y atribución', async () => {
    setUser(true)
    mocked.getPlant.mockResolvedValue({ ...species, media: [] })
    mocked.uploadSpeciesMedia.mockResolvedValue(hero)
    renderDetail()
    const form = await screen.findByRole('form', { name: 'Subir medio' })
    const file = new File(['png'], 'lechuga.png', { type: 'image/png' })
    fireEvent.change(within(form).getByLabelText('Imagen'), { target: { files: [file] } })
    fireEvent.change(within(form).getByLabelText('Licencia (SPDX o nombre)'), { target: { value: 'CC BY 4.0' } })
    fireEvent.change(within(form).getByLabelText('Atribución'), { target: { value: 'Ana Pérez' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Subir imagen' }))
    await waitFor(() =>
      expect(mocked.uploadSpeciesMedia).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ file, license: 'CC BY 4.0', attribution: 'Ana Pérez', is_hero: true, callouts: [] }),
      ),
    )
    await waitFor(() => expect(mocked.getPlant).toHaveBeenCalledTimes(2))
  })

  it('borrar pide confirmación', async () => {
    setUser(true)
    mocked.getPlant.mockResolvedValue(species)
    mocked.deleteSpeciesMedia.mockResolvedValue(undefined)
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }))
    expect(mocked.deleteSpeciesMedia).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }))
    await waitFor(() => expect(mocked.deleteSpeciesMedia).toHaveBeenCalledWith('s1', 'm1'))
  })
})

describe('relativePoint', () => {
  it('convierte el clic a 0..1 sobre la imagen y lo limita', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 }
    expect(relativePoint(150, 75, rect)).toEqual({ x: 0.25, y: 0.25 })
    expect(relativePoint(500, 0, rect)).toEqual({ x: 1, y: 0 })
    expect(relativePoint(150, 75, { ...rect, width: 0 })).toBeNull()
  })
})
```

En `frontend/src/features/catalog/catalog.test.tsx`: añadir `uploadSpeciesMedia: vi.fn(), deleteSpeciesMedia: vi.fn(),` al `vi.mock('./api', …)` y `media: [],` al objeto `detail`.

Run (en `frontend/`): `npx vitest run src/features/catalog` → FAIL.

- [ ] **Step 2: API cliente y helper**

En `frontend/src/features/catalog/api.ts`, añadir antes de `export interface SpeciesDetail`:

```ts
export interface MediaCallout {
  trait_variable: string
  /** 0..1 sobre el ancho de la imagen. */
  x: number
  /** 0..1 sobre el alto de la imagen. */
  y: number
}

export interface SpeciesMedia {
  id: string
  species_id: string
  kind: 'photo' | 'render'
  content_type: string
  license: string
  attribution: string
  source_url: string | null
  is_hero: boolean
  width: number | null
  height: number | null
  callouts: MediaCallout[]
  /** Ruta relativa al cliente `api` (requiere sesión). */
  url: string
  created_at: string
}

export interface MediaUploadInput {
  file: File
  kind: 'photo' | 'render'
  license: string
  attribution: string
  source_url: string
  is_hero: boolean
  callouts: MediaCallout[]
}
```

añadir `media: SpeciesMedia[]` a `SpeciesDetail`, y al final:

```ts
export async function uploadSpeciesMedia(speciesId: string, input: MediaUploadInput): Promise<SpeciesMedia> {
  const form = new FormData()
  form.append('file', input.file)
  form.append('kind', input.kind)
  form.append('license', input.license)
  form.append('attribution', input.attribution)
  form.append('source_url', input.source_url)
  form.append('is_hero', String(input.is_hero))
  form.append('callouts', JSON.stringify(input.callouts))
  const res = await api.post<SpeciesMedia>(`/plants/${encodeURIComponent(speciesId)}/media`, form)
  return res.data
}

export async function deleteSpeciesMedia(speciesId: string, mediaId: string): Promise<void> {
  await api.delete(`/plants/${encodeURIComponent(speciesId)}/media/${encodeURIComponent(mediaId)}`)
}
```

Crear `frontend/src/features/catalog/mediaPoint.ts`:

```ts
/** Clic en pantalla → posición relativa (0..1, 3 decimales) sobre el rectángulo de la imagen. */
export function relativePoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  const r = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000
  return { x: r((clientX - rect.left) / rect.width), y: r((clientY - rect.top) / rect.height) }
}
```

- [ ] **Step 3: Héroe con imagen**

Crear `frontend/src/features/catalog/SpeciesHero.tsx`:

```tsx
import { Callout, OriginBadge } from '@/components/ui'
import { AuthedImage } from '@/features/prototypes/shared'
import type { SpeciesDetail, SpeciesMedia } from './api'
import { traitCallout } from './traitCallouts'

/** Imagen héroe con crédito visible y callouts 2D en posiciones relativas (0..1). */
export function SpeciesHero({ species, media }: { species: SpeciesDetail; media: SpeciesMedia }) {
  return (
    <figure>
      <div className="relative overflow-hidden rounded-[22px]">
        <AuthedImage
          path={media.url}
          alt={`Imagen de ${species.scientific_name}`}
          className="block aspect-[4/3] w-full object-cover"
        />
        {media.callouts.map((c, i) => {
          const t = traitCallout(species.trait_assertions, c.trait_variable)
          return (
            <div
              key={`${c.trait_variable}-${i}`}
              data-testid="media-callout"
              className="absolute"
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
            >
              <Callout x={0} y={0} side={c.x > 0.5 ? 'left' : 'right'} label={`${t.label}: ${t.value}`}>
                <OriginBadge origin={t.origin} className="ml-2" />
              </Callout>
            </div>
          )
        })}
      </div>
      <figcaption className="mt-2 text-[11px] text-muted">
        {media.kind === 'render' ? 'Render' : 'Foto'}: {media.attribution} · Licencia {media.license}
        {media.source_url && (
          <>
            {' · '}
            <a href={media.source_url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
              Fuente
            </a>
          </>
        )}
      </figcaption>
    </figure>
  )
}
```

- [ ] **Step 4: Panel de medios (superadmin)**

Crear `frontend/src/features/catalog/MediaAdmin.tsx`:

```tsx
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react'
import { errorMessage } from '@/api/client'
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui'
import { AuthedImage } from '@/features/prototypes/shared'
import { deleteSpeciesMedia, MediaCallout, SpeciesDetail, uploadSpeciesMedia } from './api'
import { label, VARIABLE_LABELS } from './labels'
import { relativePoint } from './mediaPoint'

const MAX_CALLOUTS = 12

/** Carga y borrado de imágenes de la especie. Solo superadmin; nunca descarga imágenes de terceros. */
export function MediaAdmin({ species, onChanged }: { species: SpeciesDetail; onChanged: () => void }) {
  const variables = useMemo(() => Array.from(new Set(species.trait_assertions.map((a) => a.variable))), [species])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [kind, setKind] = useState<'photo' | 'render'>('photo')
  const [license, setLicense] = useState('')
  const [attribution, setAttribution] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [isHero, setIsHero] = useState(true)
  const [variable, setVariable] = useState(variables[0] ?? '')
  const [callouts, setCallouts] = useState<MediaCallout[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const addCallout = (e: MouseEvent<HTMLImageElement>) => {
    if (!variable || callouts.length >= MAX_CALLOUTS) return
    const p = relativePoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
    if (p) setCallouts((list) => [...list, { trait_variable: variable, ...p }])
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Elige una imagen')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await uploadSpeciesMedia(species.id, { file, kind, license, attribution, source_url: sourceUrl, is_hero: isHero, callouts })
      setFile(null)
      setCallouts([])
      setLicense('')
      setAttribution('')
      setSourceUrl('')
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo subir la imagen'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (mediaId: string) => {
    try {
      await deleteSpeciesMedia(species.id, mediaId)
      setConfirming(null)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo eliminar la imagen'))
    }
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="eyebrow">Medios con licencia</h2>
        <p className="mt-1 text-xs text-muted">
          Solo superadmin. Sube imágenes cuya licencia hayas verificado; la plataforma no descarga imágenes de terceros.
        </p>
      </div>

      {species.media.length > 0 && (
        <ul className="space-y-3">
          {species.media.map((m) => (
            <li key={m.id} className="flex items-center gap-3 text-sm">
              <AuthedImage path={m.url} alt={`Medio de ${species.scientific_name}`} className="h-12 w-12 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {m.attribution} · {m.license}
                </p>
                <p className="text-xs text-muted">
                  {m.kind === 'render' ? 'Render' : 'Foto'} · {m.callouts.length} callouts
                </p>
              </div>
              {m.is_hero && <Badge tone="lime">Héroe</Badge>}
              {confirming === m.id ? (
                <Button variant="danger" onClick={() => remove(m.id)}>
                  Confirmar eliminación
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setConfirming(m.id)}>
                  Eliminar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} aria-label="Subir medio" className="space-y-3">
        <Field label="Imagen" hint="PNG, JPG o WEBP de hasta 15 MB.">
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setCallouts([])
              }}
            />
          )}
        </Field>
        <Field label="Tipo">
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as 'photo' | 'render')}>
              <option value="photo">Foto</option>
              <option value="render">Render</option>
            </Select>
          )}
        </Field>
        <Field label="Licencia (SPDX o nombre)">
          {(id) => <Input id={id} value={license} onChange={(e) => setLicense(e.target.value)} placeholder="CC BY 4.0" />}
        </Field>
        <Field label="Atribución">
          {(id) => <Input id={id} value={attribution} onChange={(e) => setAttribution(e.target.value)} />}
        </Field>
        <Field label="URL de la fuente">
          {(id) => <Input id={id} type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isHero} onChange={(e) => setIsHero(e.target.checked)} />
          Usar como imagen principal
        </label>

        {preview && (
          <div className="space-y-2">
            <Field label="Variable del callout">
              {(id) => (
                <Select id={id} value={variable} onChange={(e) => setVariable(e.target.value)}>
                  {variables.map((v) => (
                    <option key={v} value={v}>
                      {label(VARIABLE_LABELS, v)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <p className="text-xs text-muted">
              Haz clic sobre la imagen para colocar un callout ({callouts.length}/{MAX_CALLOUTS}).
            </p>
            <div className="relative">
              <img src={preview} alt="Vista previa" onClick={addCallout} className="w-full cursor-crosshair rounded-lg" />
              {callouts.map((c, i) => (
                <span
                  key={i}
                  className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-lime"
                  style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                />
              ))}
            </div>
            {callouts.length > 0 && (
              <ul className="space-y-1 text-xs">
                {callouts.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span>
                      {label(VARIABLE_LABELS, c.trait_variable)} · {c.x.toFixed(2)}, {c.y.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      className="text-danger"
                      onClick={() => setCallouts((list) => list.filter((_, j) => j !== i))}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy} disabled={!file}>
          Subir imagen
        </Button>
      </form>
    </Card>
  )
}
```

- [ ] **Step 5: Usarlos en la ficha**

En `frontend/src/features/catalog/PlantDetailPage.tsx`:

- Cambiar `import { useHasRole } from '@/store/auth'` por `import { useAuth, useHasRole } from '@/store/auth'` y añadir `import { MediaAdmin } from './MediaAdmin'` y `import { SpeciesHero } from './SpeciesHero'`.
- Al inicio de `PlantDetailPage`, junto a `canEdit`: `const isSuperadmin = useAuth((st) => st.user?.is_superadmin ?? false)`.
- Después de `const s = state.data`: `const heroMedia = s.media.find((m) => m.is_hero)`.
- Reemplazar `<PlantIllustration species={s} />` por:

```tsx
            {heroMedia ? <SpeciesHero species={s} media={heroMedia} /> : <PlantIllustration species={s} />}
```

- En la columna derecha (`<div className="space-y-6 lg:col-span-2">`), después de la tarjeta "Fuentes":

```tsx
          {isSuperadmin && <MediaAdmin species={s} onChanged={() => load()} />}
```

- [ ] **Step 6: Verificar**

Run (en `frontend/`): `npx vitest run && npx tsc -b && npm run build`
Expected: todo PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/catalog
git commit -m "feat(catalog): ficha con imagen héroe licenciada, crédito visible, callouts 2D con origen y panel de medios para superadmin"
```

---

### Task 8: README y verificación de cierre de fase

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Checklist**

En la sección "Estado: real / simulado / pendiente" de `README.md`, cambiar el título a "(hito visual V4)" (si V3 ya lo cambió, dejar V4) y reemplazar la fila `| Studio 3D, impacto, grafo | Pendiente (V4–V6) |` por:

```markdown
| Plantas 3D procedurales (ficha, tarjetas del catálogo, Studio) | Ilustrativo: lechuga, tomate, albahaca y forma genérica en 3 etapas; etiquetadas ILUSTRATIVO, «Representación ilustrativa; no predice crecimiento» |
| Layout del Studio (zonas y plantas) | Real (datos del tenant), guardado con versión y aviso de conflicto; sin detección de colisiones |
| Imágenes de especie con callouts | Real cuando un superadmin sube una imagen con licencia y atribución; sin descargas automáticas de terceros |
| Impacto, grafo | Pendiente (V5–V6) |
```

- [ ] **Step 2: Suites completas**

```bash
~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings
cd frontend && npx tsc -b && npx vitest run && npm run build
grep -l "WebGLRenderer" dist/assets/index-*.js || echo "OK: three fuera del bundle principal"
```

Expected: todo PASS; `OK: three fuera del bundle principal`.

- [ ] **Step 3: Migración y smoke del contenedor con Postgres**

Con V3 integrado (`0005` presente): repetir el Step 9 de la Task 4. Luego levantar Postgres 17 y la imagen (`docker build -t harvestt-cortex .`), arrancar con `DATABASE_URL` hacia ese Postgres, entrar como admin del seed y: abrir `/app/plants`; abrir la ficha de lechuga; crear un proyecto con área 60 m² y ciclos de las tres especies; en `/app/projects/<id>/studio` agregar zonas, llenarlas y guardar; recargar; como superadmin, subir una imagen propia con licencia "CC BY 4.0" y dos callouts.

Expected: el contenedor aplica `0006` al arrancar; tarjetas con miniaturas; ficha con planta girando y callouts; el Studio reconstruye el mismo layout tras recargar; un segundo navegador que guarda con versión vieja ve el aviso de conflicto; la ficha con imagen muestra crédito, callouts y "Desconocido" donde no hay evidencia.

- [ ] **Step 4: Revisión visual**

Capturas en claro 1280, oscuro 1280 y claro 375 de `/app/plants`, `/app/plants/<id>` (sin y con imagen) y `/app/projects/<id>/studio` (vista y edición), con el contenedor de Playwright `mcr.microsoft.com/playwright:v1.49.0-jammy`, `--network host`; y una captura del Studio con Chromium lanzado con `--disable-webgl` (debe verse la vista superior SVG). Revisar: sin scroll horizontal, aviso ilustrativo visible, callouts legibles en ambos temas, panel lateral debajo de la escena en móvil.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: planta 3D, Studio y medios de especie en el checklist real / ilustrativo / pendiente (V4)"
```

Merge a `main` (después de V3) y despliegue: **solo con autorización explícita del usuario en esta fase**.

# M1 · Página Visión — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** página pública `/vision` que cuenta el moonshot completo, con globo vivo y recorrido, con cifras y estados de capa calculados desde la base y solicitudes reales de «Únete como nodo».

**Architecture:**
- Backend: módulo nuevo `app/modules/vision` con dos tablas, `recognitions` e `inbound_requests` (migración `0008`).
- Un endpoint público agregado, `GET /api/v1/public/vision`, que devuelve cifras, capas y sitios.
- Un endpoint público de solicitudes.
- Endpoints de superadmin para reconocimientos y para revisar solicitudes.
- Frontend: feature `features/vision` con la página, el globo three.js en *chunk* perezoso con fallback 2D, los formularios y una bandeja de superadmin en `/app/solicitudes`.

**Tech Stack:** FastAPI · SQLAlchemy 2 · Alembic · pytest · React 18 · TypeScript · Vitest · three.js 0.170 (ya instalado). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-11-07-hito-moonshot-design.md` §5, §10bis (1–3, 5) y §10ter (1–2). Mockup aprobado: `.superpowers/brainstorm/86851-1794078173/content/vision-ab.html`.

## Global Constraints

- Rama `feat/hito-m1-vision` desde `main`. Merge y despliegue **solo con autorización explícita del fundador**.
- Ninguna cifra inventada. Una cifra sin dato se muestra «pronto» (si la capa aún no existe) o «Sin datos suficientes». Nunca 0 por falta de dato.
- **Lo simulado nunca cuenta como real.** Ni dispositivos `simulated` ni lecturas con `source = simulated` suman a «nodos operando».
- El sitio de CDMX se muestra como **«prototipo histórico»**, nunca como «operando».
- Los nodos futuros del globo salen **solo** de solicitudes `kind=node` con `status=approved`. Coordenadas redondeadas a 1 decimal (≈ ciudad) **antes de guardarse**.
- Estados de capa: `done` («Hecho»), `operating` («Operando»), `in_construction` («En construcción»), `vision` («Visión»).
- Sin registro abierto: los formularios crean solicitudes; la aprobación solo cambia el estado. La invitación por correo queda fuera de M1.
- Español; sistema de diseño «Salvia cristal»; claro, oscuro y 375 px sin desbordes.
- Sin dependencias nuevas; three.js solo en *chunks* perezosos.
- Verde antes de cada commit de tarea:
  - `make test` (pytest + `tsc -b` + vitest)
  - Al cierre también:
    - `npm run build`
    - migración `upgrade → check → downgrade 0007 → upgrade → check` en Postgres 17
    - *smoke test* del contenedor

## Review Focus

1. **Bots en formularios públicos.** El campo trampa `website` lleno responde `201` igual pero no guarda nada. Campos largos o correo inválido → `422`. Test en la Tarea 3.
2. **Coordenadas exactas enviadas por quien solicita.** Se guardan y exponen redondeadas a 1 decimal. Latitud fuera de [-90, 90] o longitud fuera de [-180, 180] → `422`. Test en la Tarea 3.
3. **Solicitudes pendientes, rechazadas o de contacto nunca aparecen en el globo,** y los reconocimientos borrados no cuentan. Test en la Tarea 4.
4. **«Nodos operando» ignora** dispositivos simulados, lecturas simuladas, lecturas de más de 7 días y otras organizaciones. Test en la Tarea 4.
5. **Sin WebGL o con `prefers-reduced-motion`.** Sin WebGL se usa el mapa 2D; con movimiento reducido no hay rotación ni pulso. Si la organización pública no existe, `/public/vision` responde `200` con cifras `null` y no `500`. Tests en las Tareas 4 y 6.

---

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `app/modules/vision/models.py` | `Recognition`, `InboundRequest` y constantes |
| `app/modules/vision/schemas.py` | Entradas y salidas Pydantic |
| `app/modules/vision/service.py` | Reconocimientos, solicitudes, cálculo de cifras, capas y sitios |
| `app/modules/vision/router.py` | `public` (sin auth) y `admin` (superadmin) |
| `alembic/versions/0008_vision.py` | Tablas `recognitions` e `inbound_requests` |
| `app/models_registry.py`, `app/main.py`, `app/core/config.py` | Registro, routers, `PUBLIC_ORIGIN_*` |
| `tests/test_vision.py` | Pruebas del módulo |
| `frontend/src/features/vision/api.ts` | Tipos y cliente |
| `frontend/src/features/vision/geo.ts` | Proyecciones lat/lon → 3D y 2D (puras) |
| `frontend/src/features/vision/VisionPage.tsx` | Encabezado, cifras, recorrido, llamadas a la acción |
| `frontend/src/features/vision/Globe.tsx` · `LazyGlobe.tsx` · `GlobeFallback.tsx` | Globo three.js perezoso y mapa 2D |
| `frontend/src/features/vision/RequestForm.tsx` | Formulario «Únete como nodo» / «Habla con el equipo» |
| `frontend/src/features/vision/RequestsInboxPage.tsx` | Bandeja superadmin |
| `frontend/src/features/vision/vision.test.tsx`, `geo.test.ts` | Pruebas |
| `frontend/src/App.tsx`, `layouts/PublicLayout.tsx`, `components/Sidebar.tsx` | Rutas y navegación |

---

### Task 1: Modelos y migración 0008

**Files:**
- Create: `app/modules/vision/__init__.py`, `app/modules/vision/models.py`, `alembic/versions/0008_vision.py`, `tests/test_vision.py`
- Modify: `app/models_registry.py`

**Interfaces:**
- Produces, en `app/modules/vision/models.py`:
  - `class Recognition(UUIDMixin, TenantMixin, AuditMixin, Base)`, `__tablename__ = "recognitions"`. Campos:
    - `award: str(120)`, p. ej. «Medalla de Oro»
    - `event: str(200)`
    - `venue: str(200)`
    - `awarded_on: date`
    - `prototype_id: str(36) | None` (FK `prototypes.id`)
    - `evidence: str(500)`, obligatorio: URL o descripción de la evidencia
    - `sort_order: int = 0`
  - `class InboundRequest(UUIDMixin, AuditMixin, Base)`, `__tablename__ = "inbound_requests"`. Es global, sin organización. Campos:
    - `kind: str(10)` ∈ `REQUEST_KINDS = ("node", "contact")`
    - `name: str(120)`, `organization: str(200) | None`, `email: str(254)`
    - `city: str(120) | None`, `lat: float | None`, `lon: float | None`
    - `message: str(2000)`
    - `status: str(10)` ∈ `REQUEST_STATUSES = ("pending", "approved", "rejected")`, por defecto `"pending"`
    - `review_note: str(500) | None`
    - `reviewed_by: str(36) | None` (FK `users.id`), `reviewed_at: datetime | None`
  - Restricciones CHECK en ambos enums, con nombres `ck_inbound_requests_kind` y `ck_inbound_requests_status`. Índice `ix_inbound_requests_status`.

- [ ] **Step 1: Test de persistencia**

```python
def test_models_persist_with_defaults(db, tenants):
    org_id = db.scalar(select(Organization.id).where(Organization.slug == "alfa"))
    db.add(Recognition(organization_id=org_id, award="Medalla de Oro", event="ICAN", venue="Toronto, Canadá",
                       awarded_on=date(2018, 9, 1), evidence="Archivo del equipo"))
    db.add(InboundRequest(kind="node", name="Ana", email="ana@example.org", message="Quiero un nodo"))
    db.commit()
    req = db.scalar(select(InboundRequest))
    assert req.status == "pending" and req.lat is None
    assert db.scalar(select(func.count()).select_from(Recognition)) == 1
```

`tenants` crea las organizaciones `alfa` y `beta` (ver `tests/conftest.py`).

- [ ] **Step 2: Correr y verlo fallar.** `pytest tests/test_vision.py -v` debe fallar con `ModuleNotFoundError: app.modules.vision`.
- [ ] **Step 3: Escribir los modelos** con las interfaces de arriba y registrar `vision.models` en `app/models_registry.py`.
- [ ] **Step 4: Escribir la migración `0008_vision.py`** (`revision="0008"`, `down_revision="0007"`) con el estilo de `0007_graph_edges.py`. Columnas, FKs, CHECKs e índices deben coincidir con los modelos, incluido `ix_recognitions_organization_id`. `downgrade` borra los índices y las dos tablas.
- [ ] **Step 5: Correr las pruebas.** `pytest tests/test_vision.py -v` debe pasar.
- [ ] **Step 6: Commit.** `git commit -m "feat(vision): modelos de reconocimientos y solicitudes, migración 0008"`

### Task 2: Reconocimientos (superadmin)

**Files:**
- Create: `app/modules/vision/schemas.py`, `app/modules/vision/service.py`, `app/modules/vision/router.py`
- Modify: `app/main.py` (incluir `public_router` y `admin_router`), `tests/test_vision.py`

**Interfaces:**
- Produces, en schemas:
  - `RecognitionIn(award, event, venue, awarded_on: date, prototype_id: str | None = None, evidence: str = Field(min_length=3, max_length=500), sort_order: int = 0)`
  - `RecognitionOut`: los mismos campos más `id`
- Produces, en service:
  - `list_recognitions(db, org_id: str) -> list[Recognition]`: sin borrados, ordenados por `sort_order` y `awarded_on`
  - `create_recognition(db, user, org_id, data) -> Recognition`: registra auditoría con `audit.record(db, None, "recognition", id, "create", {...})`
  - `delete_recognition(db, user, rec_id) -> None`: borrado lógico y auditoría `"delete"`
- Produces, en router:
  - `admin_router = APIRouter(prefix="/admin", tags=["vision-admin"])`, protegido con `require_superadmin`
  - `GET /admin/recognitions`
  - `POST /admin/recognitions` → `201`
  - `DELETE /admin/recognitions/{id}` → `204`
  - Siempre opera sobre la organización pública, `public_org_id(db, settings.public_org_slug)`. Si no existe → `404 "organización pública"`.

- [ ] **Step 1: Tests.**
  - `test_recognitions_superadmin_only`: sin token → 401; editor normal → 403.
  - `test_create_list_delete_recognition`: el POST devuelve 201 con `award == "Medalla de Plata"`; el GET lista 1; tras el DELETE (204) lista 0.
  - `test_recognition_requires_evidence`: `evidence=""` → 422.

  Para el superadmin, usar `make_member(..., superadmin=True)` sobre la organización con slug igual a `settings.public_org_slug`, haciendo `monkeypatch.setattr(settings, "public_org_slug", "alfa")`.
- [ ] **Step 2: Correr y verlos fallar** (404 en las rutas).
- [ ] **Step 3: Implementar** schemas, service y router, e incluir los routers en `app/main.py`.
- [ ] **Step 4: Correr las pruebas** y verlas pasar.
- [ ] **Step 5: Commit.** `feat(vision): reconocimientos administrables por superadmin con evidencia obligatoria`

### Task 3: Solicitudes públicas y revisión

**Files:**
- Modify: `app/modules/vision/{schemas,service,router}.py`, `tests/test_vision.py`

**Interfaces:**
- Produces, en schemas:
  - `RequestIn`, con validación:
    - `kind: Literal["node", "contact"]`
    - `name: str = Field(min_length=2, max_length=120)`
    - `organization: str | None = Field(default=None, max_length=200)`
    - `email: str`: patrón `^[^@\s]+@[^@\s]+\.[^@\s]+$`, máximo 254
    - `city: str | None = Field(None, max_length=120)`
    - `lat: float | None = Field(None, ge=-90, le=90)`, `lon: float | None = Field(None, ge=-180, le=180)`
    - `message: str = Field(min_length=10, max_length=2000)`
    - `website: str = ""`: campo trampa
  - `RequestAck(received: bool = True)`
  - `RequestOut`: todos los campos guardados más `id`, `created_at`
  - `RequestReview(status: Literal["approved", "rejected"], note: str | None = Field(None, max_length=500))`
- Produces, en service:
  - `round_coord(value: float | None) -> float | None` → `round(value, 1)`
  - `create_request(db, data: RequestIn) -> InboundRequest | None`: devuelve `None` sin guardar si `data.website.strip()` no está vacío. Exige `lat` y `lon` juntos (uno sin el otro → `422`). Redondea antes de guardar.
  - `list_requests(db, status: str | None) -> list[InboundRequest]`: más recientes primero
  - `review_request(db, user, req_id, review) -> InboundRequest`: fija `status`, `review_note`, `reviewed_by` y `reviewed_at`, y registra auditoría `"review"`. Revisar una solicitud ya revisada está permitido y sobrescribe la revisión.
- Produces, en router:
  - `public_router = APIRouter(prefix="/public", tags=["vision"])`
  - `POST /public/requests` → `201 RequestAck`, siempre igual, aunque la trampa descarte la solicitud
  - `GET /admin/requests?status=` (superadmin)
  - `PATCH /admin/requests/{id}` (superadmin) → `RequestOut`

- [ ] **Step 1: Tests.**
  - `test_public_request_rounds_coordinates`: POST con `lat=19.43251, lon=-99.13321` → 201. En la base, `lat == 19.4` y `lon == -99.1`.
  - `test_honeypot_accepts_but_discards`: `website="http://spam"` → 201 `{"received": true}` y 0 filas.
  - `test_request_validation`:
    - `lat=91` → 422
    - solo `lat` → 422
    - `email="no-es-correo"` → 422
    - `message` de 2001 caracteres → 422
    - `kind="otro"` → 422
  - `test_review_request_superadmin`: un editor normal recibe 403. El superadmin aprueba con PATCH: `status == "approved"`, `reviewed_at` no nulo y existe un `AuditEvent` con `operation == "review"`. `GET ?status=pending` ya no la incluye.
- [ ] **Step 2: Correr y verlos fallar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr las pruebas** y verlas pasar.
- [ ] **Step 5: Commit.** `feat(vision): solicitudes públicas de nodo y contacto con trampa anti-bots, coordenadas redondeadas y revisión de superadmin`

### Task 4: `GET /public/vision`: cifras, capas y sitios

**Files:**
- Modify: `app/core/config.py`, `app/modules/vision/{schemas,service,router}.py`, `tests/test_vision.py`, `.env.example`

**Interfaces:**
- Consumes:
  - `public_org_id` y `public_prototypes` de `app.modules.prototypes.service`
  - `Device`, `TelemetryReading` y `DEVICE_SIMULATED`, `SOURCE_SIMULATED` de telemetría
  - `Species` del catálogo
  - `get_now` de `app.modules.simulation.clock`
- Produces, en config (`Settings`):
  - `public_origin_label` (env `PUBLIC_ORIGIN_LABEL`, por defecto `"CDMX · prototipos históricos"`)
  - `public_origin_lat` (`PUBLIC_ORIGIN_LAT`, por defecto `19.4`)
  - `public_origin_lon` (`PUBLIC_ORIGIN_LON`, por defecto `-99.1`)
  - Se agregan a `.env.example` con un comentario.
- Produces, en schemas:
  - `VisionFigure(key: str, label: str, value: float | None, status: Literal["available", "soon"], origin: str, formula: str)`
  - `VisionLayer(key: str, status: Literal["done", "operating", "in_construction", "vision"], reason: str)`
  - `VisionSite(kind: Literal["historic", "future"], label: str, lat: float, lon: float)`
  - `VisionOut(as_of: datetime, figures: list[VisionFigure], layers: list[VisionLayer], sites: list[VisionSite])`
- Produces, en service: `vision_summary(db, org_id: str | None, now: datetime) -> VisionOut`.

**Cifras**, en este orden exacto:

| key | label | value | status | origin | formula |
|---|---|---|---|---|---|
| `prototypes` | `Prototipos` | prototipos públicos de la org | available | measured | «Prototipos publicados en la vitrina.» |
| `operating_nodes` | `Nodos operando` | proyectos distintos de la org pública con al menos un `Device` con `kind != "simulated"`, no borrado, que tenga una `TelemetryReading` con `source != "simulated"` y `observed_at >= now - 7 días` | available | measured | «Instalaciones con un dispositivo físico que envió una lectura real en los últimos 7 días. Lo simulado no cuenta.» |
| `signed_readings` | `Lecturas firmadas` | `None` | **soon** | missing | «Disponible cuando opere la red de confianza (M5).» |
| `recognitions` | `Reconocimientos internacionales` | reconocimientos vivos de la org | available | sourced | «Reconocimientos registrados con evidencia.» |

Si `org_id is None`, todas las cifras `available` llevan `value=None`.

**Nota de alcance:** la entidad `Node` de la spec (§10bis.1) llega en M5. Mientras tanto, en M1 la instalación se aproxima por **proyecto**. M5 sustituye el conteo por nodos sin cambiar la clave `operating_nodes`.

**Capas**, en este orden exacto. Las constantes se reemplazan por comprobaciones reales en M2–M6:

| key | regla | reason |
|---|---|---|
| `history` | `done` si hay prototipos públicos o reconocimientos; si no, `vision` | «Prototipos 2017–2018 y reconocimientos registrados.» |
| `cortex` | `operating` si existe al menos una `Species` viva; si no, `in_construction` | «Plataforma en producción con catálogo.» |
| `knowledge` | constante `in_construction` | «Ontología, bancos de plantas y mapa GIS: hito M2–M4.» |
| `trust` | constante `vision` | «Red de confianza: hito M5.» |
| `commons` | constante `vision` | «harvestt.org: hito M6.» |

**Sitios:**
- Primero, `historic` con `public_origin_*`, siempre.
- Después, un `future` por cada `InboundRequest` con `kind="node"`, `status="approved"`, no borrada, con `lat` y `lon` no nulos. `label = city or "Nodo solicitado"`.

- [ ] **Step 1: Tests.**
  - `test_vision_without_public_org`: slug inexistente → 200. `prototypes.value` y `recognitions.value` son `None`, `signed_readings.status == "soon"` y hay 5 capas en el orden indicado.
  - `test_operating_nodes_ignores_simulated_and_stale`. Sobre la org pública (`alfa`) crea:
    - (a) un dispositivo simulado con lecturas simuladas recientes;
    - (b) un dispositivo físico con lectura `source="simulated"`;
    - (c) un dispositivo físico con lectura real de hace 8 días;
    - (d) un dispositivo físico en la org `beta` con lectura real reciente.

    `operating_nodes.value == 0`. Luego añade (e) un dispositivo físico de `alfa` con lectura real de hace 1 hora → `value == 1`.

    Crear dispositivos y lecturas con modelos directamente: `kind="physical"`, `source="device"`, `quality="good"`.
  - `test_sites_only_approved_node_requests`: crea una solicitud de nodo aprobada, una pendiente, una rechazada y un contacto aprobado → hay exactamente un sitio `future` y el primero es `historic`.
  - `test_deleted_recognition_not_counted` y `test_layers_history_done_with_recognition`.
- [ ] **Step 2: Correr y verlos fallar.**
- [ ] **Step 3: Implementar** `vision_summary` y `GET /public/vision` (`response_model=VisionOut`, `now = Depends(get_now)`).
- [ ] **Step 4: Correr las pruebas** y verlas pasar; correr también `make test`.
- [ ] **Step 5: Commit.** `feat(vision): resumen público con cifras honestas, estados de capa calculados y sitios aprobados`

### Task 5: Página `/vision`: cifras, recorrido y navegación

**Files:**
- Create: `frontend/src/features/vision/api.ts`, `frontend/src/features/vision/VisionPage.tsx`, `frontend/src/features/vision/vision.test.tsx`
- Modify: `frontend/src/App.tsx` (ruta `vision` dentro de `PublicLayout`), `frontend/src/layouts/PublicLayout.tsx` (enlace «Visión» antes de «Prototipos»)

**Interfaces:**
- Produces, en `api.ts`:
  - los tipos `VisionFigure`, `VisionLayer`, `VisionSite`, `Vision`, que reflejan los schemas de la Tarea 4
  - `LayerStatus = 'done' | 'operating' | 'in_construction' | 'vision'`
  - `LAYER_LABEL: Record<LayerStatus, string> = { done: 'Hecho', operating: 'Operando', in_construction: 'En construcción', vision: 'Visión' }`
  - `RequestInput`
  - `visionApi = { summary(): Promise<Vision>, sendRequest(input: RequestInput): Promise<void> }`

**Contenido fijo de la página:**
- Encabezado: rótulo `HARVESTT · MOONSHOT`, título «Una red abierta de datos de cultivo en la que el mundo pueda confiar.» y subtítulo «Hardware que mide, una red que no deja alterar los datos, IA que los interpreta y un portal abierto para todos.»
- Leyenda: `● Operando · ◐ En construcción · ○ Visión`.
- Cifras: cada `VisionFigure` como tile. Si `status=soon` muestra «pronto»; si `value=null` muestra «Sin datos suficientes». En otro caso, valor y `OriginBadge`, con la fórmula disponible igual que en `KpiFigure`.
- Recorrido, un capítulo por capa, en orden y con su `LAYER_LABEL`:

| Capa | Título | Texto |
|---|---|---|
| `history` | «2017–2018 · Prototipos físicos» | «Invernadero Geodésico, Cultivador Delta y Germinador ECOS. Medallas en INTARG (Polonia, 2017) e ICAN (Canadá, 2018).» Se acompaña del `StlViewer` del primer prototipo público con `model`. |
| `cortex` | «Hoy · HarvestT Cortex» | «Catálogo con evidencia, proyectos, invernadero virtual, Studio 3D, grafo de conocimiento e impacto.» |
| `knowledge` | «Capa 1 · Ontología, bancos de plantas y mapa» | «Cortex habla el idioma científico mundial y sabe dónde y cómo crece cada especie.» |
| `trust` | «Capa 2 · Red de confianza» | «Cada lectura firmada por su nodo y encadenada: nadie puede alterar un dato sin que se note.» |
| `commons` | «Capa 3 · harvestt.org» | «Datos abiertos, mapa, ontología y verificación, libres para investigar y citar.» |

- El diagrama del ecosistema (cuatro columnas: Nodos → Red de confianza → Cortex → harvestt.org) como SVG inline entre el encabezado y el recorrido. Se adapta del de `moonshot.html` y se apila en vertical por debajo de 640 px.
- Estados: cargando (`Loading`) y error (`ErrorState` con reintento), como en las demás páginas públicas.

- [ ] **Step 1: Tests.** Mockear `visionApi.summary` y `prototypesApi.publicList` con `vi.spyOn`.
  - `renderiza cifras: "pronto" para soon, "Sin datos suficientes" para null y valor con badge`
  - `muestra las cinco capas en orden con su etiqueta de estado`: `getAllByRole('heading', {level: 3})` sigue el orden de la tabla y aparece «En construcción» para `knowledge`
  - `PublicLayout enlaza a /vision`
- [ ] **Step 2: Correr y verlos fallar.** `cd frontend && npx vitest run src/features/vision`
- [ ] **Step 3: Implementar.** Usar el globo como espacio reservado (un `div` vacío con `data-testid="globe-slot"`); la Tarea 6 lo llena.
- [ ] **Step 4: Correr las pruebas** y verlas pasar.
- [ ] **Step 5: Commit.** `feat(vision): página pública /vision con cifras, diagrama y recorrido por capas`

### Task 6: Globo vivo y fallback 2D

**Files:**
- Create: `frontend/src/features/vision/geo.ts`, `frontend/src/features/vision/geo.test.ts`, `frontend/src/features/vision/Globe.tsx`, `frontend/src/features/vision/LazyGlobe.tsx`, `frontend/src/features/vision/GlobeFallback.tsx`
- Modify: `frontend/src/features/vision/VisionPage.tsx`, `frontend/src/features/vision/vision.test.tsx`

**Interfaces:**
- Produces, en `geo.ts`:
  - `latLonToVector3(lat: number, lon: number, radius: number): [number, number, number]`
    - `phi = (90 - lat)·π/180`, `theta = (lon + 180)·π/180`
    - `x = -r·sin(phi)·cos(theta)`, `y = r·cos(phi)`, `z = r·sin(phi)·sin(theta)`
  - `equirect(lat: number, lon: number, width: number, height: number): [number, number]` → `[(lon + 180) / 360 · w, (90 - lat) / 180 · h]`
  - `prefersReducedMotion(): boolean`: `matchMedia('(prefers-reduced-motion: reduce)')`; devuelve `false` si `matchMedia` no existe
- Produces, `Globe` (export default) con props `{ sites: VisionSite[]; animate: boolean; className?: string }`:
  - esfera con malla de meridianos y paralelos
  - un punto por sitio: `historic` relleno con pulso cuando `animate`; `future` como anillo punteado
  - rotación lenta solo cuando `animate`
  - libera geometrías y renderer al desmontar, con el mismo patrón que `StlViewer`
- Produces, `LazyGlobe`: `lazy(() => import('./Globe'))` con `Suspense` y el texto «Preparando globo…».
- Produces, `GlobeFallback` con props `{ sites }`: SVG equirectangular con los mismos puntos y una lista accesible de sitios con su etiqueta. `historic` se rotula «prototipo histórico» y `future`, «nodo solicitado».

- [ ] **Step 1: Tests.**
  - En `geo.test.ts`:
    - `latLonToVector3(0, 0, 1)` ≈ `[-1, 0, 0]`
    - `latLonToVector3(90, 0, 1)` ≈ `[0, 1, 0]`
    - `equirect(0, 0, 360, 180)` = `[180, 90]`
    - `equirect(19.4, -99.1, 360, 180)` ≈ `[80.9, 70.6]`
  - En `vision.test.tsx`:
    - `sin WebGL usa GlobeFallback con la lista de sitios`: mockear `webglAvailable` → `false`; aparecen «CDMX · prototipos históricos» y «prototipo histórico»
    - `con movimiento reducido el globo recibe animate=false`: mockear `LazyGlobe` y `prefersReducedMotion` → `true`, y comprobar la prop
- [ ] **Step 2: Correr y verlos fallar.**
- [ ] **Step 3: Implementar** y sustituir el `globe-slot` de `VisionPage`: `webglAvailable() ? <LazyGlobe animate={!prefersReducedMotion()} …/> : <GlobeFallback …/>`.
- [ ] **Step 4: Correr las pruebas** y `npm run build`. Verificar en la salida que three sigue en *chunks* aparte, sin crecimiento del chunk de entrada.
- [ ] **Step 5: Commit.** `feat(vision): globo three.js perezoso con sitios históricos y solicitados, mapa 2D sin WebGL y movimiento reducido`

### Task 7: Formularios «Únete como nodo» y «Habla con el equipo»

**Files:**
- Create: `frontend/src/features/vision/RequestForm.tsx`
- Modify: `frontend/src/features/vision/VisionPage.tsx`, `frontend/src/features/vision/vision.test.tsx`

**Interfaces:**
- Consumes: `visionApi.sendRequest`.
- Produces, `RequestForm` con props `{ kind: 'node' | 'contact'; onDone(): void }`:
  - Campos: nombre, organización (opcional), correo, mensaje.
  - Si `kind = node`, además ciudad y una casilla «Compartir mi ubicación aproximada (ciudad)». Con la casilla marcada, usa `navigator.geolocation` una sola vez; si se niega o falla, envía sin coordenadas y no muestra error.
  - Campo trampa `website` oculto con `aria-hidden`, `tabIndex={-1}` y `autoComplete="off"`.
  - Al terminar muestra «Gracias. El equipo revisará tu solicitud y te escribirá.»
  - Los errores 422 se muestran junto al campo.
- `VisionPage`: los botones «Únete como nodo» y «Habla con el equipo» abren el formulario correspondiente en un diálogo accesible (`role="dialog"`, foco inicial en el nombre, Escape cierra).

- [ ] **Step 1: Tests.**
  - `envía solicitud de nodo sin coordenadas si no se marca ubicación`: `sendRequest` se llama con `kind: 'node'`, sin `lat` ni `lon` y con `website: ''`, y aparece el mensaje de gracias.
  - `muestra error de validación del servidor junto al correo`: un rechazo 422 con `detail` sobre `email` produce texto de error visible.
  - `Escape cierra el diálogo`.
- [ ] **Step 2: Correr y verlos fallar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr las pruebas** y verlas pasar.
- [ ] **Step 5: Commit.** `feat(vision): formularios de solicitud de nodo y contacto con ubicación aproximada opcional`

### Task 8: Bandeja de solicitudes (superadmin)

**Files:**
- Create: `frontend/src/features/vision/RequestsInboxPage.tsx`
- Modify: `frontend/src/features/vision/api.ts`, `frontend/src/App.tsx` (ruta `app/solicitudes`), `frontend/src/components/Sidebar.tsx`, `frontend/src/features/vision/vision.test.tsx`

**Interfaces:**
- Produces, en `api.ts`:
  - `visionAdminApi = { list(status?: RequestStatus): Promise<InboundRequest[]>, review(id: string, status: 'approved' | 'rejected', note?: string): Promise<InboundRequest> }`
  - los tipos `InboundRequest` y `RequestStatus`
- Produces, `RequestsInboxPage`:
  - filtros «Pendientes / Aprobadas / Rechazadas / Todas»
  - una tarjeta por solicitud con tipo, nombre, organización, correo, ciudad y mensaje
  - botones Aprobar y Rechazar (rechazar pide una nota)
  - aviso: «Aprobar una solicitud de nodo con ubicación la muestra en el globo público, redondeada a nivel ciudad.»
  - si el usuario no es superadmin: «Solo superadmin.»
- Sidebar: la entrada `{ to: '/app/solicitudes', label: 'Solicitudes', icon: 'folder' }` solo se muestra si `user.is_superadmin`.

- [ ] **Step 1: Tests.**
  - `la entrada Solicitudes solo aparece para superadmin`
  - `aprobar llama a review y la tarjeta sale de Pendientes`
  - `rechazar exige nota`
- [ ] **Step 2: Correr y verlos fallar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr las pruebas** y verlas pasar.
- [ ] **Step 5: Commit.** `feat(vision): bandeja de solicitudes para superadmin`

### Task 9: Documentación y puerta de la fase

**Files:**
- Modify: `README.md` (fila «Página Visión» en Capacidades), `docs/STATUS.md` (fase M1 y matriz: la página Visión es Real; nodos operando = medido, hoy 0; lecturas firmadas = pronto), `docs/ARQUITECTURA.md` (módulo `vision`, migración `0008`, rutas `/vision` y `/app/solicitudes`), `docs/INTEGRIDAD_CIENTIFICA.md` (reglas: lo simulado no cuenta como nodo; coordenadas redondeadas; sitios solo de solicitudes aprobadas), `CHANGELOG.md`.

- [ ] **Step 1: Actualizar los documentos** con los datos reales de las tareas 1–8.
- [ ] **Step 2: Suite completa.** `make test` y `cd frontend && npm run build` deben pasar.
- [ ] **Step 3: Migraciones en Postgres 17:**

```bash
alembic upgrade head && alembic check && alembic downgrade 0007 && alembic upgrade head && alembic check
```

  No debe haber diferencias.
- [ ] **Step 4: Smoke del contenedor.** Con `docker build` y `docker run` contra Postgres local:
  - `/api/v1/health/ready` → `ok`
  - `/api/v1/public/vision` → 200
  - `/vision` sirve el SPA
- [ ] **Step 5: Revisión visual** de `/vision` y `/app/solicitudes` en claro, oscuro y 375 px, con y sin WebGL.
- [ ] **Step 6: Commit.** `docs: M1 Visión en README, estado, arquitectura e integridad`
- [ ] **Step 7: Pedir al fundador autorización** para merge a `main` y despliegue.
  - Tras el despliegue, verificar `/api/v1/public/vision` en producción.
  - Con autorización, cargar las dos medallas con `POST /api/v1/admin/recognitions`. Evidencia: la que el fundador indique; si no indica ninguna, «Registro del equipo General Systech; ver docs/HISTORIA.md».

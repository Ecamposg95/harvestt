# Arquitectura de HarvestT Cortex

**Versión del documento:** 1.0 · **Fecha:** 2026-11-07 · **Estado del sistema:** hito visual V1–V6 y M1 (Visión) en producción · **Migración vigente en producción:** `0008_vision` (la rama M2 añade `0009_ontology`, pendiente de fusión)

## 1. Propósito y alcance

Este documento describe la arquitectura de software de HarvestT Cortex tal como está implementada en `main`. Las decisiones de producto de origen están en [`HARVESTT_TASK_PACK.md`](HARVESTT_TASK_PACK.md); las de diseño visual y por fase, en [`superpowers/specs/`](superpowers/specs/) y [`superpowers/plans/`](superpowers/plans/). Cuando este documento y el código difieran, prevalece el código y este documento debe corregirse.

## 2. Principios de diseño

1. **Software primero, hardware después.** El contrato de telemetría se valida con simulación antes de conectar dispositivos.
2. **Monolito modular, API-first.** Un único servicio desplegable con módulos de dominio aislados; el frontend consume exclusivamente `/api/v1`.
3. **Multi-organización desde el origen.** Toda entidad privada lleva `organization_id`; el servidor nunca confía en el tenant enviado por el cliente.
4. **Procedencia obligatoria.** Cada dato declara su origen (véase [`INTEGRIDAD_CIENTIFICA.md`](INTEGRIDAD_CIENTIFICA.md)).
5. **Determinismo.** La simulación es una función pura de semilla y parámetros; una corrida se puede reproducir exactamente.
6. **Degradación explícita.** Sin WebGL, el Studio ofrece vista 2D; sin señal, se muestra «Sin señal»; sin insumos, «Sin datos suficientes».

## 3. Vista de contexto

```
            ┌─────────────────────────────┐
 Visitante ─▶  Vitrina pública            │
            │  /prototipos/:slug          │
 Investigador│                             │      ┌──────────────────┐
 Operador  ─▶  Aplicación /app/*          ├─────▶│ PostgreSQL 17    │
 Observador │  (React SPA)                │      └──────────────────┘
            │          │ /api/v1          │      ┌──────────────────┐
            │  FastAPI (monolito modular) ├─────▶│ Bucket S3        │
            └─────────────────────────────┘      │ (STL, medios)    │
                     Railway (Docker)            └──────────────────┘
```

## 4. Pila tecnológica

| Capa | Tecnología | Versión fijada |
|---|---|---|
| Interfaz | React · React Router · Zustand | 18.3.1 · 6.28.1 · 4.5.5 |
| Lenguaje y build | TypeScript · Vite · Tailwind CSS | 5.6.3 · 5.4.11 · 3.4.17 |
| Visualización | three.js · d3-force | 0.170.0 · 3.0.0 |
| API | FastAPI · Starlette · Pydantic | 0.127.0 · 0.50.0 · 2.12.5 |
| Persistencia | SQLAlchemy · Alembic · psycopg2 | 2.0.45 · 1.13.2 · 2.9.10 |
| Seguridad | python-jose (JWT) · passlib/bcrypt | 3.5.0 · 1.7.4/4.0.1 |
| Archivos | boto3 (S3 compatible) | 1.35.99 |
| Ejecución | Python · Node (build) · PostgreSQL | 3.12 · 20 · 17 |
| Pruebas | pytest · Vitest · Testing Library | — · 2.1.9 · 16.1.0 |

Las versiones están fijadas en `requirements.txt` y `frontend/package.json`. Una biblioteca nueva requiere justificar motivo, licencia y alternativa.

## 5. Backend

### 5.1 Núcleo (`app/core`)

| Componente | Responsabilidad |
|---|---|
| `config.py` | Configuración por entorno (`development`, `demo`, `staging`, `production`); `SECRET_KEY` obligatoria fuera de desarrollo |
| `db.py` | Motor y sesiones SQLAlchemy |
| `security.py` | Hash de contraseñas y emisión/validación de JWT |
| `deps.py` | `RequestContext`: usuario, organización activa y rol |
| `tenant.py` | `scoped()` y `get_scoped_or_404()`: toda consulta privada filtra por organización y excluye borrados lógicos |
| `mixins.py` | `UUIDMixin`, `TenantMixin`, `AuditMixin` (autoría, marcas de tiempo, `deleted_at`) |
| `audit.py` | Registro de eventos de auditoría |
| `storage.py` | Almacenamiento local en desarrollo, S3 en producción |
| `errors.py` | Errores de dominio con respuesta uniforme |

### 5.2 Módulos de dominio (`app/modules`)

| Módulo | Entidades | Endpoints principales (`/api/v1`) |
|---|---|---|
| `identity` | Organization, User, Membership | `POST /auth/login`, `GET /auth/me` |
| `audit` | AuditEvent | (interno) |
| `catalog` | Species, Cultivar, Source, TraitAssertion, SpeciesMedia | `/plants`, `/plants/families`, `/plants/{id}`, `/plants/{id}/media`, `/sources/{id}` |
| `projects` | Project, CropCycle, Observation | `/projects`, `/projects/{id}/crop-cycles`, `/projects/{id}/observations` |
| `prototypes` | Prototype, PrototypeAsset, PrototypeHotspot | `/prototypes/*` (interno), `/public/*` (vitrina) |
| `simulation` | SimulationRun | `/projects/{id}/simulation/runs` (+ `pause`, `resume`, `cancel`), `/simulation/demo` |
| `telemetry` | Device, TelemetryReading, AlertRule, Incident | `/projects/{id}/devices`, `/telemetry/readings`, `/telemetry/latest`, `/alert-rules`, `/alerts` |
| `studio` | Zone, Placement | `GET/PUT /projects/{id}/layout` (versionado) |
| `impact` | — (cálculo al vuelo) | `/projects/{id}/impact`, `/public/impact` |
| `graph` | GraphEdge | `GET /graph` (foco, profundidad, tipos; máximo 300 nodos) |
| `home` | — | `/home` (actividad y resumen del inicio) |
| `vision` | Recognition, InboundRequest | `GET /public/vision`, `POST /public/requests`; superadministrador: `/admin/recognitions`, `/admin/requests` |
| `ontology` (separable) | OntologyTerm, TermEquivalence, ExternalConcept, OntologyRelease | `/ontology/terms` (lista, ficha, propuesta, edición de la propia propuesta), `/ontology/suggest`, `/ontology/releases`; superadministrador: `/ontology/review-queue`, `/ontology/terms/{id}/review`, `/obsolete`, `/equivalences`; públicos: `/public/ontology/export.ttl`, `/public/ontology/export.json`, `/public/ontology/terms/{hvt_id}` |
| `term_links` | — (columnas `*_term_id` en catálogo y proyectos) | `GET /ontology/terms/{id}/usage` |
| `connectors` (M3) | ConnectorSnapshot, ConnectorSync | `GET /plants/{species_id}/banks`, `GET /connectors`, `GET /connectors/genesys/accessions` (consulta en vivo); superadministrador: `POST /connectors/{key}/sync` |

La especificación OpenAPI completa se publica en `/api/docs`.

### 5.2.1 Módulo `vision` (M1)

`GET /public/vision` devuelve cifras con origen y razón; una cifra sin dato es `null` y se muestra «pronto» o «Sin datos suficientes», nunca 0 por falta de dato. «Nodos operando» cuenta proyectos con un dispositivo no simulado con lectura no simulada en los últimos 7 días (ventana acotada en SQL). Las solicitudes públicas (`POST /public/requests`) llevan un campo trampa anti-bots, exigen `lat` y `lon` juntos (422 en caso contrario) y redondean las coordenadas a 1 decimal antes de guardarse. Aprobar una solicitud solo cambia su estado (sin invitación por correo). Configuración: `PUBLIC_ORIGIN_LABEL`, `PUBLIC_ORIGIN_LAT`, `PUBLIC_ORIGIN_LON`. El globo es un chunk perezoso de three.js con mapa 2D sin WebGL.

### 5.2.3 Módulo `connectors` (M3)

`connectors` importa datos de bancos públicos de plantas y los guarda como copias locales con fecha; no escribe en `species`, `cultivars`, `trait_assertions` ni `species_media`. Cada conector expone `fetch(species, fetch, today)` sobre un *fetcher* inyectable (las pruebas usan respuestas grabadas, nunca red). El registro de fuentes es fijo en código: `gbif`, `wfo`, `wikidata` y `genesys` tienen conector; `grin`, `cimmyt` e `inifap` son filas informativas («En construcción» o «Requiere alianza») que responden 409 `connector_unavailable` al sincronizar.

- **GBIF:** por `usageKey` del catálogo; solo registros `CC0_1_0` y `CC_BY_4_0` (los `CC_BY_NC_4_0` se excluyen y se informa cuántos).
- **WFO:** se consulta la WFO Plant List publicada por WFO en ChecklistBank (dataset 2004, CC0), porque `list.worldfloraonline.org` sirve una cadena TLS incompleta que el cliente rechaza. Solo se guarda `type = exact` y `status = accepted`.
- **Wikidata y Commons:** ítem hallado por P846 (ID de GBIF); si hay 0 o más de 1, `not_found`. Imágenes solo con licencia en lista blanca, enlazadas (*hotlink*), nunca descargadas.
- **Genesys:** toda su API exige token (`GENESYS_API_TOKEN`); sin él la fuente figura «Requiere credenciales». No se guardan accesiones: la copia local solo lleva conteos por país de origen y estado biológico; la lista se consulta en vivo. Vincular una accesión a un ciclo (`PUT /projects/{pid}/crop-cycles/{cid}/accession`, módulo `projects`; `editor` o superior) guarda solo código de instituto, número y DOI.
- **Sincronización:** una corrida exitosa reemplaza la copia; una fallida conserva la anterior y registra `last_error`. Enfriamiento de 10 minutos por fuente (429 `sync_cooldown`), 409 `sync_running` con una corrida activa, tope de 50 especies por corrida, pausas mínimas entre solicitudes y `User-Agent` propio. Un bloqueo asesor evita corridas simultáneas. CLI para tareas programadas: `python -m scripts.connectors.sync --source all`.

### 5.2.2 Módulos `ontology` y `term_links` (M2)

`ontology` es un módulo separable: importa solo de `app.core` y `app.modules.identity`, nunca de catálogo, proyectos, grafo, telemetría ni visión, para poder extraerse como servicio propio. Los términos son globales (sin organización) y pertenecen a un dominio (`organism`, `plant`, `trait`, `environment`, `place`, `node`). Ciclo de vida: `proposed → in_review → published | rejected`; un término publicado solo puede pasar a `obsolete`, con `replaced_by` apuntando a otro publicado. El ID permanente `HVT:` + 6 dígitos se asigna al publicar, dentro de un candado de publicación que serializa las versiones (`with_for_update()`), y nunca se reutiliza. Cada publicación, obsolescencia o cambio de equivalencias de un término publicado crea una versión nueva (`OntologyRelease`, entero que empieza en 1 con la semilla). Proponer requiere cuenta; revisar, obsoletar y editar equivalencias de un publicado es solo de superadministrador, con nota obligatoria de 3 a 500 caracteres. La etiqueta se compara normalizada (NFKD sin acentos, `casefold`, espacios colapsados) por dominio. Las equivalencias (`exact`, `close`, `broad` → `skos:exactMatch`, `skos:closeMatch`, `skos:broadMatch`) apuntan a `ontology_external_concepts`; la sugerencia es una búsqueda en esa tabla, sin LLM. La semilla de 45 términos se publica al arrancar de forma idempotente. La exportación pública (Turtle con `owl:versionInfo`, y JSON) lleva licencia CC-BY 4.0 y construye las IRI con `ONTOLOGY_BASE_IRI`.

`term_links` es el puente producto → ontología. Añade columnas `*_term_id` (`species.term_id`, `trait_assertions.variable_term_id`, `growth_stage_term_id`, `cultivation_system_term_id`, `projects.system_term_id`, `crop_cycles.stage_term_id`) y, al final del seed de arranque, ejecuta `relink`: llena solo las columnas en `NULL` cuando el texto libre coincide exactamente, tras normalizar, con la etiqueta o un alias de un único término publicado del dominio. Sin coincidencia, o con coincidencia ambigua, queda `NULL`; el texto original no se toca. El grafo (`graph`) añade nodos `term` con aristas `subclass_of`, `replaced_by` y `classified_as`, y la capa «knowledge» de `vision` informa la versión publicada y el número de términos.

### 5.3 Simulación y telemetría

El motor `didactic-v1` (`app/modules/simulation/engine.py`) se compone de funciones puras sin estado ni E/S: una curva diurna sinusoidal con ruido pseudoaleatorio sembrado. Admite escenarios de base, subida de temperatura, pérdida de sensor y recuperación. Las lecturas que produce se almacenan con `source = simulated` y las reglas de alerta generan incidentes idempotentes. El motor no representa un invernadero real y la interfaz lo declara siempre con la banda «Simulación didáctica, sin calibración agronómica».

El contrato de lectura (`schema_version`, `event_id`, `device_id`, `variable`, `value`, `unit`, `observed_at`, `source`, `quality`) es el mismo que usará el adaptador físico; el servidor asigna organización y `received_at`, y garantiza unicidad por dispositivo y `event_id`.

### 5.4 Modelo de evidencia

Las especies no almacenan valores universales («pH ideal»). Cada rasgo es una `TraitAssertion` contextualizada por variable, unidad, etapa, sistema de cultivo, fuente y estado de revisión. Un rasgo sin evidencia existe con `origin = missing` y se muestra como «Desconocido».

## 6. Frontend

```
frontend/src/
├── api/          cliente HTTP
├── components/   Sidebar, Logo, ui/ (OriginBadge, StatTile, Callout, gráficas, estados)
├── features/     catalog · projects · operations · studio · impact · graph · prototypes · three · home · vision · ontology
├── layouts/      AppLayout (sidebar plegable) · PublicLayout
├── pages/        Login · NotFound
└── store/        auth · tema · sidebar (Zustand)
```

| Ruta | Pantalla |
|---|---|
| `/prototipos/:slug` | Vitrina pública con modelo 3D y callouts |
| `/app` | Inicio: actividad y proyectos recientes |
| `/app/plants`, `/app/plants/:id` | Catálogo y ficha de especie |
| `/app/projects`, `/app/projects/:id` | Proyectos y bitácora |
| `/app/projects/:id/operations` | Invernadero virtual: lecturas, medidores, incidentes |
| `/app/projects/:id/studio` | Studio 3D/2D |
| `/app/projects/:id/impact` | KPIs del proyecto |
| `/app/prototypes`, `/app/prototypes/:id` | Administración de prototipos y editor de puntos |
| `/app/graph` | Grafo de conocimiento |
| `/vision` | Página pública Visión: cifras, globo, diagrama del ecosistema, recorrido por capas, solicitudes |
| `/app/solicitudes` | Bandeja de solicitudes (solo superadministrador) |
| `/app/fuentes` | Fuentes de bancos de plantas: registro de conectores con estado, licencia y última sincronización; sincronizar (solo superadministrador) |
| `/app/ontologia` | Ontología: árbol por dominio, buscador y ficha de término; proponer con sugerencias de equivalencias; «Mis propuestas»; bandeja de revisión (solo superadministrador) |

Sistema de diseño «Salvia cristal», con modo claro y oscuro y diseño adaptable desde 375 px. three.js y d3-force se cargan en *chunks* perezosos para no penalizar la carga inicial.

## 7. Persistencia y migraciones

| Migración | Contenido |
|---|---|
| `0001_identity_audit` | Organizaciones, usuarios, membresías, auditoría |
| `0002_catalog_projects` | Catálogo, fuentes, afirmaciones, proyectos, ciclos, observaciones |
| `0003_prototypes` | Prototipos y activos |
| `0004_prototype_hotspots` | Puntos etiquetados sobre STL |
| `0005_simulation_telemetry` | Corridas, dispositivos, lecturas, reglas e incidentes |
| `0006_studio_layout_species_media` | Zonas y plantas del Studio; medios de especie |
| `0007_graph_edges` | Aristas explícitas del grafo |
| `0008_vision` | Reconocimientos y solicitudes entrantes (módulo `vision`, M1) |
| `0009_ontology` | Términos, equivalencias, conceptos externos y versiones de la ontología; columnas `*_term_id` en catálogo y proyectos (M2; aplicada en producción el 2026-11-10) |
| `0010_connectors` | Copias locales de bancos de plantas (`connector_snapshots`), corridas de sincronización (`connector_syncs`) y `crop_cycles.accession_ref` (M3; aplicada en producción el 2026-11-11) |

Toda migración se verifica en PostgreSQL 17 con el ciclo `upgrade → check → downgrade → upgrade → check` sin diferencias.

## 8. Seguridad

- Autenticación JWT; contraseñas con bcrypt.
- Roles por membresía; operaciones de medios de especie restringidas a superadministrador.
- Aislamiento por organización en la capa de consulta (`scoped`) y en las restricciones de base de datos.
- Borrado lógico (`deleted_at`): los registros borrados no aparecen ni cuentan en indicadores.
- Secretos solo en el backend y en variables de entorno de Railway.

## 9. Despliegue y operación

Imagen Docker de varias etapas (build del frontend en `node:20-alpine`, API en `python:3.12-slim`). Railway despliega cada *push* a `main`; al arrancar se ejecutan `alembic upgrade head` y el seed idempotente. Salud: `/api/v1/health/ready`. Producción: <https://harvestt-production.up.railway.app>.

## 10. Calidad

Desarrollo guiado por pruebas por fase. La puerta de cada entrega exige pytest, verificación de tipos, Vitest y build en verde; migraciones probadas; *smoke test* del contenedor; revisión visual en claro, oscuro y 375 px; y autorización explícita para fusionar y desplegar. Suites: `tests/` (backend, un archivo por módulo) y pruebas `*.test.tsx` junto a cada componente.

# Arquitectura de HarvestT Cortex

**Versión del documento:** 1.0 · **Fecha:** 2026-11-07 · **Estado del sistema:** hito visual V1–V6 en producción · **Migración vigente:** `0007_graph_edges`

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

La especificación OpenAPI completa se publica en `/api/docs`.

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
├── features/     catalog · projects · operations · studio · impact · graph · prototypes · three · home
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

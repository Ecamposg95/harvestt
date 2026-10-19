# HarvestT Cortex — Base (subproyecto 1) y Prototipos (subproyecto 2)

Fecha: 2026-10-19 · Spec fuente de producto: `docs/HARVESTT_TASK_PACK.md` · Estado: aprobado en conversación (estructura A, prototipos C, orden A).

## 1. Decisiones

| Tema | Decisión |
|---|---|
| Stack | Patrón Atlas: FastAPI + Pydantic 2 + SQLAlchemy 2 (sync) + Alembic; React 18 + TS + Vite 5 + Tailwind 3 + react-router 6 + zustand + axios |
| Layout | Estilo atlas-one: `app/` (backend), `frontend/`, `alembic/`, `scripts/`, `tests/`, `docs/` |
| Infra | Un servicio Railway (`fad7b283-5a14-49ad-900c-fb828bfeeab5`) + plugin Postgres + bucket Railway (S3) para archivos. Deploy por push a `main` |
| Arranque | `alembic upgrade head` → `python -m scripts.seed` (idempotente) → uvicorn `${PORT:-8000}` (en CMD, no release phase) |
| Worker | Outbox en proceso cuando se necesite (Cortex). No hay worker en este subproyecto |
| Orden de subproyectos | Base → Prototipos → Grafo (solo exploración) → Cortex → Studio 3D → Invernadero virtual → Agentes |
| Prototipos | Vitrina pública + vista interna. STL interactivo + galería de imágenes. Estilo "vehículos SpaceX": un prototipo por propósito, sin comparador |

## 2. Base

### 2.1 Backend core (`app/core/`)

- `config.py`: `Settings` leyendo env. Variables: `DATABASE_URL`, `SECRET_KEY`, `ENVIRONMENT` (`development|demo|staging|production`), `CORS_ORIGINS`, `ACCESS_TOKEN_MINUTES` (720), `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ORG_NAME`, `SEED_ORG_SLUG`, `PUBLIC_ORG_SLUG`, `STORAGE_BACKEND` (`local|s3`), `STORAGE_DIR`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Fuera de `development` se rechaza arrancar con `SECRET_KEY` por defecto.
- `db.py`: `engine`, `SessionLocal`, `Base`, `get_db`. Tipos portables (String, Text, JSON, DateTime tz) para que los tests corran en SQLite.
- `mixins.py`: `UUIDMixin` (`id String(36)`), `TenantMixin` (`organization_id` FK, index), `AuditMixin` (`created_at`, `updated_at`, `deleted_at`).
- `security.py`: bcrypt (passlib + bcrypt 4.0.1), JWT HS256 (python-jose).
- `deps.py`: `get_current_user`, `get_context` → `RequestContext(user, organization, role)` resuelto desde `X-Organization-ID` y validado contra membresía; `require_role("editor")` (jerarquía `viewer < editor < admin`; `is_superadmin` pasa todo).
- `tenant.py`: `scoped(query, Model, ctx)` filtra por `organization_id` y `deleted_at IS NULL`. Obligatorio en todo recurso privado.
- `errors.py`: respuesta uniforme `{"error": {"code", "message", "request_id", "details"}}`; middleware asigna `X-Request-ID`.
- `storage.py`: interfaz `Storage.put(key, fileobj, content_type) / open(key) / delete(key) / exists(key)`; `LocalStorage` (dev/tests) y `S3Storage` (boto3). Los archivos se sirven siempre a través de la API (streaming), nunca con URL pública del bucket.
- `audit.py`: `record(db, ctx, resource_type, resource_id, operation, data=None)` → `AuditEvent`.

### 2.2 Módulos

Cada módulo: `app/modules/<x>/{models,schemas,service,router,seed}.py`. `app/models_registry.py` importa todos los `models`. `app/main.py` incluye todos los routers bajo `/api/v1`.

- `identity`: `Organization(id, name, slug unique)`, `User(id, email unique, full_name, password_hash, is_active, is_superadmin)`, `Membership(user_id, organization_id, role, status)`. Endpoints: `POST /auth/login` (form o JSON → `{access_token, token_type, user}`), `GET /auth/me` (usuario + membresías). Sin registro público; superadmin y org demo vía seed.
- `audit`: `AuditEvent(organization_id nullable, actor_id, resource_type, resource_id, operation, data JSON, request_id, created_at)`.
- `catalog` (global, sin tenant; escritura solo superadmin): `Species(id, scientific_name, authorship, common_names JSON[{lang,name}], family, external_ids JSON, summary)`, `Cultivar(species_id, name, provenance)`, `Source(id, title, publisher, url, license, accessed_at, rights JSON)`, `TraitAssertion(subject_type, subject_id, variable, value_min, value_max, unit, growth_stage, cultivation_system, origin, review_status, evidence_refs JSON, notes)`. `origin ∈ measured|sourced|derived|simulated|illustrative|missing`. Endpoints: `GET /plants?q=&family=&page=`, `GET /plants/{id}` (incluye cultivares, afirmaciones con fuentes), `GET /sources/{id}`.
- `projects` (tenant): `Project(name, objectives, area_m2 >0 nullable, system, location nullable, version)`, `CropCycle(project_id, species_id, cultivar_id nullable, started_on, stage, status)`, `Observation(project_id, crop_cycle_id nullable, kind, content, author_id, observed_at)`. Endpoints: `GET/POST /projects`, `GET/PATCH /projects/{id}` (PATCH con `version`, 409 si no coincide), `POST /projects/{id}/crop-cycles`, `GET/POST /projects/{id}/observations`. Todo auditado.

### 2.3 Seed

`scripts/seed.py` idempotente: superadmin y org demo (env), membresía admin; `catalog.seed` con Lactuca sativa, Solanum lycopersicum y Ocimum basilicum. IDs externos (GBIF) solo si se verificaron contra la API oficial; si no, `null`. Ninguna cifra agronómica: las afirmaciones iniciales se crean con `origin="missing"` para mostrar "desconocido".

### 2.4 Frontend (`frontend/`)

- Tokens CSS en `:root` (claro) y `.dark` (grafito); acento esmeralda; IBM Plex Sans / Plex Mono. Vitrina pública oscura por defecto.
- Rutas: `/` vitrina, `/prototipos/:slug` detalle público, `/login`, `/app` (inicio), `/app/plants`, `/app/plants/:id`, `/app/projects`, `/app/projects/:id`, `/app/prototypes`, `/app/prototypes/:id`.
- `src/api/client.ts` (axios con `Authorization` y `X-Organization-ID`), `src/store/auth.ts` (zustand, token en localStorage con try/catch), `src/components/ui/*` propios, `src/features/<x>/` por módulo. Estados: carga, vacío, error, sin permiso.

### 2.5 Infra y operación

- `Dockerfile` multi-etapa (node:20-alpine → python:3.12-slim) ; FastAPI sirve `frontend/dist` (`/assets` + catch-all que no captura `/api/*`).
- `docker-compose.yml` (Postgres 17 + app) para desarrollo; `Makefile` con `setup`, `dev`, `migrate`, `seed-demo`, `test-critical`, `build`.
- `GET /api/v1/health/live`, `/health/ready` (consulta DB).
- CI GitHub Actions: pytest, `tsc -b`, vitest, `vite build`.
- `.gitignore` incluye `docs/private/`, `.env`, `storage/`.

## 3. Prototipos

### 3.1 Modelo (`app/modules/prototypes`, tenant)

- `Prototype(id, organization_id, slug unique por org, name, codename nullable, purpose (1 línea), summary, description (Markdown), status, specs JSON [{label, value, unit?}], is_public, published_at, sort_order, hero_asset_id nullable, version)`.
- `status ∈ concept|design|in_construction|testing|operational|retired` (String + constantes).
- `PrototypeAsset(id, organization_id, prototype_id, kind ∈ image|model_stl, filename, content_type, size_bytes, checksum_sha256, storage_key, caption, is_public, sort_order)`.

### 3.2 API

Interna (`editor` para escribir, `viewer` para leer):
- `GET/POST /prototypes`, `GET/PATCH/DELETE /prototypes/{id}` (soft delete; PATCH con `version`).
- `POST /prototypes/{id}/assets` multipart (`file`, `kind`, `caption`, `is_public`); `PATCH/DELETE /prototypes/{id}/assets/{asset_id}`; `GET /prototypes/{id}/assets/{asset_id}/file` (stream).
- Validación: imágenes `png|jpg|jpeg|webp` ≤ 15 MB verificadas por firma de bytes; STL ≤ 100 MB, binario (84 + 50·n bytes) o ASCII que inicia con `solid`. Checksum SHA-256; nombre de archivo saneado; clave de storage `prototypes/{org}/{prototype}/{asset}.{ext}`.

Pública (sin auth, solo org `PUBLIC_ORG_SLUG`):
- `GET /public/prototypes` → prototipos `is_public` ordenados, con hero.
- `GET /public/prototypes/{slug}` → detalle con assets públicos únicamente.
- `GET /public/assets/{asset_id}` → stream solo si asset y prototipo son públicos y no borrados; `Cache-Control: public, max-age=3600`.
- La respuesta pública nunca incluye campos internos (`storage_key`, `organization_id`, notas, assets privados).

### 3.3 Frontend

- Vitrina `/`: héroe "HarvestT", grilla de prototipos grandes (imagen hero, nombre, propósito, estado). Vacío: "Prototipos en construcción".
- Detalle `/prototipos/:slug`: visor STL (three.js + STLLoader + OrbitControls; material uniforme, centrado y escalado automático, rotación lenta pausable, carga perezosa, fallback si no hay WebGL), galería con lightbox, propósito, specs, estado. Insignia "En construcción" cuando aplique.
- Admin `/app/prototypes`: lista, crear/editar, subir/ordenar/borrar assets, marcar público, vista previa.

## 4. Pruebas críticas

- Aislamiento: usuario de org A no lee/modifica proyectos ni prototipos de B cambiando IDs (404).
- Roles: viewer no escribe (403); editor no muta catálogo global.
- Público: prototipo/asset no público → 404; respuesta pública sin campos internos.
- Uploads: tipo falso, tamaño excedido, STL inválido → 422.
- Conflicto de versión → 409. Recarga conserva proyecto + observación.
- Arranque: migraciones desde DB vacía; seed idempotente (dos ejecuciones).

## 5. Fuera de alcance aquí

RAG, conectores GBIF/AGROVOC en vivo, grafo, 3D de planta, simulación, agentes, registro público de usuarios, edición de notas en el grafo, glTF.

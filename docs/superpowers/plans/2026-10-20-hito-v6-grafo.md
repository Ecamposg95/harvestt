# Hito visual V6 — Grafo de conocimiento (solo exploración) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que cualquier miembro abra `/app/graph` y explore, estilo Obsidian, cómo se conectan especies, cultivares, rasgos, fuentes, proyectos, ciclos y prototipos, con cada relación respaldada por un dato real (FK, afirmación con su evidencia, identificador externo verificado o arista registrada) y su procedencia visible; sin edición.

**Architecture:** backend: módulo nuevo `app/modules/graph/` con la tabla `graph_edges` (migración `0007`, `organization_id` nulo = global), un servicio que arma el grafo visible en memoria por petición (catálogo global + datos del tenant activo + aristas guardadas visibles) y lo recorta por foco, profundidad, tipos y tope de 300 nodos, y `GET /api/v1/graph`. Las aristas guardadas solo se escriben con `service.create_edge` (sin endpoint HTTP: la edición del grafo está fuera de alcance), que aplica las reglas de permiso. Frontend: página perezosa `/app/graph` con `d3-force` en su propio chunk; módulos puros y probados (`model.ts` datos y textos, `palette.ts` colores por tema, `camera.ts` zoom/pan, `layout.ts` simulación determinista, `draw.ts` dibujo Canvas 2D) y un componente `GraphCanvas` que solo orquesta el bucle de animación y los punteros.

**Tech Stack:** FastAPI 0.127, SQLAlchemy 2 (sync), Alembic, pytest (SQLite en pruebas, Postgres 17 en producción); React 18.3.1, TS 5.6, Vite 5, Tailwind 3, vitest 2.1.9 + Testing Library, zustand; **nuevo:** `d3-force` 3.0.0 y `@types/d3-force` 3.0.10 (spec §10).

**Spec:** `docs/superpowers/specs/2026-10-19-hito-visual-design.md` (sección 8; también 1, 3.2, 9, 10 y 11).

**Rama:** `feat/hito-v6-grafo` (worktree `.claude/worktrees/v6-plan`, creada desde `feat/demo-visual` @ `39913bc`). **Orden de merge:** después de V3 (`0005_simulation_telemetry`) y V4 (`0006_studio_layout_species_media`), porque `0007_graph_edges` declara `down_revision = "0006"`. Las pruebas usan `Base.metadata.create_all`, así que pytest pasa en la rama aunque `0005`/`0006` aún no existan; la verificación de Alembic en Postgres (Task 7) se hace tras rebasar sobre un `main` que ya las tenga. Archivos con conflicto probable al rebasar (solo líneas añadidas, resolución trivial): `app/main.py` (tupla de routers), `app/models_registry.py`, `app/modules/home/service.py` (`_TEXTS`), `frontend/src/App.tsx`, `frontend/src/components/Sidebar.tsx`, `frontend/src/components/icons.tsx`, `frontend/src/styles/index.css`, `frontend/package*.json`, `README.md`.

## Global Constraints

- Dependencias nuevas: solo `d3-force@3.0.0` (dependencies) y `@types/d3-force@3.0.10` (devDependencies), con versión exacta (`--save-exact`). Backend: ninguna.
- `d3-force` solo dentro del chunk perezoso de `/app/graph`: nada alcanzable por imports estáticos desde `App.tsx` puede importar `d3-force` (ni `three`). `App.tsx` carga la página con `lazy(() => import('@/features/graph/GraphPage'))`. Lo fija `lazyChunk.test.ts` (Task 6).
- IDs de nodo en la API: `"<tipo>:<id>"` (`species:<uuid>`, `trait:<variable>`, …). `focus_id` recibe el id crudo (sin prefijo). Tipos: `species | cultivar | trait | source | project | crop_cycle | prototype`.
- Nodos globales: `species`, `cultivar`, `trait`, `source` (catálogo, sin tenant). Nodos de tenant: `project`, `crop_cycle`, `prototype`, siempre leídos con `scoped(…, ctx)`. **Nunca** sale un nodo, una etiqueta ni un id de otro tenant; una arista solo se devuelve si sus dos extremos son nodos visibles.
- Aristas implícitas (derivadas al leer, nunca guardadas): `cultivar_of` (cultivar→especie), `has_trait` (especie/cultivar→rasgo, una procedencia por afirmación), `cites` (especie/cultivar→fuente por cada `evidence_refs` y especie→fuente por `external_ids`), `grows` (ciclo→especie y ciclo→cultivar), `has_cycle` (proyecto→ciclo).
- Aristas guardadas (`GraphEdge`): vocabulario cerrado `designed_for | related_to | cites` (CHECK en BD + `Literal` en el esquema). `organization_id = NULL` → global, solo escribible por superadmin y solo entre nodos globales (422 si toca un nodo de tenant; al leer, una global que toque un tipo de tenant se ignora). Arista de organización: editor+ de esa organización o superadmin; ambos extremos deben existir y ser visibles para esa organización. Toda escritura se audita con `resource_type="graph_edge"`.
- Sin relaciones inventadas: ningún seed crea `GraphEdge` (prueba con todos los `SEEDS`).
- `provenance` de cada arista en la API es una **lista** de objetos con `kind` ∈ `fk | assertion | evidence | external_id | edge`; misma (src, dst, relación) acumula procedencias sin duplicar.
- Máximo 300 nodos (`MAX_NODES`); al cortar, `truncated: true` y solo aristas entre nodos conservados. Con foco: recorrido en anchura (lo más cercano primero). Sin foco: más conectados primero. Orden determinista.
- Lectura del grafo: cualquier miembro (`get_context`). Sin endpoints de escritura: `POST/PATCH/DELETE /graph` → 405.
- Lienzo Canvas 2D (no SVG). La simulación vive en `layout.ts` (pura, semilla fija, posiciones iniciales por hash del id, avanzable con `settle(sim, n)`); el dibujo en `draw.ts` (función pura sobre una interfaz `Ctx2D`); `GraphCanvas.tsx` no contiene lógica de layout ni de dibujo.
- Colores del lienzo desde `graphPalette(dark)` con `dark` leído de `useTheme`; el fondo del escenario es CSS (`.graph-stage`) sobre los tokens del tema. Al cambiar de tema el lienzo se redibuja sin recargar.
- Copias de UI en español; Tailwind: `text-accent` para texto verde, `bg-lime` solo relleno, opacidades en múltiplos de 5.
- Comandos: backend `~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings`; frontend (en `frontend/`) `npx tsc -b`, `npx vitest run`, `npm run build`.

## Review Focus

1. **Fuga entre tenants:** el grafo de alfa no puede contener ni un id ni un nombre de beta, aunque exista una arista guardada en alfa que apunte a un prototipo de beta, y enfocar un nodo de beta desde alfa responde 404. Lo fija `test_never_includes_other_tenant_nodes` (Task 2).
2. **Corte a 300 nodos:** con más de 300 nodos visibles se devuelven exactamente 300, `truncated` es `true`, los nodos conectados sobreviven al corte y ninguna arista apunta a un nodo descartado; con foco el corte respeta el orden por distancia. Lo fijan `test_truncates_at_300_nodes` y `test_select_subgraph_cuts_in_bfs_order` (Task 2).
3. **Aristas globales:** solo un superadmin escribe aristas globales, y una arista global nunca puede unir un nodo de tenant (sería un canal para filtrar datos privados al resto de organizaciones). Lo fijan `test_only_superadmin_writes_global` y `test_global_edge_cannot_touch_tenant_nodes` (Task 1).
4. **Lienzo legible y enfocado:** etiquetas solo al acercar (salvo concentradores, el nodo enfocado y sus vecinos), lo ajeno al foco se atenúa y el brillo pulsante solo lo lleva el nodo enfocado, con los colores de la paleta del tema. Lo fija `draw.test.ts` (Task 5).
5. **d3-force fuera del chunk inicial:** la vitrina pública y el resto de `/app` no deben descargar la simulación. Lo fija `lazyChunk.test.ts`, que recorre los imports estáticos desde `App.tsx` (Task 6), y se confirma con `grep` sobre `dist/` (Task 7).

## Rulings sobre el spec

- **`meta` en los nodos.** El spec define nodos `{id, type, label, origin?}`; se añade `meta` (diccionario de textos, opcional) con `scientific_name` (especie), `species_id` (cultivar), `project_id` (ciclo), `url`/`license` (fuente), `variable` (rasgo), `status`/`system`. Motivo: el panel necesita enlazar la pantalla del recurso aunque el filtro de tipos oculte al padre, y la búsqueda debe encontrar "lactuca". Costo si está mal: quitar un campo.
- **Nombres de relaciones implícitas.** El vocabulario cerrado del spec aplica a `GraphEdge` (lo guardado). Las aristas derivadas usan `cultivar_of`, `has_trait`, `grows`, `has_cycle`; la evidencia de una afirmación reutiliza `cites`. Costo si está mal: renombrar constantes y etiquetas.
- **Especie → fuente por identificador externo.** Además de las aristas listadas en el spec, `Species.external_ids[*].source_id` (GBIF, verificado en el seed) genera `cites` con procedencia `external_id`. Es un dato real ya guardado; sin esto la fuente GBIF del seed queda aislada. Costo si está mal: borrar un bucle.
- **Ciclo → cultivar.** Si el ciclo tiene `cultivar_id`, además de ciclo→especie se emite ciclo→cultivar (`grows`). Es la misma FK real. Costo si está mal: borrar dos líneas.
- **`provenance` como lista.** Una arista puede existir por varias razones (p. ej. tres afirmaciones de fotoperiodo de la misma especie); se devuelve una lista en lugar de un objeto. Costo si está mal: cambiar el tipo en esquema y cliente.
- **Sin escritura HTTP de `GraphEdge`.** El spec §11 excluye la edición del grafo; la regla "global solo superadmin" se implementa y prueba en `service.create_edge` (sin router). En esta fase no hay forma de crear aristas guardadas desde la UI, así que la demo muestra solo aristas implícitas. Costo si está mal: un router de 15 líneas sobre el servicio ya probado.
- **Semántica de foco, profundidad y tipos.** Sin foco se devuelve el grafo visible completo (ordenado por grado) y `depth` se ignora. Con foco, `depth` = saltos. El nodo enfocado siempre se incluye aunque su tipo esté filtrado; los nodos de tipos filtrados no se devuelven ni se atraviesan. Costo si está mal: ajustar `select_subgraph`.
- **Origen del nodo rasgo.** Un rasgo (`trait:<variable>`) agrupa afirmaciones de varias especies; su `origin` es el mejor origen entre ellas (orden `measured > sourced > derived > simulated > illustrative > missing`). El origen de cada afirmación va en la procedencia de su arista `has_trait`. Costo si está mal: cambiar una línea.
- **Grafo en memoria por petición.** P0 tiene decenas de filas; se cargan las entidades visibles y se recorre en Python. Si el catálogo supera ~5 000 entidades, pasar a consultas por vecindad sin cambiar el contrato del API.
- **Filtros de tipo en el servidor.** Los chips de tipo vuelven a pedir `GET /graph?types=…`; el lienzo conserva las posiciones de los nodos que siguen visibles para que el cambio no "salte". Costo si está mal: filtrar en cliente.

## Mapa de archivos

| Archivo | Tarea | Responsabilidad |
|---|---|---|
| `app/modules/graph/__init__.py` | 1 | paquete |
| `app/modules/graph/models.py` | 1 | `GraphEdge`, tipos de nodo, relaciones, `MAX_NODES` |
| `alembic/versions/0007_graph_edges.py` | 1 | tabla `graph_edges` |
| `app/modules/graph/schemas.py` | 1, 2 | `EdgeCreate`, `GraphOut` y afines |
| `app/modules/graph/service.py` | 1, 2 | `create_edge` con permisos; `build_graph`, `select_subgraph`, `graph_view` |
| `app/modules/graph/router.py` | 2 | `GET /graph` |
| `app/models_registry.py` | 1 | registra modelos del grafo |
| `app/main.py` | 2 | incluye el router |
| `app/modules/home/service.py` | 1 | texto de actividad `graph_edge` |
| `tests/test_graph_edges.py` | 1 | permisos, vocabulario, seeds sin aristas |
| `tests/test_graph.py` | 2 | lectura, tenant, corte, foco, tipos |
| `frontend/package.json`, `frontend/package-lock.json` | 3 | `d3-force`, `@types/d3-force` |
| `frontend/src/features/graph/api.ts` | 3 | tipos y `graphApi` |
| `frontend/src/features/graph/fixtures.ts` | 3 | grafo de ejemplo para pruebas |
| `frontend/src/features/graph/model.ts` | 3 | etiquetas, enlaces, búsqueda, conexiones, procedencia |
| `frontend/src/features/graph/palette.ts` | 3 | colores por tipo y tema |
| `frontend/src/features/graph/model.test.ts`, `palette.test.ts` | 3 | pruebas |
| `frontend/src/features/graph/camera.ts` | 4 | vista, zoom, encuadre, interpolación |
| `frontend/src/features/graph/layout.ts` | 4 | simulación `d3-force` determinista |
| `frontend/src/features/graph/camera.test.ts`, `layout.test.ts` | 4 | pruebas |
| `frontend/src/features/graph/draw.ts` | 5 | dibujo Canvas 2D |
| `frontend/src/features/graph/draw.test.ts` | 5 | pruebas con contexto grabador |
| `frontend/src/features/graph/GraphCanvas.tsx` | 5 | lienzo, bucle, punteros, controles de zoom |
| `frontend/src/features/graph/GraphPage.tsx` | 6 | página: búsqueda, leyenda/filtros, panel |
| `frontend/src/features/graph/graph.test.tsx` | 6 | pruebas de la página |
| `frontend/src/features/graph/lazyChunk.test.ts` | 6 | `d3-force` fuera del chunk inicial |
| `frontend/src/App.tsx`, `App.test.tsx` | 6 | ruta perezosa `/app/graph` |
| `frontend/src/components/Sidebar.tsx`, `sidebar.test.tsx`, `icons.tsx` | 6 | entrada "Grafo" e ícono |
| `frontend/src/styles/index.css` | 6 | `.graph-stage` |
| `README.md` | 7 | checklist real / simulado / pendiente |

**Paralelismo:** dos carriles independientes. **Carril backend:** Task 1 → Task 2. **Carril frontend:** Task 3 → Task 4 → Task 5 → Task 6 (el frontend se prueba con el API simulado y no necesita el backend). Los carriles no comparten archivos. Task 7 al final, con ambos carriles terminados.

---

### Task 1: Modelo `GraphEdge`, migración `0007` y escritura con permisos

**Files:**
- Create: `app/modules/graph/__init__.py`
- Create: `app/modules/graph/models.py`
- Create: `alembic/versions/0007_graph_edges.py`
- Create: `app/modules/graph/schemas.py`
- Create: `app/modules/graph/service.py`
- Modify: `app/models_registry.py`
- Modify: `app/modules/home/service.py`
- Create: `tests/test_graph_edges.py`

**Interfaces:**
- Consumes: `record`, `scoped`, `AppError`, `forbidden`, `unprocessable`, `Membership`, `ROLE_RANK`, modelos de catálogo, proyectos y prototipos; `make_member` y `tenants` de `tests/conftest.py`; `SEEDS` de `scripts/seed.py`.
- Produces: `GraphEdge`; constantes `NODE_*`, `NODE_TYPES`, `GLOBAL_NODE_TYPES`, `TENANT_NODE_TYPES`, `REL_*`, `EDGE_RELATIONS`, `MAX_NODES = 300`, `EDGE_RESOURCE = "graph_edge"`; esquemas `NodeType`, `Relation`, `EdgeCreate`, `EdgeProvenanceIn`; `service.node_id(type, raw) -> str`; `service.create_edge(db, actor: User, organization_id: str | None, data: EdgeCreate) -> GraphEdge` (hace commit). Errores: 403 `forbidden`; 422 `invalid_input` con `details.field` ∈ `src_type | dst_type | src_id | dst_id | provenance.source_id`; 409 `edge_exists`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/test_graph_edges.py`:

```python
from typing import get_args

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.core.errors import AppError
from app.modules.audit.models import AuditEvent
from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Source, Species
from app.modules.graph import service
from app.modules.graph.models import EDGE_RELATIONS, NODE_TYPES, GraphEdge
from app.modules.graph.schemas import EdgeCreate, NodeType, Relation
from app.modules.identity.models import User
from scripts.seed import SEEDS
from tests.conftest import make_member

API = "/api/v1"


@pytest.fixture
def catalog(db):
    catalog_seed.seed(db)
    db.commit()
    species = {s.scientific_name: s for s in db.scalars(select(Species))}
    return {
        "lettuce": species["Lactuca sativa L."].id,
        "tomato": species["Solanum lycopersicum L."].id,
        "gbif": db.scalar(select(Source)).id,
    }


def user(db, email: str) -> User:
    return db.scalar(select(User).where(User.email == email))


def superadmin(db) -> User:
    _, root = make_member(db, "alfa", "root@alfa.test", "admin", superadmin=True)
    return root


def proto(client, headers, name="Germinador G1") -> str:
    res = client.post(f"{API}/prototypes", json={"name": name, "purpose": "Germinar semillas"}, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def edge(src_type, src_id, dst_type, dst_id, relation="designed_for", **provenance) -> EdgeCreate:
    return EdgeCreate(
        src_type=src_type, src_id=src_id, dst_type=dst_type, dst_id=dst_id, relation=relation, provenance=provenance
    )


def test_schema_literals_match_constants():
    assert set(get_args(NodeType)) == set(NODE_TYPES)
    assert set(get_args(Relation)) == set(EDGE_RELATIONS) == {"designed_for", "related_to", "cites"}


def test_superadmin_writes_global_edge_and_it_is_audited(db, tenants, catalog):
    root = superadmin(db)
    created = service.create_edge(
        db, root, None, edge("species", catalog["lettuce"], "species", catalog["tomato"], "related_to", note="Misma bandeja")
    )
    assert created.organization_id is None and created.relation == "related_to"
    assert created.provenance == {"note": "Misma bandeja", "author_id": root.id}
    event = db.scalar(select(AuditEvent).where(AuditEvent.resource_type == "graph_edge"))
    assert event.resource_id == created.id and event.operation == "create"
    assert event.actor_id == root.id and event.organization_id is None


def test_only_superadmin_writes_global(db, tenants, catalog):
    for email in ("admin@alfa.test", "editor@alfa.test", "viewer@beta.test"):
        with pytest.raises(AppError) as exc:
            service.create_edge(db, user(db, email), None, edge("species", catalog["lettuce"], "source", catalog["gbif"], "cites"))
        assert exc.value.status_code == 403, email
    assert db.scalar(select(func.count()).select_from(GraphEdge)) == 0


def test_global_edge_cannot_touch_tenant_nodes(db, client, tenants, catalog):
    root = superadmin(db)
    pid = proto(client, tenants["alfa_editor"])
    with pytest.raises(AppError) as exc:
        service.create_edge(db, root, None, edge("prototype", pid, "species", catalog["lettuce"]))
    assert exc.value.status_code == 422 and exc.value.details["field"] == "src_type"
    with pytest.raises(AppError) as exc:
        service.create_edge(db, root, None, edge("species", catalog["lettuce"], "prototype", pid, "related_to"))
    assert exc.value.status_code == 422 and exc.value.details["field"] == "dst_type"
    assert db.scalar(select(func.count()).select_from(GraphEdge)) == 0


def test_tenant_edge_needs_editor_of_that_org(db, client, tenants, catalog):
    alfa = tenants["alfa_org"].id
    pid = proto(client, tenants["alfa_editor"])
    editor = user(db, "editor@alfa.test")
    created = service.create_edge(
        db, editor, alfa, edge("prototype", pid, "species", catalog["lettuce"], note="Bandeja para lechuga")
    )
    assert created.organization_id == alfa
    assert created.provenance == {"note": "Bandeja para lechuga", "author_id": editor.id}
    for email in ("viewer@alfa.test", "editor@beta.test", "admin@beta.test"):
        with pytest.raises(AppError) as exc:
            service.create_edge(db, user(db, email), alfa, edge("prototype", pid, "species", catalog["tomato"]))
        assert exc.value.status_code == 403, email
    # Un superadmin puede escribir en cualquier organización
    assert service.create_edge(db, superadmin(db), alfa, edge("prototype", pid, "species", catalog["tomato"])).id


def test_tenant_edge_cannot_point_to_other_tenant(db, client, tenants, catalog):
    beta_proto = proto(client, tenants["beta_editor"], "Proto beta")
    alfa_proto = proto(client, tenants["alfa_editor"])
    with pytest.raises(AppError) as exc:
        service.create_edge(
            db, user(db, "editor@alfa.test"), tenants["alfa_org"].id,
            edge("prototype", alfa_proto, "prototype", beta_proto, "related_to"),
        )
    assert exc.value.status_code == 422 and exc.value.details["field"] == "dst_id"


def test_rejects_unknown_nodes_self_loops_bad_source_and_duplicates(db, client, tenants, catalog):
    editor = user(db, "editor@alfa.test")
    alfa = tenants["alfa_org"].id
    pid = proto(client, tenants["alfa_editor"])
    cases = [
        (edge("prototype", pid, "species", "no-existe"), "dst_id"),
        (edge("trait", "inventado", "source", catalog["gbif"], "cites"), "src_id"),
        (edge("prototype", pid, "prototype", pid, "related_to"), "dst_id"),
        (edge("prototype", pid, "species", catalog["lettuce"], source_id="no-existe"), "provenance.source_id"),
    ]
    for body, field in cases:
        with pytest.raises(AppError) as exc:
            service.create_edge(db, editor, alfa, body)
        assert exc.value.status_code == 422 and exc.value.details["field"] == field, field
    # Un rasgo existe si hay alguna afirmación con esa variable
    assert service.create_edge(db, editor, alfa, edge("trait", "photoperiod", "source", catalog["gbif"], "cites")).id
    service.create_edge(db, editor, alfa, edge("prototype", pid, "species", catalog["lettuce"], source_id=catalog["gbif"]))
    with pytest.raises(AppError) as exc:
        service.create_edge(db, editor, alfa, edge("prototype", pid, "species", catalog["lettuce"]))
    assert exc.value.status_code == 409 and exc.value.code == "edge_exists"


def test_closed_vocabulary_and_provenance_shape():
    base = {"src_type": "species", "src_id": "a", "dst_type": "source", "dst_id": "b", "relation": "cites"}
    with pytest.raises(ValidationError):
        EdgeCreate(**{**base, "relation": "eats"})
    with pytest.raises(ValidationError):
        EdgeCreate(**{**base, "src_type": "planet"})
    with pytest.raises(ValidationError):
        EdgeCreate(**{**base, "provenance": {"author_id": "x"}})  # el autor lo pone el servicio
    with pytest.raises(ValidationError):
        EdgeCreate(**{**base, "provenance": {"note": "n" * 301}})


def test_seeds_create_no_edges(db):
    for module in SEEDS:
        module.seed(db)
        db.commit()
    assert db.scalar(select(func.count()).select_from(GraphEdge)) == 0
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_graph_edges.py -q -p no:warnings`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.modules.graph'`.

- [ ] **Step 3: Modelo**

Crear `app/modules/graph/__init__.py` vacío.

Crear `app/modules/graph/models.py`:

```python
"""Grafo de conocimiento. Los nodos se derivan al vuelo; solo las aristas explícitas se guardan aquí."""
from sqlalchemy import JSON, CheckConstraint, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, UUIDMixin

NODE_SPECIES = "species"
NODE_CULTIVAR = "cultivar"
NODE_TRAIT = "trait"
NODE_SOURCE = "source"
NODE_PROJECT = "project"
NODE_CROP_CYCLE = "crop_cycle"
NODE_PROTOTYPE = "prototype"
NODE_TYPES = (
    NODE_SPECIES,
    NODE_CULTIVAR,
    NODE_TRAIT,
    NODE_SOURCE,
    NODE_PROJECT,
    NODE_CROP_CYCLE,
    NODE_PROTOTYPE,
)
GLOBAL_NODE_TYPES = (NODE_SPECIES, NODE_CULTIVAR, NODE_TRAIT, NODE_SOURCE)
TENANT_NODE_TYPES = (NODE_PROJECT, NODE_CROP_CYCLE, NODE_PROTOTYPE)

# Vocabulario cerrado de aristas guardadas.
REL_DESIGNED_FOR = "designed_for"
REL_RELATED_TO = "related_to"
REL_CITES = "cites"
EDGE_RELATIONS = (REL_DESIGNED_FOR, REL_RELATED_TO, REL_CITES)

# Relaciones implícitas: se derivan de FKs al leer y nunca se guardan.
REL_CULTIVAR_OF = "cultivar_of"
REL_HAS_TRAIT = "has_trait"
REL_GROWS = "grows"
REL_HAS_CYCLE = "has_cycle"

MAX_NODES = 300
EDGE_RESOURCE = "graph_edge"


class GraphEdge(UUIDMixin, AuditMixin, Base):
    """Arista explícita entre dos nodos. organization_id NULL = global (solo superadmin la escribe)."""

    __tablename__ = "graph_edges"
    __table_args__ = (
        CheckConstraint("relation IN ('designed_for', 'related_to', 'cites')", name="ck_graph_edges_relation"),
        Index("ix_graph_edges_src", "src_type", "src_id"),
        Index("ix_graph_edges_dst", "dst_type", "dst_id"),
    )

    organization_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=True, index=True
    )
    src_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # 64: los rasgos usan la variable como id (hasta 60 caracteres)
    src_id: Mapped[str] = mapped_column(String(64), nullable=False)
    dst_type: Mapped[str] = mapped_column(String(20), nullable=False)
    dst_id: Mapped[str] = mapped_column(String(64), nullable=False)
    relation: Mapped[str] = mapped_column(String(20), nullable=False)
    # {"author_id": "...", "source_id": "...", "locator": "p. 3", "note": "..."}
    provenance: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
```

En `app/models_registry.py`, añadir (orden alfabético):

```python
from app.modules.graph import models as graph_models  # noqa: F401
```

- [ ] **Step 4: Migración**

Crear `alembic/versions/0007_graph_edges.py`:

```python
"""aristas explícitas del grafo de conocimiento

Revision ID: 0007
Revises: 0006

Se aplica después de 0005 (V3) y 0006 (V4): mergear esta rama después de ambas.
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "graph_edges",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("src_type", sa.String(20), nullable=False),
        sa.Column("src_id", sa.String(64), nullable=False),
        sa.Column("dst_type", sa.String(20), nullable=False),
        sa.Column("dst_id", sa.String(64), nullable=False),
        sa.Column("relation", sa.String(20), nullable=False),
        sa.Column("provenance", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("relation IN ('designed_for', 'related_to', 'cites')", name="ck_graph_edges_relation"),
    )
    op.create_index("ix_graph_edges_organization_id", "graph_edges", ["organization_id"])
    op.create_index("ix_graph_edges_src", "graph_edges", ["src_type", "src_id"])
    op.create_index("ix_graph_edges_dst", "graph_edges", ["dst_type", "dst_id"])


def downgrade() -> None:
    op.drop_index("ix_graph_edges_dst", table_name="graph_edges")
    op.drop_index("ix_graph_edges_src", table_name="graph_edges")
    op.drop_index("ix_graph_edges_organization_id", table_name="graph_edges")
    op.drop_table("graph_edges")
```

- [ ] **Step 5: Esquemas de escritura**

Crear `app/modules/graph/schemas.py`:

```python
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

NodeType = Literal["species", "cultivar", "trait", "source", "project", "crop_cycle", "prototype"]
Relation = Literal["designed_for", "related_to", "cites"]


class EdgeProvenanceIn(BaseModel):
    """Procedencia declarada por quien escribe; el autor lo añade el servicio."""

    model_config = ConfigDict(extra="forbid")

    source_id: str | None = Field(default=None, max_length=36)
    locator: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=300)


class EdgeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    src_type: NodeType
    src_id: str = Field(min_length=1, max_length=64)
    dst_type: NodeType
    dst_id: str = Field(min_length=1, max_length=64)
    relation: Relation
    provenance: EdgeProvenanceIn = Field(default_factory=EdgeProvenanceIn)
```

- [ ] **Step 6: Servicio de escritura**

Crear `app/modules/graph/service.py` con la parte de escritura (Task 2 añade la de lectura en este mismo archivo):

```python
"""Grafo de conocimiento.

Nodos derivados al vuelo de entidades reales: catálogo global y proyectos, ciclos y prototipos del tenant activo.
Aristas: FKs, afirmaciones con su evidencia, identificadores externos verificados y `GraphEdge` guardadas.
Nunca se inventan relaciones.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.errors import AppError, forbidden, unprocessable
from app.modules.catalog.models import Cultivar, Source, Species, TraitAssertion
from app.modules.graph.models import (
    EDGE_RESOURCE,
    NODE_CROP_CYCLE,
    NODE_CULTIVAR,
    NODE_PROJECT,
    NODE_PROTOTYPE,
    NODE_SOURCE,
    NODE_SPECIES,
    NODE_TRAIT,
    TENANT_NODE_TYPES,
    GraphEdge,
)
from app.modules.graph.schemas import EdgeCreate
from app.modules.identity.models import MEMBERSHIP_ACTIVE, ROLE_EDITOR, ROLE_RANK, Membership, User
from app.modules.projects.models import CropCycle, Project
from app.modules.prototypes.models import Prototype

_MODELS = {
    NODE_SPECIES: Species,
    NODE_CULTIVAR: Cultivar,
    NODE_SOURCE: Source,
    NODE_PROJECT: Project,
    NODE_CROP_CYCLE: CropCycle,
    NODE_PROTOTYPE: Prototype,
}


def node_id(node_type: str, raw_id: str) -> str:
    return f"{node_type}:{raw_id}"


# ---------- Escritura (sin endpoint HTTP en V6: la edición del grafo está fuera de alcance) ----------


def _can_write(db: Session, actor: User, organization_id: str | None) -> bool:
    if actor.is_superadmin:
        return True
    if organization_id is None:
        return False
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == actor.id,
            Membership.organization_id == organization_id,
            Membership.status == MEMBERSHIP_ACTIVE,
            Membership.deleted_at.is_(None),
        )
    )
    return membership is not None and ROLE_RANK[membership.role] >= ROLE_RANK[ROLE_EDITOR]


def _node_exists(db: Session, organization_id: str | None, node_type: str, raw_id: str) -> bool:
    if node_type == NODE_TRAIT:
        stmt = select(TraitAssertion.id).where(
            TraitAssertion.variable == raw_id, TraitAssertion.deleted_at.is_(None)
        )
        return db.scalar(stmt.limit(1)) is not None
    model = _MODELS[node_type]
    stmt = select(model.id).where(model.id == raw_id, model.deleted_at.is_(None))
    if node_type in TENANT_NODE_TYPES:
        stmt = stmt.where(model.organization_id == organization_id)
    return db.scalar(stmt) is not None


def create_edge(db: Session, actor: User, organization_id: str | None, data: EdgeCreate) -> GraphEdge:
    """Crea una arista guardada. Global (organization_id None) solo superadmin y solo entre nodos globales."""
    if organization_id is None and not actor.is_superadmin:
        raise forbidden("Solo un superadmin puede crear relaciones globales")
    if not _can_write(db, actor, organization_id):
        raise forbidden()
    if organization_id is None:
        for side, node_type in (("src_type", data.src_type), ("dst_type", data.dst_type)):
            if node_type in TENANT_NODE_TYPES:
                raise unprocessable("Una relación global solo puede unir nodos globales", {"field": side})
    if (data.src_type, data.src_id) == (data.dst_type, data.dst_id):
        raise unprocessable("Un nodo no puede relacionarse consigo mismo", {"field": "dst_id"})
    for side, node_type, raw_id in (("src_id", data.src_type, data.src_id), ("dst_id", data.dst_type, data.dst_id)):
        if not _node_exists(db, organization_id, node_type, raw_id):
            raise unprocessable("El nodo no existe o no es visible", {"field": side})
    provenance = data.provenance.model_dump(exclude_none=True)
    if "source_id" in provenance and not _node_exists(db, organization_id, NODE_SOURCE, provenance["source_id"]):
        raise unprocessable("La fuente citada no existe", {"field": "provenance.source_id"})

    scope = GraphEdge.organization_id.is_(None) if organization_id is None else GraphEdge.organization_id == organization_id
    duplicate = db.scalar(
        select(GraphEdge.id).where(
            scope,
            GraphEdge.deleted_at.is_(None),
            GraphEdge.src_type == data.src_type,
            GraphEdge.src_id == data.src_id,
            GraphEdge.dst_type == data.dst_type,
            GraphEdge.dst_id == data.dst_id,
            GraphEdge.relation == data.relation,
        )
    )
    if duplicate:
        raise AppError(409, "edge_exists", "La relación ya existe")

    edge = GraphEdge(
        organization_id=organization_id,
        src_type=data.src_type,
        src_id=data.src_id,
        dst_type=data.dst_type,
        dst_id=data.dst_id,
        relation=data.relation,
        provenance={**provenance, "author_id": actor.id},
    )
    db.add(edge)
    db.flush()
    event = record(
        db,
        None,
        EDGE_RESOURCE,
        edge.id,
        "create",
        {
            "relation": data.relation,
            "src": node_id(data.src_type, data.src_id),
            "dst": node_id(data.dst_type, data.dst_id),
        },
    )
    # record() toma org y actor del contexto HTTP; aquí no hay request.
    event.organization_id = organization_id
    event.actor_id = actor.id
    db.commit()
    db.refresh(edge)
    return edge
```

- [ ] **Step 7: Texto de actividad**

En `app/modules/home/service.py`, añadir a `_TEXTS` (después de las entradas de `prototype_hotspot`):

```python
    ("graph_edge", "create"): "Relación agregada al grafo",
```

- [ ] **Step 8: Correr las pruebas**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_graph_edges.py -q -p no:warnings`
Expected: PASS (9 pruebas). Luego la suite completa: `~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings` → todo PASS.

- [ ] **Step 9: Commit**

```bash
git add app/modules/graph app/models_registry.py app/modules/home/service.py alembic/versions/0007_graph_edges.py tests/test_graph_edges.py
git commit -m "feat(graph): aristas guardadas del grafo con vocabulario cerrado, permisos global/organización y migración 0007"
```

---
### Task 2: Lectura del grafo — nodos derivados, foco, tipos, corte y aislamiento

**Files:**
- Modify: `app/modules/graph/schemas.py`
- Modify: `app/modules/graph/service.py`
- Create: `app/modules/graph/router.py`
- Modify: `app/main.py`
- Create: `tests/test_graph.py`

**Interfaces:**
- Consumes: Task 1 (`GraphEdge`, constantes, `node_id`, `create_edge`, `EdgeCreate`).
- Produces: `GET /api/v1/graph?focus_type=&focus_id=&depth=1..3&types=a,b` → `GraphOut` JSON `{nodes: [{id, type, label, origin, meta}], edges: [{src, dst, relation, provenance: [{kind, …}]}], truncated}`. Errores: 401 sin sesión; 422 `invalid_input` (`details.field` = `focus_type | focus_id | types`, o validación de FastAPI para `depth`/`focus_type`); 404 `not_found` si el foco no es visible. Funciones puras: `build_graph(db, ctx) -> Graph`, `select_subgraph(graph, focus, depth, types, limit=MAX_NODES) -> (list[Node], list[Edge], bool)`, `graph_view(...) -> GraphOut`.
- Procedencias (`kind`): `fk {field}`; `assertion {assertion_id, origin, review_status, growth_stage, cultivation_system}`; `evidence {assertion_id, variable, locator}`; `external_id {system, external_id, url}`; `edge {edge_id, scope: "global" | "organization", author_id, source_id?, locator?, note?}`.

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/test_graph.py`:

```python
import pytest
from sqlalchemy import select

from app.core.mixins import utcnow
from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Cultivar, Source, Species, TraitAssertion
from app.modules.graph import service
from app.modules.graph.models import MAX_NODES, GraphEdge
from app.modules.graph.schemas import EdgeCreate
from tests.conftest import make_member

API = "/api/v1"
GRAPH = f"{API}/graph"


@pytest.fixture
def species(db):
    catalog_seed.seed(db)
    db.commit()
    return {s.scientific_name: s for s in db.scalars(select(Species))}


def graph(client, headers, **params):
    res = client.get(GRAPH, params=params, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def edge_map(body):
    return {(e["src"], e["dst"], e["relation"]): e for e in body["edges"]}


def tenant_data(client, headers, species_id, name, cultivar_id=None):
    project = client.post(f"{API}/projects", json={"name": name}, headers=headers)
    assert project.status_code == 201, project.text
    pid = project.json()["id"]
    cycle = client.post(
        f"{API}/projects/{pid}/crop-cycles",
        json={"species_id": species_id, "cultivar_id": cultivar_id},
        headers=headers,
    )
    assert cycle.status_code == 201, cycle.text
    proto = client.post(f"{API}/prototypes", json={"name": f"Proto {name}", "purpose": "Germinar"}, headers=headers)
    assert proto.status_code == 201, proto.text
    return {"project": pid, "cycle": cycle.json()["id"], "prototype": proto.json()["id"]}


# ---- Contrato y datos del seed ----


def test_requires_auth_and_has_no_write_endpoints(client, tenants):
    assert client.get(GRAPH).status_code == 401
    h = tenants["alfa_admin"]
    assert client.post(GRAPH, json={}, headers=h).status_code == 405
    assert client.patch(GRAPH, json={}, headers=h).status_code == 405
    assert client.delete(GRAPH, headers=h).status_code == 405


def test_seed_catalog_graph(client, tenants, species):
    body = graph(client, tenants["alfa_viewer"])
    types = sorted(n["type"] for n in body["nodes"])
    assert types == ["source"] + ["species"] * 3 + ["trait"] * 4
    assert body["truncated"] is False
    relations = sorted(e["relation"] for e in body["edges"])
    assert relations == ["cites"] * 3 + ["has_trait"] * 12
    nodes = {n["id"]: n for n in body["nodes"]}
    lettuce = species["Lactuca sativa L."]
    assert nodes[f"species:{lettuce.id}"]["label"] == "Lechuga"
    assert nodes[f"species:{lettuce.id}"]["meta"]["scientific_name"] == "Lactuca sativa L."
    assert nodes["trait:ph"]["label"] == "pH" and nodes["trait:ph"]["origin"] == "missing"
    gbif_edge = next(e for e in body["edges"] if e["relation"] == "cites" and e["src"] == f"species:{lettuce.id}")
    assert gbif_edge["provenance"][0]["kind"] == "external_id"
    assert gbif_edge["provenance"][0]["external_id"] == "7403263"
    # Ninguna arista guardada: todo sale de datos reales
    assert not any(p["kind"] == "edge" for e in body["edges"] for p in e["provenance"])


def test_implicit_edges_from_real_data(client, db, tenants, species):
    lettuce = species["Lactuca sativa L."]
    cultivar = Cultivar(species_id=lettuce.id, name="Grand Rapids")
    paper = Source(title="Manual de hidroponía", url="https://example.org/manual", license="CC BY 4.0")
    db.add_all([cultivar, paper])
    db.flush()
    assertion = TraitAssertion(
        subject_type="species",
        subject_id=lettuce.id,
        variable="photoperiod",
        origin="sourced",
        review_status="approved",
        evidence_refs=[{"source_id": paper.id, "locator": "p. 12"}],
    )
    db.add(assertion)
    db.commit()
    data = tenant_data(client, tenants["alfa_editor"], lettuce.id, "Invernadero norte", cultivar_id=cultivar.id)

    body = graph(client, tenants["alfa_viewer"])
    edges = edge_map(body)
    nodes = {n["id"]: n for n in body["nodes"]}
    L = f"species:{lettuce.id}"
    C = f"cultivar:{cultivar.id}"
    cycle = f"crop_cycle:{data['cycle']}"

    assert edges[(C, L, "cultivar_of")]["provenance"] == [{"kind": "fk", "field": "cultivars.species_id"}]
    has_trait = edges[(L, "trait:photoperiod", "has_trait")]["provenance"]
    assert sorted(p["origin"] for p in has_trait) == ["missing", "sourced"]
    assert edges[(L, f"source:{paper.id}", "cites")]["provenance"] == [
        {"kind": "evidence", "assertion_id": assertion.id, "variable": "photoperiod", "locator": "p. 12"}
    ]
    assert edges[(cycle, L, "grows")]["provenance"] == [{"kind": "fk", "field": "crop_cycles.species_id"}]
    assert edges[(cycle, C, "grows")]["provenance"] == [{"kind": "fk", "field": "crop_cycles.cultivar_id"}]
    assert edges[(f"project:{data['project']}", cycle, "has_cycle")]["provenance"] == [
        {"kind": "fk", "field": "crop_cycles.project_id"}
    ]
    # El rasgo toma el mejor origen de sus afirmaciones
    assert nodes["trait:photoperiod"]["origin"] == "sourced"
    assert nodes[C]["meta"]["species_id"] == lettuce.id
    assert nodes[cycle]["label"] == "Ciclo · Lechuga"
    assert nodes[cycle]["meta"]["project_id"] == data["project"]
    assert nodes[f"source:{paper.id}"]["meta"]["url"] == "https://example.org/manual"
    assert nodes[f"prototype:{data['prototype']}"]["label"] == "Proto Invernadero norte"
    # El prototipo no tiene aristas: nada lo relaciona todavía y no se inventa
    assert not any(f"prototype:{data['prototype']}" in (e["src"], e["dst"]) for e in body["edges"])


def test_deleted_entities_are_excluded(client, db, tenants, species):
    lettuce = species["Lactuca sativa L."]
    cultivar = Cultivar(species_id=lettuce.id, name="Retirado")
    db.add(cultivar)
    db.commit()
    data = tenant_data(client, tenants["alfa_editor"], lettuce.id, "Norte")
    assert client.delete(f"{API}/prototypes/{data['prototype']}", headers=tenants["alfa_editor"]).status_code == 204
    db.get(Cultivar, cultivar.id).deleted_at = utcnow()
    db.commit()
    ids = {n["id"] for n in graph(client, tenants["alfa_viewer"])["nodes"]}
    assert f"prototype:{data['prototype']}" not in ids
    assert f"cultivar:{cultivar.id}" not in ids
    assert f"project:{data['project']}" in ids


# ---- Aislamiento por tenant (spec §9 V6) ----


def test_never_includes_other_tenant_nodes(client, db, tenants, species):
    lettuce = species["Lactuca sativa L."].id
    alfa = tenant_data(client, tenants["alfa_editor"], lettuce, "Norte alfa")
    beta = tenant_data(client, tenants["beta_editor"], lettuce, "Sur beta")
    # Arista maliciosa guardada en alfa que apunta a un prototipo de beta (insertada sin pasar por el servicio)
    db.add(
        GraphEdge(
            organization_id=tenants["alfa_org"].id,
            src_type="prototype", src_id=alfa["prototype"],
            dst_type="prototype", dst_id=beta["prototype"],
            relation="related_to", provenance={"note": "fuga"},
        )
    )
    # Arista privada de beta
    db.add(
        GraphEdge(
            organization_id=tenants["beta_org"].id,
            src_type="prototype", src_id=beta["prototype"],
            dst_type="species", dst_id=lettuce,
            relation="designed_for", provenance={},
        )
    )
    db.commit()

    res = client.get(GRAPH, headers=tenants["alfa_viewer"])
    assert res.status_code == 200
    for raw in beta.values():
        assert raw not in res.text
    assert "Sur beta" not in res.text and "fuga" not in res.text
    alfa_ids = {n["id"] for n in res.json()["nodes"]}
    assert {f"project:{alfa['project']}", f"crop_cycle:{alfa['cycle']}", f"prototype:{alfa['prototype']}"} <= alfa_ids
    assert not any(e["relation"] in ("related_to", "designed_for") for e in res.json()["edges"])

    for node_type, key in (("project", "project"), ("crop_cycle", "cycle"), ("prototype", "prototype")):
        res = client.get(GRAPH, params={"focus_type": node_type, "focus_id": beta[key]}, headers=tenants["alfa_viewer"])
        assert res.status_code == 404, node_type

    beta_body = client.get(GRAPH, headers=tenants["beta_viewer"])
    for raw in alfa.values():
        assert raw not in beta_body.text
    assert (f"prototype:{beta['prototype']}", f"species:{lettuce}", "designed_for") in edge_map(beta_body.json())


def test_stored_edges_respect_scope(client, db, tenants, species):
    _, root = make_member(db, "alfa", "root@alfa.test", "admin", superadmin=True)
    lettuce = species["Lactuca sativa L."].id
    tomato = species["Solanum lycopersicum L."].id
    alfa = tenant_data(client, tenants["alfa_editor"], lettuce, "Norte")
    global_edge = service.create_edge(
        db, root, None,
        EdgeCreate(src_type="species", src_id=lettuce, dst_type="species", dst_id=tomato, relation="related_to",
                   provenance={"note": "Comparten sistema hidropónico en la guía"}),
    )
    org_edge = service.create_edge(
        db, root, tenants["alfa_org"].id,
        EdgeCreate(src_type="prototype", src_id=alfa["prototype"], dst_type="species", dst_id=lettuce,
                   relation="designed_for"),
    )

    alfa_edges = edge_map(graph(client, tenants["alfa_viewer"]))
    assert alfa_edges[(f"species:{lettuce}", f"species:{tomato}", "related_to")]["provenance"] == [
        {"note": "Comparten sistema hidropónico en la guía", "author_id": root.id, "kind": "edge",
         "edge_id": global_edge.id, "scope": "global"}
    ]
    designed = alfa_edges[(f"prototype:{alfa['prototype']}", f"species:{lettuce}", "designed_for")]
    assert designed["provenance"][0]["scope"] == "organization"
    assert designed["provenance"][0]["edge_id"] == org_edge.id

    beta_edges = edge_map(graph(client, tenants["beta_viewer"]))
    assert (f"species:{lettuce}", f"species:{tomato}", "related_to") in beta_edges
    assert not any(rel == "designed_for" for _, _, rel in beta_edges)


def test_global_edge_touching_tenant_node_is_ignored_on_read(client, db, tenants, species):
    lettuce = species["Lactuca sativa L."].id
    alfa = tenant_data(client, tenants["alfa_editor"], lettuce, "Norte")
    # Fila global inválida (insertada a mano): nunca debe mostrarse, ni siquiera al dueño del prototipo
    db.add(GraphEdge(organization_id=None, src_type="prototype", src_id=alfa["prototype"],
                     dst_type="species", dst_id=lettuce, relation="designed_for", provenance={}))
    db.commit()
    assert not any(e["relation"] == "designed_for" for e in graph(client, tenants["alfa_viewer"])["edges"])


# ---- Foco, profundidad y tipos ----


def test_focus_and_depth(client, tenants, species):
    h = tenants["alfa_viewer"]
    lettuce = species["Lactuca sativa L."].id
    one = graph(client, h, focus_type="species", focus_id=lettuce, depth=1)
    assert one["nodes"][0]["id"] == f"species:{lettuce}"
    assert sorted(n["type"] for n in one["nodes"]) == ["source", "species"] + ["trait"] * 4
    two = graph(client, h, focus_type="species", focus_id=lettuce, depth=2)
    assert sum(n["type"] == "species" for n in two["nodes"]) == 3
    ids = {n["id"] for n in two["nodes"]}
    assert all(e["src"] in ids and e["dst"] in ids for e in two["edges"])
    trait = graph(client, h, focus_type="trait", focus_id="photoperiod", depth=1)
    assert trait["nodes"][0]["id"] == "trait:photoperiod" and len(trait["nodes"]) == 4
    for bad in (0, 4):
        assert client.get(GRAPH, params={"focus_type": "species", "focus_id": lettuce, "depth": bad}, headers=h).status_code == 422


def test_types_filter(client, tenants, species):
    h = tenants["alfa_viewer"]
    lettuce = species["Lactuca sativa L."].id
    body = graph(client, h, types="species,trait")
    assert {n["type"] for n in body["nodes"]} == {"species", "trait"}
    assert {e["relation"] for e in body["edges"]} == {"has_trait"}
    # El foco siempre se incluye aunque su tipo esté filtrado; los tipos filtrados no se atraviesan
    focused = graph(client, h, focus_type="species", focus_id=lettuce, depth=3, types="source")
    assert [n["type"] for n in focused["nodes"]] == ["species", "source"]
    res = client.get(GRAPH, params={"types": "species,planeta"}, headers=h)
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "types"


def test_focus_validation(client, tenants, species):
    h = tenants["alfa_viewer"]
    lettuce = species["Lactuca sativa L."].id
    res = client.get(GRAPH, params={"focus_type": "species"}, headers=h)
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "focus_id"
    res = client.get(GRAPH, params={"focus_id": lettuce}, headers=h)
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "focus_type"
    assert client.get(GRAPH, params={"focus_type": "planeta", "focus_id": lettuce}, headers=h).status_code == 422
    assert client.get(GRAPH, params={"focus_type": "species", "focus_id": "no-existe"}, headers=h).status_code == 404


# ---- Corte a 300 nodos (spec §9 V6) ----


def test_truncates_at_300_nodes(client, db, tenants, species):
    db.add_all([Source(title=f"Fuente aislada {i:03d}") for i in range(300)])
    db.commit()
    h = tenants["alfa_viewer"]
    body = graph(client, h)
    assert len(body["nodes"]) == MAX_NODES == 300
    assert body["truncated"] is True
    ids = {n["id"] for n in body["nodes"]}
    assert len(ids) == 300
    # Los nodos conectados sobreviven al corte; se descartan fuentes aisladas
    assert sum(n["type"] == "species" for n in body["nodes"]) == 3
    assert sum(n["type"] == "trait" for n in body["nodes"]) == 4
    assert all(e["src"] in ids and e["dst"] in ids for e in body["edges"])
    assert len(body["edges"]) == 15
    # Bajo el límite no se marca
    lettuce = species["Lactuca sativa L."].id
    assert graph(client, h, focus_type="species", focus_id=lettuce, depth=1)["truncated"] is False
    assert graph(client, h, types="species,trait")["truncated"] is False


def test_select_subgraph_cuts_in_bfs_order():
    g = service.Graph()
    for name in ("a", "b", "c", "d"):
        g.add_node(service.Node(f"source:{name}", "source", name.upper()))
    g.add_edge("source:a", "source:b", "related_to", {"kind": "fk"})
    g.add_edge("source:b", "source:c", "related_to", {"kind": "fk"})
    g.add_edge("source:c", "source:d", "related_to", {"kind": "fk"})
    nodes, edges, truncated = service.select_subgraph(g, "source:a", 3, None, limit=3)
    assert [n.id for n in nodes] == ["source:a", "source:b", "source:c"]
    assert truncated is True
    assert [(e.src, e.dst) for e in edges] == [("source:a", "source:b"), ("source:b", "source:c")]
    nodes, _, truncated = service.select_subgraph(g, "source:a", 1, None, limit=3)
    assert [n.id for n in nodes] == ["source:a", "source:b"] and truncated is False
    # Sin foco: más conectados primero
    nodes, _, _ = service.select_subgraph(g, None, 2, None, limit=2)
    assert [n.id for n in nodes] == ["source:b", "source:c"]


def test_add_edge_merges_provenance_without_duplicates():
    g = service.Graph()
    g.add_node(service.Node("species:x", "species", "X"))
    g.add_node(service.Node("trait:ph", "trait", "pH"))
    g.add_edge("species:x", "trait:ph", "has_trait", {"kind": "assertion", "assertion_id": "1"})
    g.add_edge("species:x", "trait:ph", "has_trait", {"kind": "assertion", "assertion_id": "2"})
    g.add_edge("species:x", "trait:ph", "has_trait", {"kind": "assertion", "assertion_id": "1"})
    g.add_edge("species:x", "species:otro", "related_to", {"kind": "fk"})  # extremo no visible
    g.add_edge("species:x", "species:x", "related_to", {"kind": "fk"})  # lazo
    assert len(g.edges) == 1
    assert [p["assertion_id"] for p in g.edges[("species:x", "trait:ph", "has_trait")].provenance] == ["1", "2"]
```

- [ ] **Step 2: Verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_graph.py -q -p no:warnings`
Expected: FAIL (`AttributeError: module 'app.modules.graph.service' has no attribute 'Graph'` y 404 en `/api/v1/graph`).

- [ ] **Step 3: Esquemas de salida**

En `app/modules/graph/schemas.py`, añadir al final:

```python
class GraphNodeOut(BaseModel):
    id: str
    type: NodeType
    label: str
    origin: str | None = None
    meta: dict[str, str | None] = Field(default_factory=dict)


class GraphEdgeOut(BaseModel):
    src: str
    dst: str
    relation: str
    # Una entrada por cada razón por la que existe la arista (kind: fk|assertion|evidence|external_id|edge)
    provenance: list[dict]


class GraphOut(BaseModel):
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]
    truncated: bool
```

- [ ] **Step 4: Servicio de lectura**

En `app/modules/graph/service.py`:

Reemplazar el bloque de importaciones por:

```python
from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.deps import RequestContext
from app.core.errors import AppError, forbidden, not_found, unprocessable
from app.core.tenant import scoped
from app.modules.catalog.models import ORIGINS, SUBJECT_TYPES, Cultivar, Source, Species, TraitAssertion
from app.modules.graph.models import (
    EDGE_RESOURCE,
    MAX_NODES,
    NODE_CROP_CYCLE,
    NODE_CULTIVAR,
    NODE_PROJECT,
    NODE_PROTOTYPE,
    NODE_SOURCE,
    NODE_SPECIES,
    NODE_TRAIT,
    NODE_TYPES,
    REL_CITES,
    REL_CULTIVAR_OF,
    REL_GROWS,
    REL_HAS_CYCLE,
    REL_HAS_TRAIT,
    TENANT_NODE_TYPES,
    GraphEdge,
)
from app.modules.graph.schemas import EdgeCreate, GraphEdgeOut, GraphNodeOut, GraphOut
from app.modules.identity.models import MEMBERSHIP_ACTIVE, ROLE_EDITOR, ROLE_RANK, Membership, User
from app.modules.projects.models import CropCycle, Project
from app.modules.prototypes.models import Prototype
```

Y añadir al final del archivo:

```python
# ---------- Lectura ----------

TRAIT_LABELS = {
    "air_temperature": "Temperatura del aire",
    "relative_humidity": "Humedad relativa",
    "photoperiod": "Fotoperiodo",
    "ph": "pH",
}
_ORIGIN_RANK = {origin: i for i, origin in enumerate(ORIGINS)}  # measured primero, missing al final
_TYPE_ORDER = {node_type: i for i, node_type in enumerate(NODE_TYPES)}


@dataclass
class Node:
    id: str
    type: str
    label: str
    origin: str | None = None
    meta: dict = field(default_factory=dict)


@dataclass
class Edge:
    src: str
    dst: str
    relation: str
    provenance: list[dict] = field(default_factory=list)


@dataclass
class Graph:
    nodes: dict[str, Node] = field(default_factory=dict)
    edges: dict[tuple[str, str, str], Edge] = field(default_factory=dict)

    def add_node(self, node: Node) -> None:
        self.nodes.setdefault(node.id, node)

    def add_edge(self, src: str, dst: str, relation: str, provenance: dict) -> None:
        """Solo une nodos visibles; la misma (src, dst, relación) acumula procedencias sin repetir."""
        if src == dst or src not in self.nodes or dst not in self.nodes:
            return
        edge = self.edges.setdefault((src, dst, relation), Edge(src, dst, relation))
        if provenance not in edge.provenance:
            edge.provenance.append(provenance)


def _species_label(species: Species) -> str:
    for name in species.common_names or []:
        if isinstance(name, dict) and name.get("lang") == "es" and name.get("name"):
            text = name["name"]
            return text[:1].upper() + text[1:]
    return species.scientific_name


def _add_catalog(db: Session, g: Graph) -> None:
    species = list(
        db.scalars(select(Species).where(Species.deleted_at.is_(None)).order_by(Species.scientific_name, Species.id))
    )
    for s in species:
        g.add_node(
            Node(node_id(NODE_SPECIES, s.id), NODE_SPECIES, _species_label(s), meta={"scientific_name": s.scientific_name})
        )

    cultivars = db.scalars(select(Cultivar).where(Cultivar.deleted_at.is_(None)).order_by(Cultivar.name, Cultivar.id))
    for c in cultivars:
        parent = node_id(NODE_SPECIES, c.species_id)
        if parent not in g.nodes:
            continue
        cid = node_id(NODE_CULTIVAR, c.id)
        g.add_node(Node(cid, NODE_CULTIVAR, c.name, meta={"species_id": c.species_id}))
        g.add_edge(cid, parent, REL_CULTIVAR_OF, {"kind": "fk", "field": "cultivars.species_id"})

    sources = db.scalars(select(Source).where(Source.deleted_at.is_(None)).order_by(Source.title, Source.id))
    for src in sources:
        g.add_node(Node(node_id(NODE_SOURCE, src.id), NODE_SOURCE, src.title, meta={"url": src.url, "license": src.license}))

    # Identidad taxonómica verificada (p. ej. GBIF): la especie cita la fuente de su identificador.
    for s in species:
        for system, ref in sorted((s.external_ids or {}).items()):
            if isinstance(ref, dict) and ref.get("source_id"):
                g.add_edge(
                    node_id(NODE_SPECIES, s.id),
                    node_id(NODE_SOURCE, ref["source_id"]),
                    REL_CITES,
                    {"kind": "external_id", "system": system, "external_id": ref.get("id"), "url": ref.get("url")},
                )

    origins: dict[str, list[str]] = defaultdict(list)
    assertions = db.scalars(
        select(TraitAssertion)
        .where(TraitAssertion.deleted_at.is_(None))
        .order_by(TraitAssertion.subject_id, TraitAssertion.variable, TraitAssertion.id)
    )
    for a in assertions:
        if a.subject_type not in SUBJECT_TYPES:
            continue
        subject = node_id(a.subject_type, a.subject_id)  # "species" y "cultivar" coinciden con los tipos de nodo
        if subject not in g.nodes:
            continue
        trait = node_id(NODE_TRAIT, a.variable)
        g.add_node(Node(trait, NODE_TRAIT, TRAIT_LABELS.get(a.variable, a.variable), meta={"variable": a.variable}))
        origins[trait].append(a.origin)
        g.add_edge(
            subject,
            trait,
            REL_HAS_TRAIT,
            {
                "kind": "assertion",
                "assertion_id": a.id,
                "origin": a.origin,
                "review_status": a.review_status,
                "growth_stage": a.growth_stage,
                "cultivation_system": a.cultivation_system,
            },
        )
        for ref in a.evidence_refs or []:
            if isinstance(ref, dict) and ref.get("source_id"):
                g.add_edge(
                    subject,
                    node_id(NODE_SOURCE, ref["source_id"]),
                    REL_CITES,
                    {"kind": "evidence", "assertion_id": a.id, "variable": a.variable, "locator": ref.get("locator")},
                )
    for trait, values in origins.items():
        g.nodes[trait].origin = min(values, key=lambda o: _ORIGIN_RANK.get(o, len(_ORIGIN_RANK)))


def _add_tenant(db: Session, ctx: RequestContext, g: Graph) -> None:
    for p in db.scalars(scoped(Project, ctx).order_by(Project.created_at, Project.id)):
        g.add_node(Node(node_id(NODE_PROJECT, p.id), NODE_PROJECT, p.name, meta={"system": p.system}))

    cycles = db.scalars(scoped(CropCycle, ctx).order_by(CropCycle.created_at, CropCycle.id)).unique()
    for c in cycles:
        project = node_id(NODE_PROJECT, c.project_id)
        if project not in g.nodes:
            continue
        species = g.nodes.get(node_id(NODE_SPECIES, c.species_id))
        label = f"Ciclo · {species.label if species else 'especie no disponible'}"
        if c.started_on:
            label += f" · {c.started_on.isoformat()}"
        cid = node_id(NODE_CROP_CYCLE, c.id)
        g.add_node(Node(cid, NODE_CROP_CYCLE, label, meta={"project_id": c.project_id, "status": c.status}))
        g.add_edge(project, cid, REL_HAS_CYCLE, {"kind": "fk", "field": "crop_cycles.project_id"})
        g.add_edge(cid, node_id(NODE_SPECIES, c.species_id), REL_GROWS, {"kind": "fk", "field": "crop_cycles.species_id"})
        if c.cultivar_id:
            g.add_edge(
                cid, node_id(NODE_CULTIVAR, c.cultivar_id), REL_GROWS, {"kind": "fk", "field": "crop_cycles.cultivar_id"}
            )

    for p in db.scalars(scoped(Prototype, ctx).order_by(Prototype.created_at, Prototype.id)):
        g.add_node(Node(node_id(NODE_PROTOTYPE, p.id), NODE_PROTOTYPE, p.name, meta={"status": p.status}))


def _add_stored_edges(db: Session, ctx: RequestContext, g: Graph) -> None:
    stored = db.scalars(
        select(GraphEdge)
        .where(
            GraphEdge.deleted_at.is_(None),
            or_(GraphEdge.organization_id.is_(None), GraphEdge.organization_id == ctx.organization_id),
        )
        .order_by(GraphEdge.created_at, GraphEdge.id)
    )
    for e in stored:
        is_global = e.organization_id is None
        # Defensa: una arista global nunca toca datos privados, aunque la fila exista.
        if is_global and (e.src_type in TENANT_NODE_TYPES or e.dst_type in TENANT_NODE_TYPES):
            continue
        g.add_edge(
            node_id(e.src_type, e.src_id),
            node_id(e.dst_type, e.dst_id),
            e.relation,
            {**(e.provenance or {}), "kind": "edge", "edge_id": e.id, "scope": "global" if is_global else "organization"},
        )


def build_graph(db: Session, ctx: RequestContext) -> Graph:
    """Grafo visible para el tenant activo: catálogo global + datos propios + aristas guardadas visibles."""
    g = Graph()
    _add_catalog(db, g)
    _add_tenant(db, ctx, g)
    _add_stored_edges(db, ctx, g)
    return g


def select_subgraph(
    g: Graph, focus: str | None, depth: int, types: set[str] | None, limit: int = MAX_NODES
) -> tuple[list[Node], list[Edge], bool]:
    allowed = types or set(NODE_TYPES)
    adjacency: dict[str, set[str]] = defaultdict(set)
    for src, dst, _ in g.edges:
        adjacency[src].add(dst)
        adjacency[dst].add(src)

    def order(nid: str) -> tuple:
        n = g.nodes[nid]
        return (_TYPE_ORDER[n.type], n.label.casefold(), n.id)

    if focus is None:
        candidates = sorted(
            (n.id for n in g.nodes.values() if n.type in allowed),
            key=lambda nid: (-len(adjacency[nid]), *order(nid)),
        )
    else:
        candidates, seen, frontier = [focus], {focus}, [focus]
        for _ in range(depth):
            following = []
            for current in frontier:
                for other in sorted(adjacency[current], key=order):
                    if other in seen or g.nodes[other].type not in allowed:
                        continue
                    seen.add(other)
                    following.append(other)
                    candidates.append(other)
            frontier = following

    truncated = len(candidates) > limit
    kept = candidates[:limit]
    kept_set = set(kept)
    edges = sorted(
        (e for e in g.edges.values() if e.src in kept_set and e.dst in kept_set),
        key=lambda e: (kept.index(e.src), kept.index(e.dst), e.relation),
    )
    return [g.nodes[nid] for nid in kept], edges, truncated


def parse_types(raw: str | None) -> set[str] | None:
    if raw is None or not raw.strip():
        return None
    parts = {p.strip() for p in raw.split(",") if p.strip()}
    unknown = sorted(parts - set(NODE_TYPES))
    if unknown:
        raise unprocessable("Tipo de nodo desconocido", {"field": "types", "unknown": unknown})
    return parts


def graph_view(
    db: Session,
    ctx: RequestContext,
    focus_type: str | None,
    focus_id: str | None,
    depth: int,
    types_raw: str | None,
) -> GraphOut:
    if focus_type is not None and focus_id is None:
        raise unprocessable("Indica focus_id junto con focus_type", {"field": "focus_id"})
    if focus_id is not None and focus_type is None:
        raise unprocessable("Indica focus_type junto con focus_id", {"field": "focus_type"})
    types = parse_types(types_raw)
    g = build_graph(db, ctx)
    focus = None
    if focus_type is not None and focus_id is not None:
        focus = node_id(focus_type, focus_id)
        if focus not in g.nodes:
            raise not_found("nodo")
    nodes, edges, truncated = select_subgraph(g, focus, depth, types)
    return GraphOut(
        nodes=[GraphNodeOut(id=n.id, type=n.type, label=n.label, origin=n.origin, meta=n.meta) for n in nodes],
        edges=[GraphEdgeOut(src=e.src, dst=e.dst, relation=e.relation, provenance=e.provenance) for e in edges],
        truncated=truncated,
    )
```

Nota: `kept.index` es O(n) por arista; con ≤ 300 nodos y unas cuantas centenas de aristas es despreciable. Si molesta en la revisión, sustituir por un `dict` de posiciones.

- [ ] **Step 5: Router**

Crear `app/modules/graph/router.py`:

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context
from app.modules.graph import service
from app.modules.graph.schemas import GraphOut, NodeType

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("", response_model=GraphOut)
def get_graph(
    focus_type: NodeType | None = Query(default=None),
    focus_id: str | None = Query(default=None, min_length=1, max_length=64),
    depth: int = Query(default=2, ge=1, le=3),
    types: str | None = Query(default=None, max_length=200),
    ctx: RequestContext = Depends(get_context),
    db: Session = Depends(get_db),
):
    """Grafo de solo lectura: nodos globales + del tenant activo; máximo 300 nodos (`truncated` al cortar)."""
    return service.graph_view(db, ctx, focus_type, focus_id, depth, types)
```

En `app/main.py`, importar `from app.modules.graph.router import router as graph_router` (orden alfabético con los demás) y añadir `graph_router` a la tupla de routers:

```python
    for router in (identity_router, catalog_router, projects_router, prototypes_router, home_router, graph_router):
```

(Si V3/V4 ya añadieron routers a esa tupla, añadir `graph_router` al final.)

- [ ] **Step 6: Correr pruebas**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_graph.py tests/test_graph_edges.py -q -p no:warnings`
Expected: PASS (13 + 9). Luego la suite completa: `~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings` → todo PASS.

- [ ] **Step 7: Commit**

```bash
git add app/modules/graph app/main.py tests/test_graph.py
git commit -m "feat(graph): GET /graph con nodos derivados, aristas implícitas con procedencia, foco, tipos, tope de 300 y aislamiento por tenant"
```

---

### Task 3: Dependencias, cliente del API, modelo de datos y paleta

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`
- Create: `frontend/src/features/graph/api.ts`
- Create: `frontend/src/features/graph/fixtures.ts`
- Create: `frontend/src/features/graph/model.ts`
- Create: `frontend/src/features/graph/palette.ts`
- Create: `frontend/src/features/graph/model.test.ts`
- Create: `frontend/src/features/graph/palette.test.ts`

**Interfaces:**
- Consumes: `api` de `@/api/client`; `ORIGIN_META`/`Origin` de `@/components/ui`; `REVIEW_LABELS`, `VARIABLE_LABELS`, `label` de `@/features/catalog/labels`. Contrato JSON de Task 2 (no hace falta el backend: todo se prueba con datos fijos).
- Produces: `NODE_TYPES`, `NodeType`, `GraphNode`, `GraphEdge`, `Provenance`, `GraphData`, `GraphQuery`, `splitNodeId`, `graphParams`, `graphApi.get(q)`; `FIXTURE`; `TYPE_META`, `relationLabel(relation, outgoing)`, `nodeLink(node)`, `fold`, `searchNodes`, `connectionsOf`, `neighborIds`, `countByType`, `describeProvenance`; `GraphPalette`, `graphPalette(dark)`.

- [ ] **Step 1: Instalar dependencias con versión exacta**

Run (en `frontend/`):

```bash
npm install --save-exact d3-force@3.0.0
npm install --save-exact --save-dev @types/d3-force@3.0.10
```

Expected: `package.json` con `"d3-force": "3.0.0"` en `dependencies` y `"@types/d3-force": "3.0.10"` en `devDependencies`; `package-lock.json` actualizado (arrastra `d3-dispatch`, `d3-quadtree`, `d3-timer` como transitivas). Ningún otro cambio de versiones.

- [ ] **Step 2: Pruebas que fallan**

Crear `frontend/src/features/graph/model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GraphNode, graphParams, NODE_TYPES, splitNodeId } from './api'
import { FIXTURE } from './fixtures'
import { connectionsOf, countByType, describeProvenance, neighborIds, nodeLink, relationLabel, searchNodes } from './model'

const byId = new Map(FIXTURE.nodes.map((n) => [n.id, n]))
const node = (id: string) => byId.get(id)!

describe('api', () => {
  it('separa el tipo del id crudo en el primer ":"', () => {
    expect(splitNodeId('species:sp1')).toEqual({ type: 'species', rawId: 'sp1' })
    expect(splitNodeId('trait:ph')).toEqual({ type: 'trait', rawId: 'ph' })
  })

  it('arma los parámetros: foco con profundidad y tipos solo si hay filtro', () => {
    expect(graphParams({})).toEqual({})
    expect(graphParams({ focus: 'species:sp1' })).toEqual({ focus_type: 'species', focus_id: 'sp1', depth: 2 })
    expect(graphParams({ focus: 'trait:ph', depth: 3, types: [...NODE_TYPES] })).toEqual({
      focus_type: 'trait',
      focus_id: 'ph',
      depth: 3,
    })
    expect(graphParams({ focus: null, depth: 3, types: ['species', 'trait'] })).toEqual({ types: 'species,trait' })
  })
})

describe('searchNodes', () => {
  it('busca por etiqueta y nombre científico sin acentos ni mayúsculas', () => {
    expect(searchNodes(FIXTURE.nodes, 'lactuca').map((n) => n.id)).toEqual(['species:sp1'])
    expect(searchNodes(FIXTURE.nodes, 'GBIF').map((n) => n.id)).toEqual(['source:gbif'])
    const accented: GraphNode[] = [{ id: 'trait:x', type: 'trait', label: 'Fotoperíodo', origin: null, meta: {} }]
    expect(searchNodes(accented, 'fotoperiodo')).toHaveLength(1)
  })

  it('pone primero las coincidencias al inicio y respeta el límite', () => {
    expect(searchNodes(FIXTURE.nodes, 'lechuga').map((n) => n.label)).toEqual(['Lechuga', 'Ciclo · Lechuga'])
    expect(searchNodes(FIXTURE.nodes, 'e', 2)).toHaveLength(2)
    expect(searchNodes(FIXTURE.nodes, '   ')).toEqual([])
  })
})

describe('nodeLink', () => {
  it('enlaza la pantalla del recurso según el tipo', () => {
    expect(nodeLink(node('species:sp1'))).toEqual({ kind: 'internal', to: '/app/plants/sp1', label: 'Abrir ficha de la especie' })
    expect(nodeLink(node('crop_cycle:c1'))).toEqual({ kind: 'internal', to: '/app/projects/p1', label: 'Abrir proyecto del ciclo' })
    expect(nodeLink(node('project:p1'))).toEqual({ kind: 'internal', to: '/app/projects/p1', label: 'Abrir proyecto' })
    expect(nodeLink(node('prototype:pr1'))).toEqual({ kind: 'internal', to: '/app/prototypes/pr1', label: 'Abrir prototipo' })
    expect(nodeLink(node('source:gbif'))).toEqual({ kind: 'external', href: 'https://www.gbif.org/', label: 'Abrir fuente original' })
    expect(nodeLink(node('trait:photoperiod'))).toBeNull()
    expect(nodeLink({ id: 'cultivar:cv1', type: 'cultivar', label: 'Grand Rapids', origin: null, meta: { species_id: 'sp1' } })).toEqual({
      kind: 'internal',
      to: '/app/plants/sp1',
      label: 'Abrir ficha de la especie',
    })
    expect(nodeLink({ id: 'source:s', type: 'source', label: 'Sin enlace', origin: null, meta: { url: null } })).toBeNull()
  })
})

describe('conexiones y procedencia', () => {
  it('lista conexiones salientes y entrantes con su etiqueta de relación', () => {
    const items = connectionsOf('species:sp1', FIXTURE).map((c) => [relationLabel(c.edge.relation, c.outgoing), c.other.label])
    expect(items).toEqual([
      ['Cita', 'GBIF Backbone Taxonomy'],
      ['Cultivada en el ciclo', 'Ciclo · Lechuga'],
      ['Rasgo registrado', 'Fotoperiodo'],
    ])
  })

  it('calcula vecinos incluyendo al propio nodo', () => {
    expect([...neighborIds('trait:photoperiod', FIXTURE.edges)].sort()).toEqual(['species:sp1', 'trait:photoperiod'])
  })

  it('cuenta nodos por tipo con ceros explícitos', () => {
    expect(countByType(FIXTURE.nodes)).toEqual({ species: 1, cultivar: 0, trait: 1, source: 1, project: 1, crop_cycle: 1, prototype: 1 })
  })

  it('describe cada tipo de procedencia en español', () => {
    expect(describeProvenance(FIXTURE.edges[0].provenance[0])).toBe('Afirmación · Desconocido · Sin revisar')
    expect(describeProvenance(FIXTURE.edges[1].provenance[0])).toBe('Identificador GBIF 7403263')
    expect(describeProvenance({ kind: 'fk', field: 'crop_cycles.species_id' })).toBe('Vínculo registrado en la plataforma')
    expect(describeProvenance({ kind: 'evidence', assertion_id: 'a', variable: 'photoperiod', locator: 'p. 12' })).toBe(
      'Evidencia de Fotoperiodo · p. 12',
    )
    expect(describeProvenance({ kind: 'edge', scope: 'global', source_id: 'gbif', note: 'Guía 2024' }, byId)).toBe(
      'Relación global · Fuente: GBIF Backbone Taxonomy · Guía 2024',
    )
    expect(describeProvenance({ kind: 'edge', scope: 'organization' })).toBe('Relación de la organización')
    expect(describeProvenance({ kind: 'otro' })).toBe('Procedencia registrada')
  })
})
```

Crear `frontend/src/features/graph/palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { NODE_TYPES } from './api'
import { graphPalette } from './palette'

describe('graphPalette', () => {
  it('da un color distinto a cada tipo en ambos temas', () => {
    for (const dark of [false, true]) {
      const colors = NODE_TYPES.map((t) => graphPalette(dark).node[t])
      expect(new Set(colors).size).toBe(NODE_TYPES.length)
    }
  })

  it('cambia nodos, aristas y etiquetas con el tema', () => {
    const light = graphPalette(false)
    const dark = graphPalette(true)
    expect(light.node.species).not.toBe(dark.node.species)
    expect(light.edge).not.toBe(dark.edge)
    expect(light.label).not.toBe(dark.label)
    expect(light.labelHalo).not.toBe(dark.labelHalo)
  })
})
```

Run: `npx vitest run src/features/graph` → FAIL (no existen los módulos).

- [ ] **Step 3: Cliente del API**

Crear `frontend/src/features/graph/api.ts`:

```ts
import { api } from '@/api/client'

export const NODE_TYPES = ['species', 'cultivar', 'trait', 'source', 'project', 'crop_cycle', 'prototype'] as const
export type NodeType = (typeof NODE_TYPES)[number]

export interface GraphNode {
  /** "<tipo>:<id>"; en rasgos el id es la variable (trait:photoperiod). */
  id: string
  type: NodeType
  label: string
  origin: string | null
  meta: Record<string, string | null>
}

/** Una razón por la que existe la arista: fk | assertion | evidence | external_id | edge. */
export interface Provenance {
  kind: string
  [key: string]: unknown
}

export interface GraphEdge {
  src: string
  dst: string
  relation: string
  provenance: Provenance[]
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  truncated: boolean
}

export interface GraphQuery {
  /** Id de nodo completo ("species:<id>"); null = grafo completo. */
  focus?: string | null
  depth?: number
  types?: NodeType[] | null
}

export function splitNodeId(id: string): { type: NodeType; rawId: string } {
  const i = id.indexOf(':')
  return { type: id.slice(0, i) as NodeType, rawId: id.slice(i + 1) }
}

export function graphParams(q: GraphQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  if (q.focus) {
    const { type, rawId } = splitNodeId(q.focus)
    params.focus_type = type
    params.focus_id = rawId
    params.depth = q.depth ?? 2
  }
  if (q.types && q.types.length > 0 && q.types.length < NODE_TYPES.length) params.types = q.types.join(',')
  return params
}

export const graphApi = {
  get: (q: GraphQuery = {}) => api.get<GraphData>('/graph', { params: graphParams(q) }).then((r) => r.data),
}
```

- [ ] **Step 4: Datos de ejemplo para pruebas**

Crear `frontend/src/features/graph/fixtures.ts` (solo lo importan pruebas; forma idéntica a la respuesta real):

```ts
import type { GraphData } from './api'

export const FIXTURE: GraphData = {
  truncated: false,
  nodes: [
    { id: 'species:sp1', type: 'species', label: 'Lechuga', origin: null, meta: { scientific_name: 'Lactuca sativa L.' } },
    { id: 'trait:photoperiod', type: 'trait', label: 'Fotoperiodo', origin: 'missing', meta: { variable: 'photoperiod' } },
    {
      id: 'source:gbif',
      type: 'source',
      label: 'GBIF Backbone Taxonomy',
      origin: null,
      meta: { url: 'https://www.gbif.org/', license: 'CC BY 4.0' },
    },
    { id: 'project:p1', type: 'project', label: 'Invernadero norte', origin: null, meta: { system: 'hydroponic' } },
    { id: 'crop_cycle:c1', type: 'crop_cycle', label: 'Ciclo · Lechuga', origin: null, meta: { project_id: 'p1', status: 'active' } },
    { id: 'prototype:pr1', type: 'prototype', label: 'Germinador G1', origin: null, meta: { status: 'testing' } },
  ],
  edges: [
    {
      src: 'species:sp1',
      dst: 'trait:photoperiod',
      relation: 'has_trait',
      provenance: [
        {
          kind: 'assertion',
          assertion_id: 'a1',
          origin: 'missing',
          review_status: 'unreviewed',
          growth_stage: 'unknown',
          cultivation_system: 'unknown',
        },
      ],
    },
    {
      src: 'species:sp1',
      dst: 'source:gbif',
      relation: 'cites',
      provenance: [{ kind: 'external_id', system: 'gbif', external_id: '7403263', url: 'https://www.gbif.org/species/7403263' }],
    },
    { src: 'crop_cycle:c1', dst: 'species:sp1', relation: 'grows', provenance: [{ kind: 'fk', field: 'crop_cycles.species_id' }] },
    { src: 'project:p1', dst: 'crop_cycle:c1', relation: 'has_cycle', provenance: [{ kind: 'fk', field: 'crop_cycles.project_id' }] },
  ],
}
```

- [ ] **Step 5: Modelo (textos, enlaces, búsqueda, conexiones)**

Crear `frontend/src/features/graph/model.ts`:

```ts
import { ORIGIN_META, Origin } from '@/components/ui'
import { label, REVIEW_LABELS, VARIABLE_LABELS } from '@/features/catalog/labels'
import { GraphData, GraphEdge, GraphNode, NODE_TYPES, NodeType, Provenance, splitNodeId } from './api'

export const TYPE_META: Record<NodeType, { label: string; plural: string }> = {
  species: { label: 'Especie', plural: 'Especies' },
  cultivar: { label: 'Cultivar', plural: 'Cultivares' },
  trait: { label: 'Rasgo', plural: 'Rasgos' },
  source: { label: 'Fuente', plural: 'Fuentes' },
  project: { label: 'Proyecto', plural: 'Proyectos' },
  crop_cycle: { label: 'Ciclo de cultivo', plural: 'Ciclos' },
  prototype: { label: 'Prototipo', plural: 'Prototipos' },
}

/** [desde el origen, desde el destino] */
const RELATION_LABELS: Record<string, [string, string]> = {
  cultivar_of: ['Cultivar de', 'Cultivar registrado'],
  has_trait: ['Rasgo registrado', 'Especie o cultivar con el rasgo'],
  cites: ['Cita', 'Citada por'],
  grows: ['Cultiva', 'Cultivada en el ciclo'],
  has_cycle: ['Ciclo del proyecto', 'Pertenece al proyecto'],
  designed_for: ['Diseñado para', 'Prototipo diseñado para esta'],
  related_to: ['Relacionado con', 'Relacionado con'],
}

export function relationLabel(relation: string, outgoing: boolean): string {
  const pair = RELATION_LABELS[relation]
  return pair ? pair[outgoing ? 0 : 1] : relation
}

export type NodeLink =
  | { kind: 'internal'; to: string; label: string }
  | { kind: 'external'; href: string; label: string }
  | null

/** Pantalla del recurso. Los rasgos no tienen pantalla propia. */
export function nodeLink(node: GraphNode): NodeLink {
  const { rawId } = splitNodeId(node.id)
  const meta = node.meta ?? {}
  switch (node.type) {
    case 'species':
      return { kind: 'internal', to: `/app/plants/${rawId}`, label: 'Abrir ficha de la especie' }
    case 'cultivar':
      return meta.species_id ? { kind: 'internal', to: `/app/plants/${meta.species_id}`, label: 'Abrir ficha de la especie' } : null
    case 'project':
      return { kind: 'internal', to: `/app/projects/${rawId}`, label: 'Abrir proyecto' }
    case 'crop_cycle':
      return meta.project_id ? { kind: 'internal', to: `/app/projects/${meta.project_id}`, label: 'Abrir proyecto del ciclo' } : null
    case 'prototype':
      return { kind: 'internal', to: `/app/prototypes/${rawId}`, label: 'Abrir prototipo' }
    case 'source':
      return meta.url ? { kind: 'external', href: meta.url, label: 'Abrir fuente original' } : null
    default:
      return null
  }
}

/** Minúsculas y sin acentos. */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function searchNodes(nodes: GraphNode[], query: string, limit = 8): GraphNode[] {
  const q = fold(query.trim())
  if (!q) return []
  const scored: Array<{ node: GraphNode; score: number }> = []
  for (const node of nodes) {
    const haystack = [node.label, node.meta?.scientific_name ?? ''].map(fold)
    if (haystack.some((h) => h.startsWith(q))) scored.push({ node, score: 0 })
    else if (haystack.some((h) => h.includes(q))) scored.push({ node, score: 1 })
  }
  scored.sort((a, b) => a.score - b.score || a.node.label.localeCompare(b.node.label, 'es'))
  return scored.slice(0, limit).map((s) => s.node)
}

export interface Connection {
  edge: GraphEdge
  other: GraphNode
  outgoing: boolean
}

export function connectionsOf(id: string, data: GraphData): Connection[] {
  const byId = new Map(data.nodes.map((n) => [n.id, n]))
  const out: Connection[] = []
  for (const edge of data.edges) {
    if (edge.src === id && byId.has(edge.dst)) out.push({ edge, other: byId.get(edge.dst)!, outgoing: true })
    else if (edge.dst === id && byId.has(edge.src)) out.push({ edge, other: byId.get(edge.src)!, outgoing: false })
  }
  return out.sort(
    (a, b) =>
      relationLabel(a.edge.relation, a.outgoing).localeCompare(relationLabel(b.edge.relation, b.outgoing), 'es') ||
      a.other.label.localeCompare(b.other.label, 'es'),
  )
}

/** El nodo y sus vecinos directos. */
export function neighborIds(id: string, edges: GraphEdge[]): Set<string> {
  const ids = new Set([id])
  for (const e of edges) {
    if (e.src === id) ids.add(e.dst)
    else if (e.dst === id) ids.add(e.src)
  }
  return ids
}

export function countByType(nodes: GraphNode[]): Record<NodeType, number> {
  const counts = Object.fromEntries(NODE_TYPES.map((t) => [t, 0])) as Record<NodeType, number>
  for (const n of nodes) counts[n.type] += 1
  return counts
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

export function describeProvenance(p: Provenance, nodesById?: Map<string, GraphNode>): string {
  switch (p.kind) {
    case 'fk':
      return 'Vínculo registrado en la plataforma'
    case 'assertion': {
      const origin = ORIGIN_META[p.origin as Origin]?.label ?? String(p.origin ?? '—')
      return `Afirmación · ${origin} · ${label(REVIEW_LABELS, text(p.review_status))}`
    }
    case 'evidence':
      return [`Evidencia de ${label(VARIABLE_LABELS, text(p.variable))}`, text(p.locator)].filter(Boolean).join(' · ')
    case 'external_id':
      return `Identificador ${String(p.system ?? '').toUpperCase()} ${text(p.external_id) ?? ''}`.trim()
    case 'edge': {
      const parts = [p.scope === 'global' ? 'Relación global' : 'Relación de la organización']
      const sourceId = text(p.source_id)
      const source = sourceId ? nodesById?.get(`source:${sourceId}`) : undefined
      if (source) parts.push(`Fuente: ${source.label}`)
      const locator = text(p.locator)
      if (locator) parts.push(locator)
      const note = text(p.note)
      if (note) parts.push(note)
      return parts.join(' · ')
    }
    default:
      return 'Procedencia registrada'
  }
}
```

- [ ] **Step 6: Paleta por tema**

Crear `frontend/src/features/graph/palette.ts`:

```ts
import type { NodeType } from './api'

/** Colores del lienzo del grafo por tema. Separado para probarlo sin canvas. */
export interface GraphPalette {
  node: Record<NodeType, string>
  edge: string
  edgeActive: string
  label: string
  /** Contorno de las etiquetas: el color del escenario, para que se lean sobre las aristas. */
  labelHalo: string
  ring: string
}

export function graphPalette(dark: boolean): GraphPalette {
  return dark
    ? {
        node: {
          species: '#a6e22e',
          cultivar: '#5eead4',
          trait: '#fbbf24',
          source: '#c4b5fd',
          project: '#7dd3fc',
          crop_cycle: '#f9a8d4',
          prototype: '#fb923c',
        },
        edge: 'rgba(230, 236, 226, 0.16)',
        edgeActive: 'rgba(185, 236, 90, 0.85)',
        label: '#e6ece2',
        labelHalo: 'rgba(12, 15, 11, 0.9)',
        ring: '#b9ec5a',
      }
    : {
        node: {
          species: '#4d7c0f',
          cultivar: '#0f766e',
          trait: '#b45309',
          source: '#6d28d9',
          project: '#0369a1',
          crop_cycle: '#be185d',
          prototype: '#c2410c',
        },
        edge: 'rgba(29, 36, 28, 0.18)',
        edgeActive: 'rgba(68, 106, 14, 0.9)',
        label: '#1d241c',
        labelHalo: 'rgba(243, 246, 240, 0.92)',
        ring: '#446a0e',
      }
}
```

- [ ] **Step 7: Verificar**

Run (en `frontend/`): `npx vitest run src/features/graph && npx tsc -b`
Expected: PASS (model 9, palette 2).

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/features/graph
git commit -m "feat(graph): d3-force 3.0.0 fijado, cliente del API del grafo, textos, búsqueda, enlaces y paleta por tema"
```

---

### Task 4: Cámara y simulación determinista con `d3-force`

**Files:**
- Create: `frontend/src/features/graph/camera.ts`
- Create: `frontend/src/features/graph/layout.ts`
- Create: `frontend/src/features/graph/camera.test.ts`
- Create: `frontend/src/features/graph/layout.test.ts`

**Interfaces:**
- Consumes: Task 3 (`GraphData`, `GraphNode`, `FIXTURE`); `d3-force`.
- Produces: `camera.ts` — `View {k, x, y}` (pantalla = mundo·k + (x, y)), `Point`, `MIN_ZOOM = 0.15`, `MAX_ZOOM = 5`, `clampZoom`, `toScreen`, `toWorld`, `zoomAround(v, factor, sx, sy)`, `pan(v, dx, dy)`, `centerOn(wx, wy, width, height, k)`, `fitView(points, width, height, padding = 56, maxZoom = 2)`, `lerpView(a, b, t, width, height)`, `easeOutCubic`, `screenRadius(radius, k)`. `layout.ts` — `SimNode`, `SimLink`, `Positions`, `hashSeed`, `mulberry32`, `nodeRadius`, `initialPosition`, `buildSimGraph(data, previous?)`, `createSimulation(nodes, links, {seed, alpha})` (detenida: la avanza quien la usa), `settle(sim, ticks)`, `positionsOf(nodes)`, `warmAlpha(data, previous)`, `hitTest(nodes, wx, wy, radiusScale, slop)`.

- [ ] **Step 1: Pruebas que fallan**

Crear `frontend/src/features/graph/camera.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  centerOn,
  easeOutCubic,
  fitView,
  lerpView,
  MAX_ZOOM,
  MIN_ZOOM,
  pan,
  screenRadius,
  toScreen,
  toWorld,
  zoomAround,
} from './camera'

describe('camera', () => {
  it('toScreen y toWorld son inversas', () => {
    const v = { k: 1.7, x: 33, y: -12 }
    const s = toScreen(v, 10, -4)
    const w = toWorld(v, s.x, s.y)
    expect(w.x).toBeCloseTo(10)
    expect(w.y).toBeCloseTo(-4)
  })

  it('zoomAround deja fijo el punto del mundo bajo el cursor', () => {
    const v = { k: 1, x: 10, y: 20 }
    const before = toWorld(v, 200, 150)
    const z = zoomAround(v, 2, 200, 150)
    const after = toWorld(z, 200, 150)
    expect(z.k).toBe(2)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('limita el zoom', () => {
    expect(zoomAround({ k: 1, x: 0, y: 0 }, 1000, 0, 0).k).toBe(MAX_ZOOM)
    expect(zoomAround({ k: 1, x: 0, y: 0 }, 1e-6, 0, 0).k).toBe(MIN_ZOOM)
  })

  it('pan desplaza en píxeles de pantalla', () => {
    expect(pan({ k: 2, x: 0, y: 0 }, 5, -3)).toEqual({ k: 2, x: 5, y: -3 })
  })

  it('fitView deja todos los puntos dentro del margen', () => {
    const pts = [
      { x: -100, y: -50 },
      { x: 300, y: 120 },
      { x: 0, y: 0 },
    ]
    const v = fitView(pts, 800, 600, 50)
    for (const p of pts) {
      const s = toScreen(v, p.x, p.y)
      expect(s.x).toBeGreaterThanOrEqual(50 - 1e-6)
      expect(s.x).toBeLessThanOrEqual(750 + 1e-6)
      expect(s.y).toBeGreaterThanOrEqual(50 - 1e-6)
      expect(s.y).toBeLessThanOrEqual(550 + 1e-6)
    }
    expect(v.k).toBeCloseTo(1.75)
  })

  it('fitView sin puntos centra el origen y nunca acerca más de maxZoom', () => {
    expect(fitView([], 800, 600)).toEqual({ k: 1, x: 400, y: 300 })
    expect(fitView([{ x: 5, y: 5 }], 800, 600).k).toBe(2)
  })

  it('centerOn lleva el punto al centro', () => {
    const v = centerOn(40, -20, 800, 600, 2)
    const s = toScreen(v, 40, -20)
    expect(s).toEqual({ x: 400, y: 300 })
  })

  it('lerpView parte de a, termina en b e interpola el zoom geométricamente', () => {
    const a = { k: 1, x: 0, y: 0 }
    const b = { k: 4, x: -100, y: 50 }
    const start = lerpView(a, b, 0, 800, 600)
    const end = lerpView(a, b, 1, 800, 600)
    expect(start.k).toBeCloseTo(1)
    expect(start.x).toBeCloseTo(0)
    expect(end.k).toBeCloseTo(4)
    expect(end.x).toBeCloseTo(-100)
    expect(end.y).toBeCloseTo(50)
    expect(lerpView(a, b, 0.5, 800, 600).k).toBeCloseTo(2)
  })

  it('screenRadius crece más lento que el zoom y tiene mínimo', () => {
    expect(screenRadius(10, 4)).toBe(20)
    expect(screenRadius(10, 0.25)).toBe(6)
  })

  it('easeOutCubic va de 0 a 1 desacelerando', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
  })
})
```

Crear `frontend/src/features/graph/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { GraphData } from './api'
import { FIXTURE } from './fixtures'
import {
  buildSimGraph,
  createSimulation,
  hashSeed,
  hitTest,
  initialPosition,
  mulberry32,
  nodeRadius,
  positionsOf,
  settle,
  warmAlpha,
} from './layout'

function settled(data: GraphData, ticks = 200) {
  const { nodes, links } = buildSimGraph(data)
  const sim = createSimulation(nodes, links, { seed: 7 })
  settle(sim, ticks)
  return positionsOf(nodes)
}

describe('layout', () => {
  it('es determinista: mismos datos y semilla dan las mismas posiciones tras N pasos', () => {
    const a = settled(FIXTURE)
    const b = settled(FIXTURE)
    expect([...a.entries()]).toEqual([...b.entries()])
    for (const p of a.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  it('la posición inicial depende del id y no del orden de llegada', () => {
    const a = buildSimGraph(FIXTURE).nodes
    const b = buildSimGraph({ ...FIXTURE, nodes: [...FIXTURE.nodes].reverse() }).nodes
    for (const n of a) {
      const m = b.find((x) => x.id === n.id)!
      expect([m.x, m.y]).toEqual([n.x, n.y])
    }
  })

  it('conserva la posición previa de los nodos que siguen visibles', () => {
    const previous = new Map([['species:sp1', { x: 123, y: -45 }]])
    const sp = buildSimGraph(FIXTURE, previous).nodes.find((n) => n.id === 'species:sp1')!
    expect([sp.x, sp.y]).toEqual([123, -45])
  })

  it('calcula grado y radio con las aristas válidas e ignora las de extremos ausentes', () => {
    const data: GraphData = {
      ...FIXTURE,
      edges: [...FIXTURE.edges, { src: 'species:sp1', dst: 'trait:fantasma', relation: 'has_trait', provenance: [] }],
    }
    const { nodes, links } = buildSimGraph(data)
    expect(links).toHaveLength(4)
    const sp = nodes.find((n) => n.id === 'species:sp1')!
    expect(sp.degree).toBe(3)
    expect(sp.radius).toBe(nodeRadius(3))
    expect(nodes.find((n) => n.id === 'prototype:pr1')!.degree).toBe(0)
    expect(nodeRadius(0)).toBe(4)
    expect(nodeRadius(100)).toBe(14)
  })

  it('warmAlpha arranca en frío salvo que la mayoría ya tenga posición', () => {
    expect(warmAlpha(FIXTURE, new Map())).toBe(1)
    const all = new Map(FIXTURE.nodes.map((n) => [n.id, { x: 0, y: 0 }]))
    expect(warmAlpha(FIXTURE, all)).toBe(0.35)
  })

  it('hitTest elige el nodo más cercano dentro de su radio más la holgura', () => {
    const { nodes } = buildSimGraph(FIXTURE)
    nodes.forEach((n, i) => {
      n.x = i * 100
      n.y = 0
    })
    expect(hitTest(nodes, 102, 1, 1, 0)?.id).toBe(nodes[1].id)
    expect(hitTest(nodes, 50, 0, 1, 0)).toBeNull()
    expect(hitTest(nodes, 50, 0, 1, 50)?.id).toBe(nodes[0].id)
  })

  it('PRNG, hash y posición inicial son deterministas y acotados', () => {
    expect(hashSeed('species:sp1')).toBe(hashSeed('species:sp1'))
    expect(hashSeed('a')).not.toBe(hashSeed('b'))
    const r1 = mulberry32(42)
    const r2 = mulberry32(42)
    const s1 = [r1(), r1(), r1()]
    expect([r2(), r2(), r2()]).toEqual(s1)
    for (const v of s1) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const p = initialPosition('x', 100)
    expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(100)
  })

  it('la simulación se enfría: tras muchos pasos alpha queda bajo el mínimo', () => {
    const { nodes, links } = buildSimGraph(FIXTURE)
    const sim = createSimulation(nodes, links, { seed: 7 })
    settle(sim, 400)
    expect(sim.alpha()).toBeLessThan(sim.alphaMin())
  })
})
```

Run: `npx vitest run src/features/graph` → FAIL (no existen `camera.ts` ni `layout.ts`).

- [ ] **Step 2: Cámara**

Crear `frontend/src/features/graph/camera.ts`:

```ts
/** Vista 2D del lienzo: pantalla = mundo · k + (x, y). Funciones puras. */
export interface View {
  k: number
  x: number
  y: number
}

export interface Point {
  x: number
  y: number
}

export const MIN_ZOOM = 0.15
export const MAX_ZOOM = 5

export function clampZoom(k: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))
}

export function toScreen(v: View, wx: number, wy: number): Point {
  return { x: wx * v.k + v.x, y: wy * v.k + v.y }
}

export function toWorld(v: View, sx: number, sy: number): Point {
  return { x: (sx - v.x) / v.k, y: (sy - v.y) / v.k }
}

/** Zoom manteniendo fijo el punto del mundo que está bajo (sx, sy). */
export function zoomAround(v: View, factor: number, sx: number, sy: number): View {
  const k = clampZoom(v.k * factor)
  const w = toWorld(v, sx, sy)
  return { k, x: sx - w.x * k, y: sy - w.y * k }
}

export function pan(v: View, dx: number, dy: number): View {
  return { k: v.k, x: v.x + dx, y: v.y + dy }
}

export function centerOn(wx: number, wy: number, width: number, height: number, k: number): View {
  const kk = clampZoom(k)
  return { k: kk, x: width / 2 - wx * kk, y: height / 2 - wy * kk }
}

export function fitView(points: Point[], width: number, height: number, padding = 56, maxZoom = 2): View {
  if (points.length === 0 || width <= 0 || height <= 0) return { k: 1, x: width / 2, y: height / 2 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const k = clampZoom(Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY, maxZoom))
  return centerOn((minX + maxX) / 2, (minY + maxY) / 2, width, height, k)
}

/** Interpola el centro del mundo en línea recta y el zoom de forma geométrica (sin "columpio"). */
export function lerpView(a: View, b: View, t: number, width: number, height: number): View {
  const ca = toWorld(a, width / 2, height / 2)
  const cb = toWorld(b, width / 2, height / 2)
  const k = a.k * Math.pow(b.k / a.k, t)
  return centerOn(ca.x + (cb.x - ca.x) * t, ca.y + (cb.y - ca.y) * t, width, height, k)
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** Radio en pantalla: crece con la raíz del zoom para que al acercar no tape todo; mínimo 0.6×. */
export function screenRadius(radius: number, k: number): number {
  return radius * Math.max(0.6, Math.sqrt(k))
}
```

- [ ] **Step 3: Simulación**

Crear `frontend/src/features/graph/layout.ts`:

```ts
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  Simulation,
  SimulationLinkDatum,
  SimulationNodeDatum,
} from 'd3-force'
import type { GraphData, GraphNode } from './api'

export interface SimNode extends SimulationNodeDatum {
  id: string
  node: GraphNode
  degree: number
  radius: number
  x: number
  y: number
}

export interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode
  target: SimNode
  relation: string
  key: string
}

export type Positions = Map<string, { x: number; y: number }>

/** FNV-1a de 32 bits: semilla estable a partir de un texto. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** PRNG pequeño y determinista en [0, 1). */
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

export function nodeRadius(degree: number): number {
  return 4 + Math.min(10, Math.sqrt(degree) * 2.2)
}

/** Posición inicial dentro de un disco, derivada solo del id (independiente del orden de llegada). */
export function initialPosition(id: string, spread: number): { x: number; y: number } {
  const rnd = mulberry32(hashSeed(id))
  const angle = rnd() * Math.PI * 2
  const r = spread * Math.sqrt(rnd())
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
}

export function buildSimGraph(data: GraphData, previous?: Positions): { nodes: SimNode[]; links: SimLink[] } {
  const spread = 40 * Math.sqrt(Math.max(1, data.nodes.length))
  const nodes: SimNode[] = data.nodes.map((node) => {
    const p = previous?.get(node.id) ?? initialPosition(node.id, spread)
    return { id: node.id, node, degree: 0, radius: nodeRadius(0), x: p.x, y: p.y }
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const links: SimLink[] = []
  for (const e of data.edges) {
    const source = byId.get(e.src)
    const target = byId.get(e.dst)
    if (!source || !target) continue
    links.push({ source, target, relation: e.relation, key: `${e.src}|${e.dst}|${e.relation}` })
    source.degree += 1
    target.degree += 1
  }
  for (const n of nodes) n.radius = nodeRadius(n.degree)
  return { nodes, links }
}

const LINK_DISTANCE: Record<string, number> = {
  cultivar_of: 30,
  has_cycle: 36,
  grows: 46,
  has_trait: 60,
  cites: 72,
}

/** Simulación detenida: el llamador la avanza con tick() (bucle de animación) o settle() (pruebas). */
export function createSimulation(
  nodes: SimNode[],
  links: SimLink[],
  { seed = 7, alpha = 1 }: { seed?: number; alpha?: number } = {},
): Simulation<SimNode, SimLink> {
  return forceSimulation<SimNode, SimLink>(nodes)
    .randomSource(mulberry32(seed))
    .force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((n) => n.id)
        .distance((l) => LINK_DISTANCE[l.relation] ?? 56),
    )
    .force('charge', forceManyBody<SimNode>().strength((n) => -70 - n.degree * 10).distanceMax(420))
    .force('collide', forceCollide<SimNode>((n) => n.radius + 4))
    // Gravedad suave: los nodos aislados (prototipos sin relaciones) no se van del cuadro.
    .force('x', forceX<SimNode>(0).strength(0.045))
    .force('y', forceY<SimNode>(0).strength(0.045))
    .alpha(alpha)
    .stop()
}

export function settle(sim: Simulation<SimNode, SimLink>, ticks: number): void {
  sim.tick(ticks)
}

export function positionsOf(nodes: SimNode[]): Positions {
  return new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]))
}

/** Si la mayoría de los nodos ya tenía posición (p. ej. tras filtrar), reacomodar con poca energía. */
export function warmAlpha(data: GraphData, previous: Positions): number {
  if (data.nodes.length === 0) return 1
  const known = data.nodes.filter((n) => previous.has(n.id)).length
  return known / data.nodes.length >= 0.5 ? 0.35 : 1
}

/** Nodo más cercano a (wx, wy) en coordenadas del mundo; radiusScale convierte el radio a mundo. */
export function hitTest(nodes: SimNode[], wx: number, wy: number, radiusScale: number, slop: number): SimNode | null {
  let best: SimNode | null = null
  let bestDist = Infinity
  for (const n of nodes) {
    const d = Math.hypot(n.x - wx, n.y - wy)
    if (d <= n.radius * radiusScale + slop && d < bestDist) {
      best = n
      bestDist = d
    }
  }
  return best
}
```

- [ ] **Step 4: Verificar**

Run (en `frontend/`): `npx vitest run src/features/graph && npx tsc -b`
Expected: PASS (camera 10, layout 8, más las de Task 3).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/graph
git commit -m "feat(graph): cámara con zoom al cursor y encuadre, y simulación d3-force determinista con posiciones conservadas"
```

---

### Task 5: Dibujo Canvas 2D y componente `GraphCanvas`

**Files:**
- Create: `frontend/src/features/graph/draw.ts`
- Create: `frontend/src/features/graph/draw.test.ts`
- Create: `frontend/src/features/graph/GraphCanvas.tsx`

**Interfaces:**
- Consumes: Task 3 (`GraphData`, `graphPalette`, `neighborIds`), Task 4 (cámara y layout), `isClick` de `@/features/prototypes/pick`, `useTheme`.
- Produces: `draw.ts` — `Ctx2D` (subconjunto de `CanvasRenderingContext2D` que usa el dibujo), `DrawState`, `LABEL_ZOOM = 1.2`, `HUB_DEGREE = 6`, `DIM_ALPHA = 0.14`, `labelAlpha(node, state)`, `drawGraph(ctx, nodes, links, state)`. `GraphCanvas.tsx` — `GraphCanvasProps {data, selectedId, onSelect(id | null), fitKey}` y `GraphCanvas` (nombrado). El lienzo: arrastrar el fondo mueve, arrastrar un nodo lo mueve (y lo suelta al terminar), rueda = zoom al cursor, clic sin arrastre (≤ 5 px) selecciona o deselecciona, `+`/`-`/`0`/`Esc` con el lienzo enfocado, botones "Acercar", "Alejar" y "Encuadrar todo". Al seleccionar, la cámara viaja al nodo en 650 ms; al cargar o cambiar `fitKey`, encuadra; al enfriarse la simulación reencuadra una vez si el usuario no ha movido la vista.

- [ ] **Step 1: Pruebas que fallan**

Crear `frontend/src/features/graph/draw.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { GraphData } from './api'
import { toScreen } from './camera'
import { Ctx2D, DIM_ALPHA, drawGraph, DrawState, labelAlpha } from './draw'
import { buildSimGraph } from './layout'
import { neighborIds } from './model'
import { graphPalette } from './palette'

/** Contexto falso que graba lo que se pinta (jsdom no implementa canvas). */
class Recorder implements Ctx2D {
  globalAlpha = 1
  fillStyle = ''
  strokeStyle = ''
  lineWidth = 1
  shadowBlur = 0
  shadowColor = ''
  font = ''
  textAlign: CanvasTextAlign = 'start'
  textBaseline: CanvasTextBaseline = 'alphabetic'
  lineJoin: CanvasLineJoin = 'miter'
  fills: Array<{ x: number; y: number; color: string; alpha: number; blur: number }> = []
  texts: Array<{ text: string; alpha: number }> = []
  private arcAt: { x: number; y: number } | null = null
  setTransform() {}
  clearRect() {}
  beginPath() {
    this.arcAt = null
  }
  moveTo() {}
  lineTo() {}
  stroke() {}
  strokeText() {}
  arc(x: number, y: number) {
    this.arcAt = { x, y }
  }
  fill() {
    if (this.arcAt) this.fills.push({ ...this.arcAt, color: this.fillStyle, alpha: this.globalAlpha, blur: this.shadowBlur })
  }
  fillText(text: string) {
    this.texts.push({ text, alpha: this.globalAlpha })
  }
}

// Un concentrador (grado 6) con seis rasgos alrededor y una fuente aislada.
const traits = ['a', 'b', 'c', 'd', 'e', 'f']
const DATA: GraphData = {
  truncated: false,
  nodes: [
    { id: 'species:hub', type: 'species', label: 'Lechuga', origin: null, meta: {} },
    ...traits.map((t) => ({ id: `trait:${t}`, type: 'trait' as const, label: `Rasgo ${t}`, origin: 'missing', meta: {} })),
    { id: 'source:s', type: 'source', label: 'Fuente suelta', origin: null, meta: {} },
  ],
  edges: traits.map((t) => ({ src: 'species:hub', dst: `trait:${t}`, relation: 'has_trait', provenance: [] })),
}

function scene() {
  const { nodes, links } = buildSimGraph(DATA)
  for (const n of nodes) {
    const i = traits.indexOf(n.id.replace('trait:', ''))
    if (n.id === 'species:hub') Object.assign(n, { x: 0, y: 0 })
    else if (n.id === 'source:s') Object.assign(n, { x: 200, y: 0 })
    else Object.assign(n, { x: 60 * Math.cos(i), y: 60 * Math.sin(i) })
  }
  return { nodes, links }
}

function state(over: Partial<DrawState> = {}): DrawState {
  return {
    view: { k: 0.8, x: 400, y: 300 },
    width: 800,
    height: 600,
    dpr: 1,
    palette: graphPalette(true),
    selectedId: null,
    hoverId: null,
    highlight: null,
    time: 0,
    ...over,
  }
}

function draw(over: Partial<DrawState> = {}) {
  const { nodes, links } = scene()
  const ctx = new Recorder()
  drawGraph(ctx, nodes, links, state(over))
  return { ctx, nodes }
}

describe('drawGraph', () => {
  it('alejado solo rotula los concentradores', () => {
    const { ctx } = draw()
    expect(ctx.texts.map((t) => t.text)).toEqual(['Lechuga'])
  })

  it('al acercar rotula todo, con fundido intermedio', () => {
    const { ctx } = draw({ view: { k: 1.5, x: 400, y: 300 } })
    expect(ctx.texts).toHaveLength(8)
    expect(ctx.texts.every((t) => t.alpha === 1)).toBe(true)
    const { nodes } = scene()
    const leaf = nodes.find((n) => n.id === 'trait:a')!
    const mid = labelAlpha(leaf, state({ view: { k: 1.075, x: 0, y: 0 } }))
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('con foco atenúa lo ajeno, rotula al nodo y sus vecinos y solo el enfocado brilla', () => {
    const highlight = neighborIds('trait:a', DATA.edges)
    const view = { k: 0.8, x: 400, y: 300 }
    const { ctx, nodes } = draw({ selectedId: 'trait:a', highlight, view })
    expect(ctx.texts.map((t) => t.text).sort()).toEqual(['Lechuga', 'Rasgo a'])

    const at = (id: string) => {
      const n = nodes.find((x) => x.id === id)!
      return toScreen(view, n.x, n.y)
    }
    const near = (f: { x: number; y: number }, p: { x: number; y: number }) => Math.abs(f.x - p.x) < 1e-6 && Math.abs(f.y - p.y) < 1e-6

    const loose = ctx.fills.filter((f) => near(f, at('source:s')))
    expect(loose.length).toBeGreaterThan(0)
    expect(loose.every((f) => f.alpha === DIM_ALPHA)).toBe(true)
    expect(ctx.fills.filter((f) => near(f, at('trait:b'))).every((f) => f.alpha === DIM_ALPHA)).toBe(true)
    expect(ctx.fills.filter((f) => near(f, at('species:hub'))).every((f) => f.alpha === 1)).toBe(true)

    const glowing = ctx.fills.filter((f) => f.blur > 0)
    expect(glowing.length).toBeGreaterThan(0)
    expect(glowing.every((f) => near(f, at('trait:a')) && f.color === graphPalette(true).node.trait)).toBe(true)
  })

  it('sin foco nada brilla ni se atenúa', () => {
    const { ctx } = draw()
    expect(ctx.fills.every((f) => f.blur === 0 && f.alpha === 1)).toBe(true)
  })

  it('pinta con los colores de la paleta recibida', () => {
    const dark = draw({ palette: graphPalette(true) }).ctx.fills.map((f) => f.color)
    const light = draw({ palette: graphPalette(false) }).ctx.fills.map((f) => f.color)
    expect(dark).toContain(graphPalette(true).node.species)
    expect(light).toContain(graphPalette(false).node.species)
    expect(light).not.toContain(graphPalette(true).node.species)
  })
})
```

Run: `npx vitest run src/features/graph/draw.test.ts` → FAIL (no existe `draw.ts`).

- [ ] **Step 2: Dibujo**

Crear `frontend/src/features/graph/draw.ts`:

```ts
import { screenRadius, toScreen, View } from './camera'
import type { SimLink, SimNode } from './layout'
import type { GraphPalette } from './palette'

/** Zoom a partir del cual todas las etiquetas son visibles (con fundido de LABEL_FADE antes). */
export const LABEL_ZOOM = 1.2
const LABEL_FADE = 0.25
/** Grado desde el que un nodo se rotula aunque la vista esté alejada. */
export const HUB_DEGREE = 6
export const DIM_ALPHA = 0.14
const TAU = Math.PI * 2
const MAX_LABEL = 32

/** Lo que el dibujo usa de CanvasRenderingContext2D (permite probar con un contexto falso). */
export interface Ctx2D {
  globalAlpha: number
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  shadowBlur: number
  shadowColor: string
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  lineJoin: CanvasLineJoin
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, start: number, end: number): void
  fill(): void
  stroke(): void
  fillText(text: string, x: number, y: number): void
  strokeText(text: string, x: number, y: number): void
}

export interface DrawState {
  view: View
  /** Tamaño en píxeles CSS. */
  width: number
  height: number
  dpr: number
  palette: GraphPalette
  selectedId: string | null
  hoverId: string | null
  /** Nodo enfocado + vecinos; null = sin foco. */
  highlight: Set<string> | null
  /** ms, para el pulso del brillo. */
  time: number
}

export function labelAlpha(n: SimNode, s: Pick<DrawState, 'view' | 'highlight' | 'hoverId' | 'selectedId'>): number {
  if (n.id === s.hoverId || n.id === s.selectedId) return 1
  if (s.highlight) return s.highlight.has(n.id) ? 1 : 0
  if (n.degree >= HUB_DEGREE) return 1
  return Math.max(0, Math.min(1, (s.view.k - (LABEL_ZOOM - LABEL_FADE)) / LABEL_FADE))
}

function segment(ctx: Ctx2D, view: View, l: SimLink): void {
  const a = toScreen(view, l.source.x, l.source.y)
  const b = toScreen(view, l.target.x, l.target.y)
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
}

/** Dibuja en coordenadas de pantalla (CSS px); el DPR se aplica con setTransform. */
export function drawGraph(ctx: Ctx2D, nodes: SimNode[], links: SimLink[], s: DrawState): void {
  const { view, palette } = s
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
  ctx.clearRect(0, 0, s.width, s.height)
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1

  // 1. Aristas: las del nodo enfocado van aparte, encima y con el color activo.
  const active: SimLink[] = []
  ctx.strokeStyle = palette.edge
  ctx.lineWidth = 1
  ctx.globalAlpha = s.highlight ? DIM_ALPHA : 1
  ctx.beginPath()
  for (const l of links) {
    if (s.selectedId && (l.source.id === s.selectedId || l.target.id === s.selectedId)) active.push(l)
    else segment(ctx, view, l)
  }
  ctx.stroke()
  if (active.length > 0) {
    ctx.globalAlpha = 1
    ctx.strokeStyle = palette.edgeActive
    ctx.lineWidth = 1.6
    ctx.beginPath()
    for (const l of active) segment(ctx, view, l)
    ctx.stroke()
  }

  // 2. Nodos: puntos de color por tipo; el enfocado lleva halo con brillo pulsante.
  const pulse = 0.5 + 0.5 * Math.sin(s.time / 320)
  for (const n of nodes) {
    const p = toScreen(view, n.x, n.y)
    const r = screenRadius(n.radius, view.k)
    if (p.x < -r || p.y < -r || p.x > s.width + r || p.y > s.height + r) continue
    const color = palette.node[n.node.type]
    const selected = n.id === s.selectedId
    if (selected) {
      ctx.shadowColor = color
      ctx.shadowBlur = 16 + 16 * pulse
      ctx.globalAlpha = 0.25
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(p.x, p.y, r + 6 + 3 * pulse, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = s.highlight && !s.highlight.has(n.id) ? DIM_ALPHA : 1
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, TAU)
    ctx.fill()
    ctx.shadowBlur = 0
    if (selected || n.id === s.hoverId) {
      ctx.globalAlpha = 1
      ctx.strokeStyle = palette.ring
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(p.x, p.y, r + 3, 0, TAU)
      ctx.stroke()
    }
  }

  // 3. Etiquetas encima de todo, con contorno del color del escenario.
  ctx.font = '600 11px Manrope, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  for (const n of nodes) {
    const alpha = labelAlpha(n, s)
    if (alpha <= 0) continue
    const p = toScreen(view, n.x, n.y)
    if (p.x < -200 || p.y < -40 || p.x > s.width + 200 || p.y > s.height + 40) continue
    const text = n.node.label.length > MAX_LABEL ? `${n.node.label.slice(0, MAX_LABEL - 1)}…` : n.node.label
    const y = p.y + screenRadius(n.radius, view.k) + 4
    ctx.globalAlpha = alpha
    ctx.lineWidth = 3
    ctx.strokeStyle = palette.labelHalo
    ctx.strokeText(text, p.x, y)
    ctx.fillStyle = palette.label
    ctx.fillText(text, p.x, y)
  }
  ctx.globalAlpha = 1
}
```

Run: `npx vitest run src/features/graph/draw.test.ts` → PASS (5).

- [ ] **Step 3: Componente del lienzo**

Crear `frontend/src/features/graph/GraphCanvas.tsx`:

```tsx
import { KeyboardEvent, PointerEvent, ReactNode, useEffect, useRef } from 'react'
import type { Simulation } from 'd3-force'
import { isClick } from '@/features/prototypes/pick'
import { useTheme } from '@/store/theme'
import type { GraphData } from './api'
import { centerOn, easeOutCubic, fitView, lerpView, pan, Point, screenRadius, toWorld, View, zoomAround } from './camera'
import { Ctx2D, drawGraph } from './draw'
import { buildSimGraph, createSimulation, hitTest, Positions, positionsOf, settle, SimLink, SimNode, warmAlpha } from './layout'
import { neighborIds } from './model'
import { graphPalette } from './palette'

export interface GraphCanvasProps {
  data: GraphData
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Cambia cuando lo mostrado cambia de naturaleza (grafo completo ↔ vecindario): reencuadra. */
  fitKey: string
}

const FOCUS_ZOOM = 1.6
const ANIM_MS = 650
const WARMUP_TICKS = 80
const HIT_SLOP_PX = 6
const AUTO_FIT_ALPHA = 0.06

interface Drag {
  pointerId: number
  start: Point
  last: Point
  node: SimNode | null
  moved: boolean
}

interface Stage {
  nodes: SimNode[]
  links: SimLink[]
  sim: Simulation<SimNode, SimLink> | null
  positions: Positions
  view: View
  width: number
  height: number
  dpr: number
  anim: { from: View; to: View; start: number } | null
  selected: string | null
  hover: string | null
  highlight: Set<string> | null
  dark: boolean
  dirty: boolean
  fitKey: string | null
  needsFit: boolean
  /** Reencuadre único cuando la simulación se enfría, salvo que el usuario ya haya movido la vista. */
  autoFit: boolean
  drag: Drag | null
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/80 text-lg font-semibold text-ink-fg shadow-glass backdrop-blur hover:bg-ink"
    >
      {children}
    </button>
  )
}

export function GraphCanvas({ data, selectedId, onSelect, fitKey }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dark = useTheme((s) => s.theme === 'dark')
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const stage = useRef<Stage>({
    nodes: [],
    links: [],
    sim: null,
    positions: new Map(),
    view: { k: 1, x: 0, y: 0 },
    width: 0,
    height: 0,
    dpr: 1,
    anim: null,
    selected: null,
    hover: null,
    highlight: null,
    dark,
    dirty: true,
    fitKey: null,
    needsFit: false,
    autoFit: false,
    drag: null,
  })

  const animateTo = (to: View) => {
    const s = stage.current
    s.anim = { from: s.view, to, start: performance.now() }
    s.dirty = true
  }

  const fit = (animate: boolean) => {
    const s = stage.current
    if (!s.width || !s.height || s.nodes.length === 0) {
      s.needsFit = true
      return
    }
    s.needsFit = false
    const to = fitView(s.nodes, s.width, s.height)
    if (animate) animateTo(to)
    else {
      s.view = to
      s.dirty = true
    }
  }

  const zoomBy = (factor: number) => {
    const s = stage.current
    s.autoFit = false
    animateTo(zoomAround(s.view, factor, s.width / 2, s.height / 2))
  }

  // Datos nuevos: reconstruir la simulación conservando posiciones previas.
  useEffect(() => {
    const s = stage.current
    s.sim?.stop()
    const { nodes, links } = buildSimGraph(data, s.positions)
    const sim = createSimulation(nodes, links, { seed: 7, alpha: warmAlpha(data, s.positions) })
    const refit = s.fitKey !== fitKey
    if (refit) settle(sim, WARMUP_TICKS) // el primer cuadro ya tiene forma; el resto se anima
    s.nodes = nodes
    s.links = links
    s.sim = sim
    s.highlight = s.selected ? neighborIds(s.selected, data.edges) : null
    s.dirty = true
    if (refit) {
      s.fitKey = fitKey
      s.autoFit = true
      fit(false)
    }
    return () => {
      s.positions = positionsOf(s.nodes)
      s.sim?.stop()
    }
  }, [data, fitKey])

  // Selección: resaltar vecinos y viajar al nodo.
  useEffect(() => {
    const s = stage.current
    s.selected = selectedId
    s.highlight = selectedId ? neighborIds(selectedId, data.edges) : null
    s.dirty = true
    const node = selectedId ? s.nodes.find((n) => n.id === selectedId) : undefined
    if (node && s.width) {
      s.autoFit = false
      animateTo(centerOn(node.x, node.y, s.width, s.height, Math.max(s.view.k, FOCUS_ZOOM)))
    }
  }, [selectedId, data])

  useEffect(() => {
    stage.current.dark = dark
    stage.current.dirty = true
  }, [dark])

  // Tamaño, rueda y bucle de animación (una vez).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = stage.current
    const ctx = (canvas.getContext?.('2d') ?? null) as Ctx2D | null

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      s.dpr = Math.min(window.devicePixelRatio || 1, 2)
      s.width = rect.width
      s.height = rect.height
      canvas.width = Math.round(rect.width * s.dpr)
      canvas.height = Math.round(rect.height * s.dpr)
      s.dirty = true
      if (s.needsFit) fit(false)
    }
    resize()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(canvas)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      s.anim = null
      s.autoFit = false
      s.view = zoomAround(s.view, Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top)
      s.dirty = true
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    let raf = 0
    const frame = (time: number) => {
      const sim = s.sim
      if (sim && sim.alpha() > sim.alphaMin()) {
        sim.tick()
        s.dirty = true
        if (s.autoFit && sim.alpha() < AUTO_FIT_ALPHA) {
          s.autoFit = false
          fit(true)
        }
      }
      if (s.anim) {
        const t = Math.min(1, (time - s.anim.start) / ANIM_MS)
        s.view = lerpView(s.anim.from, s.anim.to, easeOutCubic(Math.max(0, t)), s.width, s.height)
        if (t >= 1) s.anim = null
        s.dirty = true
      }
      // Con un nodo enfocado se redibuja siempre: el brillo pulsa.
      if (ctx && (s.dirty || s.selected)) {
        drawGraph(ctx, s.nodes, s.links, {
          view: s.view,
          width: s.width,
          height: s.height,
          dpr: s.dpr,
          palette: graphPalette(s.dark),
          selectedId: s.selected,
          hoverId: s.hover,
          highlight: s.highlight,
          time,
        })
        s.dirty = false
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [])

  const local = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const pick = (p: Point): SimNode | null => {
    const s = stage.current
    const w = toWorld(s.view, p.x, p.y)
    return hitTest(s.nodes, w.x, w.y, screenRadius(1, s.view.k) / s.view.k, HIT_SLOP_PX / s.view.k)
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    const s = stage.current
    const p = local(e)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    s.anim = null
    s.drag = { pointerId: e.pointerId, start: p, last: p, node: pick(p), moved: false }
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = stage.current
    const p = local(e)
    const d = s.drag
    if (!d || d.pointerId !== e.pointerId) {
      const id = pick(p)?.id ?? null
      if (id !== s.hover) {
        s.hover = id
        s.dirty = true
        e.currentTarget.style.cursor = id ? 'pointer' : 'grab'
      }
      return
    }
    if (!isClick(d.start, p)) d.moved = true
    if (d.moved) {
      s.autoFit = false
      if (d.node) {
        const w = toWorld(s.view, p.x, p.y)
        d.node.fx = w.x
        d.node.fy = w.y
        if (s.sim) {
          s.sim.alphaTarget(0.25)
          if (s.sim.alpha() < 0.3) s.sim.alpha(0.3)
        }
      } else {
        s.view = pan(s.view, p.x - d.last.x, p.y - d.last.y)
      }
      s.dirty = true
    }
    d.last = p
  }

  const endDrag = (e: PointerEvent<HTMLCanvasElement>, select: boolean) => {
    const s = stage.current
    const d = s.drag
    if (!d || d.pointerId !== e.pointerId) return
    s.drag = null
    if (d.node) {
      d.node.fx = null
      d.node.fy = null
      s.sim?.alphaTarget(0)
    }
    if (select && !d.moved) onSelectRef.current(d.node?.id ?? null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === '+' || e.key === '=') zoomBy(1.4)
    else if (e.key === '-') zoomBy(1 / 1.4)
    else if (e.key === '0') fit(true)
    else if (e.key === 'Escape') onSelectRef.current(null)
    else return
    e.preventDefault()
  }

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`Grafo con ${data.nodes.length} nodos y ${data.edges.length} relaciones. Usa la búsqueda o la lista de conexiones para navegar con el teclado.`}
        className="h-full w-full cursor-grab touch-none rounded-3xl focus-visible:outline-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, true)}
        onPointerCancel={(e) => endDrag(e, false)}
        onPointerLeave={() => {
          if (stage.current.hover) {
            stage.current.hover = null
            stage.current.dirty = true
          }
        }}
        onKeyDown={onKeyDown}
      />
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <ZoomButton label="Acercar" onClick={() => zoomBy(1.4)}>
          +
        </ZoomButton>
        <ZoomButton label="Alejar" onClick={() => zoomBy(1 / 1.4)}>
          −
        </ZoomButton>
        <ZoomButton label="Encuadrar todo" onClick={() => fit(true)}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </ZoomButton>
      </div>
    </div>
  )
}
```

Notas de implementación:
- `fitView(s.nodes, …)` acepta los `SimNode` porque tienen `x`/`y` (tipado estructural con `Point`).
- No usar `sim.restart()`: arrancaría el temporizador interno de d3; el único reloj es el `requestAnimationFrame` del componente.
- Las dependencias omitidas en los `useEffect` son intencionales: el estado mutable vive en `stage` (ref) y las funciones auxiliares solo lo leen; el proyecto no usa ESLint.

- [ ] **Step 4: Verificar**

Run (en `frontend/`): `npx vitest run src/features/graph && npx tsc -b`
Expected: PASS (draw 5 más las anteriores); `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/graph
git commit -m "feat(graph): lienzo Canvas 2D con etiquetas por zoom, foco con brillo y vecinos resaltados, zoom al cursor y arrastre"
```

---

### Task 6: Página `/app/graph` perezosa, búsqueda, leyenda y filtros, panel de detalle; entrada en el menú

**Files:**
- Create: `frontend/src/features/graph/GraphPage.tsx`
- Create: `frontend/src/features/graph/graph.test.tsx`
- Create: `frontend/src/features/graph/lazyChunk.test.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/sidebar.test.tsx`
- Modify: `frontend/src/components/icons.tsx`
- Modify: `frontend/src/styles/index.css`

**Interfaces:**
- Consumes: Tasks 3–5 (`graphApi`, `NODE_TYPES`, `FIXTURE`, funciones de `model.ts`, `graphPalette`, `GraphCanvas`/`GraphCanvasProps`); `PageHeader`, `Input`, `Field`, `Select`, `Button`, `OriginBadge`, `Loading`, `Empty`, `ErrorState`, `cx` de `@/components/ui`; `useTheme`.
- Produces: `export default function GraphPage()` (default para `lazy`); ruta `/app/graph`; `NAV_ITEMS` con `{ to: '/app/graph', label: 'Grafo', icon: 'graph' }`; `IconName` con `'graph'`; clase CSS `.graph-stage`. Estado en la URL: `?focus=<id de nodo>&depth=1..3` (enlazable); tipos activos y búsqueda son estado local.

- [ ] **Step 1: Pruebas que fallan**

Crear `frontend/src/features/graph/graph.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GraphData, graphApi, NODE_TYPES } from './api'
import { FIXTURE } from './fixtures'
import type { GraphCanvasProps } from './GraphCanvas'
import GraphPage from './GraphPage'

// jsdom no implementa canvas: el lienzo se sustituye por un botón por nodo que llama a onSelect.
vi.mock('./GraphCanvas', () => ({
  GraphCanvas: ({ data, selectedId, onSelect }: GraphCanvasProps) => (
    <div data-testid="graph-canvas" data-selected={selectedId ?? ''}>
      {data.nodes.map((n) => (
        <button key={n.id} type="button" onClick={() => onSelect(n.id)}>
          nodo {n.label}
        </button>
      ))}
    </div>
  ),
}))

beforeEach(() => vi.restoreAllMocks())

function renderPage(data: GraphData = FIXTURE, url = '/app/graph') {
  const spy = vi.spyOn(graphApi, 'get').mockResolvedValue(data)
  render(
    <MemoryRouter initialEntries={[url]}>
      <GraphPage />
    </MemoryRouter>,
  )
  return spy
}

const panel = () => screen.getByRole('complementary', { name: 'Detalle del nodo' })

describe('GraphPage', () => {
  it('carga el grafo completo con leyenda, conteos y lienzo', async () => {
    const spy = renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Grafo de conocimiento' })).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith({ focus: null, depth: 2, types: [...NODE_TYPES] })
    const legend = screen.getByRole('group', { name: 'Leyenda y filtros por tipo' })
    const species = within(legend).getByRole('button', { name: /Especies/ })
    expect(species).toHaveAttribute('aria-pressed', 'true')
    expect(species).toHaveTextContent('1')
    expect(within(legend).getByRole('button', { name: /Cultivares/ })).toHaveTextContent('0')
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    expect(screen.getByText('6 nodos · 4 relaciones')).toBeInTheDocument()
    expect(screen.queryByText(/primeros 300 nodos/)).toBeNull()
  })

  it('busca sin acentos y abre el detalle con conexiones, procedencia y enlace', async () => {
    renderPage()
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Buscar en el grafo' }), { target: { value: 'lactuca' } })
    fireEvent.click(within(screen.getByRole('list', { name: 'Resultados de búsqueda' })).getByRole('button', { name: /Lechuga/ }))
    const p = panel()
    expect(within(p).getByRole('heading', { level: 2, name: 'Lechuga' })).toBeInTheDocument()
    expect(within(p).getByText('Lactuca sativa L.')).toBeInTheDocument()
    expect(within(p).getByRole('link', { name: 'Abrir ficha de la especie' })).toHaveAttribute('href', '/app/plants/sp1')
    expect(within(p).getByText('Afirmación · Desconocido · Sin revisar')).toBeInTheDocument()
    expect(within(p).getByText('Identificador GBIF 7403263')).toBeInTheDocument()
    expect(within(p).getByText('Cultivada en el ciclo')).toBeInTheDocument()
    expect(screen.getByTestId('graph-canvas')).toHaveAttribute('data-selected', 'species:sp1')
    expect(screen.queryByRole('list', { name: 'Resultados de búsqueda' })).toBeNull()
  })

  it('clic en un rasgo muestra su origen, sin enlace, y se navega por sus conexiones', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'nodo Fotoperiodo' }))
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Fotoperiodo' })).toBeInTheDocument()
    expect(within(panel()).getByText('Desconocido')).toBeInTheDocument()
    expect(within(panel()).queryByRole('link')).toBeNull()
    fireEvent.click(within(panel()).getByRole('button', { name: /Lechuga/ }))
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Lechuga' })).toBeInTheDocument()
  })

  it('los filtros por tipo recargan con types y no permiten apagar el último', async () => {
    const spy = renderPage()
    const legend = await screen.findByRole('group', { name: 'Leyenda y filtros por tipo' })
    fireEvent.click(within(legend).getByRole('button', { name: /Fuentes/ }))
    await waitFor(() =>
      expect(spy).toHaveBeenLastCalledWith({ focus: null, depth: 2, types: NODE_TYPES.filter((t) => t !== 'source') }),
    )
    expect(within(legend).getByRole('button', { name: /Fuentes/ })).toHaveAttribute('aria-pressed', 'false')
    for (const name of [/Especies/, /Cultivares/, /Rasgos/, /Proyectos/, /Ciclos/]) {
      fireEvent.click(within(legend).getByRole('button', { name }))
    }
    expect(within(legend).getByRole('button', { name: /Prototipos/ })).toBeDisabled()
  })

  it('explorar vecindario pide foco y profundidad; ver grafo completo lo quita', async () => {
    const spy = renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'nodo Lechuga' }))
    fireEvent.change(screen.getByLabelText('Profundidad'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Explorar vecindario' }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith({ focus: 'species:sp1', depth: 3, types: [...NODE_TYPES] }))
    expect(await screen.findByText(/Vecindario de/)).toHaveTextContent('Vecindario de Lechuga a 3 saltos')
    fireEvent.click(screen.getByRole('button', { name: 'Ver grafo completo' }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith({ focus: null, depth: 2, types: [...NODE_TYPES] }))
  })

  it('abre enfocado si la URL trae foco y profundidad', async () => {
    const spy = renderPage(FIXTURE, '/app/graph?focus=species:sp1&depth=1')
    await screen.findByTestId('graph-canvas')
    expect(spy).toHaveBeenCalledWith({ focus: 'species:sp1', depth: 1, types: [...NODE_TYPES] })
    expect(screen.getByTestId('graph-canvas')).toHaveAttribute('data-selected', 'species:sp1')
  })

  it('avisa cuando el grafo se recorta a 300 nodos', async () => {
    renderPage({ ...FIXTURE, truncated: true })
    expect(await screen.findByText(/primeros 300 nodos/)).toBeInTheDocument()
  })

  it('sin nodos muestra un estado vacío honesto y no dibuja lienzo', async () => {
    renderPage({ nodes: [], edges: [], truncated: false })
    expect(await screen.findByText('Aún no hay nodos')).toBeInTheDocument()
    expect(screen.queryByTestId('graph-canvas')).toBeNull()
  })

  it('error con reintento', async () => {
    const spy = vi.spyOn(graphApi, 'get').mockRejectedValue(new Error('x'))
    render(
      <MemoryRouter>
        <GraphPage />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('es solo exploración: no hay controles de edición', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'nodo Lechuga' }))
    expect(screen.queryAllByRole('button', { name: /agregar|editar|eliminar|borrar|guardar/i })).toHaveLength(0)
  })
})
```

Crear `frontend/src/features/graph/lazyChunk.test.ts`:

```ts
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
```

En `frontend/src/App.test.tsx`, reemplazar el encabezado de importaciones por:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { graphApi } from '@/features/graph/api'
import { useAuth } from '@/store/auth'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
  useAuth.setState({ token: null, user: null, memberships: [] })
})
```

y añadir al final:

```tsx
it('carga /app/graph desde su chunk perezoso', async () => {
  vi.spyOn(graphApi, 'get').mockResolvedValue({ nodes: [], edges: [], truncated: false })
  useAuth.setState({
    token: 't',
    user: { id: 'u1', email: 'ana@alfa.test', full_name: 'Ana', is_superadmin: false },
    memberships: [],
  })
  render(
    <MemoryRouter initialEntries={['/app/graph']}>
      <App />
    </MemoryRouter>,
  )
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Grafo de conocimiento' }, { timeout: 5000 }),
  ).toBeInTheDocument()
  expect(await screen.findByText('Aún no hay nodos')).toBeInTheDocument()
})
```

En `frontend/src/components/sidebar.test.tsx`, añadir:

```tsx
it('incluye el grafo de conocimiento', async () => {
  await renderSidebar()
  expect(screen.getByRole('link', { name: 'Grafo' })).toHaveAttribute('href', '/app/graph')
})
```

Run (en `frontend/`): `npx vitest run src/features/graph src/App.test.tsx src/components/sidebar.test.tsx`
Expected: FAIL (no existe `GraphPage`; falta la ruta y la entrada del menú). `lazyChunk.test.ts` también falla en el control positivo.

- [ ] **Step 2: Página**

Crear `frontend/src/features/graph/GraphPage.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { Button, cx, Empty, ErrorState, Field, Input, Loading, OriginBadge, PageHeader, Select } from '@/components/ui'
import { useTheme } from '@/store/theme'
import { GraphData, GraphNode, graphApi, NODE_TYPES, NodeType } from './api'
import { GraphCanvas } from './GraphCanvas'
import { connectionsOf, countByType, describeProvenance, nodeLink, relationLabel, searchNodes, TYPE_META } from './model'
import { GraphPalette, graphPalette } from './palette'

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: GraphData; refreshing: boolean }

const DEPTHS = [1, 2, 3]

function parseDepth(raw: string | null): number {
  const n = Number(raw)
  return DEPTHS.includes(n) ? n : 2
}

const hops = (d: number) => `${d} ${d === 1 ? 'salto' : 'saltos'}`

function Dot({ color, glow = false }: { color: string; glow?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: color, boxShadow: glow ? `0 0 10px ${color}` : undefined }}
    />
  )
}

interface PanelProps {
  node: GraphNode | null
  data: GraphData
  byId: Map<string, GraphNode>
  palette: GraphPalette
  depth: number
  onDepth: (depth: number) => void
  onExplore: (id: string) => void
  onSelect: (id: string) => void
}

function NodePanel({ node, data, byId, palette, depth, onDepth, onExplore, onSelect }: PanelProps) {
  if (!node) {
    return (
      <aside aria-label="Detalle del nodo" className="glass p-5">
        <p className="eyebrow">Detalle</p>
        <h2 className="mt-2 text-lg font-bold">Explora el grafo</h2>
        <p className="mt-2 text-sm text-muted">
          Haz clic en un punto o búscalo por nombre para ver de dónde viene y con qué se conecta. Arrastra para moverte; usa la
          rueda o los botones para acercar. Las etiquetas aparecen al acercarte.
        </p>
      </aside>
    )
  }
  const link = nodeLink(node)
  const connections = connectionsOf(node.id, data)
  const scientific = node.meta?.scientific_name
  return (
    <aside aria-label="Detalle del nodo" className="glass flex min-h-0 flex-col p-5 lg:max-h-[calc(100vh-17rem)]">
      <p className="eyebrow flex items-center gap-2">
        <Dot color={palette.node[node.type]} glow />
        {TYPE_META[node.type].label}
      </p>
      <h2 className="mt-2 break-words text-xl font-extrabold">{node.label}</h2>
      {scientific && scientific !== node.label && <p className="mt-1 text-sm italic text-muted">{scientific}</p>}
      {node.origin && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          Mejor evidencia registrada <OriginBadge origin={node.origin} />
        </p>
      )}
      {link && (
        <div className="mt-4">
          {link.kind === 'internal' ? (
            <Link to={link.to} className="inline-flex rounded-full bg-ink px-4 py-2 text-xs font-semibold text-ink-fg">
              {link.label}
            </Link>
          ) : (
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex rounded-full bg-ink px-4 py-2 text-xs font-semibold text-ink-fg"
            >
              {link.label}
            </a>
          )}
        </div>
      )}
      <div className="mt-4 flex items-end gap-2">
        <div className="w-32">
          <Field label="Profundidad">
            {(id) => (
              <Select id={id} value={depth} onChange={(e) => onDepth(Number(e.target.value))} className="!py-1.5">
                {DEPTHS.map((d) => (
                  <option key={d} value={d}>
                    {hops(d)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Button variant="secondary" className="!px-4 !py-2" onClick={() => onExplore(node.id)}>
          Explorar vecindario
        </Button>
      </div>
      <h3 className="mt-5 text-sm font-bold">Conexiones ({connections.length})</h3>
      {connections.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Sin relaciones registradas en esta vista.</p>
      ) : (
        <ul aria-label="Conexiones" className="mt-2 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {connections.map((c) => (
            <li key={`${c.edge.src}|${c.edge.dst}|${c.edge.relation}`} className="rounded-2xl bg-fg/5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                {relationLabel(c.edge.relation, c.outgoing)}
              </p>
              <button
                type="button"
                onClick={() => onSelect(c.other.id)}
                className="mt-1 flex items-center gap-2 text-left text-sm font-semibold hover:text-accent"
              >
                <Dot color={palette.node[c.other.type]} />
                {c.other.label}
              </button>
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {c.edge.provenance.map((p, i) => (
                  <li key={i}>{describeProvenance(p, byId)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

export default function GraphPage() {
  const [params, setParams] = useSearchParams()
  const focus = params.get('focus')
  const depth = parseDepth(params.get('depth'))
  const [types, setTypes] = useState<NodeType[]>([...NODE_TYPES])
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(focus)
  const [query, setQuery] = useState('')
  const [panelDepth, setPanelDepth] = useState(depth)
  const dark = useTheme((s) => s.theme === 'dark')
  const palette = useMemo(() => graphPalette(dark), [dark])
  const request = useRef(0)

  const load = useCallback(() => {
    const id = ++request.current
    setState((prev) => (prev.phase === 'ready' ? { ...prev, refreshing: true } : { phase: 'loading' }))
    graphApi
      .get({ focus, depth, types })
      .then((data) => {
        if (id === request.current) setState({ phase: 'ready', data, refreshing: false })
      })
      .catch((err) => {
        if (id === request.current) setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar el grafo') })
      })
  }, [focus, depth, types])
  useEffect(load, [load])

  const data = state.phase === 'ready' ? state.data : null
  const byId = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data])
  const results = useMemo(() => (data ? searchNodes(data.nodes, query) : []), [data, query])
  const counts = useMemo(() => countByType(data?.nodes ?? []), [data])

  // Si el nodo seleccionado ya no está (filtro o vecindario nuevo), se limpia la selección.
  useEffect(() => {
    if (data && selectedId && !byId.has(selectedId)) setSelectedId(null)
  }, [data, byId, selectedId])

  const toggleType = (t: NodeType) =>
    setTypes((prev) => NODE_TYPES.filter((x) => (x === t ? !prev.includes(t) : prev.includes(x))))
  const pick = (id: string) => {
    setSelectedId(id)
    setQuery('')
  }
  const explore = (id: string) => {
    setSelectedId(id)
    setParams({ focus: id, depth: String(panelDepth) })
  }

  if (state.phase === 'loading') return <Loading label="Cargando grafo…" />
  if (state.phase === 'error') return <ErrorState message={state.message} onRetry={load} />
  const graph = state.data
  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const focusNode = focus ? byId.get(focus) : undefined
  const present = NODE_TYPES.filter((t) => counts[t] > 0)

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Conocimiento"
        title="Grafo de conocimiento"
        description="Especies, rasgos, fuentes, proyectos, ciclos y prototipos conectados solo por datos registrados: vínculos del sistema, afirmaciones con su evidencia y relaciones con procedencia."
      />

      <div className="glass relative z-20 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Input
            type="search"
            aria-label="Buscar en el grafo"
            placeholder="Buscar especie, rasgo, fuente, proyecto…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) pick(results[0].id)
              if (e.key === 'Escape') setQuery('')
            }}
          />
          {query.trim() && (
            <ul aria-label="Resultados de búsqueda" className="glass absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-auto p-1.5">
              {results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted">Sin coincidencias</li>
              ) : (
                results.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => pick(n.id)}
                      className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm hover:bg-fg/5"
                    >
                      <Dot color={palette.node[n.type]} />
                      <span className="min-w-0 flex-1 truncate font-medium">{n.label}</span>
                      <span className="text-xs text-muted">{TYPE_META[n.type].label}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <div role="group" aria-label="Leyenda y filtros por tipo" className="flex flex-wrap gap-1.5">
          {NODE_TYPES.map((t) => {
            const active = types.includes(t)
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                disabled={active && types.length === 1}
                onClick={() => toggleType(t)}
                className={cx(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed',
                  active ? 'border-border bg-surface/80 text-fg' : 'border-dashed border-border text-muted opacity-60',
                )}
              >
                <Dot color={palette.node[t]} glow={active} />
                {TYPE_META[t].plural}
                {active && <span className="font-mono text-muted"> {counts[t]}</span>}
              </button>
            )
          })}
        </div>
        {state.refreshing && (
          <span role="status" className="text-xs text-muted lg:ml-auto">
            Actualizando…
          </span>
        )}
      </div>

      {graph.truncated && (
        <p role="status" className="glass px-4 py-3 text-sm">
          Se muestran los primeros 300 nodos (los más conectados o los más cercanos al foco). Selecciona uno y usa «Explorar
          vecindario» para ver el resto.
        </p>
      )}
      {focus && (
        <div className="glass flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <span>
            Vecindario de <strong>{focusNode?.label ?? 'nodo'}</strong> a {hops(depth)}
          </span>
          <Button variant="secondary" className="!px-4 !py-1.5" onClick={() => setParams({})}>
            Ver grafo completo
          </Button>
        </div>
      )}

      {graph.nodes.length === 0 ? (
        <Empty
          title="Aún no hay nodos"
          description="El grafo se arma con el catálogo, tus proyectos y tus prototipos. Cuando existan, aparecerán aquí con sus relaciones reales."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="graph-stage relative h-[60vh] min-h-[420px] overflow-hidden rounded-3xl border border-border/60 shadow-glass lg:h-[calc(100vh-17rem)]">
            <GraphCanvas data={graph} selectedId={selectedId} onSelect={setSelectedId} fitKey={focus ?? 'all'} />
            <p className="pointer-events-none absolute left-4 top-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              {graph.nodes.length} nodos · {graph.edges.length} relaciones
            </p>
            <ul
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 left-3 hidden flex-wrap gap-x-3 gap-y-1 rounded-2xl bg-surface/60 px-3 py-2 text-[11px] font-semibold text-muted backdrop-blur sm:flex"
            >
              {present.map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Dot color={palette.node[t]} glow />
                  {TYPE_META[t].plural}
                </li>
              ))}
            </ul>
          </div>
          <NodePanel
            node={selected}
            data={graph}
            byId={byId}
            palette={palette}
            depth={panelDepth}
            onDepth={setPanelDepth}
            onExplore={explore}
            onSelect={setSelectedId}
          />
        </div>
      )}

      <p className="text-xs text-muted">
        Solo exploración: los nodos y relaciones salen de datos registrados y nada se edita desde aquí.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Ruta perezosa**

En `frontend/src/App.tsx`:

Cambiar `import { ReactNode } from 'react'` por:

```tsx
import { lazy, ReactNode, Suspense } from 'react'
```

Añadir debajo de las importaciones:

```tsx
import { Loading } from '@/components/ui'

// d3-force vive solo en este chunk perezoso.
const GraphPage = lazy(() => import('@/features/graph/GraphPage'))
```

Y dentro de la ruta `app`, después de `prototypes/:id`:

```tsx
        <Route
          path="graph"
          element={
            <Suspense fallback={<Loading label="Cargando grafo…" />}>
              <GraphPage />
            </Suspense>
          }
        />
```

- [ ] **Step 4: Menú e ícono**

En `frontend/src/components/icons.tsx`, añadir `'graph'` al tipo `IconName` y al mapa `PATHS`:

```tsx
  graph: 'M4 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M16 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 6.2l8 .6M6.8 7.9l4.4 8.3M17.2 8.8l-4.4 7.4',
```

En `frontend/src/components/Sidebar.tsx`, añadir al final de `NAV_ITEMS`:

```tsx
  { to: '/app/graph', label: 'Grafo', icon: 'graph' },
```

- [ ] **Step 5: Escenario con estilo por tema**

Al final de `frontend/src/styles/index.css`:

```css
@layer components {
  /* Escenario del grafo: retícula de puntos y viñeta que siguen los tokens del tema. */
  .graph-stage {
    background-color: rgb(var(--c-surface) / 0.55);
    background-image:
      radial-gradient(rgb(var(--c-fg) / 0.07) 1px, transparent 1.2px),
      radial-gradient(ellipse at 50% 40%, rgb(var(--c-lime) / 0.12), transparent 65%);
    background-size: 22px 22px, 100% 100%;
  }
  .dark .graph-stage {
    background-color: rgb(12 15 11);
    background-image:
      radial-gradient(rgb(230 236 226 / 0.06) 1px, transparent 1.2px),
      radial-gradient(ellipse at 50% 35%, rgb(166 226 46 / 0.1), transparent 60%),
      linear-gradient(160deg, rgb(26 32 25), rgb(10 12 9));
    background-size: 22px 22px, 100% 100%, 100% 100%;
  }
}
```

- [ ] **Step 6: Verificar**

Run (en `frontend/`): `npx vitest run && npx tsc -b && npm run build`
Expected: todo PASS; el build emite un chunk `GraphPage-*.js` aparte del `index-*.js`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat(graph): página /app/graph perezosa con búsqueda, leyenda y filtros por tipo, panel con procedencia y entrada Grafo en el menú"
```

---

### Task 7: README, verificación de cierre de fase

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Checklist**

En la tabla "real / simulado / pendiente" de `README.md`, sacar "grafo" de la fila `| Studio 3D, impacto, grafo | Pendiente (V4–V6) |` (dejar en esa fila solo lo que siga pendiente tras V4/V5) y añadir:

```markdown
| Grafo de conocimiento (`/app/graph`) | Real, solo exploración: nodos derivados del catálogo y de los datos del tenant; relaciones de FKs, afirmaciones con su evidencia e identificadores externos verificados, cada una con su procedencia; máximo 300 nodos. Las relaciones guardadas (`designed_for`, `related_to`, `cites`) existen en el modelo pero no se editan desde la UI en esta fase |
```

- [ ] **Step 2: Suites completas**

```bash
~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings
cd frontend && npx tsc -b && npx vitest run && npm run build
grep -l "alphaMin" dist/assets/*.js
```

Expected: todo PASS; el `grep` lista solo el chunk de `GraphPage` (ningún `index-*.js`).

- [ ] **Step 3: Migración en Postgres 17 (tras rebasar sobre un `main` con V3 y V4)**

```bash
git fetch origin && git rebase origin/main   # debe contener 0005 y 0006
docker run -d --rm --name hvt-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=hvt -p 55432:5432 postgres:17
sleep 5
export DATABASE_URL=postgresql://postgres:pg@localhost:55432/hvt
~/.venvs/harvestt/bin/python -m alembic upgrade head
~/.venvs/harvestt/bin/python -m alembic check
~/.venvs/harvestt/bin/python -m alembic downgrade 0006
~/.venvs/harvestt/bin/python -m alembic upgrade head
docker stop hvt-pg
```

Expected: `alembic heads` muestra una sola cabeza `0007`; `alembic check` imprime "No new upgrade operations detected.". Si `0005`/`0006` aún no están en `main`, este paso queda bloqueado (Alembic responde `Can't locate revision identified by '0006'`): no cambiar `down_revision`, esperar al merge de V3 y V4.

- [ ] **Step 4: Smoke del contenedor con datos de demo**

Levantar Postgres 17 y la imagen (`docker build -t harvestt-cortex .`), arrancar con `DATABASE_URL` hacia ese Postgres, entrar como admin del seed, crear un proyecto con un ciclo de lechuga y un prototipo, y abrir `/app/graph`.

Expected: el contenedor aplica `0007` al arrancar; se ven 3 especies unidas a 4 rasgos (DESCONOCIDO) y a la fuente GBIF, el proyecto → ciclo → lechuga, y el prototipo como punto suelto (no hay relación registrada y no se inventa). Clic en "Lechuga": brillo, vecinos resaltados, panel con procedencia y "Abrir ficha de la especie" lleva a `/app/plants/<id>`.

- [ ] **Step 5: Revisión visual**

Capturas en claro 1280, oscuro 1280 y claro 375 de `/app/graph`, sin selección y con "Lechuga" seleccionada (contenedor `mcr.microsoft.com/playwright:v1.49.0-jammy`, `--network host`). Revisar: sin scroll horizontal; zoom con rueda suave y centrado en el cursor; etiquetas legibles en ambos temas (contorno del color del fondo); brillo visible en oscuro; leyenda dentro del escenario; en 375 px el panel queda debajo del lienzo y los botones de zoom son alcanzables.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: grafo de conocimiento pasa a real (solo exploración) en el checklist (V6)"
```

Merge a `main` y despliegue: **solo con autorización explícita del usuario**, y después de V3 y V4 (migración `0007` → `0006`).

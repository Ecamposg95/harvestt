# M2 · Ontología — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vocabulario propio de HarvestT en seis dominios, con IDs permanentes `HVT:000000`, equivalencias a estándares, propuestas de la comunidad revisadas por el equipo, términos enlazados a los datos existentes, presencia en el grafo de V6 y exportación OWL/JSON con licencia CC-BY 4.0.

**Architecture:**
- Módulo nuevo y **separable** `app/modules/ontology`:
  - cuatro tablas: términos, equivalencias, conceptos externos cargados y versiones (migración `0009`);
  - servicio de propuesta, revisión y publicación;
  - exportación;
  - semilla idempotente.
  - Solo puede importar `app.core.*` y `app.modules.identity.*`; una prueba lo impone.
- Módulo puente `app/modules/term_links`, del lado del producto:
  - columnas `*_term_id` en especies, afirmaciones, proyectos y ciclos;
  - resolución en las escrituras;
  - reenlace en cada arranque;
  - uso de un término.
- El grafo de V6 suma el tipo de nodo `term`.
- Frontend: feature `features/ontology` en `/app/ontologia`, con árbol por dominio, buscador, ficha, «Proponer término», «Mis propuestas» y la bandeja de revisión de superadmin.

**Tech Stack:** FastAPI · SQLAlchemy 2 · Alembic · pytest · React 18 · TypeScript · Vitest. Sin dependencias nuevas: el Turtle se serializa a mano, sin `rdflib`.

**Spec:** `docs/superpowers/specs/2026-11-07-hito-moonshot-design.md` §3, §6, §10ter (2 y 3), §11 y §12. Los mockups `ontologia*.html` no están en el repositorio; manda el texto de §6.

## Estado de ejecución

Rama `feat/hito-m2-ontologia`. Ejecución con subagentes: implementación y revisión por tarea. Se actualiza y se sube al cerrar cada tarea.

| Tarea | Estado | Commits |
|---|---|---|
| 1 · Modelos y migración 0009 | Completa (revisada) | `111db9d` |
| 2 · Propuestas y sugerencias | Completa (revisada) | `ea0e761` |
| 3 · Revisión y versiones | Completa (revisada, 1 ronda de corrección) | `681b13b`, `398939f` |
| 4 · Semilla verificada | Completa (revisada) | `d45e902` |
| 5 · Puente con datos | Completa (revisada, 1 ronda de corrección) | `7b99a47`, `8ebe999` |
| 6 · Exportación | Completa (revisada) | `4ff0587` |
| 7 · Grafo | Completa (revisada) | `a0ff38c` |
| 8 · Página de ontología | En curso | |
| 9 · Propuestas y revisión (UI) | Pendiente | |
| 10 · Visión, docs y puerta | Pendiente | |

## Global Constraints

- Rama `feat/hito-m2-ontologia` desde `main`. Merge y despliegue **solo con autorización explícita del fundador**.
- **Separabilidad (§10ter.3):** `app/modules/ontology/**` importa solo de `app.core` y `app.modules.identity`. Nada de catálogo, proyectos, grafo, telemetría ni visión.
- **Nunca se inventan correspondencias.** Un valor libre que no casa con un alias publicado queda con `*_term_id = NULL`, y la interfaz lo muestra como «Desconocido». El texto original no se toca.
- **Nunca se inventan identificadores externos.** Cada equivalencia de la semilla se verifica contra la fuente oficial (Tarea 4). La que no se pueda verificar se omite; no se aproxima.
- ID permanente: `HVT:` seguido de 6 dígitos con ceros a la izquierda (`HVT:000001`). Se asigna al publicar y nunca se reutiliza.
- Estados y etiquetas:

  | Código | Etiqueta |
  |---|---|
  | `proposed` | Propuesto |
  | `in_review` | En revisión |
  | `published` | Publicado |
  | `rejected` | Rechazado |
  | `obsolete` | Obsoleto |

- Un término publicado nunca se borra ni cambia de etiqueta, definición o padre. Solo puede pasar a `obsolete`, con `replaced_by` apuntando a otro término publicado.
- Dominios y etiquetas:

  | Código | Etiqueta |
  |---|---|
  | `organism` | Organismo |
  | `plant` | Planta y etapas |
  | `trait` | Rasgos |
  | `environment` | Ambiente |
  | `place` | Lugar |
  | `node` | Nodo y medición |

- Correspondencias: `exact`, `close` y `broad`, que se exportan como `skos:exactMatch`, `skos:closeMatch` y `skos:broadMatch`.
- Esquemas externos admitidos, con su prefijo de identificador:

  | Esquema | Formato del identificador |
  |---|---|
  | `ncbi_taxon` | numérico |
  | `wfo` | `wfo-…` |
  | `po` | `PO:…` |
  | `bbch` | código |
  | `co` | `CO_…` |
  | `ucum` | código UCUM |
  | `peco` | `PECO:…` |
  | `envo` | `ENVO:…` |
  | `agrovoc` | `c_…` |
  | `geosparql` | IRI |
  | `koppen` | código |
  | `sosa` | IRI |
  | `ssn` | IRI |
  | `prov` | IRI |

- Proponer requiere cuenta, sin importar el rol (§10ter.2). Revisar, obsoletar y editar equivalencias de un término publicado: **solo superadmin**. El rol de curador queda fuera; es decisión del builder (§6.2 lo permite).
- Toda acción de revisión exige razón: `note` con 3 a 500 caracteres, visible en la ficha.
- Crédito: la ficha muestra «Propuesto por <full_name>». Los términos de la semilla dicen «Equipo HarvestT». El formulario de propuesta avisa: «Si se publica, tu nombre aparecerá como autor del término, también en la exportación pública».
- Cada publicación, obsolescencia o cambio de equivalencias de un término publicado **sube la versión** de la ontología (entero, empieza en 1 con la semilla).
- Exportación pública con licencia `https://creativecommons.org/licenses/by/4.0/`. Las IRI usan `ONTOLOGY_BASE_IRI` (env), por defecto `https://harvestt-production.up.railway.app/api/v1/public/ontology/terms/`. **El ID `HVT:` es lo permanente; la base de las IRI cambiará con harvestt.org.** Se documenta en INTEGRIDAD_CIENTIFICA.
- La sugerencia de equivalencias es una búsqueda en `ontology_external_concepts`, sin LLM.
- Español; «Salvia cristal»; claro, oscuro y 375 px sin desbordes.
- Verde antes de cada commit: `make test` (pytest + `tsc -b` + vitest). Al cierre también:
  - `npm run build`;
  - ciclo `upgrade → check → downgrade 0008 → upgrade → check` en Postgres 17;
  - *smoke test* del contenedor, si Docker está disponible (si no, se declara no ejecutado, como en M1).

## Review Focus

1. **Aprobaciones concurrentes o repetidas.**
   - Aprobar un término ya publicado → `409 already_reviewed`.
   - Dos aprobaciones distintas nunca comparten `hvt_id` ni versión. La versión vigente se bloquea con `with_for_update()`.
   - Test en la Tarea 3.
2. **Etiqueta duplicada con otra grafía.** «Fotoperíodo» frente a «fotoperiodo » en el mismo dominio → `409 term_exists` al proponer y al aprobar. Se compara la etiqueta normalizada: NFKD sin acentos, `casefold`, espacios colapsados. En otro dominio sí se permite. Test en la Tarea 2.
3. **Padre inválido.** Padre de otro dominio, no publicado, u obsoleto entre la propuesta y la aprobación → `422` con `field=parent_id`. Obsoletar un término con `replaced_by` igual a sí mismo, no publicado u obsoleto → `422`. Test en la Tarea 3.
4. **Valores libres sin correspondencia.** `"unknown"`, `"other"`, `""`, `"Germinación"` (que casa por alias plegado) y `"etapa rara"`:
   - solo `"Germinación"` obtiene término;
   - los demás quedan en `NULL`;
   - el texto original queda intacto;
   - reenlazar dos veces no cambia nada.
   - Test en la Tarea 5.
5. **Visibilidad de propuestas.**
   - Un usuario sin superadmin ve los términos publicados y obsoletos, y **sus** propuestas.
   - Nunca ve las propuestas ni las rechazadas de otros: `GET` directo → `404`.
   - La exportación pública y `/public/ontology/terms/{hvt_id}` solo incluyen publicados y obsoletos.
   - Tests en las Tareas 2 y 6.

---

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `app/modules/ontology/models.py` | `OntologyTerm`, `TermEquivalence`, `ExternalConcept`, `OntologyRelease` y constantes |
| `app/modules/ontology/text.py` | `normalize_label(text) -> str` (puro) |
| `app/modules/ontology/schemas.py` | Entradas y salidas Pydantic |
| `app/modules/ontology/service.py` | Lectura con visibilidad, propuesta, edición, sugerencias |
| `app/modules/ontology/review.py` | Revisión, publicación, versiones, obsolescencia, equivalencias de publicados |
| `app/modules/ontology/export.py` | Turtle y JSON |
| `app/modules/ontology/seed.py` · `data/seed_terms.json` · `data/external_concepts.json` | Semilla idempotente y vocabularios cargados |
| `app/modules/ontology/router.py` | `router` (`/ontology`, con sesión) y `public_router` (`/public/ontology`) |
| `scripts/ontology/verify_external.py` | Verificación en red de los identificadores externos (no corre en pytest) |
| `app/modules/term_links/service.py` · `router.py` | Resolver, reenlazar, uso de un término; `seed()` de reenlace |
| `alembic/versions/0009_ontology.py` | Tablas nuevas y columnas `*_term_id` |
| `tests/test_ontology.py`, `tests/test_term_links.py` | Pruebas |
| `frontend/src/features/ontology/*` | API, página, árbol, ficha, vecinos, propuesta, bandeja |

---

### Task 1: Modelos, migración 0009 y frontera del módulo

**Files:**
- Create: `app/modules/ontology/__init__.py`, `models.py`, `text.py`, `alembic/versions/0009_ontology.py`, `tests/test_ontology.py`
- Modify:
  - `app/models_registry.py`;
  - `app/modules/catalog/models.py`: `Species.term_id`, `TraitAssertion.variable_term_id`, `growth_stage_term_id` y `cultivation_system_term_id`;
  - `app/modules/projects/models.py`: `Project.system_term_id`, `CropCycle.stage_term_id`.
  - Todas son `String(36)`, nullable, con FK `ontology_terms.id` e índice.

**Interfaces:**
- Produces en `models.py`:
  - Constantes: `DOMAINS`, `TERM_STATUSES`, `MATCH_TYPES = ("exact", "close", "broad")` y `SCHEMES` (la tabla de Global Constraints).
  - `class OntologyTerm(UUIDMixin, AuditMixin, Base)`, tabla `ontology_terms`, global y sin organización:
    - `hvt_id: str(10) | None`, único;
    - `seed_key: str(60) | None`, único;
    - `domain: str(20)`;
    - `parent_id`: FK a sí misma, nullable;
    - `label: str(120)`;
    - `label_key: str(120)`, indexado junto con `domain`;
    - `definition: Text`;
    - `aliases: JSON list[str]`, por defecto `[]`;
    - `unit: str(30) | None`, código UCUM, solo en `trait`;
    - `status: str(12)`, por defecto `proposed`;
    - `proposed_by`: FK `users.id`, nullable; NULL significa semilla del equipo;
    - `reviewed_by`, `reviewed_at`, `review_note: str(500) | None`;
    - `replaced_by_id`: FK a sí misma, nullable;
    - `published_in_version: int | None`, `obsoleted_in_version: int | None`;
    - CHECKs `ck_ontology_terms_domain` y `ck_ontology_terms_status`.
  - `class TermEquivalence(UUIDMixin, AuditMixin, Base)`, tabla `ontology_equivalences`:
    - `term_id` FK, con índice;
    - `scheme: str(20)`, `external_id: str(120)`, `url: str(500)`;
    - `external_label: str(200) | None`;
    - `match: str(5)`;
    - CHECKs `ck_ontology_equivalences_scheme` y `ck_ontology_equivalences_match`;
    - `UniqueConstraint(term_id, scheme, external_id)`.
  - `class ExternalConcept(UUIDMixin, AuditMixin, Base)`, tabla `ontology_external_concepts`:
    - `scheme`, `external_id`, `label: str(200)`, `label_key: str(200)` (indexado), `url`;
    - `verified_at: date`, `verified_via: str(300)`;
    - único `(scheme, external_id)`.
  - `class OntologyRelease(UUIDMixin, AuditMixin, Base)`, tabla `ontology_releases`:
    - `version: int`, único;
    - `note: str(300)`;
    - `published_by`: FK `users.id`, nullable.
- Produces en `text.py`: `normalize_label(text: str) -> str` (NFKD sin marcas combinantes, `casefold`, espacios colapsados, `strip`).

- [ ] **Step 1: Tests.**
  - `test_normalize_label`: `normalize_label("  Fotoperíodo ") == normalize_label("fotoperiodo") == "fotoperiodo"`.
  - `test_term_persists_with_defaults`: un término propuesto guarda `status == "proposed"`, `hvt_id is None` y `aliases == []`.
  - `test_ontology_module_has_no_product_imports`: recorre con `ast` cada `.py` de `app/modules/ontology/` y afirma que todo `import`/`from` que empiece con `app.` empiece con `app.core` o `app.modules.identity` o `app.modules.ontology`.
- [ ] **Step 2: Correr y verlos fallar** (`ModuleNotFoundError`).
- [ ] **Step 3: Escribir los modelos y `text.py`.** Registrarlos en `models_registry.py` y añadir las columnas a catálogo y proyectos.
- [ ] **Step 4: Escribir `0009_ontology.py`** (`revision="0009"`, `down_revision="0008"`) al estilo de `0007_graph_edges.py`:
  - crea las 4 tablas, con FKs, CHECKs, únicos e índices idénticos a los modelos;
  - añade las 6 columnas con FK nombrada `fk_<tabla>_<columna>_ontology_terms` e índice `ix_<tabla>_<columna>`;
  - `downgrade` lo deshace en orden inverso.
- [ ] **Step 5: `pytest tests/test_ontology.py -v`** en verde.
- [ ] **Step 6: Commit.** `feat(ontology): modelos, migración 0009 y frontera del módulo`

### Task 2: Lectura, propuesta, edición y sugerencias

**Files:**
- Create: `app/modules/ontology/schemas.py`, `service.py`, `router.py`
- Modify: `app/main.py` (incluir `ontology.router.router` y `public_router`), `tests/test_ontology.py`. En esta tarea `public_router = APIRouter(prefix="/public/ontology", tags=["ontology-public"])` se crea vacío y se registra; la Tarea 6 le añade las rutas.

**Interfaces:**
- Consumes: modelos de la Tarea 1; `get_current_user` y `require_superadmin` de `app.core.deps`.
- Produces en schemas:
  - `EquivalenceIn(scheme: SchemeLiteral, external_id: str(1..120), url: HttpUrl, external_label: str | None, match: MatchLiteral)`.
  - `TermProposal(domain: DomainLiteral, parent_id: str | None, label: str(2..120), definition: str(10..2000), aliases: list[str(1..60)] (máx. 10), unit: str(1..30) | None, equivalences: list[EquivalenceIn] (máx. 10))`.
  - `TermEdit`: los mismos campos opcionales, excepto `domain`.
  - `TermSummary(id, hvt_id, domain, parent_id, label, status, unit)`.
  - `TermDetail(TermSummary + definition, aliases, equivalences: list[EquivalenceOut], parent: TermSummary | None, children: list[TermSummary], replaced_by: TermSummary | None, proposed_by_name: str, review_note, reviewed_at, published_in_version, obsoleted_in_version)`. `proposed_by_name` vale «Equipo HarvestT» si `proposed_by` es NULL.
  - `SuggestionOut(scheme, external_id, label, url)`.
- Produces en service:
  - `visible_terms(db, user) -> Select`: publicados y obsoletos; más propios si no es superadmin; todo si lo es.
  - `list_terms(db, user, domain: str | None, q: str | None, status: str | None, mine: bool = False) -> list[OntologyTerm]`: `mine=True` limita a `proposed_by == user.id`; `q` filtra por `label_key` o por alias plegado que contenga `normalize_label(q)`; orden por `domain`, `label_key`.
  - `get_term(db, user, term_id) -> OntologyTerm`: `404 "término"` si no es visible.
  - `term_detail(db, term) -> TermDetail`.
  - `propose(db, user, data) -> OntologyTerm`: valida el padre (mismo dominio y `published`); rechaza duplicados con `409 term_exists` si otro término no rechazado del mismo dominio tiene igual `label_key`; `unit` solo con `domain == "trait"` (si no, 422 en `unit`); audita `"ontology_term"`, `"propose"`.
  - `edit(db, user, term, data) -> OntologyTerm`: solo quien propuso y solo en `proposed` o `in_review` (si no, 403 o 409); `in_review` vuelve a `proposed`; reemplaza las equivalencias si vienen.
  - `suggest(db, q: str, limit: int = 10) -> list[ExternalConcept]`: `label_key` contiene cada palabra de `normalize_label(q)`; `q` menor de 2 caracteres devuelve `[]`.
- Produces en router, con prefijo `/ontology` y `get_current_user`:
  - `GET /terms?domain&q&status&mine`
  - `GET /terms/{id}`
  - `POST /terms` → 201
  - `PATCH /terms/{id}`
  - `GET /suggest?q`

- [ ] **Step 1: Tests.**
  - `test_ontology_requires_login`: 401 sin token.
  - `test_any_member_can_propose`: un `viewer` de `alfa` propone → 201, `status=proposed`, `hvt_id=null`, `proposed_by_name` = su `full_name`.
  - `test_duplicate_label_normalized`: «Fotoperíodo» ya propuesto y «fotoperiodo » en el mismo dominio → 409 `term_exists`; en `environment` → 201.
  - `test_parent_must_be_published_same_domain`: padre propuesto → 422 `parent_id`; padre de otro dominio → 422.
  - `test_unit_only_for_traits`.
  - `test_visibility_of_proposals`: el `editor` de `beta` no ve la propuesta del `viewer` de `alfa` ni en la lista ni en `GET /terms/{id}` (404); el superadmin sí.
  - `test_edit_only_by_proposer_and_returns_to_proposed`: otro usuario → 403; tras `in_review` (fijado en la base), la edición vuelve a `proposed`.
  - `test_suggest_searches_loaded_vocabularies`: con `ExternalConcept(scheme="agrovoc", label="air temperature")`, `GET /suggest?q=Air temp` devuelve ese concepto; `q="a"` → `[]`.
- [ ] **Step 2: Correr y verlos fallar.**
- [ ] **Step 3: Implementar** schemas, service y router. Registrar en `app/main.py`.
- [ ] **Step 4: Pruebas en verde.**
- [ ] **Step 5: Commit.** `feat(ontology): propuestas de términos con visibilidad, duplicados normalizados y sugerencias`

### Task 3: Revisión, publicación, versiones y obsolescencia

**Files:**
- Create: `app/modules/ontology/review.py`
- Modify: `schemas.py`, `router.py`, `tests/test_ontology.py`

**Interfaces:**
- Produces en schemas:
  - `ReviewIn(action: Literal["approve", "request_changes", "reject"], note: str(3..500))`
  - `ObsoleteIn(replaced_by_id: str, note: str(3..500))`
  - `EquivalencesIn(equivalences: list[EquivalenceIn], note: str(3..500))`
  - `ReleaseOut(version, note, created_at, term_count)`
- Produces en `review.py`:
  - `current_version(db, lock: bool = False) -> int`: 0 si no hay versiones.
  - `publish_release(db, actor: User | None, note: str) -> int`: bloquea la última versión con `with_for_update()` y crea `version + 1`.
  - `next_hvt_id(db) -> str`: mayor número existente + 1, formateado `HVT:%06d`. Se llama dentro del mismo bloqueo.
  - `review(db, actor, term, data) -> OntologyTerm`:
    - si el estado no es `proposed` ni `in_review` → `409 already_reviewed`;
    - `approve`: revalida el padre y el duplicado contra los publicados; asigna `hvt_id`; `status=published`; `published_in_version = publish_release(...)`;
    - `request_changes` → `in_review`;
    - `reject` → `rejected`;
    - en todos los casos guarda `reviewed_by`, `reviewed_at` y `review_note`, y audita `"ontology_term"` con la acción.
  - `obsolete(db, actor, term, data)`: el término debe estar `published`; el reemplazo, `published` y distinto; `obsoleted_in_version` sube la versión.
  - `replace_equivalences(db, actor, term, data)`: solo términos `published`; sube la versión.
- Produces en router, todo con `require_superadmin`:
  - `POST /terms/{id}/review`
  - `POST /terms/{id}/obsolete`
  - `PUT /terms/{id}/equivalences`
  - `GET /releases` (con sesión, sin superadmin)
  - `GET /review-queue`: `proposed` e `in_review`, los más antiguos primero.

- [ ] **Step 1: Tests.**
  - `test_review_superadmin_only`: un editor → 403.
  - `test_approve_assigns_id_and_bumps_version`:
    - con la versión 1 existente, aprobar → `hvt_id` con forma `HVT:\d{6}` y `published_in_version == 2`;
    - una segunda aprobación da otro `hvt_id` y la versión 3.
  - `test_review_twice_conflicts`: aprobar dos veces → 409 `already_reviewed`.
  - `test_note_required`: `note=""` → 422.
  - `test_request_changes_then_edit_then_approve`.
  - `test_reject_keeps_reason_visible_to_proposer`.
  - `test_parent_obsoleted_before_approval`: 422 `parent_id`.
  - `test_published_term_is_never_deleted_or_edited`:
    - `PATCH` sobre un publicado → 409;
    - no existe ninguna ruta `DELETE /ontology/terms/{id}` (responde 405).
  - `test_obsolete_requires_published_replacement`: con un reemplazo propuesto o igual a sí mismo → 422; con uno válido → `status=obsolete` y `replaced_by` en el detalle.
  - `test_replace_equivalences_bumps_version`.
- [ ] **Step 2: Correr y verlos fallar.**
- [ ] **Step 3: Implementar `review.py` y las rutas.**
- [ ] **Step 4: Pruebas en verde.**
- [ ] **Step 5: Commit.** `feat(ontology): revisión con razón, publicación con ID permanente, versiones y obsolescencia`

### Task 4: Vocabularios externos verificados y semilla

**Files:**
- Create:
  - `app/modules/ontology/data/external_concepts.json`
  - `app/modules/ontology/data/seed_terms.json`
  - `app/modules/ontology/seed.py`
  - `scripts/ontology/__init__.py`
  - `scripts/ontology/verify_external.py`
- Modify: `scripts/seed.py` (`SEEDS` añade `ontology_seed` después de `catalog_seed`), `tests/test_ontology.py`

**Interfaces:**
- `external_concepts.json`: `[{scheme, external_id, label, url, verified_at, verified_via}]`.
- `seed_terms.json`: `[{seed_key, domain, parent_seed_key | null, label, definition, aliases, unit | null, equivalences: [{scheme, external_id, match}]}]`. La equivalencia toma `url` y `external_label` del concepto externo con el mismo `(scheme, external_id)`, que **debe existir**.
- `seed.seed(db) -> None`, idempotente:
  1. hace *upsert* de conceptos externos por `(scheme, external_id)`;
  2. inserta como `published` los `seed_key` que no existen, en el orden del archivo, con `proposed_by=None` y nota «Vocabulario semilla del equipo»;
  3. si insertó alguno, crea **una** versión nueva («Semilla: N términos») y asigna `hvt_id` en orden;
  4. nunca modifica un término existente.
- `verify_external.py`: por cada concepto consulta la fuente y escribe en stdout `OK`, `FALTA` o `DISTINTO` (etiqueta distinta), terminando con código distinto de 0 si algo no es `OK`. Fuentes:
  - NCBI Taxonomy: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=taxonomy&id=<id>&retmode=json`
  - PO, PECO, ENVO: `https://www.ebi.ac.uk/ols4/api/ontologies/<onto>/terms?obo_id=<id>`
  - AGROVOC: `https://agrovoc.fao.org/browse/rest/v1/agrovoc/label?uri=http://aims.fao.org/aos/agrovoc/<id>&lang=en`
  - SOSA, SSN y GeoSPARQL: la IRI debe aparecer en el documento de la ontología del W3C o del OGC.
  - BBCH: código y página contra la monografía (Meier 2018, doi:10.5073/20180906-074619), verificación manual anotada en `verified_via`.
  - UCUM: el código se valida contra `https://ucum.org/ucum` (verificación manual anotada).
- Contenido de la semilla. Decisión del builder: alrededor de 43 términos, lo que la plataforma ya usa. Sin metas de cantidad.

  | Dominio | Términos (alias de mapeo entre paréntesis) |
  |---|---|
  | `organism` | Asteraceae › *Lactuca* › *Lactuca sativa*; Solanaceae › *Solanum* › *Solanum lycopersicum*; Lamiaceae › *Ocimum* › *Ocimum basilicum*. Los alias de especie son el nombre científico sin autor. Equivalencia `ncbi_taxon` exacta. |
  | `plant` | 10 estadios principales BBCH 0–9 (alias: «germinación», «germination», «desarrollo de hojas», «floración», «flowering», «maduración», …). Órganos: hoja, raíz, tallo, flor, fruto (PO). |
  | `trait` | Temperatura del aire (`air_temperature`, `Cel`), Humedad relativa (`relative_humidity`, `%`), Fotoperiodo (`photoperiod`, `h`), pH (`ph`, `[pH]`). AGROVOC donde se verifique. |
  | `environment` | Sistema de cultivo › Hidroponía (`hydroponic`), Sustrato (`substrate`), Suelo (`soil`), Aeroponía (`aeroponic`). `other` no se mapea. |
  | `place` | Región; Zona climática (Köppen). Equivalencias solo si se verifican. |
  | `node` | Nodo › Invernadero, Cultivador, Germinador; Dispositivo; Sensor (`sosa:Sensor`); Lectura (`sosa:Observation`); Firma. |

  Las definiciones son de una o dos frases, propias y en español; no se copian definiciones de estándares con licencia incompatible.

- [ ] **Step 1: Llenar los dos JSON y correr `~/.venvs/harvestt/bin/python -m scripts.ontology.verify_external`.** Quitar de ambos archivos todo concepto que no salga `OK` y anotar en el commit cuáles se quitaron. El script necesita red; pytest no.
- [ ] **Step 2: Tests.**
  - `test_seed_files_are_consistent`:
    - cada `parent_seed_key` existe antes en el archivo y en el mismo dominio;
    - cada equivalencia existe en `external_concepts.json`;
    - `seed_key` y `(domain, normalize_label(label))` son únicos;
    - `unit` aparece solo en `trait`;
    - todo `scheme` está en `SCHEMES`.
  - `test_seed_is_idempotent`: dos corridas → mismo número de términos, una sola versión (1) y `hvt_id` de `HVT:000001` a `HVT:0000NN` sin huecos.
  - `test_seed_adds_new_terms_in_new_version`: con un término extra (archivo parcheado con `monkeypatch`) → versión 2; los anteriores conservan su `hvt_id`.
- [ ] **Step 3: Implementar `seed.py` y registrarlo en `scripts/seed.py`.**
- [ ] **Step 4: Pruebas en verde.**
- [ ] **Step 5: Commit.** `feat(ontology): vocabulario semilla con equivalencias verificadas`

### Task 5: Puente con los datos existentes y uso de un término

**Files:**
- Create: `app/modules/term_links/__init__.py`, `service.py`, `router.py`, `tests/test_term_links.py`
- Modify:
  - `app/modules/projects/service.py`: `create_project`, `update_project` y `create_crop_cycle` llaman a `resolve`;
  - `scripts/seed.py`: `term_links_seed` va al final de `SEEDS`;
  - `app/main.py`.

**Interfaces:**
- Produces en `term_links/service.py`:
  - `resolve(db, domain: str, raw: str | None) -> str | None`:
    - devuelve el `id` del término `published` del `domain` cuyo `label_key` o algún alias normalizado sea igual a `normalize_label(raw)`;
    - con `raw` vacío, `"unknown"`, `"other"` o sin coincidencia → `None`.
    - Igualdad exacta tras normalizar; nunca coincidencia parcial.
  - `FIELD_MAP`, con `(modelo, columna_texto, columna_term, dominio)`:
    - `TraitAssertion.variable` → `trait`
    - `TraitAssertion.growth_stage` → `plant`
    - `TraitAssertion.cultivation_system` → `environment`
    - `CropCycle.stage` → `plant`
    - `Project.system` → `environment`
    - `Species.scientific_name` → `organism`, quitando antes `authorship` del final si está presente
  - `relink(db) -> dict[str, int]`: solo llena `*_term_id` que estén en NULL; devuelve el conteo enlazado por campo. Sus llamadas: `seed(db)` (que hace `relink` y registra en el log) y las rutas de escritura.
  - `term_usage(db, ctx, term_id) -> TermUsage(species: int, assertions: int, projects: int, cycles: int)`:
    - especies y afirmaciones son globales;
    - proyectos y ciclos solo de `ctx.organization_id`;
    - se excluyen los borrados lógicos.
- Produces en router: `GET /ontology/terms/{id}/usage` (`get_context`) → `TermUsage`.

- [ ] **Step 1: Tests.**
  - `test_resolve_exact_after_normalizing`: los cinco valores de Review Focus 4, más `"Hydroponic"` → término Hidroponía.
  - `test_relink_fills_only_nulls_and_keeps_text`:
    - afirmaciones sembradas → `variable_term_id` enlazado y `variable` intacto;
    - una afirmación con `variable_term_id` ya fijado a otro término no cambia;
    - una segunda corrida devuelve todos los conteos en 0.
  - `test_species_linked_without_authorship`: «Lactuca sativa L.» → término *Lactuca sativa*.
  - `test_new_project_and_cycle_get_term`: `POST` de un proyecto `system="soil"` → `system_term_id` de Suelo; un ciclo `stage="floración"` → término BBCH 6; `stage="mi etapa"` → NULL.
  - `test_usage_counts_only_own_org`: un proyecto de `beta` no cuenta para `alfa`.
- [ ] **Step 2: Correr y verlos fallar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Pruebas en verde.**
- [ ] **Step 5: Commit.** `feat(ontology): términos enlazados a especies, afirmaciones, proyectos y ciclos sin inventar correspondencias`

### Task 6: Exportación OWL (Turtle) y JSON, y resolución pública por ID

**Files:**
- Create: `app/modules/ontology/export.py`
- Modify: `router.py` (`public_router`, prefijo `/public/ontology`, sin sesión), `app/core/config.py` (`ontology_base_iri`), `.env.example`, `tests/test_ontology.py`

**Interfaces:**
- `export_terms(db) -> tuple[int, list[OntologyTerm]]`: versión vigente y términos `published` u `obsolete`, ordenados por `hvt_id`.
- `iri(hvt_id) -> str`: `settings.ontology_base_iri + hvt_id.replace(":", "_")`.
- `to_turtle(version, terms, base_iri) -> str`:
  - prefijos `owl`, `rdfs`, `skos`, `dcterms`, `xsd`;
  - cabecera `<base_iri> a owl:Ontology ; owl:versionInfo "N" ; dcterms:license <https://creativecommons.org/licenses/by/4.0/> ; dcterms:title "Ontología HarvestT"@es`;
  - por término:
    - `a owl:Class`;
    - `rdfs:label "…"@es`;
    - `skos:definition "…"@es`;
    - `skos:notation "HVT:000001"`;
    - `rdfs:subClassOf <padre>`;
    - `skos:<match>Match <url>` por cada equivalencia;
    - `dcterms:creator "<nombre>"`;
    - si es obsoleto, `owl:deprecated true` y `dcterms:isReplacedBy <iri>`.
  - Literales escapados: `\\`, `"`, `\n`, `\r`.
- `to_json(version, terms) -> dict`: `{"version", "license", "base_iri", "terms": [{hvt_id, iri, domain, parent, label, definition, aliases, unit, status, replaced_by, creator, equivalences}]}`.
- Rutas:
  - `GET /public/ontology/export.ttl`: `text/turtle; charset=utf-8`, con `Content-Disposition: attachment; filename="harvestt-ontologia-v<N>.ttl"`.
  - `GET /public/ontology/export.json`.
  - `GET /public/ontology/terms/{hvt_id}`: acepta `HVT:000001` o `HVT_000001`. Si es propuesto, rechazado o no existe → 404.

- [ ] **Step 1: Tests.**
  - `test_export_turtle_shape`: contiene `owl:versionInfo "1"`, la licencia, `skos:notation "HVT:000001"` y un `skos:exactMatch`. Un término propuesto **no** aparece.
  - `test_turtle_escapes_literals`: una definición con `"` y salto de línea sale escapada.
  - `test_export_json_includes_obsolete_with_replacement`.
  - `test_public_term_resolution`: `HVT_000001` → 200; el ID de un rechazado → 404; sin sesión.
- [ ] **Step 2: Correr y verlos fallar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Pruebas en verde.**
- [ ] **Step 5: Commit.** `feat(ontology): exportación OWL Turtle y JSON con licencia CC-BY 4.0`

### Task 7: Términos en el grafo de V6

**Files:**
- Modify:
  - Backend: `app/modules/graph/models.py`, `schemas.py`, `service.py`, `tests/test_graph.py`.
  - Frontend: `frontend/src/features/graph/api.ts`, `model.ts`, `palette.ts`, `graph.test.tsx` y `model.test.ts`/`palette.test.ts`.

**Interfaces:**
- `NODE_TERM = "term"`, añadido a `NODE_TYPES` y a `GLOBAL_NODE_TYPES`. `NodeType` (Python y TS) incluye `"term"`.
- Id de nodo: `term:HVT:000001`. Etiqueta: `label`. `meta = {"hvt_id", "domain", "status"}`. `origin = None`.
- Relaciones implícitas nuevas, que nunca se guardan:
  - `REL_SUBCLASS_OF = "subclass_of"`: término → padre;
  - `REL_CLASSIFIED_AS = "classified_as"`: especie, rasgo, proyecto o ciclo → término, por la columna `*_term_id`; procedencia `{"kind": "fk", "field": "<tabla>.<columna>"}`;
  - `REL_REPLACED_BY = "replaced_by"`.
- Al rasgo `trait:<variable>` se le une el término de `variable_term_id` de cualquiera de sus afirmaciones.
- Solo entran términos `published` y `obsolete`.
- `_node_exists` resuelve `term` por `hvt_id`, para que `create_edge` no falle con `KeyError`.
- Frontend:
  - `TYPE_META.term = { label: 'Término', plural: 'Términos' }`;
  - `RELATION_LABELS`: `subclass_of` → `['Subclase de', 'Término más específico']`; `classified_as` → `['Clasificado como', 'Datos clasificados']`; `replaced_by` → `['Reemplazado por', 'Reemplaza a']`;
  - color de `term` en ambos temas, distinto de los siete existentes;
  - `nodeLink` de un término lleva a `/app/ontologia?term=<hvt_id>`.

- [ ] **Step 1: Tests.**
  - Backend:
    - `test_terms_join_graph`: con la semilla, el grafo de `alfa` incluye `term:HVT:…` de Temperatura del aire, con la arista `trait:air_temperature —classified_as→ term`;
    - `test_proposed_terms_absent_from_graph`;
    - `test_project_classified_only_in_own_tenant`: el proyecto de `beta` no aparece en el grafo de `alfa`, aunque comparta término.
  - Frontend:
    - la paleta tiene `term` en claro y oscuro;
    - `relationLabel('subclass_of', true) === 'Subclase de'`;
    - `nodeLink` de un término apunta a `/app/ontologia?term=HVT:000001`.
- [ ] **Step 2: Correr y verlos fallar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `make test` en verde.** Las pruebas existentes de truncado a 300 siguen pasando.
- [ ] **Step 5: Commit.** `feat(graph): los términos de la ontología como nodos con subclase y clasificación`

### Task 8: Página `/app/ontologia`: árbol, buscador y ficha

**Files:**
- Create en `frontend/src/features/ontology/`:
  - `api.ts`, `labels.ts`, `tree.ts`, `tree.test.ts`;
  - `OntologyPage.tsx`, `TermTree.tsx`, `TermCard.tsx`, `TermNeighbors.tsx`;
  - `ontology.test.tsx`.
- Modify: `frontend/src/App.tsx` (ruta `ontologia`), `components/Sidebar.tsx` (ítem «Ontología» después de «Grafo»), `components/icons.tsx` (icono `tree`).

**Interfaces:**
- `api.ts`: tipos que espejan `TermSummary`, `TermDetail`, `EquivalenceOut`, `SuggestionOut`, `TermUsage` y `ReleaseOut`. `ontologyApi`:
  - `list(params)`, `get(id)`, `usage(id)`, `releases()`;
  - `propose(input)`, `edit(id, input)`, `suggest(q)`;
  - `reviewQueue()`, `review(id, body)`, `obsolete(id, body)`.
- `labels.ts`: `DOMAIN_LABELS`, `STATUS_LABELS`, `MATCH_LABELS` (`exact` «Exacta», `close` «Cercana», `broad` «Amplia») y `SCHEME_LABELS`.
- `tree.ts`: `buildTree(terms: TermSummary[]) -> Record<Domain, TreeNode[]>`, con `TreeNode = TermSummary & { children: TreeNode[] }`. Ordena por etiqueta con `localeCompare('es')`. Un término cuyo padre no está en la lista queda como raíz.
- `OntologyPage`:
  - pestañas por dominio, buscador con *debounce* de 250 ms sobre `list({q})` y versión vigente («Versión N») en la cabecera;
  - enlaces «Exportar Turtle» y «Exportar JSON» a `/api/v1/public/ontology/export.*`;
  - el parámetro `?term=<hvt_id>` abre esa ficha.
  - Ficha del término:
    - `hvt_id` (o «Sin ID: propuesta») y estado;
    - definición y alias;
    - tabla de equivalencias con el enlace externo;
    - uso: «Usado en: N especies · N afirmaciones · N proyectos · N ciclos»; con todo en 0, «Aún sin datos enlazados»;
    - «Propuesto por …» y la razón de la revisión;
    - si es obsoleto, el aviso «Obsoleto · reemplazado por <enlace>»;
    - `TermNeighbors`;
    - el enlace «Ver en el grafo» (`/app/graph?focus=term:<hvt_id>`).
- `TermNeighbors`: SVG estático sin d3:
  - el término al centro;
  - el padre arriba;
  - hasta 8 hijos abajo, con «+N» si hay más;
  - las equivalencias a la derecha.
  - Usa los colores de los tokens del tema.

- [ ] **Step 1: Tests.**
  - `tree.test.ts`: jerarquía, orden con acentos («Ácido» antes de «Bano») y huérfano como raíz.
  - `ontology.test.tsx`, con `vi.spyOn(ontologyApi, …)`:
    - muestra el árbol del dominio activo;
    - buscar «foto» llama a `list` con `q='foto'`;
    - la ficha muestra «HVT:000001», «Exacta», «Propuesto por Equipo HarvestT» y los conteos de uso;
    - un obsoleto muestra «reemplazado por»;
    - `?term=HVT:000003` abre esa ficha.
- [ ] **Step 2: Correr y verlos fallar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `make test` en verde.**
- [ ] **Step 5: Commit.** `feat(ontology): página de ontología con árbol por dominio, buscador y ficha de término`

### Task 9: Proponer término, «Mis propuestas» y bandeja de revisión

**Files:**
- Create en `frontend/src/features/ontology/`: `ProposeTermDialog.tsx`, `MyProposals.tsx`, `ReviewQueue.tsx`
- Modify: `OntologyPage.tsx` (pestañas «Explorar», «Mis propuestas» y, solo superadmin, «Revisión»), `ontology.test.tsx`

**Interfaces:**
- `ProposeTermDialog({ initialDomain, parent?, term? (edición), onDone })`. Usa `Dialog` de `features/catalog/Dialog.tsx` y `Field`/`Input`/`Textarea`/`Select` de `components/ui`.
  - Campos: dominio, padre (solo publicados del dominio), etiqueta, definición, alias (separados por coma), unidad (solo `trait`) y equivalencias.
  - «Sugerencias de Cortex»: llama a `suggest(etiqueta)` con *debounce* de 300 ms; cada sugerencia se agrega con un tipo de correspondencia elegido (por defecto `close`).
  - Aviso fijo de crédito (Global Constraints).
  - Errores del servidor: 409 `term_exists` → «Ya existe un término con esa etiqueta en este dominio»; 422 → el mensaje junto al campo `field`.
- `MyProposals`: lista de `list({ mine: true })`, con estado y razón. Las que están `in_review` tienen «Editar», que abre el diálogo en modo edición.
- `ReviewQueue`:
  - tarjetas de `reviewQueue()` con la propuesta completa;
  - botones «Aprobar», «Pedir cambios» y «Rechazar», con nota obligatoria (el botón está deshabilitado con menos de 3 caracteres);
  - en cada término publicado de la ficha, acción «Marcar obsoleto» (superadmin) con selector de reemplazo y nota.

- [ ] **Step 1: Tests.**
  - `proponer envía la propuesta y muestra el aviso de crédito`.
  - `una sugerencia se agrega como equivalencia cercana`.
  - `409 muestra el mensaje de duplicado`.
  - `la pestaña Revisión no aparece sin superadmin`.
  - `aprobar exige nota y llama a review con action approve`.
  - `pedir cambios deja la propuesta editable en Mis propuestas`.
- [ ] **Step 2: Correr y verlos fallar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `make test` en verde.**
- [ ] **Step 5: Commit.** `feat(ontology): proponer términos con sugerencias, mis propuestas y bandeja de revisión`

### Task 10: Visión, documentación y puerta de la fase

**Files:**
- Modify:
  - `app/modules/vision/service.py`: la capa `knowledge`;
  - `tests/test_vision.py`;
  - `README.md`, `docs/STATUS.md`, `docs/ARQUITECTURA.md`, `docs/INTEGRIDAD_CIENTIFICA.md`, `CHANGELOG.md`.

**Interfaces:**
- La capa `knowledge` sigue `in_construction`. Su `reason` se calcula:
  - con versión ≥ 1: `"Ontología publicada (versión N, M términos). Bancos de plantas y mapa GIS: hitos M3–M4."`;
  - sin versión: el texto actual.
  - `vision` importa `ontology.review.current_version`; la dirección producto → ontología está permitida.

- [ ] **Step 1: Test** `test_knowledge_layer_reports_ontology_version` (con y sin semilla). Verlo fallar, implementarlo y verlo pasar.
- [ ] **Step 2: Documentos.**
  - README: fila «Ontología».
  - STATUS: fase M2 y matriz.
    - Términos de la semilla: **Real**, equipo.
    - Propuestas: **Real**.
    - Enlaces a datos existentes: **Real**; sin correspondencia, «Desconocido».
    - Rol de curador: **Pendiente**.
  - ARQUITECTURA: módulos `ontology` (separable) y `term_links`, migración `0009`, rutas.
  - INTEGRIDAD:
    - nunca se inventan correspondencias ni identificadores externos;
    - verificación con `verify_external`;
    - un término publicado no se borra;
    - el ID es permanente y la base de las IRI no lo es;
    - crédito del proponente;
    - licencia CC-BY 4.0.
  - CHANGELOG.
- [ ] **Step 3: Suite completa.** `make test` y `cd frontend && npm run build` en verde.
- [ ] **Step 4: Migraciones en Postgres 17**, sin diferencias:

```bash
alembic upgrade head && alembic check && alembic downgrade 0008 && alembic upgrade head && alembic check
```

- [ ] **Step 5: Smoke**, con uvicorn o con el contenedor si hay Docker, contra Postgres local tras `python -m scripts.seed`:
  - `/api/v1/health/ready` → `ok`;
  - `/api/v1/public/ontology/export.ttl` → 200 con `owl:versionInfo`;
  - el log del seed reporta los conteos de `relink`;
  - `/app/ontologia` sirve el SPA.
- [ ] **Step 6: Revisión visual** de `/app/ontologia` (las tres pestañas) y del grafo con términos, en claro, oscuro y 375 px.
- [ ] **Step 7: Commit.** `docs: M2 Ontología en README, estado, arquitectura e integridad`
- [ ] **Step 8: Pedir al fundador autorización** para merge a `main` y despliegue. Tras desplegar:
  - verificar `/api/v1/public/ontology/export.json` en producción;
  - verificar que las 12 afirmaciones de producción quedaron con `variable_term_id`, consultando `/api/v1/graph?focus_type=term&focus_id=HVT:000001`.

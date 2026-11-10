# M3 · Bancos de datos de plantas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** conectores de solo lectura a GBIF, World Flora Online, Wikidata/Commons y Genesys, con copia local y procedencia. Una sección «Bancos de plantas y distribución» en la ficha de especie, el panel `/app/fuentes` para superadmin y la acción «Usar en mi ciclo».

**Architecture:**
- Módulo nuevo `app/modules/connectors`, del lado del producto (puede importar catálogo y proyectos):
  - contrato común `Connector` con registro estático de fuentes;
  - motor de sincronización que guarda **una copia por fuente y especie** (`connector_snapshots`) y una bitácora de corridas (`connector_syncs`), migración `0010`;
  - cliente HTTP mínimo con `urllib` (sin dependencias nuevas) y un *fetcher* inyectable para las pruebas.
- Lo importado vive **solo** en `connector_snapshots`. Nunca escribe en `species`, `cultivars` ni `trait_assertions`.
- La ficha lee la copia local: funciona aunque la fuente no responda.
- Sincronización: botón del superadmin (`POST /connectors/{key}/sync`) y un comando `python -m scripts.connectors.sync` para un cron de Railway. Sin workers nuevos: el catálogo tiene 3 especies y cada corrida tarda segundos.
- Frontend:
  - feature `features/connectors` con la sección de la ficha (chips de identidad, mini-mapa SVG de México con presencia GBIF y los sitios de la Visión encima, accesiones);
  - página `/app/fuentes`.

**Tech Stack:** FastAPI · SQLAlchemy 2 · Alembic · pytest · React 18 · TypeScript · Vitest. **Sin dependencias nuevas.** El mini-mapa es SVG con el contorno de México de Natural Earth (dominio público) recortado por un script. MapLibre queda para M4.

**Spec:** `docs/superpowers/specs/2026-11-07-hito-moonshot-design.md` §2 (anti-metas), §3, §7, §10ter (1 y 2), §11 y §12. El mockup `bancos.html` no está en el repositorio; manda el texto de §7.

## Estado de ejecución

Rama `feat/hito-m3-bancos`. Se actualiza y se sube al cerrar cada tarea.

| Tarea | Estado | Commits |
|---|---|---|
| 1 · Modelos, registro y migración 0010 | Completa (revisada) | `57f9338` |
| 2 · Motor de sincronización | Pendiente | |
| 3 · Conector GBIF | Pendiente | |
| 4 · Conectores WFO y Wikidata/Commons | Pendiente | |
| 5 · Genesys y «Usar en mi ciclo» (API) | Pendiente | |
| 6 · API de ficha y panel, comando de sync | Pendiente | |
| 7 · Página `/app/fuentes` | Pendiente | |
| 8 · Sección de la ficha | Pendiente | |
| 9 · Visión, docs y puerta | Pendiente | |

## Lo verificado contra las fuentes reales (2026-11-10)

Estos hechos se comprobaron con la red y deciden el diseño. Las respuestas reales se graban como *fixtures* en la Tarea correspondiente; **ninguna forma de respuesta se inventa**.

- **GBIF**:
  - `GET https://api.gbif.org/v1/occurrence/search` acepta `taxonKey`, `country=MX`, `hasCoordinate=true`, `hasGeospatialIssue=false`, `license` repetible, `limit` (máx. 300), `offset` y `facet=country`.
  - Sin filtro de licencia, el tomate tiene 59 549 ocurrencias con coordenadas; 25 895 de ellas son `CC_BY_NC_4_0`.
  - Con `license=CC0_1_0&license=CC_BY_4_0`, en México quedan 1 106 de tomate.
  - Los `usageKey` de las 3 especies ya están en `species.external_ids.gbif.id`.
- **WFO**:
  - `list.worldfloraonline.org` sirve una cadena TLS incompleta y `urllib` la rechaza.
  - Se usa la **WFO Plant List publicada por WFO en ChecklistBank**: dataset `2004` («World Flora Online Plant List 2026-06», licencia CC0).
    - `GET https://api.checklistbank.org/dataset/2004/match/nameusage?q=<nombre sin autor>&authorship=<autor>` devuelve `type: "exact"`, `usage.id` = `wfo-…` y `usage.status`.
    - `GET …/dataset/2004/taxon/<wfo-id>/synonyms` devuelve `homotypic` y `heterotypic`.
  - IDs verificados:
    - *Lactuca sativa* `wfo-0000128816`;
    - *Solanum lycopersicum* `wfo-0001029216`;
    - *Ocimum basilicum* `wfo-0000253230`.
- **Wikidata**:
  - `GET https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=haswbstatement:P846=<gbif>&format=json` encuentra el ítem por el ID de GBIF (lechuga → `Q83193`).
  - `action=wbgetentities&ids=<Q>&props=labels|aliases|claims&languages=es|en` da:
    - etiquetas y alias;
    - P685 (NCBI), P7715 (WFO), P961 (IPNI);
    - P18 (imagen) y P1843 (nombre común).
  - Wikidata es CC0.
- **Commons**: `GET https://commons.wikimedia.org/w/api.php?action=query&titles=File:<archivo>&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=800&format=json` da `thumburl`, `descriptionurl` y, en `extmetadata`, `LicenseShortName`, `LicenseUrl`, `Artist` (HTML) y `AttributionRequired`.
- **Genesys**:
  - **Toda la API exige credenciales.** Sin token responde 401. El token se pide a `helpdesk@genesys-pgr.org`.
  - Su documentación v2 describe `POST https://api.genesys-pgr.org/api/v2/acn/filter?p=<página>&l=<≤1000>`, cuya respuesta es paginada (`content`, `totalElements`). Cada `AccessionDTO` trae `instituteCode`, `accessionNumber`, `doi`, `origCty`, `sampStat` y `taxonomy.{genus,species}`.
  - **El cuerpo del filtro por género o especie no está documentado.**
  - Sus términos permiten usar los datos, pero **prohíben redistribuirlos** y exigen citar la fuente.

## Global Constraints

- Rama `feat/hito-m3-bancos` desde `main`. Merge y despliegue **solo con autorización explícita del fundador**.
- **Solo lectura hacia las fuentes.** Ningún conector hace POST, salvo el `acn/filter` de Genesys, que es una consulta.
- **Lo importado nunca sobrescribe lo capturado por el equipo.** Una sincronización no modifica ninguna fila de `species`, `cultivars`, `trait_assertions` ni `species_media`. Una prueba compara las filas antes y después. La ficha muestra lo del equipo y lo importado lado a lado, y lo importado lleva origen `sourced`.
- **Sin coincidencias aproximadas.**
  - Un conector solo guarda datos si la identidad casa sin ambigüedad: GBIF por `usageKey`, WFO con `type == "exact"` y `status == "accepted"`, Wikidata con exactamente 1 ítem con ese P846.
  - Cualquier otro caso guarda `status = "not_found"` con el motivo y sin datos.
- **Copia local:**
  - Una sincronización exitosa reemplaza la copia (`payload`, `fetched_at`).
  - Una fallida conserva la copia anterior y registra `last_attempt_at` y `last_error`.
  - La ficha muestra entonces «Fuente no disponible · última copia del <fecha>». Si nunca hubo copia: «Sin datos de esta fuente todavía».
- **Licencias:**
  - GBIF: solo registros `CC0_1_0` y `CC_BY_4_0`; los `CC_BY_NC_4_0` se excluyen y se informa cuántos.
  - Commons: solo imágenes con `LicenseShortName` en la lista blanca: `CC0`, `Public domain`, `CC BY` y `CC BY-SA` con cualquier versión. Se enlazan (*hotlink* del `thumburl`) con autor y licencia visibles; **nunca se descargan** (regla vigente de `species_media`).
  - Genesys: no se guardan accesiones. La copia local guarda solo **conteos** por país de origen y estado biológico. La lista de accesiones se consulta en vivo y enlaza a Genesys. Un ciclo guarda solo los identificadores de la accesión (código de instituto, número, DOI).
  - Toda copia lleva `license`, `attribution` y `source_url`.
- **Estados de conector y etiquetas:**

  | Código | Etiqueta |
  |---|---|
  | `active` | Activo |
  | `requires_credentials` | Requiere credenciales |
  | `in_construction` | En construcción |
  | `requires_alliance` | Requiere alianza |

- **Registro de fuentes** (`key`, etiqueta, aporte, licencia, estado):

  | key | Etiqueta | Aporte | Licencia | Estado |
  |---|---|---|---|---|
  | `gbif` | GBIF | Presencia georreferenciada | CC0 1.0 / CC BY 4.0 por registro | `active` |
  | `wfo` | World Flora Online | Nombre aceptado y sinónimos | CC0 1.0 | `active` |
  | `wikidata` | Wikidata / Wikimedia Commons | Nombres comunes, identificadores cruzados, imágenes | CC0 1.0; imágenes con su licencia | `active` |
  | `genesys` | Genesys | Accesiones de germoplasma | Términos de uso de Genesys (sin redistribución) | `active` si existe `GENESYS_API_TOKEN`; si no, `requires_credentials` |
  | `grin` | USDA GRIN | Accesiones y evaluaciones | Dominio público (EE. UU.) | `in_construction` |
  | `cimmyt` | CIMMYT | Germoplasma mexicano | Por convenio | `requires_alliance` |
  | `inifap` | INIFAP / CNRG | Germoplasma mexicano | Por convenio | `requires_alliance` |

  Solo `gbif`, `wfo`, `wikidata` y `genesys` tienen conector. Las demás son filas informativas que no se pueden sincronizar (409 `connector_unavailable`).
- **Ritmo con las fuentes:**
  - Pausa mínima entre solicitudes: GBIF 0.25 s, ChecklistBank 0.5 s, Wikidata y Commons 1 s, Genesys 1 s.
  - `User-Agent: HarvestT-connectors/1.0 (+https://harvestt-production.up.railway.app)` y `TIMEOUT = 30` s.
  - **Enfriamiento:** no se sincroniza la misma fuente dos veces en 10 min (429 `sync_cooldown`).
  - Una corrida `running` de esa fuente → 409 `sync_running`. Una corrida `running` de más de 30 min se considera abandonada.
  - Tope de 50 especies por corrida (más → corrida `partial`).
- Sincronizar: **solo superadmin**. Leer la sección de bancos: cualquier miembro autenticado. Vincular accesión a ciclo: `editor` o superior de la organización del proyecto.
- Ningún secreto en logs ni en respuestas. `GENESYS_API_TOKEN` se lee de env y va a `.env.example` vacío.
- Español; «Salvia cristal»; claro, oscuro y 375 px sin desbordes.
- Verde antes de cada commit: `make test` (pytest + `tsc -b` + vitest). Al cierre también:
  - `npm run build`;
  - ciclo `upgrade → check → downgrade 0009 → upgrade → check` en Postgres 17;
  - *smoke test* del contenedor si Docker está disponible.
- **Pruebas sin red.** Todos los tests usan *fetchers* falsos con *fixtures* JSON grabados de respuestas reales en `tests/fixtures/connectors/`. Ningún test toca internet.

## Review Focus

1. **Fuente caída a mitad de corrida.** GBIF responde la página 1 y falla en la 3. Se espera:
   - la copia previa intacta;
   - `last_error` registrado;
   - la corrida `partial` o `error`, nunca una copia nueva con datos a medias.

   Prueba en Tarea 2 (`test_failed_fetch_keeps_previous_copy`) y en Tarea 3 (`test_gbif_page_failure_does_not_store_partial_cells`).
2. **Especie sin `external_ids.gbif`, o con nombre sin coincidencia exacta en WFO o Wikidata.** Se espera `not_found` con motivo visible («Sin coincidencia exacta en World Flora Online») y nunca la «mejor» coincidencia.

   Pruebas en Tareas 3 y 4 (`test_gbif_without_usage_key_is_not_found`, `test_wfo_fuzzy_match_is_not_found`, `test_wikidata_two_items_is_ambiguous`).
3. **Identidades cruzadas que no coinciden.** El P7715 de Wikidata difiere del WFO casado, o su P846 difiere del GBIF del catálogo. La ficha marca «No coinciden» en el chip, no elige una.

   Prueba en Tarea 6 (`test_identity_checks_flag_mismatch`) y en Tarea 8 (vitest del chip).
4. **Imagen de Commons con licencia no permitida o sin autor.** Se omite. El `Artist` con HTML se muestra como texto plano, sin inyectar HTML.

   Prueba en Tarea 4 (`test_commons_rejects_nc_and_strips_html`) y en Tarea 8 (vitest: el autor `<a>…</a>` se renderiza como texto).
5. **«Usar en mi ciclo» cruzando organizaciones o especies.** Vincular a un ciclo de otra organización → 404. Vincular a un ciclo de otra especie → 422 `species_mismatch`. Un `viewer` → 403.

   Prueba en Tarea 5 (`test_link_accession_rules`).

---

### Task 1: Modelos, registro y migración 0010

**Files:**
- Create: `app/modules/connectors/__init__.py`, `app/modules/connectors/models.py`, `app/modules/connectors/registry.py`, `alembic/versions/0010_connectors.py`
- Modify: `app/models_registry.py`, `app/modules/projects/models.py` (columna `accession_ref`), `app/core/config.py` (`genesys_api_token`), `.env.example`
- Test: `tests/test_connectors.py`

**Interfaces:**
- Produces:
  - `ConnectorSnapshot` (tabla `connector_snapshots`), con columnas:
    - `id`, `source: str(20)`, `species_id: FK species.id`, `status: str(20)` (`ok` | `not_found`), `external_id: str(100) | None`, `payload: JSON`, `license: str(200) | None`, `attribution: str(500) | None`, `source_url: str(500) | None`;
    - `fetched_at: datetime | None` (última copia buena), `last_attempt_at: datetime`, `last_error: str(500) | None`, más `AuditMixin`;
    - `UniqueConstraint("source", "species_id", name="uq_connector_snapshot")`.
  - `ConnectorSync` (tabla `connector_syncs`), con columnas `id`, `source`, `status` (`running` | `ok` | `partial` | `error`), `started_at`, `finished_at | None`, `species_total: int`, `species_ok: int`, `error: str(500) | None`, `actor_id: FK users.id | None` e índice `(source, started_at)`.
  - `CropCycle.accession_ref: JSON | None`, con la forma `{"source": "genesys", "institute_code": str, "accession_number": str, "doi": str | None, "url": str, "linked_at": iso}`.
  - `registry.py`:
    - `SourceInfo` (dataclass congelada: `key`, `label`, `contribution`, `license`, `url`, `base_status`);
    - `SOURCES: tuple[SourceInfo, ...]` con las 7 filas de Global Constraints, en ese orden;
    - `source_status(key) -> str`, que aplica la regla de `GENESYS_API_TOKEN`;
    - `get_source(key) -> SourceInfo` (KeyError si no existe).
  - `settings.genesys_api_token: str` (env `GENESYS_API_TOKEN`, por defecto `""`).

- [ ] **Step 1: Pruebas que fallan**
  - `test_registry_order_and_statuses`: las keys en orden `["gbif","wfo","wikidata","genesys","grin","cimmyt","inifap"]`; `source_status("genesys") == "requires_credentials"` sin token y `"active"` con `monkeypatch.setattr(settings, "genesys_api_token", "x")`.
  - `test_snapshot_unique_per_source_species`: dos `ConnectorSnapshot` con mismo `source` y `species_id` → `IntegrityError`.
  - `test_cycle_accession_ref_defaults_null`.
- [ ] **Step 2:** `pytest tests/test_connectors.py -v` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** los modelos y el registro. Migración `0010_connectors` (`down_revision = "0009_ontology"`): crea las dos tablas y agrega `crop_cycles.accession_ref` (JSON, nullable). El `downgrade` las quita en orden inverso.
- [ ] **Step 4:** `pytest tests/test_connectors.py -v` → PASS; `make test` en verde.
- [ ] **Step 5: Commit** `feat(connectors): modelos, registro de fuentes y migración 0010`.

### Task 2: Motor de sincronización

**Files:**
- Create: `app/modules/connectors/http.py`, `app/modules/connectors/base.py`, `app/modules/connectors/sync.py`
- Test: `tests/test_connectors.py`

**Interfaces:**
- Consumes: Tarea 1.
- Produces:
  - `http.py`:
    - `class FetchError(Exception)`;
    - `Fetcher = Callable[[str, dict | None], Any]` (url, cuerpo JSON opcional → JSON decodificado);
    - `def make_fetcher(min_interval: float, headers: dict[str, str] | None = None) -> Fetcher`, con `urllib`, el `User-Agent` y el `TIMEOUT` de Global Constraints. Respeta la pausa mínima entre llamadas del mismo fetcher. HTTP ≠ 2xx, timeout y JSON inválido → `FetchError` con mensaje corto sin cabeceras ni token.
  - `base.py`:
    - `@dataclass class FetchResult: status: Literal["ok","not_found"]; external_id: str | None; payload: dict; license: str | None; attribution: str | None; source_url: str | None; reason: str | None = None`;
    - `class Connector(Protocol): key: str; def fetch(self, species: Species, fetch: Fetcher) -> FetchResult`.
    - El conector **lanza** `FetchError` si la fuente falla. Devuelve `not_found` solo si la fuente respondió que no hay coincidencia exacta.
  - `sync.py`:
    - `CONNECTORS: dict[str, Connector]`, que las Tareas 3–5 llenan;
    - `def run_sync(db, key: str, actor: User | None, now: datetime, fetcher_factory: Callable[[str], Fetcher] | None = None) -> ConnectorSync`;
    - `SyncRefused(AppError)`, con códigos `connector_unavailable` (409), `sync_running` (409) y `sync_cooldown` (429).

**Comportamiento de `run_sync`:**
- Rechaza fuentes sin conector o con un estado distinto de `active`.
- Aplica el bloqueo y el enfriamiento de Global Constraints. En Postgres usa además `pg_advisory_xact_lock(7_250_003)` al crear la corrida, como `ontology/locks.py`.
- Recorre las especies no borradas por `scientific_name`, hasta 50. Por especie:
  - con `ok` o `not_found`: hace *upsert* de la copia, y con `ok` fija `fetched_at = now`;
  - con `FetchError`: conserva `payload` y `fetched_at`, y fija `last_attempt_at` y `last_error`;
  - hace commit por especie.
- Estado final:
  - `ok` si todas respondieron;
  - `partial` si alguna falló o se alcanzó el tope;
  - `error` si todas fallaron.

- [ ] **Step 1: Pruebas que fallan** (con un `FakeConnector` registrado en `CONNECTORS` por fixture):
  - `test_sync_stores_copy_with_provenance`;
  - `test_failed_fetch_keeps_previous_copy`: primera corrida ok, segunda con `FetchError` → `payload` y `fetched_at` iguales, `last_error` lleno, corrida `error`;
  - `test_sync_never_touches_catalog_rows`: snapshot de las columnas de `species`, `cultivars`, `trait_assertions` y `species_media` antes y después → iguales;
  - `test_sync_cooldown_and_running`:
    - una segunda corrida a los 5 min → 429;
    - una corrida `running` de hace 10 min → 409;
    - una de hace 31 min → se permite;
  - `test_sync_refuses_informative_and_credentialless_sources`: `grin` → 409; `genesys` sin token → 409;
  - `test_make_fetcher_wraps_http_errors`: con `urllib.request.urlopen` parcheado para lanzar `HTTPError(500)` → `FetchError` y el mensaje no contiene `Authorization`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** PASS; `make test`.
- [ ] **Step 5: Commit** `feat(connectors): motor de sincronización con copia local y enfriamiento`.

### Task 3: Conector GBIF

**Files:**
- Create: `app/modules/connectors/gbif.py`, `tests/fixtures/connectors/gbif/*.json`, `tests/test_connectors_gbif.py`

**Interfaces:**
- Consumes: `FetchResult`, `Fetcher`, `CONNECTORS` (se registra como `"gbif"`).
- Produces: `payload` con la forma:
  ```json
  {"usage_key": "2930137",
   "occurrences_total": 33654, "excluded_nc": 25895,
   "top_countries": [{"country": "ES", "count": 3408}],
   "mexico": {"total": 1106, "sampled": 1106, "cell_deg": 0.5,
              "cells": [{"lat": 19.25, "lon": -99.25, "count": 12}]},
   "licenses": ["CC0_1_0", "CC_BY_4_0"]}
  ```
  - `top_countries` tiene máximo 10.
  - Cada celda se identifica por su centro: `floor(v / 0.5) * 0.5 + 0.25`.
  - `sampled < total` solo si México supera `MEXICO_MAX_RECORDS = 3000`.
  - Constantes: `PAGE = 300`, `MIN_INTERVAL = 0.25`.
  - `license = "CC BY 4.0 (agregado de registros CC0 1.0 y CC BY 4.0)"`.
  - `attribution = "GBIF.org, consultado el <AAAA-MM-DD>. Ocurrencias con coordenadas y licencia CC0 o CC BY."`.
  - `source_url = "https://www.gbif.org/occurrence/search?taxon_key=<k>&country=MX"`.
  - `external_id = usage_key`.

**Cómo se calcula:**
- Con `species.external_ids["gbif"]["id"]` y sin pedir *match*: si falta → `not_found` con razón «La especie no tiene identificador de GBIF en el catálogo».
- `excluded_nc` = total con coordenadas sin filtro de licencia − total con filtro (dos llamadas con `limit=0`).
- `top_countries` sale de `facet=country&facetLimit=10` con filtro de licencia.
- Las celdas de México se calculan paginando `country=MX` con filtro de licencia hasta `total` o el tope.
- Cualquier `FetchError` en cualquier página se propaga: no se guarda nada parcial.

- [ ] **Step 1: Grabar fixtures reales** de tomate (`taxonKey=2930137`) con un script de un solo uso en el scratchpad, no en el repo.
  - Archivos:
    - `count_all.json` (limit=0, sin licencia);
    - `count_licensed_facets.json` (limit=0, licencia, `facet=country&facetLimit=10`);
    - `mx_page_0.json` (limit=300, offset=0, solo con los campos `decimalLatitude`, `decimalLongitude`, `license` de cada resultado, más `count` y `endOfRecords`).
  - Para que la prueba de paginación sea pequeña, se recorta a 2 páginas sintéticas derivadas de `mx_page_0` (`mx_page_0_small.json`, `mx_page_1_small.json`) con `count` coherente.
  - Se documenta en `tests/fixtures/connectors/README.md` qué es real y qué está recortado.
- [ ] **Step 2: Pruebas que fallan:**
  - `test_gbif_aggregates_cells_and_countries`: las celdas suman `sampled`, `excluded_nc` es correcto y el país más frecuente está primero;
  - `test_gbif_sample_when_over_cap`: con el tope en 1 página (`monkeypatch` de `MEXICO_MAX_RECORDS`), `sampled < total`;
  - `test_gbif_page_failure_does_not_store_partial_cells`;
  - `test_gbif_without_usage_key_is_not_found`;
  - `test_gbif_url_filters_licenses`: las URL pedidas contienen `license=CC0_1_0&license=CC_BY_4_0`, `hasCoordinate=true` y `hasGeospatialIssue=false`.
- [ ] **Step 3:** FAIL → implementar → PASS; `make test`.
- [ ] **Step 4: Commit** `feat(connectors): GBIF — presencia en México por celdas y países, solo CC0/CC BY`.

### Task 4: Conectores WFO (ChecklistBank) y Wikidata/Commons

**Files:**
- Create: `app/modules/connectors/wfo.py`, `app/modules/connectors/wikidata.py`, `tests/fixtures/connectors/wfo/*.json`, `tests/fixtures/connectors/wikidata/*.json`, `tests/test_connectors_wfo_wikidata.py`

**Interfaces:**
- Produces:
  - **WFO**: `payload = {"wfo_id", "name", "authorship", "status": "accepted", "synonyms": [{"name", "authorship"}] (máx. 50, orden de la fuente: homotípicos y luego heterotípicos), "release": <título del dataset>}`.
    - Constante `WFO_CLB_DATASET = 2004`; el título se lee de `GET https://api.checklistbank.org/dataset/2004` en cada corrida.
    - `license = "CC0 1.0"`.
    - `attribution = "World Flora Online Plant List (<release>), vía ChecklistBank."`.
    - `source_url = "https://www.worldfloraonline.org/taxon/<wfo_id>"`.
    - `external_id = wfo_id`.
    - El nombre para `q` es `scientific_name` sin el `authorship` final; si existe, `authorship` va en su parámetro.
  - **Wikidata**: `payload = {"qid", "label_es", "common_names": {"es": [...], "en": [...]}, "ids": {"gbif", "ncbi", "wfo", "ipni"}, "images": [{"file", "thumb_url", "page_url", "license", "license_url", "artist"}]}`.
    - `common_names` une, sin duplicados y respetando el orden, la etiqueta, los alias y los P1843 de cada idioma.
    - Cada valor de `ids` es la primera declaración o `null`.
    - `images` tiene máximo 3 y sale de P18.
    - `artist` es **texto plano**: se quitan las etiquetas y se des-escapan las entidades con `html.unescape`.
    - `license = "CC0 1.0 (datos); imágenes con licencia propia"`.
    - `source_url = "https://www.wikidata.org/wiki/<qid>"`.
    - `external_id = qid`.
    - La búsqueda es por P846 = `external_ids.gbif.id`: sin GBIF → `not_found`; 0 resultados → `not_found` «Sin ítem de Wikidata con este ID de GBIF»; más de 1 → `not_found` «Varios ítems de Wikidata con este ID de GBIF».
  - **Commons**: lista blanca por regex sobre `LicenseShortName`: `^(CC0( 1\.0)?|Public domain|CC BY( \d\.\d)?|CC BY-SA( \d\.\d)?)$`. Una imagen se omite si no la pasa, si no tiene `thumburl` o si `Artist` queda vacío tras limpiar.
  - Cada conector usa su `MIN_INTERVAL` (WFO 0.5 s; Wikidata y Commons 1 s).

- [ ] **Step 1: Grabar fixtures reales** de lechuga:
  - `wfo/match_lactuca.json`, `wfo/synonyms_wfo-0000128816.json` y `wfo/dataset_2004.json` (recortado a `title`, `license` y `version`);
  - `wikidata/search_P846_7403263.json` y `wikidata/entity_Q83193.json` (recortado a etiquetas y alias `es`/`en` y a las *claims* P846, P685, P7715, P961, P18 y P1843);
  - `wikidata/commons_Iceberg_lettuce_in_SB.json`.
  - Casos sintéticos, marcados en el README de fixtures:
    - `match_fuzzy.json` (`type: "variant"`);
    - `search_two_hits.json`;
    - `commons_nc.json` (`LicenseShortName: "CC BY-NC 2.0"`).
- [ ] **Step 2: Pruebas que fallan:**
  - `test_wfo_exact_accepted_with_synonyms`: `wfo_id == "wfo-0000128816"`, `len(synonyms) <= 50` y el primero tiene `name`;
  - `test_wfo_fuzzy_match_is_not_found`;
  - `test_wikidata_ids_names_and_images`: `qid == "Q83193"`, `ids.ncbi == "4236"`, `ids.wfo == "wfo-0000128816"`, `"lechuga" in common_names["es"]`, y la imagen tiene `license == "CC BY 1.0"` y `artist == "en:User:Geographer"`;
  - `test_wikidata_two_items_is_ambiguous`;
  - `test_commons_rejects_nc_and_strips_html`.
- [ ] **Step 3:** FAIL → implementar → PASS; `make test`.
- [ ] **Step 4: Commit** `feat(connectors): World Flora Online vía ChecklistBank y Wikidata/Commons con licencias`.

### Task 5: Genesys y «Usar en mi ciclo» (API)

**Files:**
- Create: `app/modules/connectors/genesys.py`, `app/modules/connectors/sampstat.py`, `tests/test_connectors_genesys.py`
- Modify: `app/modules/projects/router.py`, `app/modules/projects/service.py`, `app/modules/projects/schemas.py`

**Interfaces:**
- Produces:
  - **`genesys.py`**: conector `"genesys"`. Usa `Authorization: API-Token <GENESYS_API_TOKEN>` (esquema de la documentación vigente), `POST https://api.genesys-pgr.org/api/v2/acn/filter?p=<n>&l=1000`.
    - El cuerpo lo arma **una sola función**, `filter_body(genus: str, species: str) -> dict`, que devuelve `{"taxonomy.genus": [genus], "taxonomy.species": [species]}`. Lleva el comentario `# NO VERIFICADO: la documentación v2 no publica el nombre del filtro taxonómico. Confirmar en la primera corrida con token.`
    - El conector valida que **cada** registro devuelto tenga `taxonomy.genus` y `taxonomy.species` iguales a los pedidos. Si alguno no coincide, lanza `FetchError("El filtro taxonómico de Genesys no se aplicó; revisar filter_body")` y no guarda nada. Así un filtro mal nombrado nunca produce conteos falsos.
    - `payload = {"total", "by_country": [{"country", "count"}], "by_sampstat": [{"code", "count"}], "sampled": int}`. Pagina hasta `totalElements` o 5 000 registros; si se trunca, `sampled < total`. **No guarda accesiones individuales.**
    - `license = "Términos de uso de Genesys"`.
    - `attribution = "Datos consultados en Genesys (https://www.genesys-pgr.org), <AAAA-MM-DD>."`.
    - `source_url = "https://www.genesys-pgr.org/a/overview"`.
  - **`def list_accessions_live(species: Species, fetch: Fetcher, limit: int = 50) -> list[AccessionOut]`**: consulta en vivo, sin guardar. `AccessionOut` = `institute_code`, `accession_number`, `doi | None`, `origin_country | None`, `sampstat | None`, `url`. El `url` es `https://doi.org/<doi>` si hay DOI; si no, `https://www.genesys-pgr.org/a/overview`.
  - **`sampstat.py`**: `SAMPSTAT_LABELS: dict[int, str]` con los códigos MCPD 2.1. El implementador **los verifica** contra la referencia MCPD v2.1 (FAO/Bioversity, 2015) y cita la página en el docstring:
    - 100 Silvestre; 110 Natural; 120 Seminatural/silvestre; 130 Seminatural/sembrado;
    - 200 Maleza;
    - 300 Variedad tradicional o criolla;
    - 400 Material de mejoramiento o investigación; 410 Línea de mejorador; 411 Población sintética; 412 Híbrido; 413 Población base; 414 Línea endogámica; 415 Población segregante; 416 Selección clonal;
    - 420 Material genético; 421 Mutante; 422 Material citogenético; 423 Otro material genético;
    - 500 Cultivar mejorado;
    - 600 OGM;
    - 999 Otro.

    Si un código no está en el diccionario, se muestra el número con «Código MCPD <n>».
  - **Projects:**
    - `GET /projects/crop-cycles?species_id=<id>` (miembro): ciclos no cancelados de la organización activa para esa especie, con `project_name`. Se declara **antes** de `GET /projects/{project_id}` para que FastAPI no lo confunda con un ID.
    - `PUT /projects/{project_id}/crop-cycles/{cycle_id}/accession` (editor), body `AccessionLink`: `source: Literal["genesys"]`, `institute_code` (patrón `^[A-Z]{3}\d{3,4}$`), `accession_number` (1–64), `doi` (opcional, `^10\.\S+/\S+$`). Devuelve `CropCycleOut` con `accession_ref`.
    - `DELETE` de la misma ruta (editor) → 204.
    - Vincular o desvincular registra auditoría con la acción `crop_cycle.accession_linked` o `crop_cycle.accession_unlinked`, como el resto de proyectos.
    - Reglas: un ciclo de otra organización → 404; un ciclo cuya especie no es la del `species_id` → 422 `species_mismatch`; un `viewer` → 403.

    El ciclo **no** consulta Genesys al vincular: el vínculo guarda solo identificadores, y la ficha del ciclo enlaza a la fuente.

- [ ] **Step 1: Pruebas que fallan** (fixtures sintéticas construidas con los campos documentados del `AccessionDTO`, marcadas como sintéticas en el README):
  - `test_genesys_aggregates_without_storing_accessions`;
  - `test_genesys_wrong_filter_raises` (un registro de otro género → `FetchError` y sin copia);
  - `test_genesys_requires_token` (sin token, `run_sync("genesys")` → 409);
  - `test_sampstat_unknown_code_label`;
  - `test_link_accession_rules` (Review Focus 5, más el éxito con editor y el `DELETE`);
  - `test_list_cycles_by_species_is_tenant_scoped`.
- [ ] **Step 2:** FAIL → implementar → PASS; `make test`.
- [ ] **Step 3: Commit** `feat(connectors): Genesys (conteos, sin redistribución) y vínculo de accesión a ciclo`.

### Task 6: API de ficha y panel, comando de sincronización

**Files:**
- Create: `app/modules/connectors/schemas.py`, `app/modules/connectors/service.py`, `app/modules/connectors/router.py`, `scripts/connectors/__init__.py`, `scripts/connectors/sync.py`
- Modify: `app/main.py` (incluir el router)
- Test: `tests/test_connectors_api.py`

**Interfaces:**
- Produces:
  - **`GET /api/v1/plants/{species_id}/banks`** (miembro), que responde `BanksOut`:
    ```
    {species_id,
     sources: [{key, label, contribution, status, license_summary,
                copy: null | {status, external_id, payload, license, attribution, source_url,
                              fetched_at, last_attempt_at, last_error, stale: bool, reason}}],
     identity: [{key: "gbif"|"wfo"|"ncbi"|"wikidata", value: str|null, url: str|null,
                 check: "match"|"mismatch"|"unknown", detail: str|null}]}
    ```
    - `sources` trae las 7 fuentes en orden de registro.
    - `stale = last_attempt_at > fetched_at and last_error is not None`.
    - Para `genesys`, la copia nunca incluye accesiones.
    - Las URL de `identity`:
      - gbif → `https://www.gbif.org/species/<id>`;
      - wfo → `https://www.worldfloraonline.org/taxon/<id>`;
      - ncbi → `https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=<id>`;
      - wikidata → `https://www.wikidata.org/wiki/<qid>`.
    - Valores de `check` en `identity`:
      - **gbif**: `match` si el P846 de Wikidata es igual al del catálogo; `mismatch` si difiere; `unknown` si falta alguno.
      - **wfo**: el mismo criterio, entre el P7715 de Wikidata y el `wfo_id` casado.
      - **ncbi**: siempre `unknown`, porque viene de una sola fuente; `detail` = «Según Wikidata».
      - **wikidata**: `unknown`.
  - **`GET /api/v1/connectors`** (superadmin): `[{key, label, contribution, license, url, status, can_sync, last_sync: {status, started_at, finished_at, species_total, species_ok, error} | null, copies: {ok, not_found, stale}}]`.
  - **`POST /api/v1/connectors/{key}/sync`** (superadmin): `run_sync` síncrono → `ConnectorSyncOut`. Una key desconocida → 404.
  - **`GET /api/v1/connectors/genesys/accessions?species_id=`** (miembro): llama a `list_accessions_live` de la Tarea 5. Responde `503 source_unavailable` si Genesys no está `active` o si la fuente falla.
  - **`python -m scripts.connectors.sync [--source gbif|wfo|wikidata|genesys|all]`**: llama a `run_sync` con `actor=None`, imprime una línea por fuente y sale con código 1 si alguna termina en `error`. No se programa en Railway en este hito.

- [ ] **Step 1: Pruebas que fallan:**
  - `test_banks_without_copies` (7 fuentes, todas con `copy: null`);
  - `test_banks_stale_copy`;
  - `test_identity_checks_flag_mismatch` (Review Focus 3);
  - `test_connectors_panel_superadmin_only` (un admin de organización → 403);
  - `test_sync_endpoint_runs_and_respects_cooldown` (con `fetcher_factory` falso inyectado mediante `app.dependency_overrides` de una dependencia `get_fetcher_factory`);
  - `test_sync_cli_exit_code` (con `monkeypatch` de `run_sync`).
- [ ] **Step 2:** FAIL → implementar → PASS; `make test`.
- [ ] **Step 3: Commit** `feat(connectors): API de bancos en la ficha, panel de fuentes y comando de sincronización`.

### Task 7: Página `/app/fuentes`

**Files:**
- Create: `frontend/src/features/connectors/api.ts`, `frontend/src/features/connectors/labels.ts`, `frontend/src/features/connectors/SourcesPage.tsx`, `frontend/src/features/connectors/sources.test.tsx`
- Modify: `frontend/src/App.tsx` (ruta `fuentes`), `frontend/src/components/Sidebar.tsx` (`SUPERADMIN_ITEMS` suma `{ to: '/app/fuentes', label: 'Fuentes', icon: 'globe' }`)

**Interfaces:**
- Produces:
  - `api.ts`: `fetchConnectors()`, `syncConnector(key)`, `fetchBanks(speciesId)`, `fetchGenesysAccessions(speciesId)`, `fetchCyclesForSpecies(speciesId)`, `linkAccession(projectId, cycleId, body)` y `unlinkAccession(projectId, cycleId)`, con tipos que reflejan exactamente los esquemas de la Tarea 6.
  - `labels.ts`:
    - `CONNECTOR_STATUS_LABELS` (tabla de Global Constraints);
    - `SYNC_STATUS_LABELS` = `{running: 'En curso', ok: 'Correcta', partial: 'Parcial', error: 'Con error'}`;
    - `SAMPSTAT_LABELS`, igual al de la Tarea 5.

**La tabla:**
- Columnas: Fuente, Aporte, Licencia, Estado, Última sincronización y Copias (ok / sin coincidencia / desactualizadas).
- Si `last_sync.error` existe, se muestra bajo el estado en texto de alerta: es la columna de errores que pide §7.2.
- Botón «Sincronizar» solo si `can_sync`. Mientras corre: deshabilitado, con «Sincronizando…».
- Los errores 429 y 409 muestran el mensaje del servidor.
- Las filas `requires_alliance` e `in_construction` muestran su estado sin botón.
- La fila de Genesys sin token dice «Requiere credenciales · solicitar token a helpdesk@genesys-pgr.org».
- En 375 px, la tabla pasa a tarjetas.
- Un usuario que no es superadmin y entra por URL ve «No tienes permiso para ver esta página», igual que `RequestsInboxPage`.

- [ ] **Step 1: Pruebas vitest que fallan:**
  - render con las 7 filas;
  - el botón solo en `can_sync`;
  - «Sincronizando…» mientras la promesa está pendiente;
  - el mensaje de enfriamiento en 429;
  - la vista sin permiso.
- [ ] **Step 2:** FAIL → implementar → PASS; `make test`.
- [ ] **Step 3: Commit** `feat(web): panel de fuentes /app/fuentes`.

### Task 8: Sección «Bancos de plantas y distribución» en la ficha

**Files:**
- Create:
  - `scripts/connectors/build_mexico_outline.py`;
  - `frontend/src/features/connectors/mexico-outline.json` (generado y versionado);
  - `frontend/src/features/connectors/BanksSection.tsx`, `IdentityChips.tsx`, `PresenceMap.tsx`, `AccessionsPanel.tsx`, `UseInCycleDialog.tsx`, `projection.ts`;
  - `frontend/src/features/connectors/banks.test.tsx`, `projection.test.ts`.
- Modify: `frontend/src/features/catalog/PlantDetailPage.tsx` (nueva `<Section title="Bancos de plantas y distribución">` después de «Identificadores externos»).

**Interfaces:**
- Consumes: `api.ts`, `labels.ts` (Tarea 7); `GET /api/v1/public/vision` → `sites` (sitios de la Visión con `kind`, `label`, `lat` y `lon`).
- Produces:
  - **`build_mexico_outline.py`**:
    - descarga `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson`;
    - toma la entidad con `ADM0_A3 == "MEX"`;
    - redondea las coordenadas a 2 decimales y quita los puntos consecutivos repetidos;
    - escribe `{"source": "Natural Earth 1:50m (dominio público)", "bbox": [-118.5, 14.5, -86.5, 32.8], "polygons": [[[lon, lat], ...], ...]}`.

    Necesita red. Se ejecuta una vez y el JSON se versiona (< 60 KB).
  - **`projection.ts`**: `project(lon, lat, width): {x, y}`, una equirectangular sobre el `bbox` con el factor `cos(23°)` en x; la altura se deriva del ancho.
  - **`IdentityChips`**: un chip por elemento de `identity`.
    - Con `check === 'mismatch'`: el chip muestra «No coinciden» y `detail`.
    - Con `value === null`: no se dibuja.
  - **`PresenceMap`** (SVG, `role="img"`, `aria-label` con el total):
    - el contorno de México;
    - un círculo por celda, con área proporcional a `count`;
    - encima, los `sites` de la Visión que caen dentro del `bbox`, con forma y leyenda distintas («Prototipo histórico» o «Nodo solicitado»);
    - al pie, «Presencia GBIF en México: <total> registros con licencia CC0/CC BY (<excluded_nc> excluidos por licencia NC en el mundo)» y, si `sampled < total`, «Mapa con una muestra de <sampled> de <total>»;
    - después, la lista de los 10 países principales con su conteo y la atribución.
  - **`AccessionsPanel`**:
    - si Genesys no está `active`: «Genesys requiere credenciales de API. Accesiones disponibles cuando el equipo las configure.»;
    - si hay copia: conteos por país y por estado biológico (con `SAMPSTAT_LABELS`) y el botón «Ver accesiones», que llama a `fetchGenesysAccessions` y muestra una tabla con enlace a la fuente y la acción «Usar en mi ciclo»;
    - si la consulta en vivo da 503: «Fuente no disponible».
  - **`UseInCycleDialog`**: lista los ciclos de `fetchCyclesForSpecies`; sin ciclos, muestra «No tienes ciclos de esta especie».
    - Confirmar llama a `linkAccession`.
    - Un `viewer` ve la acción deshabilitada con el título «Necesitas rol de editor».
  - **Cada bloque de fuente** muestra su estado de copia:
    - `stale`: «Fuente no disponible · última copia del <fecha dd/mm/aaaa>»;
    - `copy === null`: «Sin datos de esta fuente todavía»;
    - `not_found`: el `reason`.
  - **Lo del equipo y lo importado, lado a lado**:
    - nombres comunes del catálogo, con la etiqueta «Equipo HarvestT», junto a los de Wikidata, con «Wikidata · sourced»;
    - nombre aceptado y sinónimos de WFO con «World Flora Online · sourced».
  - **Imágenes de Commons**: miniaturas con `loading="lazy"`, autor en **texto** y licencia enlazada a `license_url`. Nunca se usa `dangerouslySetInnerHTML`.

- [ ] **Step 1:** ejecutar `python scripts/connectors/build_mexico_outline.py` y versionar el JSON. Si no hay red, se detiene y se reporta, no se dibuja un contorno a mano.
- [ ] **Step 2: Pruebas que fallan:**
  - `projection.test.ts`: las esquinas del `bbox` caen en (0, 0) y (width, height), y CDMX (−99.1, 19.4) cae dentro;
  - `banks.test.tsx`:
    - copia `stale` → texto «Fuente no disponible · última copia del»;
    - chip `mismatch` → «No coinciden»;
    - el autor `<a href="x">Geographer</a>` aparece como texto y no hay ningún `a[href="x"]`;
    - Genesys `requires_credentials` → el mensaje de credenciales;
    - el diálogo sin ciclos → «No tienes ciclos de esta especie»;
    - la muestra → «Mapa con una muestra de».
- [ ] **Step 3:** FAIL → implementar → PASS; `make test`.
- [ ] **Step 4: Revisión visual** con Docker y Playwright (`mcr.microsoft.com/playwright:v1.49.0-jammy`) contra la demo local con datos sincronizados de verdad. Se sincroniza desde `/app/fuentes` en la demo, con red. Capturas en claro, oscuro y 375 px, sin desbordes.
- [ ] **Step 5: Commit** `feat(web): bancos de plantas y distribución en la ficha de especie`.

### Task 9: Visión, documentación y puerta

**Files:**
- Modify: `app/modules/vision/service.py` (`_knowledge_reason`), `tests/test_vision.py`, `README.md`, `docs/STATUS.md`, `docs/ARQUITECTURA.md`, `docs/INTEGRIDAD_CIENTIFICA.md`, `CHANGELOG.md`, este plan («Estado de ejecución»).

**Interfaces:**
- `_knowledge_reason` suma, después de la frase de la ontología: «Bancos de plantas: <n> fuentes activas (<etiquetas>)», donde `n` cuenta las fuentes con estado `active` y al menos una copia `ok`.
  - Si Genesys no está activo, se agrega «; Genesys requiere credenciales».
  - Termina con «. Mapa GIS: hito M4.».
  - Sin copias `ok`: «Bancos de plantas: conectores listos, sin sincronizar. Mapa GIS: hito M4.».
- La capa `knowledge` sigue `in_construction` hasta M4.
- **INTEGRIDAD_CIENTIFICA**, sección nueva «Importación desde bancos públicos»: solo lectura, sin sobrescritura, coincidencia exacta, licencias por fuente (incluida la no redistribución de Genesys), copia con fecha, y el anti-meta de §2.

- [ ] **Step 1:** pruebas de la frase en los tres casos (sin copias; con GBIF, WFO y Wikidata ok y Genesys sin token; con Genesys activo y con copia) → FAIL → implementar → PASS.
- [ ] **Step 2:** documentación de §12 de la spec: capacidades, matriz real/simulado, módulo `connectors` y migración `0010` en ARQUITECTURA, y la entrada en CHANGELOG.
- [ ] **Step 3: Puerta**:
  - `make test`;
  - `npm run build`;
  - ciclo de migraciones en Postgres 17 (`upgrade → check → downgrade 0009 → upgrade → check`);
  - *smoke test* del contenedor;
  - `python -m scripts.connectors.sync --source all` contra la demo local con red, para comprobar las 3 fuentes reales.

  Si Genesys no tiene token, se declara no ejecutado.
- [ ] **Step 4: Commit** `docs: M3 Bancos en README, estado, arquitectura e integridad`.

## Después del despliegue (con autorización)

1. Sincronizar GBIF, WFO y Wikidata desde `/app/fuentes` en producción y comprobar la ficha de las 3 especies.
2. Programar el cron de Railway (`python -m scripts.connectors.sync --source all`, semanal) solo si el fundador lo autoriza.
3. Genesys: el fundador solicita el token a `helpdesk@genesys-pgr.org`. Con el token, se configura `GENESYS_API_TOKEN`, se ejecuta una corrida y se confirma `filter_body`. Si la validación de la Tarea 5 lo rechaza, se corrige el nombre del filtro con la documentación que entregue Genesys.
4. El término «Accesión» (dominio Organismo) se propone y publica por el flujo normal de la ontología (M2), no por código.

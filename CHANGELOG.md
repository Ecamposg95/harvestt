# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Las fechas siguen ISO 8601.

## 2026-11-10 · M3 Bancos de datos de plantas

### Añadido (en la rama `feat/hito-m3-bancos`; pendiente de autorización para fusionar y desplegar)
- **M3 · Bancos de plantas:** módulo `connectors` con conectores de solo lectura a GBIF, World Flora Online, Wikidata/Wikimedia Commons y Genesys; migración `0010_connectors` (`connector_snapshots`, `connector_syncs`).
- Copias locales con fecha, licencia, atribución y URL de origen; una sincronización fallida conserva la copia anterior y registra el error.
- Solo coincidencia exacta de identidad (GBIF por `usageKey`; WFO `exact` y `accepted`; Wikidata con un único ítem); sin coincidencia, «Sin coincidencia» con motivo y sin datos.
- GBIF: solo registros CC0 1.0 y CC BY 4.0; los CC BY-NC se excluyen y se informa cuántos. WFO se consulta vía ChecklistBank (dataset 2004) por la cadena TLS incompleta de `list.worldfloraonline.org`. Commons: imágenes con licencia abierta, enlazadas y con autor en texto plano.
- Genesys: requiere token (`GENESYS_API_TOKEN`, no configurado); sin acceso a su API no se ha ejecutado contra la fuente real. No se guardan accesiones (solo conteos); la lista se consulta en vivo y la accesión se puede vincular a un ciclo de cultivo.
- `/api/v1/plants/{id}/banks`, `/api/v1/connectors`, `/api/v1/connectors/{key}/sync` (solo superadministrador; enfriamiento de 10 minutos por fuente) y `/api/v1/connectors/genesys/accessions`; CLI `python -m scripts.connectors.sync`.
- Frontend: panel `/app/fuentes` y sección «Bancos de plantas y distribución» en la ficha de especie.
- Visión: la capa «knowledge» informa las fuentes de bancos activas con copia.

### Corregido
- Wikidata: los nombres comunes excluyen el nombre científico (su etiqueta en español para el tomate era «Solanum lycopersicum»).

## 2026-11-10 · M2 Ontología

### Añadido (fusionado a `main` en `b272409` y desplegado en producción el 2026-11-10)
- **M2 · Ontología:** módulo separable `ontology` (términos globales, equivalencias, conceptos externos y versiones); migración `0009_ontology`.
- Ciclo propuesta → revisión → publicación con ID permanente `HVT:000001`, nota obligatoria en cada revisión, obsolescencia con `replaced_by` y versión que sube con cada publicación, obsolescencia o cambio de equivalencias.
- `/api/v1/ontology/*` (lista, ficha, propuesta, sugerencias de equivalencias sin LLM, versiones, bandeja de revisión para superadministrador) y públicos `/api/v1/public/ontology/export.ttl`, `/export.json` y `/terms/{hvt_id}` (CC-BY 4.0; IRI con `ONTOLOGY_BASE_IRI`).
- Semilla verificada de 45 términos en seis dominios con equivalencias a NCBI Taxon, PO, BBCH, AGROVOC, PECO, ENVO, SOSA, SSN y GeoSPARQL; verificador `python -m scripts.ontology.verify_external`.
- Puente `term_links`: columnas `*_term_id` en especies, afirmaciones, proyectos y ciclos; `relink` idempotente al arrancar (solo coincidencia exacta; sin ella el enlace queda vacío, sin término); `GET /api/v1/ontology/terms/{id}/usage`.
- Grafo: nodos `term` con aristas `subclass_of`, `replaced_by` y `classified_as`.
- Frontend: página `/app/ontologia` (árbol por dominio, buscador, ficha, proponer, «Mis propuestas», revisión).
- Visión: la capa «knowledge» informa la versión publicada y el número de términos.

## [M1 — Página Visión] — 2026-11-07

### Añadido
- **M1 · Página Visión:** módulo `vision` con reconocimientos y solicitudes entrantes; migración `0008_vision`.
- `GET /api/v1/public/vision` (cifras honestas, estados de capa, sitios aprobados) y `POST /api/v1/public/requests` (solicitud de nodo o contacto, trampa anti-bots, coordenadas redondeadas a 1 decimal).
- `/api/v1/admin/recognitions` y `/api/v1/admin/requests` para superadministrador.
- Ajustes `PUBLIC_ORIGIN_LABEL`, `PUBLIC_ORIGIN_LAT`, `PUBLIC_ORIGIN_LON`.
- Frontend: página pública `/vision` (globo three.js perezoso con mapa 2D sin WebGL, diagrama del ecosistema, recorrido por capas, formularios en diálogo) y bandeja `/app/solicitudes`.
- «Nodos operando» se calcula en cada consulta: instalaciones con un dispositivo no simulado que envió una lectura real en los últimos 7 días; sin organización pública, «Sin datos suficientes». El valor en producción se confirmará tras el despliegue (definición provisional hasta M5); «lecturas firmadas» = «pronto»; CDMX como «prototipo histórico».

### Documentación
- Conjunto documental institucional: `README.md`, `docs/HISTORIA.md`, `docs/ARQUITECTURA.md`, `docs/INTEGRIDAD_CIENTIFICA.md`, `docs/STATUS.md`, `CITATION.cff` y este registro.
- Consolidación: las quince ramas de trabajo (`feat/*`, `sdd/*`) verificadas como integradas en `main` y eliminadas del remoto.

## [V5 — Impacto] — 2026-11-07

### Añadido
- KPIs de proyecto con origen y fórmula; `null` cuando faltan insumos.
- KPIs públicos del catálogo y la vitrina, sin datos de proyectos.
- Pestaña Impacto del proyecto y sección pública Impacto en la vitrina.

### Corregido
- Los KPIs ignoran registros borrados; `sources_cited` es `null` sin afirmaciones.
- Fechas futuras no cuentan en «días desde inicio» ni en observaciones de 30 días.

## [V3, V4, V6 — Invernadero virtual, Studio y Grafo] — 2026-10-20

### Añadido
- **V3:** motor de simulación determinista `didactic-v1`; dispositivos, lecturas, reglas de alerta e incidentes; pantalla de operaciones con banda didáctica, medidores y series; migración `0005`.
- **V4:** Studio con plantas procedurales, selección, modo edición, guardado versionado y vista 2D sin WebGL; medios de especie con licencia y atribución; miniaturas procedurales; migración `0006`.
- **V6:** `GET /graph` con nodos derivados, aristas con procedencia, foco, filtros por tipo y tope de 300 nodos; página `/app/graph`; migración `0007`.
- Vitrina con modelo 3D destacado, STL con color por cara, callouts con separación automática y modelos procedurales de los prototipos históricos.

## [V1, V2 — Sistema de diseño y puntos etiquetados] — 2026-10-20

### Añadido
- **V1:** sistema de diseño «Salvia cristal», sidebar plegable, `/api/v1/home`, componentes `OriginBadge`, `StatTile`, `Callout` y gráficas.
- **V2:** editor de puntos sobre STL y callouts que siguen la rotación en la página pública; migración `0004`.

## [Base de la plataforma] — 2026-10-19

### Añadido
- Núcleo FastAPI, autenticación JWT, multi-organización, auditoría e infraestructura Docker/Railway (migración `0001`).
- Catálogo de especies, proyectos, ciclos y bitácora (migración `0002`).
- Vitrina pública y administración de prototipos (migración `0003`).
- Especificación de producto *Task Pack v1.0* y especificación del hito visual.

## [Origen] — 2026-04-23

- Creación del repositorio con la descripción del proyecto HarvestT (etapa de prototipos 2017–2018).

# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Las fechas siguen ISO 8601.

## [Sin publicar]

### Añadido (rama `feat/hito-m1-vision`, pendiente de autorización para fusionar y desplegar)
- **M1 · Página Visión:** módulo `vision` con reconocimientos y solicitudes entrantes; migración `0008_vision`.
- `GET /api/v1/public/vision` (cifras honestas, estados de capa, sitios aprobados) y `POST /api/v1/public/requests` (solicitud de nodo o contacto, trampa anti-bots, coordenadas redondeadas a 1 decimal).
- `/api/v1/admin/recognitions` y `/api/v1/admin/requests` para superadministrador.
- Ajustes `PUBLIC_ORIGIN_LABEL`, `PUBLIC_ORIGIN_LAT`, `PUBLIC_ORIGIN_LON`.
- Frontend: página pública `/vision` (globo three.js perezoso con mapa 2D sin WebGL, diagrama del ecosistema, recorrido por capas, formularios en diálogo) y bandeja `/app/solicitudes`.
- «Nodos operando» = 0 (medido, definición provisional hasta M5); «lecturas firmadas» = «pronto»; CDMX como «prototipo histórico».

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

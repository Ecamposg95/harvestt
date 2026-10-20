# HarvestT Cortex — Hito visual (V1–V6)

Fecha: 2026-10-19 · Spec fuente de producto: `docs/HARVESTT_TASK_PACK.md` · Spec previo: `2026-10-19-base-y-prototipos-design.md` · Estado: diseño aprobado en conversación (alcance completo, dirección B "Salvia cristal", sidebar plegable, grafo como V6, planta 3D híbrida).

## 1. Objetivo

Llevar la plataforma desplegada (base, catálogo, proyectos, prototipos) al lenguaje visual de las referencias en `docs/screenshots/` y construir las piezas que esas pantallas presuponen: callouts sobre modelos 3D, invernadero virtual con telemetría simulada, planta 3D, KPIs de impacto y grafo de conocimiento.

Criterio de éxito: un recorrido de demo donde la vitrina pública, la página de prototipo, el inicio de `/app`, la ficha de planta, operaciones del invernadero, el Studio, impacto y grafo se ven como la visión, y **ningún número es inventado**: cada valor es real, calculado con fórmula visible o lleva etiqueta SIMULADO / ILUSTRATIVO / DESCONOCIDO.

### Restricciones

- Las capturas son diseños de terceros: solo inspiración. No se copian marcas, logos ni textos. `docs/screenshots/` no se versiona.
- Reglas del task pack vigentes: sin valores agronómicos sin evidencia; ausentes explícitos; simulación didáctica etiquetada ("Simulación didáctica, sin calibración agronómica"); 3D etiquetado ("Representación ilustrativa; no predice crecimiento").
- Mismo stack e infra (un servicio Railway, Postgres, bucket). Sin workers ni servicios nuevos.
- Cada fase en rama `feat/hito-v<n>-<tema>`, tests verdes, merge y despliegue a `main` solo con autorización explícita del usuario.

## 2. Mapa de fases

| Fase | Contenido | Referencia | Depende de |
|---|---|---|---|
| V1 | Sistema de diseño Salvia cristal + rediseño de pantallas existentes | 53, 43 | — |
| V2 | Hotspots/callouts en prototipos STL | 53 | V1 |
| V3 | Invernadero virtual: motor, telemetría simulada, incidentes, operaciones | 13, 43 | V1 |
| V4 | Planta 3D híbrida: Studio procedural + layout + medios con licencia en ficha | 12 | V1, V2 (Callout 3D) |
| V5 | KPIs de impacto con procedencia + sección pública | 34 | V3, V4 |
| V6 | Grafo de conocimiento (solo exploración) | — | V1 |

## 3. V1 · Sistema de diseño y pantallas base

### 3.1 Tokens y tipografía

Se reemplazan los tokens de `frontend/src/styles/index.css` (se conserva el esquema de canales RGB para Tailwind y los nombres existentes, así las features no cambian de clases):

| Token | Claro (por defecto) | Oscuro (grafito-salvia) |
|---|---|---|
| `--c-bg` (inicio degradado) | `#e6ece2` | `#141813` |
| `--c-bg-2` (fin degradado, nuevo) | `#cfdacb` | `#1d231c` |
| `--c-surface` (vidrio) | `255 255 255` usado a 52 % | `255 255 255` a 6 % |
| `--c-fg` | `#1d241c` | `#e6ece2` |
| `--c-muted` | `#5d6a5b` | `#9aa898` |
| `--c-accent` | `#a6e22e` (lima) | `#a6e22e` |
| `--c-accent-ink` (nuevo, texto verde sobre claro) | `#4f7a12` | `#b9ec5a` |
| `--c-ink` (nuevo, oscuro sólido: riel, CTA) | `#262b25` | `#0d100c` |
| `--c-danger`, `--c-warning` | se mantienen ajustados al fondo | ídem |

- Tipografía: Manrope (400–800) self-hosted vía `@fontsource/manrope`; se retira IBM Plex. `font-mono` queda para valores técnicos (IDs, unidades) con la pila del sistema.
- Forma: radios 20–28 px en tarjetas, píldora (`rounded-full`) en botones y chips, sombra suave verdosa, `backdrop-blur` en vidrio con degradación a fondo sólido si el navegador no soporta blur.
- Titulares de display: Manrope 800, mayúsculas, `letter-spacing` negativo; tamaño fluido (`clamp`) para que el título público de 64 px baje a ~40 px en móvil.
- El tema claro es el predeterminado; el selector claro/oscuro existente (`store/theme.ts`) se mantiene.

### 3.2 Componentes (`frontend/src/components/ui/`)

Se reescriben `Button` (variantes `pill-dark`, `pill-glass`, `ghost`), `Card` → `GlassCard`, `Badge`, `PageHeader`, `States`. Nuevos:

- `StatTile`: etiqueta, valor, unidad, `OriginBadge` opcional; si no hay valor muestra "Sin lecturas" / "Sin datos" según contexto, nunca `0`.
- `OriginBadge`: mapea `measured|sourced|derived|simulated|illustrative|missing` → MEDIDO / FUENTE / DERIVADO / SIMULADO / ILUSTRATIVO / DESCONOCIDO, con color y tooltip explicativo. Única fuente de verdad para etiquetas de origen en la UI.
- `Callout`: punto + línea + etiqueta en píldora oscura, posicionado en coordenadas de pantalla (`x`, `y`, lado izquierdo/derecho, estado `dimmed`). Se reutiliza en STL (V2), planta (V4) e invernadero (V3). Hook `useProjectedCallouts(camera, points)` que convierte puntos 3D a pantalla y detecta oclusión por raycast (en `features/three/`).
- `BarChart` (barras redondeadas, una resaltada) y `LineChart` simple en SVG propio; `Gauge` semicircular en SVG. Sin librería de gráficas. Aceptan huecos (`null`) y los dibujan como hueco, no como cero.
- `Sidebar`: riel oscuro de 64 px con íconos y tooltip; botón para expandir a 232 px con etiquetas; preferencia persistida en `localStorage` (con try/catch); en < 768 px se convierte en drawer con overlay. Íconos SVG inline propios (sin librería de íconos).

### 3.3 Pantallas

| Ruta | Cambio |
|---|---|
| `/` (vitrina) | Fondo salvia, nav con píldoras, héroe con titular grande, tarjetas de prototipo en vidrio con imagen héroe y estado |
| `/prototipos/:slug` | Layout de la 53: título enorme con nombre en `accent-ink`, propósito, CTA, visor STL en tarjeta de vidrio, fila de chips de specs (campos existentes del prototipo; sin specs inventadas), galería |
| `/login` | Tarjeta de vidrio centrada sobre degradado |
| `/app` | Layout de la 43: héroe con proyecto más reciente (nombre, especie, sistema, área si existe), tiles de lecturas (antes de V3: "Sin lecturas"), conteos reales (observaciones, ciclos, fuentes citadas), actividad reciente desde `AuditEvent` del tenant |
| `/app/plants`, `/app/plants/:id` | Tarjetas de vidrio, afirmaciones con `OriginBadge`; ficha con héroe preparado para V4 (placeholder con nombre científico mientras no haya medio) |
| `/app/projects`, `/app/projects/:id` | Tarjetas y pestañas en píldora (Resumen, Bitácora, Ciclos; luego Operaciones y Studio) |
| `/app/prototypes*` | Admin con el nuevo estilo |

Backend V1: `GET /api/v1/home` (tenant) devuelve `{recent_project, counts{projects, crop_cycles, observations, sources_cited}, activity[]}` con `activity` = últimos 10 `AuditEvent` del tenant traducidos a texto de UI. No requiere migración.

## 4. V2 · Hotspots en prototipos

- Modelo `PrototypeHotspot` (tenant, `UUIDMixin`, `AuditMixin`): `prototype_id` FK, `asset_id` FK (el STL al que pertenece), `label` (≤ 60), `description` (≤ 500, opcional), `x`, `y`, `z` (float, coordenadas del modelo antes de normalizar), `sort_order`. Migración `0004_prototype_hotspots`.
- API interna (editor+): `GET/POST /prototypes/{id}/hotspots`, `PATCH/DELETE /prototypes/{id}/hotspots/{hid}`; máximo 12 por prototipo (422 al exceder). Auditado.
- API pública: el detalle publicado incluye `hotspots[{label, description, x, y, z, sort_order}]` del STL principal; sin IDs internos ni autor.
- Editor (admin): modo "Agregar punto" → clic sobre la malla → raycast → formulario de etiqueta; arrastrar no aplica (se borra y se recrea). Lista lateral para reordenar y editar.
- Vista pública: `useProjectedCallouts` actualiza posiciones por frame solo cuando la cámara cambia; puntos ocluidos se atenúan; en móvil los callouts se colapsan a números con leyenda debajo.

## 5. V3 · Invernadero virtual (QW4: HVT-014, HVT-015)

### 5.1 Módulos y modelos

`app/modules/simulation/` y `app/modules/telemetry/`. Todos con `TenantMixin` y aislamiento por `scoped()`.

- `Device` (telemetry): `project_id`, `name`, `kind` (`simulated` en este hito; `physical` reservado para HVT-022), `variables` JSON (`["air_temperature","relative_humidity"]`), posición `x,y,z` en metros dentro del invernadero, `status`.
- `SimulationRun` (simulation): `project_id`, `scenario` (`base|heat_rise|sensor_loss`), `model_version` (`didactic-v1`), `seed` (int), `inputs` JSON validado, `status` (`running|paused|completed|cancelled`), `started_at`, `paused_at`, `paused_seconds`, `total_steps`, `emitted_steps`, `limits` JSON (texto de limitaciones), `author_id`.
- `TelemetryReading` (telemetry): `schema_version`, `event_id` (UUID), `device_id`, `project_id`, `variable`, `value` (nullable no permitido: la falta de señal es ausencia de lectura), `unit` (`Cel`, `%`), `observed_at`, `received_at`, `source` (`simulated`), `quality` (`synthetic`), `scenario_run_id`. Índice único `(device_id, event_id)`; índice `(project_id, variable, observed_at)`.
- `AlertRule` (telemetry): `project_id`, `variable`, `comparator` (`gt|lt`), `threshold`, `hysteresis`, `cooldown_minutes`, `stale_after_minutes`, `label`, `is_didactic` (siempre `true` en este hito). Sin reglas por defecto con valores agronómicos: el seed de demo crea reglas marcadas "Regla demostrativa" con umbrales elegidos para que el escenario dispare, documentados como tales.
- `Incident` (telemetry): `project_id`, `rule_id` nullable, `kind` (`threshold|stale`), `device_id`, `opened_at`, `closed_at`, `severity`, `evidence` JSON (lecturas que lo dispararon), `status` (`open|acknowledged|closed`), `acknowledged_by`, `acknowledged_at`. Reconocer queda en `AuditEvent`.

Migración `0005_simulation_telemetry`.

### 5.2 Motor `didactic-v1`

Función pura `generate(seed, scenario, inputs, step) -> {variable: value | None}` en `simulation/engine.py`, sin estado ni E/S:

- Curva diurna sinusoidal con media, amplitud y desfase de `inputs`; ruido pseudoaleatorio con `random.Random(f"{seed}:{step}:{variable}")` (determinista e independiente del orden de cálculo).
- `heat_rise`: rampa sumada a temperatura entre pasos configurables, con retardo y saturación (regla de ventilación didáctica de la sección 08).
- `sensor_loss`: un dispositivo devuelve `None` (sin lectura) en un intervalo y luego se recupera.
- Humedad relativa derivada con relación inversa didáctica a la temperatura y acotada a [0, 100].
- `inputs` validados contra rangos físicos generales (temperatura media −10…50 °C, amplitud 0…20, paso 1…60 min, horizonte ≤ 7 días, ≤ 5 000 pasos por run), nunca presentados como óptimos.

### 5.3 Ejecución sin worker

El tiempo simulado avanza con el reloj real acelerado (`tick_seconds` en `inputs`, por defecto 2 s reales = 1 paso). Al leer (`GET` de lecturas, estado o home) se "materializa" hasta el paso que corresponde: `target = min(total_steps, floor((now − started_at − paused_seconds)/tick_seconds))`. Para cada paso pendiente se calculan valores y se insertan lecturas con `event_id = uuid5(run_id, f"{step}:{device}:{variable}")`, de modo que materializar dos veces no duplica (`ON CONFLICT DO NOTHING` / verificación previa en SQLite). Luego se evalúan reglas sobre las lecturas nuevas.

- Límite por llamada: 500 pasos materializados; el resto continúa en la siguiente lectura (la UI hace polling cada 5 s mientras el run está `running`).
- Pausa / reanudar / cancelar / reset: `POST /projects/{id}/simulation/runs/{rid}/{pause|resume|cancel}`; `reset` = crear un run nuevo (los runs son inmutables para auditoría).
- Un solo run `running` por proyecto (409 si ya existe).

### 5.4 Reglas e incidentes

- Umbral: abre incidente cuando el valor cruza `threshold`; cierra solo cuando vuelve más allá de `threshold ∓ hysteresis`; no reabre antes de `cooldown_minutes` (tiempo simulado).
- Stale: si un dispositivo no tiene lectura en `stale_after_minutes` de tiempo simulado → incidente `stale` y la UI muestra "Sin señal" (nunca 0); se cierra al volver la señal.
- Evaluación idempotente: re-evaluar el mismo rango de pasos no crea incidentes duplicados.

### 5.5 API

| Método y ruta | Rol |
|---|---|
| `GET/POST /projects/{id}/devices`, `PATCH/DELETE …/{did}` | viewer / editor |
| `GET/POST /projects/{id}/simulation/runs`, `GET …/{rid}`, `POST …/{rid}/{pause,resume,cancel}` | viewer / editor |
| `GET /projects/{id}/telemetry/readings?variable=&device_id=&since=&until=&run_id=` (máx. 2 000 puntos, con `downsample`) | viewer |
| `GET /projects/{id}/telemetry/latest` (último valor por dispositivo y variable + `stale`) | viewer |
| `GET/POST /projects/{id}/alert-rules`, `PATCH/DELETE …/{rid}` | viewer / editor |
| `GET /projects/{id}/alerts`, `PATCH /projects/{id}/alerts/{aid}` (`acknowledge`) | viewer / editor |

Fuera de alcance: `POST /telemetry/readings` con credencial de dispositivo (HVT-022).

### 5.6 Pantalla `/app/projects/:id/operations`

Inspirada en la 13: cabecera con estado del run y controles; banda persistente "Simulación didáctica, sin calibración agronómica"; gauges de último valor por variable (SIMULADO); `LineChart` por variable con huecos en pérdida de señal; lista de incidentes con reconocer; escena 3D del invernadero (geometría paramétrica: nave con techo a dos aguas dimensionada con `area_m2` del proyecto o, si falta, tamaño ilustrativo etiquetado) con dispositivos como esferas y `Callout` con su última lectura o "Sin señal". El inicio `/app` pasa a mostrar las últimas lecturas del proyecto reciente con badge SIMULADO.

## 6. V4 · Planta 3D híbrida (HVT-012, HVT-013)

### 6.1 Studio `/app/projects/:id/studio`

- Generadores procedurales en `frontend/src/features/three/plants/`: `lettuce` (roseta), `tomato` (tallo con hojas compuestas y frutos en etapa 3), `basil` (pares opuestos); cada uno con 3 etapas ilustrativas (`seedling|vegetative|mature`) y semilla para variación; geometría generada una vez por (especie, etapa, semilla) y reutilizada con instancing. Especies sin generador usan un genérico.
- Layout: `Zone` (tenant): `project_id`, `name`, `x`, `y`, `width`, `depth` (m); `Placement`: `zone_id`, `crop_cycle_id` nullable, `species_id`, `stage`, `x`, `y`, `rotation`. Validación: zonas dentro del área del proyecto (si existe), plantas dentro de su zona (422 con detalle). Sin detección de colisiones en P0. Migración `0006_studio_layout_species_media`.
- API: `GET /projects/{id}/layout`, `PUT /projects/{id}/layout` (reemplazo completo con `version`, 409 si no coincide). Recargar reconstruye la escena.
- UI: órbita, zoom, selección (panel lateral con especie, etapa, ciclo), modo edición para mover y agregar; aviso persistente "Representación ilustrativa; no predice crecimiento"; fallback 2D (vista superior SVG del layout) si no hay WebGL.

### 6.2 Medios de especie y ficha

- `SpeciesMedia` (global, escritura solo superadmin): `species_id`, `storage_key`, `content_type`, `kind` (`photo|render`), `license` (texto SPDX o nombre), `attribution` (obligatorio), `source_url`, `is_hero`, `width`, `height`, `callouts` JSON (ver ficha). Mismas validaciones de imagen que prototipos (magic bytes, 15 MB). Sin licencia o atribución → 422.
- API: `GET /plants/{id}` incluye `media[]`; `POST /plants/{id}/media` (superadmin), `DELETE …/{mid}`; `GET /plants/{id}/media/{mid}/file` (streaming con caché).
- Ficha `/app/plants/:id` (inspirada en la 12): héroe con la imagen `is_hero` y crédito visible (atribución + licencia + enlace); callouts 2D con posiciones relativas sobre la imagen (`SpeciesMedia.callouts` JSON `[{trait_variable, x, y}]` en 0–1) que muestran el valor de la afirmación o "Desconocido" con su `OriginBadge`. Sin imagen: vista 3D procedural de la especie en etapa madura con etiqueta ILUSTRATIVO.
- No se descargan imágenes de terceros automáticamente; las sube el administrador con su licencia verificada.

## 7. V5 · Impacto y KPIs

- Módulo `app/modules/impact/` sin tablas: servicio que calcula KPIs al vuelo.
- Cada KPI: `{key, label, value | null, unit, origin, formula, inputs_count, as_of}`. `value = null` cuando no hay insumos suficientes → UI "Sin datos suficientes".
- KPIs de proyecto (`GET /projects/{id}/impact`): ciclos activos (medido), días desde inicio del ciclo más antiguo activo (derivado), observaciones últimos 30 días (medido), cobertura de evidencia de las especies del proyecto = afirmaciones con origen distinto de `missing` / total (derivado), fuentes citadas (medido), corridas de simulación (simulado), incidentes abiertos/reconocidos y tiempo medio a reconocer (simulado, porque provienen de telemetría simulada).
- KPIs públicos (`GET /public/impact`, solo org pública): prototipos publicados, especies en catálogo, fuentes con licencia registrada, cobertura de evidencia del catálogo. Sin datos internos de proyectos.
- Explícitamente fuera: rendimiento, ahorro de agua, CO₂, dinero, cualquier estimación sin metodología documentada.
- UI: sección pública "Impacto" en la vitrina (inspirada en la 34: números grandes, texto narrativo, cada número con su origen y fórmula en tooltip) y pestaña Impacto en el proyecto.

## 8. V6 · Grafo de conocimiento (HVT-020, solo exploración)

- Nodos derivados al vuelo de entidades existentes: `species`, `cultivar`, `trait` (variable de afirmación), `source`, `project`, `crop_cycle`, `prototype`. Aristas implícitas de FKs: cultivar→especie, afirmación (especie→rasgo, con fuente como evidencia), ciclo→especie, proyecto→ciclo.
- `GraphEdge` (`organization_id` nullable = global; global solo escribible por superadmin): `src_type`, `src_id`, `dst_type`, `dst_id`, `relation` (vocabulario cerrado: `designed_for`, `related_to`, `cites`), `provenance` JSON (fuente o autor). Seed: ninguna relación inventada; solo aristas que se deriven de datos reales. Migración `0007_graph_edges`.
- API: `GET /graph?focus_type=&focus_id=&depth=1..3&types=` → `{nodes[{id, type, label, origin?}], edges[{src, dst, relation, provenance}], truncated}`; máximo 300 nodos (`truncated=true` al cortar). Respeta tenant: nodos globales + del tenant.
- UI `/app/graph`: canvas con `d3-force` (estilo Obsidian: nodos como puntos coloreados por tipo, etiquetas al acercar, enfoque al hacer clic, vecinos resaltados), búsqueda, filtros por tipo, panel lateral con detalle y procedencia y enlace a la pantalla del recurso. Sin edición.

## 9. Pruebas

- Backend (pytest, SQLite y Postgres en CI local):
  - V1: `/home` aislado por tenant y sin datos ajenos en `activity`.
  - V2: CRUD de hotspots, límite 12, aislamiento, campos públicos sin internos.
  - V3: golden test del motor (misma semilla/versión/inputs → serie idéntica; semilla distinta → serie distinta); materializar dos veces no duplica; evento tardío conserva `observed_at`; pérdida de señal no genera lecturas y abre `stale`; histéresis y cooldown evitan tormenta; cancelación detiene la materialización; un run por proyecto; aislamiento entre proyectos y tenants; reconocimiento auditado.
  - V4: validaciones de layout fuera de límites, versión 409, `SpeciesMedia` exige licencia y atribución, permisos superadmin.
  - V5: KPIs con `null` cuando faltan insumos; origen correcto; `/public/impact` sin fugas.
  - V6: límite de nodos y `truncated`, sin nodos de otro tenant.
- Frontend (vitest): `OriginBadge` (6 orígenes), `StatTile` sin valor, `Callout` y proyección/oclusión con cámara simulada, `Sidebar` (plegar, persistencia, drawer), gráficas con huecos, fallback 2D del Studio.
- Cierre de cada fase: `tsc`, vitest, pytest, build, smoke del contenedor Docker, revisión visual en navegador (claro, oscuro, móvil) y checklist "real / simulado / pendiente" actualizado en el README.

## 10. Dependencias nuevas

- `@fontsource/manrope` (V1), `d3-force` + `@types/d3-force` (V6). Versiones exactas fijadas en el plan.
- Backend: ninguna.

## 11. Fuera de alcance

Cortex/RAG y agentes (QW2/QW5), comparador de escenarios y expediente (HVT-016/017), ingestión de telemetría física (HVT-022), control de actuadores, modelo científico de crecimiento, edición del grafo.

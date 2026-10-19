# HarvestT Cortex — Task Pack de desarrollo v1.0

Fecha: 19 de octubre de 2026 · Product owner: Emmanuel Campos Genaro · Atlas Tech

**Propósito:** entregar a una IA de desarrollo una especificación ejecutable para construir la capa de inteligencia de HarvestT y producir quick wins demostrables antes de fabricar hardware.

**Estado del documento:** propuesta de implementación, no reporte de software ya construido. No se ha inspeccionado el repositorio actual. Dependencias, versiones y proveedores deben verificarse en el repositorio y en documentación oficial antes de implementar. Este paquete no autoriza sobrescribir trabajo existente ni publicar datos privados.

## 00. Cómo usar este paquete

1. Adjunta este archivo a tu IA de desarrollo dentro del repositorio HarvestT.
2. Ejecuta el prompt maestro de la sección 15. Pídele avanzar por incrementos verticales, empezando por QW1.
3. Conserva este archivo como `docs/HARVESTT_TASK_PACK.md`. Genera los documentos operativos indicados; este archivo es la especificación fuente.
4. Después de cada incremento, exige demo reproducible, evidencia de validación y actualización de `docs/STATUS.md`.
5. No intentes construir todas las fases en un solo cambio. La visión es integral; cada entrega debe poder arrancar y ser revisada por separado.

### Primer resultado que queremos ver

Una aplicación donde se pueda buscar una planta, abrir su ficha, crear un proyecto de cultivo, guardar una nota y recargar sin perder información. Después incorporar RAG con evidencia, 3D y un invernadero virtual.

### Decisiones de producto establecidas

- Software primero; hardware después.
- Experiencia web interactiva, en español inicialmente.
- Catálogo agrícola, fuentes abiertas, RAG, agentes y visualización 3D.
- Cortex como memoria y capa de inteligencia transversal.
- Arquitectura modular, multi-tenant desde el inicio, API-first.
- Preparación para sensores y actuadores sin depender de dispositivos reales para demostrar el producto.
- Prioridad a componentes open source y datos reutilizables con procedencia.
- Integración futura con Atlas ONE; no recrear un ERP completo en esta etapa.

### Supuestos reversibles para arrancar

- Tres especies demostradoras: lechuga, tomate y albahaca. No implican variedades ni parámetros agronómicos validados.
- Usuarios iniciales: fundador/investigador, operador y observador.
- Un invernadero virtual por proyecto inicialmente; modelo extensible a varios.
- Arquitectura de monolito modular con worker, no microservicios desde el primer día.
- Sin control físico, pagos, marketplace, blockchain ni entrenamiento de un modelo fundacional propio en P0.

## 01. Visión y recorrido principal

**HarvestT Cortex es un espacio de trabajo para investigar plantas, planificar cultivos, explorar escenarios y acumular evidencia de cada ciclo.**

Recorrido de referencia:

1. Explorar catálogo y fuentes.
2. Seleccionar especie; identificar variedad cuando exista evidencia.
3. Crear proyecto con ubicación opcional, área, sistema y objetivos.
4. Conversar con Cortex usando el contexto del proyecto.
5. Guardar recomendaciones como propuestas revisables.
6. Explorar planta e invernadero en 3D.
7. Ejecutar escenarios explícitamente simulados.
8. Observar telemetría virtual y generar incidencias.
9. Consultar la bitácora y exportar el expediente.

Regla de producto: toda cifra presentada como conocimiento agronómico debe tener fuente y contexto; todo dato sintético debe estar marcado. Un dato ausente se representa como desconocido, nunca como cero.

## 02. Quick wins y gates

Las duraciones son orientativas, no compromisos; recalcular tras auditar el repositorio. Unidad: jornadas de ingeniería con asistencia de IA, sin contar validación agronómica ni fabricación. Los rangos por incremento no deben leerse como fechas garantizadas.

| Incremento | Resultado visible | Dependencias | Esfuerzo orientativo | Gate |
| --- | --- | --- | --- | --- |
| QW0 | Aplicación existente entendida y ruta de ejecución verificable | Acceso al repositorio | 0.5–1 jornada | Informe de estado y ningún cambio destructivo |
| QW1 | Catálogo + ficha + proyecto + bitácora persistentes | QW0, base mínima de auth/tenant | 2–4 jornadas | Flujo funciona tras recargar y no cruza organizaciones |
| QW2 | Cortex responde usando documentos con citas | QW1, corpus permitido | 3–5 jornadas | Citas verificables, abstención y aislamiento |
| QW3 | Planta 3D y distribución de invernadero guardable | QW1; independiente de QW2 | 2–4 jornadas | Selección, cámara, etapas ilustrativas y fallback |
| QW4 | Sensores virtuales, gráficas e incidentes | QW1 | 2–4 jornadas | Secuencia reproducible y eventos idempotentes |
| QW5 | Agentes con herramientas + expediente de demo | QW2 y QW4; integra QW3 | 2–4 jornadas | Ejecución auditada, permisos y demo completa |

**P0:** QW0–QW5, demo funcional de extremo a extremo. **P1:** mayor cobertura de datos y operación piloto. **P2:** modelos calibrados e integración física. No prometer predicciones productivas validadas como parte de P0.

## 03. Arquitectura objetivo

Alinear con el ADF de Atlas y adaptar a lo que ya funcione en el repositorio.

| Capa | Decisión propuesta | Límite de responsabilidad |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite | UI, estados, formularios, visualización |
| API | FastAPI + Pydantic + SQLAlchemy | Validación, permisos, lógica de dominio |
| Persistencia | PostgreSQL y migraciones Alembic | Entidades, auditoría, jobs, telemetría inicial |
| Recuperación | Texto completo + extensión vectorial compatible | Búsqueda híbrida y filtrado autorizado |
| Archivos | Almacenamiento local en dev; objeto remoto en staging | Originales, exportaciones y activos con permisos |
| Jobs | Worker con cola persistente | Ingesta, embeddings y tareas largas |
| IA | Adaptador de LLM y embeddings | Proveedor intercambiable; secretos solo backend |
| Agentes | Orquestación explícita con herramientas tipadas | Límites, estado, reintentos y trazabilidad |
| 3D | Three.js integrado en React | Representación interactiva; nunca autoridad científica |
| Telemetría | Adaptador simulado primero | Contrato compartido con futura integración MQTT/HTTP |
| Observabilidad | Logs estructurados y métricas | Latencia, errores, consumo y salud de jobs |

Mantener versiones compatibles con el repositorio. No actualizar framework, runtime o autenticación por preferencia personal. Si se necesita una biblioteca nueva, registrar motivo, licencia y alternativa en un ADR. Propuesta de carpeta para repo nuevo; respetar organización existente si ya hay código:

```text
apps/web/
apps/api/app/modules/{identity,catalog,projects,knowledge,cortex,simulation,telemetry,audit}/
apps/worker/
packages/contracts/
data/seeds/
data/evaluation/
docs/{adr,runbooks,demo}/
infra/
```

### Modos de ejecución

- `fixture`: fixtures locales, reproducción determinista, badge visible. Ninguna respuesta pregrabada se etiqueta como IA real.
- `connected`: conectores activos y modelo configurado; permite caché con antigüedad visible.
- `pilot`: usuarios reales, permisos estrictos, backups y monitoreo; separado de datos demo.

El frontend consume los mismos endpoints en fixture y connected. La simulación corre en servidor para conservar estado y reproducibilidad. No dispersar mocks en componentes UI.

### Comandos que debe ofrecer el proyecto

`make setup`, `make dev`, `make migrate`, `make seed-demo`, `make test-critical`, `make build`, `make demo-reset`.

El reset debe exigir entorno demo y namespace/tenant de demostración; rechazar producción. No borrar una base compartida. Documentar comandos equivalentes si el stack existente usa otra herramienta.

## 04. Modelo de dominio y contratos de datos

### Entidades mínimas

| Entidad | Campos esenciales y propósito |
| --- | --- |
| Organization / Membership | organización, usuario, rol, estado |
| Species | ID estable, nombre científico, nombres comunes, IDs externos |
| Cultivar | especie, denominación, procedencia; opcional hasta tener evidencia |
| TraitAssertion | entidad, variable, valor/rango, unidad, etapa, sistema, localidad, fuente, revisión |
| Source | URL, editor, título, licencia, derechos de ingesta, fecha de acceso |
| SourceVersion / Document / Chunk | checksum, versión, ruta autorizada, texto, ubicación exacta |
| Project | tenant, nombre, objetivos, área, sistema, ubicación opcional |
| Greenhouse / Zone | proyecto, geometría, unidades y ubicación |
| CropCycle | proyecto, especie/variedad, fechas, etapa observada y estado |
| Observation | ciclo, tipo, contenido, autor, archivo opcional, fecha |
| Conversation / Message | tenant, proyecto, contenido, referencias |
| AgentRun / ToolCall | estado, herramientas, argumentos validados, evidencia, consumo |
| Scenario / ScenarioRun | inputs, semilla, versión de modelo, outputs, limitaciones |
| Device / SensorReading | identidad, variable, valor, unidad, origen, calidad, tiempos |
| Alert / ProposedAction | regla, severidad, evidencia, estado, aprobación si aplica |
| AuditEvent | actor, tenant, recurso, operación, timestamp, trace ID |

Cada tabla privada debe incluir `tenant_id`; usar relaciones y restricciones que impidan unir recursos de organizaciones distintas. Los catálogos globales serán de solo lectura para usuarios ordinarios; las anotaciones privadas vivirán separadas.

### Hechos y evidencia

No guardar un único “pH ideal” universal en Species. Usar afirmaciones contextualizadas:

```json
{
  "subject_type": "species",
  "subject_id": "<internal-id>",
  "variable": "air_temperature",
  "value": null,
  "unit": "Cel",
  "growth_stage": "unknown",
  "cultivation_system": "unknown",
  "evidence_refs": [],
  "review_status": "unreviewed",
  "origin": "missing"
}
```

Los IDs entre ángulos son placeholders de especificación, no seeds. Separar `measured`, `sourced`, `derived`, `simulated`, `illustrative` y `missing`. No crear un porcentaje de confianza arbitrario: mostrar nivel de evidencia y razones; cualquier score posterior requiere metodología documentada.

### Telemetría v1

```json
{
  "schema_version": "1.0",
  "event_id": "<uuid>",
  "device_id": "<registered-device-id>",
  "project_id": "<authorized-project-id>",
  "variable": "air_temperature",
  "value": 28.4,
  "unit": "Cel",
  "observed_at": "2026-10-19T22:00:00Z",
  "source": "simulated",
  "quality": "synthetic",
  "scenario_run_id": "<run-id>"
}
```

Este ejemplo es sintético y no expresa un umbral agronómico. El servidor asigna `tenant_id` y `received_at` tras autenticar el dispositivo; nunca confía en un tenant enviado por el cliente. Índice único por dispositivo y event_id. Conservar tiempo observado y recibido para eventos tardíos. Un sensor desconectado es falta de señal; no temperatura cero.

## 05. Pantallas y experiencia de usuario

| Ruta propuesta | Elementos y acciones reales |
| --- | --- |
| `/app` | Proyectos recientes, estado de fuentes y ejecuciones; crear proyecto |
| `/app/plants` | Búsqueda, filtros, tarjetas, procedencia y comparación |
| `/app/plants/:id` | Identidad, etapas, evidencia, afirmaciones y añadir a proyecto |
| `/app/projects/:id` | Resumen, bitácora, cultivo, archivos y decisiones |
| `/app/projects/:id/cortex` | Chat, evidencia lateral, actividad de herramientas y guardar propuesta |
| `/app/projects/:id/studio` | Planta 3D, zonas, selección, cámara y guardar distribución |
| `/app/projects/:id/simulation` | Escenarios, inputs, ejecutar, comparar y limitaciones |
| `/app/projects/:id/operations` | Lecturas, gráficas, dispositivos e incidentes |
| `/app/knowledge` | Fuentes, versión, licencia, ingesta y errores |
| `/app/settings` | Miembros y configuración permitida por rol |

Diseño: fondo grafito o claro configurable, acento esmeralda, jerarquía sobria, sensación de laboratorio científico. Usar texto “HarvestT Cortex”; no inventar un logo oficial Atlas. Español natural; evitar mostrar jerga de backend al operador.

Cada pantalla contempla carga, vacío, error recuperable, sin permisos, offline y datos parciales. Filtros en URL; formularios con errores junto al campo; navegación por teclado. Desktop prioritario para Studio y versión móvil útil para catálogo, Cortex y bitácora. Nunca dejar botones decorativos que parezcan operativos.

## 06. Fuentes e ingesta

### Registro inicial de candidatos

| Fuente oficial | Uso previsto | Integración inicial | Precaución específica |
| --- | --- | --- | --- |
| https://agrovoc.fao.org/ | conceptos agrícolas y sinónimos | conector REST o snapshot permitido | vocabulario, no receta de cultivo |
| https://cropontology.org/ | rasgos y métodos | importación versionada según formato disponible | revisar por ontología y versión |
| https://techdocs.gbif.org/en/openapi/ | identidad taxonómica | Species API; ocurrencias después | distribución no prueba aptitud en invernadero |
| https://www.fao.org/agris/ | descubrimiento bibliográfico | metadatos y enlaces según acceso disponible | no asumir permiso para texto completo |
| https://github.com/ajwdewit/pcse | evaluación de modelación | spike P2, no dependencia P0 | validar alcance y licencia del modelo |
| https://github.com/mrdoob/three.js/ | visualización web | librería frontend | activos 3D tienen licencias propias |

Estos enlaces fueron identificados en la investigación de contexto del 19 de octubre de 2026. No constituyen garantía de uptime, endpoints o términos actuales. Verificar la documentación oficial al implementar; registrar versión y fecha. No diseñar endpoints externos de memoria.

### Contrato de conector

Cada conector implementa `health`, `fetch`, `normalize`, `checkpoint` y salida con `source_id`, `external_id`, `source_version`, `retrieved_at`, `license`, `checksum`, `provenance`, `status`. Timeouts, rate limits, backoff y reanudación obligatorios. No omitir errores ni confundir respuesta vacía con éxito completo.

Estados: `pending → fetching → normalized → review_required/indexable → indexed`, con `failed`, `blocked_rights`, `stale` y `withdrawn`. Ingesta idempotente por fuente, ID externo y versión/checksum. Un cambio genera versión; no pierde evidencia citada.

Para arrancar: GBIF para identidad y AGROVOC para conceptos; corpus técnico pequeño curado por el usuario o de reutilización permitida para RAG. AGROVOC y GBIF no reemplazan manuales agronómicos. Si no hay texto permitido, entregar búsqueda bibliográfica y marcar el corpus faltante; no rellenar respuestas técnicas inventadas.

Registrar separadamente permisos de metadatos, texto, imágenes y redistribución. PDFs subidos se procesan en un worker limitado, con límites de tamaño/tipo, sin ejecutar contenido. La ingesta de URLs usa allowlist y bloqueo de direcciones privadas, redirecciones inseguras y esquemas no autorizados.

## 07. RAG y agentes

### Pipeline de recuperación

1. Autenticar usuario y resolver proyecto/tenant.
2. Interpretar intención y normalizar términos contra vocabulario conocido.
3. Recuperar texto por búsqueda léxica y semántica, filtrando permisos antes de recuperar contenido.
4. Consultar entidades estructuradas cuando la pregunta requiere comparación exacta.
5. Ordenar evidencia y preservar contexto de cultivo, etapa y sistema.
6. Componer respuesta con afirmaciones vinculadas a fragmentos.
7. Validar que referencias existen y pertenecen a evidencia accesible.
8. Guardar ejecución, versión de corpus, modelo y consumo sin exponer secretos.

Citas: ID de documento + versión + chunk + página/sección/offset cuando disponible. El usuario puede abrir el fragmento exacto. Un título o URL sin pasaje no basta para respaldar una cifra. Si no hay evidencia, responder qué falta. Si hay conflicto, mostrarlo sin promediar datos incompatibles.

### Herramientas iniciales tipadas

- `search_catalog(query, filters)` — lectura de entidades autorizadas.
- `retrieve_evidence(query, project_id, filters)` — búsqueda con permisos.
- `get_project_context(project_id)` — condiciones declaradas y observadas.
- `compare_plants(plant_ids, dimensions)` — datos con fuentes y vacíos explícitos.
- `run_scenario(project_id, model_id, inputs)` — solo modelos allowlisted y límites.
- `propose_plan(project_id, steps, evidence_refs)` — propuesta, no aplicación automática.
- `save_note(project_id, content, evidence_refs)` — exige permiso y acción explícita del usuario.

No dar SQL arbitrario, shell, navegación ilimitada o acceso genérico a secretos al agente. Las herramientas aplican autorización independientemente de lo que diga el prompt.

### Roles funcionales de agentes

Investigador, curador, planificador, simulador y supervisor. Implementar primero investigador y planificador; añadir los demás cuando existan sus herramientas. Puede ser un mismo modelo con roles distintos, sin infraestructura multiagente innecesaria.

Estado: `queued → running → needs_input/needs_review → completed`, con `failed` y `cancelled`. Presupuesto inicial configurable: máximo 8 llamadas de herramienta y timeout global de 90 segundos por ejecución interactiva; los jobs científicos largos son asíncronos. Registrar acciones y razones resumidas, no cadenas privadas de razonamiento. Reintentar solo operaciones seguras; escrituras con clave de idempotencia.

Los documentos recuperados son datos no confiables: cualquier instrucción embebida para cambiar permisos, ignorar reglas o ejecutar herramientas se trata como texto. La política del agente y las credenciales nunca se incorporan al corpus.

### Evaluación mínima de RAG

Crear 30 casos versionados: 10 respondibles con evidencia, 5 sin evidencia, 5 con conflicto/contexto distinto, 5 de aislamiento entre tenants y 5 de inyección documental. Medir apoyo de afirmaciones y corrección con revisión humana en una muestra; existencia de cita no equivale a verdad.

Gates: 100% referencias resolubles; cero fugas entre tenants; cero invenciones de referencias; abstención en los 5 casos sin evidencia; al menos 8/10 respuestas respondibles sustentadas según rúbrica. Mantener casos de evaluación separados de ejemplos usados para ajustar prompts.

## 08. Visualización y simulación

### P0: Studio ilustrativo

Planta procedural simple o activo con licencia comprobada; órbita, zoom, selección y tres etapas ilustrativas. Layout de zonas y posiciones con guardado. No generar geometría por cada lectura: actualizar estado con límites para mantener fluidez. Mostrar aviso “Representación ilustrativa; no predice crecimiento”. Fallback 2D cuando no exista soporte gráfico adecuado.

### P0: invernadero virtual

Modelo didáctico versionado con semilla determinista, escenario base, subida de temperatura, pérdida de sensor y recuperación. Variables iniciales: temperatura del aire y humedad relativa; otras solo si su significado/unidad están implementados. Inputs limitados y validación de rangos físicos generales, sin presentarlos como rangos óptimos de cultivo.

Para visualizar ventilación: regla didáctica configurable con retardo y saturación, documentada y separada del agente. Etiqueta persistente “Simulación didáctica, sin calibración agronómica”. No estimar rendimiento comercial, enfermedad o consumo de agua con fórmulas arbitrarias.

Cada ejecución guarda inputs, semilla, versión del modelo, fecha, outputs, límites y autor. Comparar escenarios alineando variable, unidad y horizonte. Prohibir comparar escenarios de modelos incompatibles sin aviso explícito.

### P2: modelo científico

Spike de adecuación de PCSE u otro modelo abierto para los cultivos/sistemas seleccionados. Entregable: variables requeridas, disponibilidad de parámetros, licencia, supuestos, datos de calibración, validación fuera de muestra y error medido. Integrar únicamente el alcance respaldado; modelo 3D y modelo científico permanecen desacoplados.

## 09. API interna mínima

Prefijo `/api/v1`. La IA deberá generar OpenAPI desde implementaciones reales y contratos de frontend. Evitar spec paralela que no se actualice.

| Método/ruta | Propósito | Autorización |
| --- | --- | --- |
| GET `/plants` y `/plants/{id}` | catálogo paginado y ficha | miembro autorizado |
| GET `/sources/{id}` | metadatos y estado | visibilidad de fuente |
| POST `/projects` | crear proyecto | editor/admin |
| GET/PATCH `/projects/{id}` | leer/modificar | scope tenant y rol |
| GET/POST `/projects/{id}/observations` | bitácora | lectura/escritura por rol |
| GET/PUT `/projects/{id}/layout` | Studio persistente | editor para escritura |
| POST `/projects/{id}/conversations` | nueva conversación | miembro |
| POST `/conversations/{id}/messages` | consulta con recuperación | acceso al proyecto |
| GET `/agent-runs/{id}` | ejecución, evidencia y estado | autor o rol autorizado |
| POST `/projects/{id}/scenario-runs` | ejecutar escenario | editor |
| GET `/scenario-runs/{id}` | resultados | scope proyecto |
| POST `/telemetry/readings` | recibir eventos | credencial de dispositivo limitada |
| GET `/projects/{id}/readings` | datos paginados/agregados | scope proyecto |
| GET/PATCH `/projects/{id}/alerts/{id}` | ver/reconocer incidente | rol autorizado |
| POST `/knowledge/imports` | ingesta | curador/admin |
| POST `/projects/{id}/exports` | crear expediente | miembro autorizado |
| GET `/health/live`, `/health/ready` | proceso/dependencias | sin información sensible |

Errores uniformes con `code`, `message`, `request_id` y detalles seguros. Límites en paginación y uploads; fechas UTC en API y zona configurable en UI. Conflictos de edición: versión/ETag, respuesta 409 y aviso al usuario. Lecturas históricas con downsampling, sin cargar millones de puntos al navegador.

## 10. Backlog ejecutable

Cada ticket termina con código, validación proporcional, documentación y evidencia del criterio. Estados iniciales: TODO. Si ya existe una función, verificarla y reutilizarla antes de reconstruirla.

### HVT-001 · Auditoría y bootstrap — P0 / QW0

Dependencias: ninguna. Inspeccionar README, AGENTS.md, git status, estructura, dependencias, migraciones y configuración sin imprimir secretos. Identificar frontend/backend, despliegue actual, funcionalidades reutilizables y fallas reproducibles. Entregar `docs/REPO_AUDIT.md` y plan de cambios. Aceptación: comandos reales de arranque y fallos documentados; ningún archivo del usuario sobrescrito.

### HVT-002 · Base ejecutable — P0 / QW1

Depende de 001. Configurar API, web, PostgreSQL y migraciones; solo crear lo ausente. `.env.example` sin secretos, lockfiles y health checks. Aceptación: entorno limpio arranca siguiendo README, API ready depende de DB y build frontend pasa.

### HVT-003 · Identidad y tenants — P0 / QW1

Depende de 002. Implementar/reutilizar login, membresías y roles admin/editor/viewer. Scope backend en todas las entidades privadas, workers y almacenamiento. Aceptación: usuario A no puede leer ni modificar recursos B incluso cambiando IDs; viewer no escribe; catálogo global no mutable por editor. Auth de demo no puede activarse en producción.

### HVT-004 · Shell y estados UI — P0 / QW1

Depende de 002. Navegación, diseño, errores, vacíos y carga. Aceptación: rutas reales, navegación por teclado y sin botones de acción muertos; vista móvil funcional para catálogo/bitácora.

### HVT-005 · Catálogo y evidencia — P0 / QW1

Depende de 003/004. Modelos Species, Cultivar, Source y TraitAssertion; tres especies iniciales con identidad trazable. Búsqueda y ficha. Aceptación: origen visible, campos sin evidencia vacíos y filtros funcionales. No cargar cifras técnicas desde la memoria del LLM.

### HVT-006 · Proyectos y bitácora — P0 / QW1

Depende de 003/005. Crear proyecto, asociar planta, editar objetivos, guardar observación. Aceptación: recarga conserva datos; validación área positiva; auditoría de cambios; aislamiento por tenant. Esta entrega cierra el primer quick win.

### HVT-007 · Registro y conectores — P0 / QW2

Depende de 005. Conectores acotados de GBIF y AGROVOC, con fixtures autorizados para pruebas. Aceptación: ejecución real documentada o bloqueo de acceso explícito; backoff, cache age, idempotencia y error visible. No afirmar “conectado” si solo funciona el fixture.

### HVT-008 · Ingesta documental — P0 / QW2

Depende de 003/007. Upload autorizado, extracción, checksum, versiones, chunks y permisos. Aceptación: documento repetido no duplica índice; ubicación de fragmentos verificable; archivo inválido no bloquea worker; derechos desconocidos bloquean indexación de texto externo.

### HVT-009 · Recuperación híbrida — P0 / QW2

Depende de 008. Texto completo y embeddings mediante adaptador. Aceptación: búsqueda filtra tenant y documento antes de devolver fragmentos; reindexación no mezcla dimensiones/versiones de embeddings; borrado/revocación elimina acceso también desde caché.

### HVT-010 · Cortex con citas — P0 / QW2

Depende de 009/006. Chat por proyecto, respuesta, evidencias, historial y cancelación. Aceptación: abrir cita lleva al pasaje real; sin proveedor se informa estado o modo fixture; no se inventa una respuesta “en vivo”. Ejecutar evaluación de sección 07.

### HVT-011 · Herramientas y agentes — P0 / QW5

Depende de 010; añadir run_scenario después de 014. Investigador y planificador, herramientas tipadas y presupuesto. Aceptación: UI muestra herramientas ejecutadas y resultados; permiso validado en cada herramienta; propuesta no modifica proyecto sin acción explícita.

### HVT-012 · Planta 3D — P0 / QW3

Depende de 004/005. Tres etapas ilustrativas, cámara, selección y ficha vinculada. Aceptación: licencia de activo o autoría procedural registrada, fallback 2D, sin claims predictivos. Medir fluidez en dispositivo documentado, objetivo 30 FPS durante interacción representativa.

### HVT-013 · Layout de invernadero — P0 / QW3

Depende de 006/012. Zonas, posiciones y guardado en API. Aceptación: recarga reconstruye escena; coordenadas y medidas coherentes; objetos fuera de límites generan validación; sin colisiones costosas innecesarias en P0.

### HVT-014 · Motor virtual — P0 / QW4

Depende de 006. Escenarios deterministas, start/pause/reset del run, parámetros y versión. Aceptación: mismos inputs/semilla/version producen resultados iguales; run no afecta otro proyecto; límites de CPU/tiempo y cancelación funcionales.

### HVT-015 · Telemetría e incidentes — P0 / QW4

Depende de 014/003. Lecturas, gráficas y reglas didácticas. Aceptación: reenvío de event_id no duplica; desconexión muestra stale; histéresis/cooldown evita tormenta de alertas; reconocimiento queda auditado. Una regla demostrativa no se etiqueta como recomendación agronómica.

### HVT-016 · Comparador de escenarios — P0 / QW5

Depende de 014/015. Escenario A/B, inputs, resultados y diferencias. Aceptación: persistencia y unidades consistentes; etiquetas de origen; sin estimaciones económicas no respaldadas.

### HVT-017 · Exportación de expediente — P0 / QW5

Depende de 006/010/016. Exportar Markdown y JSON del proyecto, fuentes, bitácora y escenarios. Aceptación: solo datos autorizados, referencias incluidas y modo simulado visible. PDF queda P1 si retrasa demo.

### HVT-018 · Endurecimiento y demo — P0 / cierre

Depende de quick wins completos. Ejecutar gates críticos, logs, límites de API/IA, backups y runbook. Aceptación: recorrido sección 13 reproducible desde seed, sin errores de consola que rompan flujos, reporte de límites reales. Desplegar staging solo con credenciales y permisos del entorno; no asumir autorización de producción.

### HVT-019 · Operación e ingesta ampliada — P1

Depende de 018. Curación humana, importaciones incrementales, deduplicación y retiro de fuentes; observaciones con imágenes y trazabilidad. Aceptación: migración entre versiones de corpus y permisos probada; cobertura medida por cultivo y etapa.

### HVT-020 · Grafo y ontologías — P1

Depende de 019. Relaciones entre especie, rasgo, etapa, evidencia y ciclo; navegación visual y consultas de relaciones. Comenzar con tablas de relaciones; usar motor especializado solo ante necesidad comprobada. Aceptación: enlaces con procedencia y consultas que mejoren casos concretos frente al baseline.

### HVT-021 · Validación científica — P2

Depende de datos piloto suficientes. Comparar modelos y documentar aplicabilidad, calibración y error. Aceptación: revisión agronómica y evaluación fuera de muestra; límites por especie/sistema explícitos. Sin esos datos permanece experimental.

### HVT-022 · Adaptador físico — P2

Depende de 015 y definición de dispositivos. Provisionar credenciales por dispositivo, adaptador MQTT/HTTP, buffer y reconexión. Aceptación: replay, duplicados y desconexiones sin pérdida silenciosa ni cruces; separar sensor real del simulado.

### HVT-023 · Control supervisado — P2

Depende de 022, revisión de hardware y protocolos operativos. Comandos tipados con expiración, confirmación, idempotencia, límites, override y estado seguro local. Aceptación: pérdida de nube no deja actuadores indefinidamente activos; agente no puede saltar interlocks. No se entrega control físico por simplemente habilitar una herramienta del LLM.

### HVT-024 · Integración Atlas ONE — P2

Depende de 018 y contrato de integración acordado. Exportar ciclos, insumos, producción e incidencias mediante API/eventos versionados. Aceptación: mapeos e idempotencia probados, propiedad de datos definida; sin duplicar finanzas/ERP en HarvestT.

## 11. Seguridad, confiabilidad y operación

- Roles y scopes se aplican en servidor, herramientas, worker, búsqueda y exportaciones.
- Catálogo público separado del conocimiento privado; cachés incluyen tenant y versión de permisos.
- Credenciales de LLM, DB y dispositivos solo en servidor; nunca variables públicas del bundler ni logs.
- Validar URLs de ingesta para prevenir acceso a servicios internos; limitar tamaño, formatos y tiempos.
- Fuentes externas y documentos no pueden cambiar instrucciones o permisos de agentes.
- Login con mecanismo mantenido y hashing de contraseñas vigente si se usa login propio. No migrar auth sin necesidad.
- CORS explícito, cookies/CSRF según arquitectura, TLS en staging y rotación de secretos documentada.
- Límites por usuario y tenant para mensajes, tokens, jobs, documentos y simulaciones. Coste medido donde el proveedor lo permita; no inventar coste cero para inferencia local.
- Logs con request_id, run_id y job_id; redactar datos sensibles. No almacenar texto completo privado en logs por defecto.
- Métricas: tasa de error, latencia de API y recuperación, cola, tiempo de respuesta IA, consumo por ejecución y freshness de conectores.
- Backup de DB/archivos y restauración de prueba antes de piloto; migrations reversibles cuando sea viable.
- Revocar fuente/documento debe impedir futuras recuperaciones y avisar si una cita histórica ya no está disponible.
- Sin Kubernetes, múltiples bases especializadas o servicios distribuidos hasta existir necesidad medida.

## 12. Validación y definición de terminado

### Pruebas críticas

1. Dos tenants con los mismos nombres de proyecto: aislamiento API, RAG, worker, caché y exportación.
2. Permisos viewer/editor/admin; intentos de acceso por ID ajeno.
3. Ingesta duplicada y actualizada: idempotencia y versión de citas.
4. Documentos con instrucciones maliciosas: no ejecutan herramientas.
5. Fuente caída, timeout y rate limit: error recuperable y caché etiquetada.
6. Pregunta sin evidencia y fuentes incompatibles: abstención/conflicto.
7. Telemetría duplicada, tardía y desconexión: integridad y estado correcto.
8. Simulación determinista, cancelada y fuera de rango.
9. Recorrido E2E: login → catálogo → proyecto → nota → Cortex → escena → escenario → exportar.
10. Build y migración desde una base vacía; smoke test sobre staging si existe.

Usar pytest/httpx para backend y herramienta E2E compatible con el repo. No generar cientos de tests que repiten getters; priorizar riesgos anteriores. Reportar pruebas realmente ejecutadas y limitaciones del entorno.

### Objetivos iniciales medibles

- Catálogo: p95 < 800 ms en conjunto demo y entorno documentado.
- Recuperación local: p95 < 2 s con corpus y recursos registrados; separar tiempo del LLM.
- UI Studio: objetivo 30 FPS en equipo de referencia; fallback funcional.
- Respuestas IA: mostrar progreso/cancelar; no bloquear navegación durante jobs.
- 100% escenarios y lecturas sintéticas etiquetados; 100% cifras agronómicas en demo con referencia o ausencia explícita.
- Cero secretos en bundle/commits; cero fallos de aislamiento conocidos en release.

Son metas de aceptación propuestas, no benchmarks ya obtenidos. Reajustar con evidencia y aprobación de producto si se descubre una limitación real.

### Definition of Done por ticket

Función operativa; datos persistentes donde corresponde; permisos; errores/estados vacíos; validación proporcional ejecutada; documentación de uso; migraciones/seed idempotente si aplica; evidencia visual o pasos reproducibles; sin TODO oculto detrás de botón “funcional”.

## 13. Guion de demo de 7 minutos

- 0:00–0:45: abrir HarvestT, explicar estado de fuentes y modo demo.
- 0:45–1:30: buscar lechuga y mostrar identidad, evidencia y datos todavía desconocidos.
- 1:30–2:15: crear proyecto, registrar objetivo y una observación; recargar.
- 2:15–3:30: preguntar a Cortex algo respondible en el corpus curado, abrir el pasaje citado y guardar una propuesta. No fijar una pregunta agronómica antes de verificar evidencia disponible.
- 3:30–4:30: explorar planta 3D y distribución; indicar carácter ilustrativo.
- 4:30–5:30: lanzar escenario virtual de temperatura y observar alerta; desconectar sensor simulado y mostrar stale.
- 5:30–6:15: comparar dos escenarios con inputs y límites.
- 6:15–7:00: exportar expediente; explicar que el siguiente paso sustituye dispositivos virtuales por adaptadores reales.

Plan B: fixture determinista con badge persistente si falla internet o proveedor. No presentar replay como ejecución actual. Botón de reset limitado al tenant demo. Preparar una lista visible de “funcional / simulado / pendiente de validar”.

## 14. Entregables del repositorio

- README con comandos verificados y arquitectura breve.
- `docs/REPO_AUDIT.md`: hallazgos y reutilización.
- `docs/STATUS.md`: tickets completados, pendientes, bloqueos y siguiente incremento.
- `docs/ARCHITECTURE.md` y ADRs: decisiones y alternativas.
- `docs/DATA_SOURCES.md`: conector, licencia, términos, versión y derechos.
- `docs/AI_BEHAVIOR.md`: herramientas, permisos, presupuestos y abstención.
- `docs/DEMO.md`: recorrido, reset y modo de contingencia.
- `docs/LIMITATIONS.md`: restricciones científicas y técnicas visibles.
- `docs/HARDWARE_CONTRACT.md`: esquema telemetría v1 y evolución.
- `docs/runbooks/`: deploy, rollback, backup, reindexación y proveedor caído.
- `.env.example`, migraciones, fixtures permitidos y evaluación RAG.
- Inventario de dependencias/licencias y activos; ninguna API privada es obligatoria para fixture.

## 15. Prompt maestro para la IA de desarrollo

Copia este bloque junto con el archivo completo:

```text
Actúa como responsable de ingeniería de HarvestT Cortex. Lee docs/HARVESTT_TASK_PACK.md (o el archivo adjunto) y conviértelo en incrementos de software operativos. El objetivo es construir primero la capa de inteligencia, conocimiento agrícola, RAG, agentes, 3D y telemetría virtual; el hardware viene después.

Empieza inspeccionando el repositorio y sus instrucciones. Respeta cambios existentes y no reescribas componentes que ya funcionen. No asumas que el proyecto está vacío. Identifica stack, auth, migraciones y comandos reales. Si el repo está vacío, inicializa la arquitectura propuesta con versiones compatibles verificadas.

Implementa QW0 y después QW1 completo: catálogo de tres especies, fichas con procedencia, creación de proyecto y bitácora persistente, con autenticación y aislamiento por organización. Evita dedicar toda la sesión a documentación: tras la auditoría breve, construye el primer recorrido vertical. Usa diseño sobrio de laboratorio, español y acento esmeralda.

Reglas: API-first; permisos backend; secretos fuera del cliente; valores agronómicos solo con evidencia; datos ausentes explícitos; fixtures, ilustración 3D y simulaciones claramente etiquetados. Cada conector y dependencia registra procedencia/licencia. No inventes endpoints externos, citas, benchmarks, acceso o resultados de pruebas.

Implementa con criterio de monolito modular y adaptadores. Usa modos fixture/connected separados y los mismos contratos de API. No agregues servicios distribuidos innecesarios. No integres hardware real ni control físico en esta fase.

Después de cada incremento ejecuta validaciones críticas, corrige los fallos y actualiza docs/STATUS.md. Informa resultado visible, archivos principales, comandos ejecutados, tests realmente aprobados, limitaciones y próximo ticket. Si falta una credencial, deja un adaptador y un modo fixture honesto; continúa con trabajo no bloqueado. No detengas todo el proyecto por un conector externo caído.

No marques terminado un módulo con botones sin acción o datos no persistentes. No publiques en producción ni borres bases/recursos existentes sin autorización correspondiente. Entrega QW1 funcionando y los pasos exactos para revisarlo. Continúa luego con QW2 cuando se solicite el siguiente incremento.
```

## 16. Prompts de continuación

### QW2 — Conocimiento y RAG real

```text
Revisa STATUS y ejecuta HVT-007 a HVT-010. Reutiliza el catálogo y permisos existentes. Integra GBIF/AGROVOC según documentación oficial y un corpus técnico de uso permitido. Implementa extracción versionada, búsqueda híbrida, citas a pasajes, historial por proyecto y abstención. Mantén fixture independiente del proveedor real. Ejecuta la batería de 30 casos definida en el task pack y reporta fallos sin maquillarlos. Termina con una pregunta respondible citada, una sin evidencia y una prueba de aislamiento demostrables.
```

### QW3 — Studio 3D

```text
Ejecuta HVT-012 y HVT-013. Construye una representación ilustrativa de planta por etapas, controles de cámara y distribución persistente de invernadero. Usa activos con licencia verificada o geometría procedural propia. No conectes apariencia a predicciones biológicas inventadas. Incluye fallback 2D, selección accesible y medición de rendimiento en entorno documentado. Entrega una escena guardable y recargable vinculada a un proyecto real.
```

### QW4 — Invernadero virtual

```text
Ejecuta HVT-014 y HVT-015. Implementa un motor determinista con semilla y versión, telemetría v1, gráficas, desconexión de sensor y alertas didácticas con histéresis. Todo dato debe indicar source=simulated. Prueba duplicados, eventos tardíos, cancelación y aislamiento. Mantén el contrato preparado para dispositivos reales sin agregar control físico. Entrega un escenario reproducible de temperatura, pérdida de señal y recuperación.
```

### QW5 — Agentes y demo integrada

```text
Ejecuta HVT-011 y HVT-016 a HVT-018. Conecta herramientas existentes a investigador/planificador con permisos, presupuesto y trazabilidad. Guarda planes como propuestas revisables. Añade comparación de escenarios y expediente Markdown/JSON. Recorre la demo de 7 minutos, corrige fallos y documenta qué es real, simulado y pendiente. Entrega comandos de ejecución, reporte de validaciones y staging solo si el entorno está autorizado.
```

### Revisión antes del piloto

```text
Audita el producto contra los gates del task pack. Prioriza fugas entre tenants, secretos, citas sin apoyo, valores agronómicos inventados, confusión fixture/live y control de dispositivos. Corrige defectos críticos antes de funciones nuevas. Comprueba restauración, revocación de documentos y límites de coste. Reporta evidencia y bloqueos reales. No declares validación científica basándote en que la animación o el chat funcionen.
```

## 17. Plantilla de cierre de cada incremento

```text
Incremento y tickets:
Resultado visible:
Cómo probarlo (comandos/pasos verificados):
Validaciones ejecutadas y resultados:
Datos reales / simulados / ilustrativos:
Fuentes y dependencias nuevas:
Permisos y aislamiento revisados:
Limitaciones y bloqueos:
Cambios de arquitectura justificados:
Siguiente ticket recomendado:
```

**Criterio rector:** el primer valor aparece cuando HarvestT guarda conocimiento y decisiones con evidencia. La robustez se demuestra mediante persistencia, aislamiento, trazabilidad y recorridos completos; la expansión del catálogo y la inteligencia científica se apoyan en esa base.

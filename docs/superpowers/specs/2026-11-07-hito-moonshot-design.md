# HarvestT — Hito Moonshot (M1–M6)

Fecha: 2026-11-07 · Estado: **completo, pendiente de aprobación del fundador** · Especificación previa: `2026-10-19-hito-visual-design.md` (V1–V6, en producción) · Producto: `docs/HARVESTT_TASK_PACK.md` · Mockups de la conversación: `.superpowers/brainstorm/86851-1794078173/content/` (`moonshot.html`, `vision-ab.html`, `ontologia*.html`, `bancos.html`, `gis.html`, `red-confianza.html`, `harvestt-org.html`)

## 1. Intención

HarvestT se va a convertir en una startup. La plataforma tiene que **mostrar casi todo el moonshot** y convencer a la vez a inversionistas, investigadores e instituciones aliadas.

**El moonshot, en palabras del fundador:** un sistema estilo nodos blockchain que comparte datos confiables sobre el crecimiento de cultivos, con hardware, software y una capa de IA, más **harvestt.org** para que cualquiera acceda a esos datos.

**Lectura acordada:**

- Cada invernadero HarvestT es un **nodo**: mide, firma y publica sus datos.
- La **red de confianza** impide que un dato se altere sin que se note.
- **Cortex** (software + IA) interpreta los datos con una **ontología** común y conocimiento externo: bancos de plantas y GIS.
- **harvestt.org** es el portal abierto donde se consultan, verifican, descargan y citan.

Dos dominios con roles distintos:

- **harvestt.com / Cortex** es el producto comercial: hardware y plataforma.
- **harvestt.org** es el bien común de datos abiertos. Da credibilidad científica y atrae nodos.

### Por qué ahora

V1–V6 dejó una plataforma operando con datos honestos. El siguiente paso para levantar la startup es hacer **visible y verificable** el resto de la visión, sin prometer lo que todavía no existe.

### Criterio de éxito

Un recorrido donde una persona ajena al proyecto entiende el moonshot completo en la página Visión. Después navega la ontología, ve una especie con datos de bancos públicos, explora un mapa de México, verifica una lectura firmada y descarga un dataset. **Cada pieza muestra honestamente si está operando, en construcción o es visión**, y ningún número es inventado.

## 2. Metas, no-metas y anti-metas

**Metas**

- M1 Página Visión pública (globo vivo + recorrido).
- M2 Ontología robusta con propuestas de la comunidad.
- M3 Conectores a bancos de datos públicos de plantas.
- M4 Mapa GIS de México.
- M5 Red de confianza: firma, encadenamiento, sello y verificación.
- M6 harvestt.org y el modelo open core.

**No-metas en este hito**

- Hardware físico nuevo o firmware de producción.
- Token o criptomoneda.
- Puntos canjeables: los operadores ganan **reputación y acceso** ahora; los puntos se diseñan cuando haya clientes.
- Escribir datos en los bancos externos.
- Mapa global: el mapa empieza en México y se abre al mundo después.
- Copiar capas ráster completas (WorldClim, SoilGrids) a la base de datos.

**Anti-metas**: el hito fracasa aunque funcione si ocurre cualquiera de estas cosas.

- Una cifra de la página Visión o de harvestt.org es inventada o «maquillada». Si no hay dato, se muestra «pronto» o «Sin datos suficientes».
- La red de confianza se presenta como blockchain o como hardware real cuando las firmas vienen de nodos simulados. Hoy no hay dispositivos físicos firmando: las firmas de nodos virtuales llevan la etiqueta SIMULADO.
- Un dato importado de un banco sobrescribe un dato capturado por el equipo.
- Se publica la ubicación exacta de un nodo privado.
- Un término de la ontología publicado se borra y deja datos huérfanos.

## 3. Restricciones vigentes

- Reglas de `docs/INTEGRIDAD_CIENTIFICA.md`: taxonomía de origen, ausente nunca es cero, fórmula visible, licencia y atribución.
- Mismo stack: FastAPI, SQLAlchemy/Alembic, PostgreSQL 17, React/TS/Vite/Tailwind, three.js, Railway, bucket S3. **Una dependencia nueva aceptada:** MapLibre GL JS (open source) para mapas.
- Proceso por fase, como V1–V6: plan detallado contra el código real, rama `feat/hito-m<n>-<tema>`, TDD, `make test` + typecheck + vitest + build en verde, migraciones `upgrade → check → downgrade → upgrade` en Postgres 17, revisión visual (claro, oscuro, 375 px), merge y despliegue **solo con autorización explícita**.
- Interfaz en español; sistema de diseño «Salvia cristal».
- Las conexiones externas deben degradar con honestidad: «Fuente no disponible · última copia del…».

## 4. Fases y orden

| Fase | Contenido | Depende de |
|---|---|---|
| M1 | Página Visión | — |
| M2 | Ontología | — |
| M3 | Bancos de datos de plantas | M2 (accesión, identificadores externos) |
| M4 | Mapa GIS de México | M2 (Lugar), M3 (presencia GBIF) |
| M5 | Red de confianza | M2 (Nodo y medición) |
| M6 | harvestt.org + open core | M2–M5 |

M1 va primero porque es la pieza de presentación y no depende de nada. Sus etiquetas de estado se actualizan conforme avanzan las demás fases. M2 es la base del resto.

## 5. M1 · Página Visión

Página **pública** en `/vision`, sin sesión, enlazada desde la vitrina. Se mudará a harvestt.org en M6. Combina las direcciones A (globo vivo) y B (recorrido), según `vision-ab.html`.

1. **Encabezado:** frase de misión, globo 3D con three.js (sin dependencias nuevas) y nodos.
   - El nodo de CDMX late como *operando*.
   - Los nodos futuros se dibujan punteados como *visión*.
   - Leyenda de estados: **● Operando · ◐ En construcción · ○ Visión**.
2. **Cuatro cifras reales con `OriginBadge`:** prototipos, nodos operando, lecturas firmadas y medallas. Una cifra sin dato muestra «pronto».
3. **Recorrido con scroll**, cada capa con su etiqueta de estado:
   - 2017–18: prototipos y medallas, con un modelo 3D girando.
   - Hoy: Cortex.
   - Capa 1: ontología, bancos y GIS.
   - Capa 2: red de confianza.
   - Capa 3: harvestt.org.
4. **Llamadas a la acción:** «Únete como nodo» y «Habla con el equipo».
5. **Estado de cada capa calculado, no escrito a mano.** Un endpoint público (p. ej. `GET /api/v1/public/vision`) devuelve el estado de cada capa y las cifras, derivados de lo que existe en la base.

**Decisión del builder:** las reglas exactas que convierten «existe X» en «operando» deben documentarse en el plan.

El diagrama del ecosistema (`moonshot.html`: nodos → red de confianza → Cortex → harvestt.org) fue aprobado y se incluye en la página.

## 6. M2 · Ontología

### 6.1 Modelo

Vocabulario propio de HarvestT, en español, con **seis dominios** alrededor del **ciclo de cultivo**. Cada término propio apunta a su equivalente en un estándar internacional.

| Dominio | Alcance | Estándares de equivalencia |
|---|---|---|
| Organismo | familia › género › especie › cultivar › **accesión** | NCBI Taxonomy, World Flora Online |
| Planta y etapas | órganos, etapas fenológicas | Plant Ontology, escala BBCH |
| Rasgos | variable + unidad | Crop Ontology, UCUM |
| Ambiente | clima, suelo, luz, **sistema de cultivo** | PECO, ENVO, AGROVOC |
| Lugar | región, zona climática | GeoSPARQL, Köppen |
| Nodo y medición | dispositivo › sensor › lectura › firma | SOSA/SSN (W3C), PROV-O |

**Cada término tiene:**
- identificador permanente `HVT:000000`
- etiqueta y definición en español
- dominio y padre (jerarquía)
- equivalencias externas (esquema, identificador, URL, tipo de correspondencia: exacta, cercana o amplia)
- estado: `propuesto`, `en revisión`, `publicado`, `rechazado` u `obsoleto` (con `reemplazado_por`)
- quién lo propuso y quién lo revisó
- versión de la ontología en la que se publicó

### 6.2 Gobernanza

Decisión del fundador: **la comunidad propone y el equipo revisa.**

1. **Proponer.** Un usuario con cuenta propone un término.
2. **Equivalencias.** Cortex sugiere equivalencias externas. En este hito, la sugerencia es una búsqueda en los vocabularios cargados, no un LLM.
3. **Revisión.** El equipo (superadmin o un rol nuevo de curador) aprueba, pide cambios o rechaza, siempre con una razón visible.
4. **Publicación.** Asigna el ID permanente y sube la versión de la ontología.

**Un término publicado nunca se borra:** se marca obsoleto y apunta a su reemplazo. Cada término da crédito visible a quien lo propuso.

### 6.3 Migración del texto libre

Hoy `TraitAssertion.variable`, `TraitAssertion.growth_stage`, `TraitAssertion.cultivation_system`, `CropCycle.stage` y `Project.system` son texto libre. Se agregan referencias a términos y se mapean los valores existentes. **Lo que no se pueda mapear queda como «Desconocido»;** no se inventan correspondencias. El texto original se conserva para auditoría.

### 6.4 Pantallas y salidas

- **`/app/ontologia`** (`ontologia-flujo.html`): árbol por dominio, buscador y ficha de término. La ficha muestra equivalencias, en qué datos se usa, quién lo propuso, mini-grafo de vecinos y el botón «Proponer término». Más una bandeja de revisión para el equipo.
- **El grafo de V6 incorpora los términos** como nodos.
- **Exportación** de la versión publicada en OWL (Turtle) y JSON, con licencia CC-BY 4.0.

### 6.5 Carga inicial

Un vocabulario semilla curado por el equipo que cubre lo que la plataforma ya usa: las variables del catálogo y la telemetría, etapas, sistemas, especies del catálogo y tipos de nodo. **Decisión del builder:** el tamaño de la semilla. El «412 términos» de los mockups es un ejemplo, no una meta.

## 7. M3 · Bancos de datos de plantas

Decisión del fundador: empezar con **bancos de datos públicos**. Por ahora no hay convenios con bancos de germoplasma.

| Fuente | Aporta | Fase |
|---|---|---|
| GBIF | presencia georreferenciada de la especie | M3 |
| Genesys | accesiones de germoplasma (conteos, país de origen, estado biológico) | M3 |
| World Flora Online | nombre aceptado y sinónimos | M3 |
| Wikidata / Wikimedia Commons | nombres comunes, identificadores cruzados, imágenes con licencia | M3 |
| USDA GRIN | accesiones y evaluaciones | después de M3 («en construcción») |
| CIMMYT, INIFAP/CNRG | germoplasma mexicano | requiere alianza («visión») |

### 7.1 Comportamiento

- **Conector por fuente** con un contrato común: buscar especie, traer registros, normalizar a la ontología y guardar con procedencia (fuente, licencia, fecha de consulta, identificador externo).
- **Copia local** de lo importado (identidades, conteos, accesiones resumidas, puntos de presencia agregados) para que la ficha funcione aunque la fuente no responda. En ese caso se muestra «Fuente no disponible · última copia del <fecha>».
- **Solo lectura** hacia las fuentes.
- **Lo importado nunca sobrescribe lo capturado por el equipo.** Ambos se muestran lado a lado, cada uno con su origen (`sourced`).
- **Sincronización** por acción del superadmin desde el panel de conectores, y opcionalmente programada.
  - Restricción: sin workers nuevos, salvo que el plan lo justifique.
  - Decisión del builder: el mecanismo (por ejemplo, un comando o un endpoint protegido invocado por un cron de Railway) y los límites de tasa por fuente.
- **Respeto de licencias:** solo se importa y muestra lo que la licencia de cada registro permite, y la atribución es visible.

### 7.2 Pantallas (`bancos.html`)

- **Ficha de especie, sección nueva «Bancos de plantas y distribución»:**
  - chips de identidad externa
  - mini-mapa de presencia GBIF con los nodos encima
  - accesiones por banco, país y estado biológico
  - acción «Usar en mi ciclo», que vincula una accesión a un ciclo de cultivo (dominio Organismo › accesión)
- **`/app/fuentes`** (superadmin): tabla de conectores con aporte, licencia, última sincronización, estado (activo / en construcción / requiere alianza) y errores.

## 8. M4 · Mapa GIS de México

Decisión del fundador: **México primero, global después.**

**`/app/mapa`** (`gis.html`), con MapLibre GL JS y mapa base de OpenStreetMap. Pregunta guía: *«¿qué puedo cultivar aquí y quién ya lo cultiva?»*

**Capas:**

| Grupo | Capas |
|---|---|
| HarvestT | nodos, mis proyectos |
| Biodiversidad | presencia de la especie (GBIF, de M3), accesiones por origen (Genesys) |
| Ambiente | temperatura y precipitación (WorldClim), zonas Köppen, suelo (SoilGrids: pH, textura), uso de suelo (INEGI) |
| México (CONABIO) | capas de biodiversidad pertinentes |

Decisión del builder: qué capas concretas de CONABIO, según licencia y disponibilidad.

**Clic en un punto** muestra:
- clima, suelo y zona climática, cada valor con fuente
- nodos y proyectos cercanos
- registros de la especie cerca
- «Crear proyecto aquí»

**Aptitud de una especie en un punto:** se calcula **solo** si el catálogo tiene rangos con fuente para las variables involucradas, con fórmula visible. Si no, «Sin datos suficientes». Hoy esa será la respuesta honesta.

**Ubicación de proyectos:** `Project.location` hoy es texto libre. Se agregan coordenadas opcionales (latitud, longitud) y una referencia a un término Lugar. El texto actual se conserva.

**Ráster:** se consulta desde servicios públicos o se muestrea por punto. No se copian capas completas.

**Privacidad:** la ubicación de proyectos y nodos privados se muestra solo a su organización. En vistas públicas se redondea. Decisión del builder: la precisión de redondeo, que debe documentarse.

**PostGIS:** no se requiere al inicio (coordenadas + GeoJSON). Decisión del builder si el plan lo justifica y Railway lo soporta.

**Dataset GIS propio**, exportable y publicado en M6:
- `harvestt-nodos.geojson`
- `harvestt-ciclos.geojson`
- `harvestt-lecturas.parquet` (cuando exista M5)

## 9. M5 · Red de confianza

Decisión del fundador: **reputación y acceso para los operadores de nodos ahora; puntos canjeables después; sin token.** Diseño en `red-confianza.html`.

### 9.1 Mecanismo

1. **Identidad de nodo:** cada nodo (dispositivo) tiene un par de llaves. La pública se registra en HarvestT y la privada nunca sale del dispositivo. Los nodos virtuales de hoy generan y guardan su llave en el servidor, y por eso sus firmas se etiquetan **SIMULADO**.
2. **Firma de lecturas:** cada lectura (contrato de telemetría v1 existente) se firma sobre una serialización canónica.
3. **Encadenamiento:** las lecturas aceptadas se agrupan en bloques secuenciales por red. Cada bloque contiene el hash del anterior y la raíz de Merkle de sus lecturas.
4. **Sello:** cada periodo (por ejemplo, cada hora) se publica la huella de la cadena en un registro público de solo anexado.
5. **Verificación:** cualquiera, sin cuenta, comprueba que una lectura pertenece a un bloque, que la firma corresponde al nodo y que la cadena es íntegra hasta el sello.
   - Resultado ✅ «Este dato no ha sido alterado».
   - Resultado ⚠️ «La huella no coincide».

Ninguna lectura se reescribe. Las correcciones son registros nuevos que referencian al original.

### 9.2 Más adelante

Anclar los sellos en una blockchain pública (por ejemplo, Bitcoin vía OpenTimestamps) para que **ni HarvestT pueda reescribir la historia**. No entra en este hito; el diseño debe dejarlo posible.

### 9.3 Reputación

Cada lectura y dataset da crédito visible a su nodo y operador, y entra en la cita con DOI de harvestt.org. Las insignias de calidad del nodo se derivan de criterios documentados (continuidad, verificación, completitud), nunca de un puntaje arbitrario.

### 9.4 Decisiones del builder

- Algoritmo de firma y de hash (por ejemplo, Ed25519 y SHA-256) y formato canónico. El protocolo y la referencia de verificación se publican como open source (Apache-2.0).
- Tamaño y periodicidad de bloques.

## 10. M6 · harvestt.org y open core

### 10.1 harvestt.org

Portal público (`harvestt-org.html`):
- frase de misión y buscador único (especie, lugar o término)
- cifras honestas
- seis entradas:
  - **Datasets**, versionados con DOI
  - **Ontología**, con explorador y descarga
  - **Verificar**
  - **Mapa**
  - **API**, con llave gratuita y límites justos
  - **Construye un nodo**, con planos, firmware y guía de montaje; hoy contenido «en construcción»

La página Visión de M1 se muda aquí. Decisión del builder: el despliegue (mismo servicio con dominio adicional o servicio aparte), con preferencia por el mismo servicio mientras sea suficiente.

**DOI:** vía Zenodo u otro servicio equivalente. Decisión del builder: el proveedor y la automatización.

### 10.2 Licencias

Decisión del fundador: **Cortex en open core.**

| Pieza | Licencia |
|---|---|
| Datos de la red | CC-BY 4.0 |
| Ontología | CC-BY 4.0 |
| Planos de hardware del nodo | CERN-OHL-S |
| Firmware y protocolo de firma | Apache-2.0 |
| Núcleo de Cortex | abierto (licencia por decidir) |
| Funciones avanzadas de Cortex | de pago y cerradas |

Primera propuesta (decisión del builder, a confirmar con el fundador) de qué entra en el núcleo y qué en las funciones avanzadas:

- **Núcleo abierto:** catálogo, proyectos, bitácora, ontología, conectores públicos, mapa, verificación y exportación.
- **Avanzado:** IA y agentes (Cortex chat, RAG), multi-invernadero y operación, simulación avanzada, soporte.

La separación técnica (repositorios, paquetes o *feature flags*) se define en el plan de M6.

## 10bis. Decisiones tomadas tras la revisión del builder (decisión de Claude; el fundador puede cambiarlas)

1. **Qué es un nodo.** Un **nodo** es una instalación: un invernadero, cultivador o germinador. Se modela como una entidad `Node` ligada a un proyecto, con coordenadas y operador. Los **dispositivos** (`Device`) pertenecen a un nodo y son los que tienen el par de llaves y firman. La reputación y las insignias se calculan por nodo. «Nodos operando» cuenta nodos con al menos un dispositivo **físico** que haya enviado una lectura firmada en los últimos 7 días.
2. **Lo simulado nunca cuenta como real.** Las firmas de dispositivos simulados existen y se pueden verificar, pero:
   - la página Visión y harvestt.org no las suman a «lecturas firmadas» ni a «nodos operando»; se muestran aparte y con etiqueta SIMULADO, o no se muestran;
   - **no se acuña ningún DOI sobre datos sintéticos**: los datasets con DOI solo incluyen datos `measured`.
   Hoy, por tanto, «nodos operando» = 0 y «lecturas firmadas» = «pronto». El nodo de CDMX aparece en el globo como **«prototipo histórico»**, no como «operando».
3. **Nodos futuros del globo.** Solo se dibujan **solicitudes reales** recibidas por «Únete como nodo», con su ubicación redondeada a nivel de ciudad. Si no hay ninguna, no se dibuja ninguno. No se inventan puntos.
4. **Una sola cadena global.** Las hojas son hashes con sal de cada lectura, de modo que la prueba Merkle de una lectura no revela datos de otras organizaciones. El sello horario se publica en dos lugares: un endpoint público propio y un **repositorio git público de solo anexado**, para que viva fuera del control exclusivo de la base de HarvestT. OpenTimestamps queda como paso posterior.
5. **Medallas y reconocimientos.** Nueva entidad ligera `Recognition` (evento, sede, fecha, premio, prototipo, evidencia o fuente) editable por superadmin. La cifra de M1 se deriva de ella.

## 10ter. Decisiones del fundador tras la revisión (2026-11-07)

1. **Publicación opt-in.** Todo dato es privado por defecto. Cada nodo (y cada proyecto) decide explícitamente publicar, con una bandera de visibilidad y su fecha. Solo lo publicado entra en el mapa público, en los datasets, en las cifras de harvestt.org y en la verificación con detalle. La verificación de un dato no publicado responde solo «íntegro / no íntegro», sin mostrar su contenido. Despublicar detiene publicaciones futuras, pero no retira versiones de datasets ya citadas con DOI; esto se advierte al publicar.
2. **Cuentas por invitación o solicitud aprobada.** No hay registro abierto en este hito.
   - El formulario público «Únete como nodo» crea una **solicitud** con nombre, organización, correo, ubicación aproximada y motivo. El equipo la aprueba y eso genera la invitación.
   - «Habla con el equipo» crea un contacto.
   - Las llaves de API de M6 se emiten a cuentas aprobadas.
   - Las propuestas de términos de M2 las hacen usuarios con cuenta.
3. **El código se abre después.** En este hito no se publica ningún repositorio. Las licencias de §10.2 quedan como **decisión de diseño documentada**. Los módulos `ledger` (protocolo y verificación) y `ontology` se escriben **separables**, sin dependencias hacia módulos de producto, para poder extraerlos cuando se abra el código. Esto sustituye la idea de publicar el sello en un repositorio git público (§10bis.4): por ahora el sello se publica en el endpoint propio y en un archivo de solo anexado descargable. La publicación externa se suma cuando se abra el código o se adopte OpenTimestamps.
4. **Todavía no existe el dominio harvestt.org.** M6 se construye dentro del despliegue actual bajo una ruta pública (p. ej. `/org/*`), lista para servirse en harvestt.org cuando se adquiera el dominio. La compra del dominio y el DOI (Zenodo) quedan fuera del alcance técnico. Mientras no haya datos `measured` publicados, no se acuña ningún DOI.

## 11. Lo que se deja al builder

Además de lo marcado arriba:
- nombres de tablas y endpoints
- estructura de módulos (nuevos módulos `ontology`, `connectors`, `geo` y `ledger` son lo esperable)
- la forma del caché de conectores
- el detalle visual dentro de «Salvia cristal»
- la estrategia de pruebas por fase, siguiendo el estándar de V1–V6

## 12. Documentación a actualizar por fase

- `README.md` (capacidades)
- `docs/STATUS.md` (matriz real / simulado / pendiente y estado de la página Visión)
- `docs/ARQUITECTURA.md` (módulos, migraciones)
- `docs/INTEGRIDAD_CIENTIFICA.md` (reglas nuevas de importación, aptitud y firmas)
- `CHANGELOG.md`

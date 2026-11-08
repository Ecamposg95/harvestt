# Estado del sistema

**Corte:** 2026-11-07 · **Producción:** <https://harvestt-production.up.railway.app> (`main`, base `3c3f6b0` de M1; migración `0007_graph_edges`) · **Rama en curso:** `feat/hito-m1-vision` (M1, pendiente de autorización; no desplegada)

## 1. Resumen ejecutivo

El hito visual V1–V6 está completo, integrado en `main` y desplegado en producción. Las quince ramas de trabajo (`feat/*` y `sdd/*`) se integraron en `main` y se eliminaron del remoto; no existe trabajo pendiente de integración. La plataforma opera con datos reales del usuario para catálogo, proyectos, layout y prototipos, y con simulación declarada para telemetría.

## 1.1 Hito M1 · Página Visión (en rama)

La rama `feat/hito-m1-vision` (desde `main` `3c3f6b0`) incorpora la página pública `/vision` y la bandeja `/app/solicitudes`. **Está en rama, pendiente de autorización para fusionar y desplegar; no está en producción.** Última suite completa registrada: pytest 262 pruebas en verde y Vitest 249/249. Migración `0008_vision` (pendiente de aplicar en producción); el ciclo `upgrade → check → downgrade 0007 → upgrade → check` se verificó sin diferencias en PostgreSQL 17 local.

**Pendiente antes de fusionar:** construcción y *smoke test* del contenedor Docker (no ejecutados: Docker no está disponible en la máquina de desarrollo; el *smoke* de la API y del SPA se hizo con uvicorn contra PostgreSQL 17 local) y revisión visual de `/vision` y `/app/solicitudes` en claro, oscuro y 375 px, con y sin WebGL.

Cifras honestas de M1: «nodos operando» se calcula en cada consulta: instalaciones con un dispositivo no simulado que envió una lectura real en los últimos 7 días; sin organización pública, «Sin datos suficientes». El valor en producción se confirmará tras el despliegue (definición provisional hasta la entidad Node en M5); «lecturas firmadas» = «pronto» (la capa aún no existe); CDMX figura como «prototipo histórico», nunca como operando; los nodos futuros provienen solo de solicitudes aprobadas, con coordenadas redondeadas a 1 decimal.

## 2. Fases del hito visual

| Fase | Alcance | Estado | En producción |
|---|---|---|---|
| V1 | Sistema de diseño «Salvia cristal», sidebar plegable, inicio | Completa | `b101107`, pulido `ca52717` |
| V2 | Puntos etiquetados sobre STL | Completa | `074c981` |
| V3 | Invernadero virtual: simulación, telemetría, incidentes | Completa | `24b1a3d` |
| V4 | Studio 3D, plantas procedurales, medios de especie | Completa | `24b1a3d` |
| V5 | Indicadores de impacto con fórmula y origen | Completa | `806d021` (2026-11-07) |
| V6 | Grafo de conocimiento con procedencia | Completa | `24b1a3d` |

**Última verificación integral registrada** (integración V3/V4/V6): pytest completo y Vitest 217/217 en verde; build con three.js y d3-force en *chunks* perezosos; migraciones `0001 → 0007` con ciclo `upgrade → check → downgrade 0004 → upgrade → check` sin diferencias en PostgreSQL 17; *smoke test* del contenedor; revisión visual en claro, oscuro y 375 px. V5 se verificó en producción mediante `/api/v1/health/ready` y `/api/v1/public/impact`.

## 3. Matriz real / simulado / pendiente

| Elemento | Estado |
|---|---|
| Proyectos, ciclos, observaciones, actividad del inicio | **Real** — datos de la organización |
| Catálogo de especies | **Real**; rasgos sin evidencia se muestran como «Desconocido» |
| Puntos etiquetados sobre modelos STL | **Real** — editor con máximo 12 por prototipo; callouts que siguen la rotación, se atenúan detrás del modelo y no se enciman; en móvil, números con leyenda |
| Vitrina pública | **Real** — modelo 3D del prototipo destacado; STL con color por cara |
| Lecturas, gráficas, medidores e incidentes del invernadero virtual | **Simulado** — motor `didactic-v1`, determinista por semilla; banda didáctica visible; sin señal se muestra «Sin señal» |
| Reglas de alerta de demostración (30 °C, 45 %) | Umbrales de ejemplo, no agronómicos |
| Escena 3D del invernadero y del Studio | **Ilustrativo** — piso a partir del área registrada |
| Plantas 3D procedurales | **Ilustrativo** — «no predice crecimiento» |
| Layout del Studio | **Real** — versionado |
| Medios de especie | **Real** — solo superadministrador; licencia y atribución obligatorias |
| Grafo de conocimiento | **Real** — solo nodos y relaciones derivados de datos registrados |
| KPIs del proyecto | **Real**, calculados al vuelo: Medido, Derivado (fórmula visible) y Simulado; sin insumos, «Sin datos suficientes» |
| KPIs públicos | **Real** — prototipos publicados, especies, fuentes con licencia, cobertura de evidencia |
| Rendimiento, agua, CO₂, dinero | **Fuera de alcance** hasta contar con metodología documentada |
| Página Visión `/vision` (rama M1) | **Real** — cifras medidas o «pronto»; no desplegada |
| «Nodos operando» | **Medido** — se calcula en cada consulta: instalaciones con un dispositivo no simulado que envió una lectura real en los últimos 7 días; sin organización pública, «Sin datos suficientes». El valor en producción se confirmará tras el despliegue; interino hasta M5 |
| «Lecturas firmadas» | **Pendiente** — se muestra «pronto» |
| Sitio de CDMX en el globo | **Real** como «prototipo histórico» |
| Nodos futuros en el globo | **Real** — solo solicitudes aprobadas, coordenadas a 1 decimal |
| Reconocimientos (medallas) | **Real** — administrables por superadministrador, con evidencia obligatoria; carga en producción pendiente de autorización |
| Telemetría de dispositivos físicos | **Pendiente** — Etapa III |

## 4. Observaciones abiertas

1. **Cobertura de evidencia en producción: 0 %.** Las 12 afirmaciones del catálogo están en «Desconocido». Se resuelve cargando afirmaciones con fuente revisada, no ajustando la cifra.
2. **Grafo:** registrar aristas reales `designed_for` (prototipo → especie) cuando el equipo indique qué cultiva cada prototipo.
3. **Defectos menores conocidos:** dos altas simultáneas pueden dejar 13 puntos en un prototipo; puntos borrados en cascada sin evento de auditoría propio; STL con normales invertidas no seleccionables desde fuera; piso ilustrativo no cuadrado en Studio sin área; sin *pinch-zoom* táctil en el grafo.
4. **Limpieza de ramas remotas:** hecha el 2026-11-07; las quince ramas `feat/*` y `sdd/*` integradas se eliminaron del remoto. El repositorio conserva solo `main`.

## Hoja de ruta

Derivada del backlog de [`HARVESTT_TASK_PACK.md`](HARVESTT_TASK_PACK.md) (§10).

| Prioridad | Línea de trabajo | Tickets |
|---|---|---|
| P0 | Cierre de M1: autorización, fusión, despliegue y carga de reconocimientos | M1 |
| P0 | Conocimiento y RAG con citas verificables y abstención | HVT-007 a HVT-010 |
| P0 | Agentes con herramientas tipadas y ejecución auditada | HVT-011 |
| P0 | Comparador de escenarios y exportación del expediente | HVT-016, HVT-017 |
| P0 | Endurecimiento y guion de demostración | HVT-018 |
| P1 | Operación e ingesta ampliada; grafo y ontologías | HVT-019, HVT-020 |
| P2 | Validación científica, adaptador físico, control supervisado, integración Atlas ONE | HVT-021 a HVT-024 |

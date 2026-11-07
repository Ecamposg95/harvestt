# Historia de HarvestT

Registro cronológico del proyecto, de los prototipos físicos a la plataforma HarvestT Cortex. Las fechas posteriores a abril de 2026 se corroboran con el historial de este repositorio.

## Etapa I — Prototipos físicos (2017–2018)

El equipo **General Systech**, en la Ciudad de México, concibió HarvestT como un sistema de agrotecnología capaz de reproducir de forma autónoma condiciones climáticas favorables para el cultivo. El sistema integraba:

- **Sensado:** luminosidad, humedad ambiental y de suelo, temperatura y calidad del aire.
- **Control:** microcontroladores (familias ATmega328 y PIC) y computadoras de placa única para gobernar calefacción, iluminación LED de espectro completo y dosificación de nutrientes.
- **Inteligencia:** aprendizaje automático, agentes expertos y lógica difusa para decisión y análisis predictivo.
- **Interfaz:** aplicación móvil para alertas, planes de cultivo y visualización remota con cámaras internas (*watch and learn*).

De esta etapa provienen tres prototipos, hoy reconstruidos de forma ilustrativa en la vitrina pública:

| Prototipo | Descripción |
|---|---|
| Invernadero Geodésico | Estructura geodésica para cultivo en ambiente controlado |
| Cultivador Delta | Cultivador automatizado |
| Germinador ECOS | Germinador para las primeras etapas del ciclo |

### Reconocimientos

| Fecha | Reconocimiento | Evento | Sede |
|---|---|---|---|
| Junio de 2017 | Medalla de Plata | INTARG — International Invention and Innovation Show | Katowice, Polonia |
| Septiembre de 2018 | Medalla de Oro | ICAN — International Invention & Innovation Competition in Canada | Toronto, Canadá |

## Etapa II — HarvestT Cortex (2026–)

En 2026 el proyecto se reorientó hacia una estrategia *software primero*: construir la capa de inteligencia, memoria y evidencia antes de fabricar nueva electrónica.

| Fecha | Hito | Referencia |
|---|---|---|
| 2026-04-23 | Creación del repositorio del proyecto | `6ead407` |
| 2026-10-19 | Especificación de producto *HarvestT Cortex Task Pack v1.0* | `docs/HARVESTT_TASK_PACK.md` |
| 2026-10-19 | Base de la plataforma: núcleo FastAPI, autenticación, multi-organización, interfaz React, infraestructura | `64e189c` |
| 2026-10-19 | Catálogo de especies, proyectos y bitácora (migración 0002) | `cb1be01` |
| 2026-10-19 | Vitrina pública y administración de prototipos | `c6d7e82` |
| 2026-10-19 | Especificación del hito visual V1–V6 | `63ff91d` |
| 2026-10-20 | **V1** — Sistema de diseño «Salvia cristal» | `b101107` |
| 2026-10-20 | **V2** — Puntos etiquetados sobre modelos STL | `074c981` |
| 2026-10-20 | **V3** — Invernadero virtual: simulación determinista, telemetría e incidentes | `24b1a3d` |
| 2026-10-20 | **V4** — Studio 3D, plantas procedurales y medios de especie con licencia | `24b1a3d` |
| 2026-10-20 | **V6** — Grafo de conocimiento con procedencia | `24b1a3d` |
| 2026-10-22 | Prototipos históricos cargados en producción con STL, fotografías y puntos | — |
| 2026-11-07 | **V5** — Indicadores de impacto con fórmula y origen; desplegado a producción | `9786a54`, `806d021` |
| 2026-11-07 | Consolidación: todas las ramas de trabajo integradas en `main`; documentación institucional | — |

## Etapa III — Integración física (planeada)

Adaptador de dispositivos reales sobre el contrato de telemetría ya validado, control supervisado de actuadores, calibración científica de modelos e integración con Atlas ONE. Véase [`STATUS.md`](STATUS.md#hoja-de-ruta).

## Equipo

| Integrante | Contribución |
|---|---|
| Emmanuel Campos Genaro | Responsable técnico, análisis económico; dirección de HarvestT Cortex |
| José Israel Romero Flores | Diseño de circuitos eléctricos y tarjetas de control |
| Leonardo Tonatiuh González García | Programación e interfaz gráfica |
| Luis Antonio Hernández Moha | Desarrollo de software y prototipos |

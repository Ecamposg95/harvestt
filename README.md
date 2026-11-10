<div align="center">

# HarvestT

**Agrotecnología automatizada para el cultivo en ambientes controlados**

*De prototipo galardonado (2017–2018) a plataforma de investigación con integridad de datos verificable (2026)*

[Plataforma en producción](https://harvestt-production.up.railway.app) ·
[Historia](docs/HISTORIA.md) ·
[Arquitectura](docs/ARQUITECTURA.md) ·
[Integridad científica](docs/INTEGRIDAD_CIENTIFICA.md) ·
[Estado](docs/STATUS.md) ·
[Cambios](CHANGELOG.md)

</div>

---

## Resumen

HarvestT es un proyecto de investigación y desarrollo tecnológico que busca trasladar la agronomía clásica a un entorno automatizado, medible y reproducible. Nació como un sistema de hardware y software para invernaderos y germinadores inteligentes capaces de reproducir condiciones climáticas favorables de forma autónoma. Su desarrollo fue reconocido internacionalmente con la **Medalla de Plata en INTARG (Katowice, Polonia, 2017)** y la **Medalla de Oro en ICAN (Toronto, Canadá, 2018)**.

En 2026 el proyecto inició su segunda etapa: **HarvestT Cortex**, una plataforma web para investigar especies, planificar y operar cultivos y conservar evidencia de cada ciclo. Cortex se construye *software primero*: valida el flujo de trabajo, el modelo de datos y la telemetría con simulación explícitamente etiquetada, de modo que la futura integración con dispositivos físicos se haga sobre un contrato ya probado.

## Principio rector

> **Toda cifra presentada como conocimiento agronómico debe tener fuente y contexto; todo dato sintético debe estar marcado. Un dato ausente se representa como desconocido, nunca como cero.**

Cada valor que muestra la plataforma declara su origen con una de seis categorías — **Medido · Fuente · Derivado · Simulado · Ilustrativo · Desconocido** — y los indicadores derivados exponen su fórmula. El detalle metodológico está en [`docs/INTEGRIDAD_CIENTIFICA.md`](docs/INTEGRIDAD_CIENTIFICA.md).

## Etapas del proyecto

| Etapa | Periodo | Enfoque | Resultado |
|---|---|---|---|
| **I. Prototipos físicos** | 2017–2018 | Sensores, microcontroladores, actuadores, control inteligente | Invernadero Geodésico, Cultivador Delta, Germinador ECOS; medallas INTARG e ICAN |
| **II. HarvestT Cortex** | 2026– | Plataforma de investigación, simulación y evidencia | Hito visual V1–V6 en producción (noviembre 2026) |
| **III. Integración física** | Planeada | Telemetría real, adaptador de dispositivos, control supervisado | Pendiente; ver [hoja de ruta](docs/STATUS.md#hoja-de-ruta) |

La cronología completa está en [`docs/HISTORIA.md`](docs/HISTORIA.md).

## Objetivos

- **Sustentabilidad urbana.** Facilitar la agricultura vertical y urbana en metrópolis como la Ciudad de México.
- **Optimización de cultivos.** Controlar variables como fotoperiodo, temperatura y humedad para acortar y estabilizar ciclos.
- **Democratización del conocimiento.** Permitir que personas sin formación agronómica cultiven alimentos con apoyo de evidencia trazable.
- **Rigor.** Separar con claridad lo medido de lo simulado y lo ilustrativo, para que la plataforma sea útil como instrumento de investigación.

## Capacidades de HarvestT Cortex

| Módulo | Capacidad | Naturaleza del dato |
|---|---|---|
| Catálogo de especies | Búsqueda por familia, fichas con afirmaciones contextualizadas, medios con licencia y atribución | Fuente / Desconocido |
| Proyectos y bitácora | Proyectos, ciclos de cultivo y observaciones por organización | Medido (registrado por el usuario) |
| Vitrina pública | Prototipos con modelo 3D (STL con color por cara) y puntos etiquetados | Ilustrativo |
| Invernadero virtual | Sensores, lecturas, reglas de alerta e incidentes con motor determinista `didactic-v1` | **Simulado** |
| Studio 3D | Distribución de zonas y plantas procedurales, guardado versionado, vista 2D sin WebGL | Layout real / plantas ilustrativas |
| Impacto | KPIs de proyecto y públicos con fórmula y origen por cifra | Medido / Derivado / Simulado |
| Grafo de conocimiento | Nodos y relaciones derivados únicamente de datos registrados, con procedencia | Derivado |
| Página Visión (M1, en producción) | Página pública `/vision` con cifras honestas («nodos operando» medido; «lecturas firmadas» = pronto), globo con el prototipo histórico de CDMX y nodos futuros solo de solicitudes aprobadas, recorrido por capas y solicitudes de nodo o contacto; bandeja `/app/solicitudes` para superadministrador | Medido / Derivado / Ilustrativo |
| Ontología (M2, en rama, pendiente de autorización para fusionar y desplegar) | Términos globales con ID permanente `HVT:000001`, ciclo propuesta → revisión → publicación, equivalencias verificadas con vocabularios externos (NCBI Taxon, PO, BBCH, AGROVOC, UCUM, SOSA, …), versiones y exportación pública OWL/Turtle y JSON con licencia CC-BY 4.0; los datos existentes se enlazan a términos solo por coincidencia exacta y, sin ella, quedan «Desconocido»; página `/app/ontologia` y términos en el grafo | Real (semilla del equipo y propuestas revisadas) / Desconocido |

## Arquitectura en síntesis

Monolito modular *API-first* y multi-organización desde el origen.

```
React 18 · TypeScript · Vite · Tailwind · three.js · d3-force
                         │  /api/v1
FastAPI · Pydantic 2 · SQLAlchemy 2 · Alembic (0001 → 0009)
                         │
PostgreSQL 17                 Almacenamiento de objetos S3 (Railway)
```

Módulos de dominio: `identity`, `audit`, `catalog`, `projects`, `prototypes`, `simulation`, `telemetry`, `studio`, `impact`, `graph`, `home`, `vision`, `ontology` (separable), `term_links`. Descripción completa, modelo de datos y decisiones en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Puesta en marcha

**Requisitos:** Python 3.12+, Node 20+, Docker (para PostgreSQL local).

```bash
cp .env.example .env          # define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD
make setup                    # dependencias de Python y del frontend
make dev                      # PostgreSQL (Docker) + migraciones + seed
make dev-api                  # API en http://localhost:8000  (OpenAPI en /api/docs)
make dev-web                  # frontend en http://localhost:5173
make test                     # pytest + verificación de tipos + vitest
```

### Despliegue

Railway despliega cada *push* a `main` con el `Dockerfile`. Al arrancar, el contenedor aplica `alembic upgrade head` y un seed idempotente. Los archivos de prototipos y los medios de especie se guardan en el bucket S3 de Railway. `SEED_DEMO_SIMULATION=1` crea el proyecto «Invernadero demostrativo» (apagado en producción).

### Datos de demostración

Los prototipos históricos se reconstruyen como STL procedurales a partir de fotografías y láminas del equipo, y se cargan por la API con sus puntos etiquetados:

```bash
HARVESTT_PASSWORD=... python -m scripts.demo.load_demo \
  --base http://localhost:8080 --email admin@... --photos-dir RUTA_FOTOS [--replace]
```

Idempotente por *slug*; `--replace` recrea. Las fotografías no se versionan. **Los modelos son representaciones ilustrativas, no planos de fabricación.**

## Metodología de desarrollo

Cada fase se diseña en una especificación, se planifica contra el código existente y se implementa con desarrollo guiado por pruebas en su propia rama. Ninguna fase llega a producción sin: suite completa en verde, migraciones probadas en ciclo `upgrade → check → downgrade → upgrade` sobre PostgreSQL 17, *smoke test* del contenedor, revisión visual (claro, oscuro y 375 px) y autorización explícita del responsable técnico. Especificaciones y planes: [`docs/superpowers/`](docs/superpowers/). Especificación de producto: [`docs/HARVESTT_TASK_PACK.md`](docs/HARVESTT_TASK_PACK.md).

## Reconocimientos internacionales

| Reconocimiento | Evento | Sede | Fecha |
|---|---|---|---|
| Medalla de Plata | INTARG — International Invention and Innovation Show | Katowice, Polonia | Junio de 2017 |
| Medalla de Oro | ICAN — International Invention & Innovation Competition in Canada | Toronto, Canadá | Septiembre de 2018 |

## Equipo — General Systech

| Integrante | Contribución |
|---|---|
| Emmanuel Campos Genaro | Responsable técnico, análisis económico y dirección de HarvestT Cortex |
| José Israel Romero Flores | Diseño de circuitos eléctricos y tarjetas de control |
| Leonardo Tonatiuh González García | Programación e interfaz gráfica |
| Luis Antonio Hernández Moha | Desarrollo de software y prototipos |

## Cómo citar

Si utiliza HarvestT en trabajo académico, cite el repositorio con los metadatos de [`CITATION.cff`](CITATION.cff).

---

<sub>HarvestT · General Systech · Ciudad de México · 2017–2026</sub>

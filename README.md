# HarvestT: Sistema de Agrotecnología Automatizado con IA

HarvestT es una plataforma integral de hardware y software diseñada para revolucionar la agronomía clásica mediante la automatización y el uso de Inteligencia Artificial. El proyecto se enfoca en la creación de invernaderos y germinadores inteligentes capaces de reproducir condiciones climáticas óptimas de manera autónoma.

## Características Principales

- **Monitoreo en Tiempo Real:** Sensores integrados que miden luminosidad, humedad (ambiental y de suelo), temperatura y calidad del aire.
- **Control Inteligente:** Implementación de algoritmos de Machine Learning, agentes inteligentes expertos y lógica difusa para la toma de decisiones y análisis predictivo.
- **Hardware Robusto:** Basado en microcontroladores (como ATMEGA328/PIC) y computadoras de placa única (SBC) para gestionar actuadores de calefacción, iluminación LED de espectro completo y dispensadores de nutrientes.
- **Ecosistema Digital:** Aplicación móvil para notificaciones, alertas, planes de cultivo y visualización remota mediante cámaras internas (*"watch and learn"*).

## Objetivos del Proyecto

- **Sustentabilidad Urbana:** Facilitar el desarrollo de agricultura vertical y urbana en metrópolis como la CDMX.
- **Optimización de Cultivos:** Reducir el ciclo de crecimiento de las plantas controlando variables como el fotoperiodo.
- **Impacto Social:** Democratizar la agronomía permitiendo que personas sin conocimientos técnicos puedan cultivar sus propios alimentos de forma eficiente.

## Reconocimientos Internacionales

| Reconocimiento | Evento | Sede | Fecha |
| --- | --- | --- | --- |
| 🥈 Medalla de Plata | INTARG | Katowice, Polonia | Junio 2017 |
| 🥇 Medalla de Oro | ICAN | Toronto, Canadá | Septiembre 2018 |

## Equipo (General Systech)

| Integrante | Rol |
| --- | --- |
| Emmanuel Campos Genaro | Responsable Técnico / Análisis Económico |
| José Israel Romero Flores | Diseño de circuitos eléctricos y tarjetas de control |
| Leonardo Tonatiuh González García | Programación e interfaz gráfica |
| Luis Antonio Hernandez Moha | Desarrollo de software y prototipos |

## HarvestT Cortex (plataforma)

Plataforma web para investigar, planificar y operar cultivos en ambientes controlados, con vitrina pública de prototipos. Especificación de producto: [`docs/HARVESTT_TASK_PACK.md`](docs/HARVESTT_TASK_PACK.md).

**Stack:** FastAPI · SQLAlchemy · Alembic · PostgreSQL · React · TypeScript · Vite · Tailwind · three.js · Railway.

### Desarrollo local

```bash
cp .env.example .env          # define SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
make setup                    # dependencias Python y frontend
make dev                      # Postgres (Docker) + migraciones + seed
make dev-api                  # API en http://localhost:8000 (docs en /api/docs)
make dev-web                  # frontend en http://localhost:5173
make test                     # pytest + tsc + vitest
```

### Despliegue

Railway despliega automáticamente cada push a `main` usando el `Dockerfile`. Al arrancar, el contenedor aplica las migraciones (`alembic upgrade head`, hoy hasta `0007`) y el seed idempotente. Los archivos de prototipos y medios de especie se guardan en el bucket S3 de Railway.

Variables opcionales: `SEED_DEMO_SIMULATION=1` crea el proyecto "Invernadero demostrativo" con sensores y reglas de ejemplo (apagado por defecto; producción no lo usa).

### Datos de demostración

Los prototipos de la demo (Invernadero Geodésico, Cultivador Delta y Germinador ECOS) se generan como STL procedurales con color y se cargan por la API, con sus puntos etiquetados:

```bash
HARVESTT_PASSWORD=... python -m scripts.demo.load_demo \
  --base http://localhost:8080 --email admin@... --photos-dir RUTA_FOTOS [--replace]
```

- Idempotente por slug; `--replace` borra y recrea.
- Las fotos no se versionan: el cargador las busca por nombre en `--photos-dir` (fotos del Cultivador Delta, render y lámina del geodésico).
- Los modelos son representaciones ilustrativas hechas a partir de fotos y láminas del equipo, no planos de fabricación.
- En un proyecto, Operaciones → "Preparar demostración" crea dos sensores y dos reglas demostrativas para lanzar corridas.

### Estado: real / simulado / pendiente (hito visual V1–V4 y V6)

| Elemento | Estado |
|---|---|
| Proyectos, ciclos, observaciones, actividad del inicio | Real (datos del tenant) |
| Catálogo de especies | Real; rasgos sin evidencia se muestran como "Desconocido" |
| Puntos etiquetados sobre modelos STL | Real: editor en el admin (máx. 12 por prototipo); callouts que siguen la rotación, se atenúan detrás del modelo y no se enciman; en móvil, números con leyenda |
| Vitrina pública | Real: modelo 3D del prototipo destacado; STL con color por cara cuando el archivo lo trae |
| Invernadero virtual: lecturas, gráficas, medidores, incidentes | **Simulado** (motor `didactic-v1`, determinista por semilla); siempre con la banda "Simulación didáctica, sin calibración agronómica" y la etiqueta SIMULADO; sin señal se muestra "Sin señal", nunca 0 |
| Reglas de alerta del demo (30 °C, 45 %) | Umbrales de ejemplo, no agronómicos |
| Escena 3D del invernadero y del Studio | **Ilustrativo**: forma y alturas ilustrativas; piso a partir del área registrada |
| Plantas 3D procedurales (catálogo, ficha, Studio) | **Ilustrativo**: "Representación ilustrativa; no predice crecimiento" |
| Layout del Studio (zonas y plantas) | Real (datos del tenant, con versión) |
| Medios de especie (foto principal con callouts) | Real: solo superadmin; licencia y atribución obligatorias y visibles |
| Grafo de conocimiento | Real: solo nodos y relaciones derivados de datos registrados; sin edición |
| KPIs de impacto (V5) | Pendiente |
| Telemetría física de dispositivos | Pendiente (fuera de este hito) |

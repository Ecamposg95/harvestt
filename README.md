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

Railway despliega automáticamente cada push a `main` usando el `Dockerfile`. Al arrancar, el contenedor aplica las migraciones (`alembic upgrade head`) y el seed idempotente. Los archivos de prototipos (STL e imágenes) se guardan en el bucket S3 de Railway.

### Estado: real / simulado / pendiente (hito visual V2)

| Elemento | Estado |
|---|---|
| Proyectos, ciclos, observaciones, actividad del inicio | Real (datos del tenant) |
| Catálogo de especies | Real; rasgos sin evidencia se muestran como "Desconocido" |
| Lecturas de temperatura y humedad en el inicio | Pendiente (V3: invernadero virtual, etiquetadas SIMULADO) |
| Puntos etiquetados sobre modelos STL | Real: editor en el admin (máx. 12 por prototipo); en la página pública los callouts siguen la rotación y se atenúan detrás del modelo; en móvil, números con leyenda |
| Studio 3D, impacto, grafo | Pendiente (V4–V6) |

# Hito visual — Plan maestro (V1–V6)

> **For agentic workers:** this is the roadmap. Each phase has its own detailed plan in `docs/superpowers/plans/`; implement only from a detailed plan. REQUIRED SUB-SKILL for detailed plans: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** llevar HarvestT Cortex a la visión de `docs/screenshots/` en seis fases entregables por separado.

**Spec:** `docs/superpowers/specs/2026-10-19-hito-visual-design.md`

## Por qué un plan por fase

Las seis fases son subsistemas independientes (diseño, hotspots, simulación/telemetría, Studio/medios, KPIs, grafo). Cada una produce software desplegable por sí misma. El plan detallado de la fase N se escribe al empezarla, contra el código que realmente dejó la fase N−1 (nombres de componentes, migraciones, helpers), para no planear sobre interfaces imaginadas.

## Fases

| Fase | Plan detallado | Rama | Migración | Entregable verificable |
|---|---|---|---|---|
| V1 | `2026-10-20-hito-v1-sistema-diseno.md` | `feat/hito-v1-diseno` | — | Todas las pantallas actuales en Salvia cristal; sidebar plegable; `/api/v1/home`; componentes `OriginBadge`, `StatTile`, `Callout`, gráficas |
| V2 | `…-hito-v2-hotspots.md` (al iniciar) | `feat/hito-v2-hotspots` | `0004_prototype_hotspots` | Editor de puntos sobre STL; callouts que siguen la rotación en la página pública |
| V3 | `…-hito-v3-invernadero.md` (al iniciar) | `feat/hito-v3-invernadero` | `0005_simulation_telemetry` | Escenario reproducible (base, subida de temperatura, pérdida de sensor y recuperación) con incidentes y pantalla de operaciones |
| V4 | `…-hito-v4-planta-3d.md` (al iniciar) | `feat/hito-v4-planta-3d` | `0006_studio_layout_species_media` | Studio con plantas procedurales y layout guardado; ficha de planta con imagen licenciada y callouts |
| V5 | `…-hito-v5-impacto.md` (al iniciar) | `feat/hito-v5-impacto` | — | KPIs de proyecto y públicos con fórmula y origen; sección Impacto |
| V6 | `…-hito-v6-grafo.md` (al iniciar) | `feat/hito-v6-grafo` | `0007_graph_edges` | `/app/graph` navegable con procedencia |

Orden fijo V1 → V6. V3 y V6 solo dependen de V1 y podrían adelantarse si el usuario lo pide; V4 necesita el `Callout` 3D de V2; V5 necesita V3 y V4.

## Puerta de cada fase

1. Plan detallado escrito, revisado por el usuario.
2. Implementación en su rama con TDD.
3. Verde: `make test` (pytest), `npm run typecheck`, `npm test`, `npm run build`; migraciones `upgrade → check → downgrade → upgrade` en Postgres 17 cuando haya migración.
4. Smoke del contenedor Docker y revisión visual (claro, oscuro, 375 px).
5. README: checklist "real / simulado / pendiente" actualizado.
6. Merge a `main` y despliegue **solo con autorización explícita del usuario en esa fase**; verificación en `https://harvestt-production.up.railway.app`.

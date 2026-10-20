# Hito visual V3 — Invernadero virtual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un invernadero virtual reproducible: sensores simulados en un proyecto, corridas del motor didáctico `didactic-v1` (base, subida de temperatura, pérdida de sensor y recuperación) que generan telemetría al leerse, reglas con histéresis y cooldown que abren incidentes, y una pantalla de operaciones con gauges, series con huecos, incidentes reconocibles y una nave 3D con callouts; el inicio `/app` muestra las últimas lecturas con badge SIMULADO.

**Architecture:** backend: módulo `simulation` (motor puro, corridas, materialización sin worker con reloj inyectable) y módulo `telemetry` (dispositivos, lecturas idempotentes, reglas, incidentes, configuración demostrativa), migración `0005`. Las lecturas se generan al leer (`GET` de lecturas, estado, alertas o inicio) hasta el paso que corresponde por reloj, con tope de 500 pasos por llamada, `INSERT … ON CONFLICT DO NOTHING` sobre `(device_id, event_id)` y bloqueo de fila del run. Frontend: feature `operations` (API, formato puro, polling, página), escena 3D paramétrica en el chunk perezoso de three, pestañas en píldora del proyecto y lecturas en el inicio.

**Tech Stack:** FastAPI 0.127, SQLAlchemy 2 (sync), Alembic, pytest; React 18.3.1, TS 5.6, three 0.170.0 (chunk perezoso), vitest 2.1.9 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-19-hito-visual-design.md` (sección 5, obligatoria; además 1, 3.2, 3.3, 9 y 11).

**Rama:** `feat/hito-v3-invernadero`, creada desde `main` (que ya contiene V2).

**Verificación previa del plan:** todo el código de este plan se ejecutó en un worktree temporal desde `main`: suite backend completa en SQLite, las suites de V3 también contra Postgres 17, `alembic upgrade → check → downgrade 0004 → upgrade → check` sin diferencias, `tsc -b`, `vitest run` (19 archivos) y `npm run build` con three fuera del bundle principal. Si un paso falla al implementarlo, el problema está en el entorno o en una desviación del plan, no en el código del plan.

## Global Constraints

- Sin dependencias nuevas (frontend ni backend).
- three solo dentro del chunk perezoso: `OperationsPage`, `HomePage` y `App.tsx` no importan `three` ni directa ni indirectamente. La escena se carga con `LazyGreenhouseViewer`; `features/operations/format.ts` (tipos, medidas de la nave y conversión de coordenadas) no importa `three`.
- Ningún número inventado: toda lectura es `simulated`/`synthetic`, toda vista la etiqueta con `OriginBadge origin="simulated"`, la banda "Simulación didáctica, sin calibración agronómica" es persistente en operaciones, la nave sin área registrada se rotula como tamaño ilustrativo y las reglas demostrativas dicen en su etiqueta que el umbral es de ejemplo, no agronómico.
- La falta de señal es ausencia de fila (`TelemetryReading.value` no admite nulos). La UI muestra "Sin señal" (señal perdida) o "Sin lecturas" (aún no hay datos); nunca `0`. Las series cortan la línea en los huecos.
- Motor puro: `engine.generate` no lee reloj, base de datos ni estado global. Toda la aleatoriedad sale de `random.Random(f"{seed}:{step}:{device}:{variable}")`.
- Tiempo testeable: las rutas reciben `now` con `Depends(get_now)` (`app/modules/simulation/clock.py`); las pruebas lo sustituyen con el fixture `clock` (`FrozenClock`). Ninguna prueba duerme.
- Fechas: todo valor leído de la base pasa por `as_utc()` antes de compararse (SQLite devuelve fechas sin zona; Postgres, con zona).
- Materialización: máximo `MAX_STEPS_PER_CALL = 500` pasos por llamada; `event_id = uuid5(UUID(run_id), f"{step}:{device_id}:{variable}")`; inserción idempotente portable (`sqlalchemy.dialects.postgresql.insert` / `sqlalchemy.dialects.sqlite.insert` con `on_conflict_do_nothing`); el run se lee con `with_for_update()`.
- Un solo run activo (`running` o `paused`) por proyecto → 409 `run_active`, respaldado por índice único parcial.
- Roles: lecturas con `viewer`, escrituras con `editor`; toda escritura de usuario pasa por `record()` (`device`, `alert_rule`, `simulation_run`, `incident`). Aislamiento: todo por `scoped()` o `organization_id` explícito y `get_project` (404 entre tenants y proyectos).
- Copias de UI en español; Tailwind: `text-accent` para texto verde, `bg-lime` solo relleno, opacidades en múltiplos de 5.
- Comandos: backend `~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings`; frontend (en `frontend/`) `npx tsc -b`, `npx vitest run`, `npm run build`. Postgres de prueba en el puerto **55435**.

## Review Focus

1. **Materialización concurrente duplicada.** La pantalla de operaciones dispara varias lecturas seguidas y hace polling; dos pestañas abiertas materializan el mismo run a la vez. Sin defensa salen lecturas e incidentes duplicados. Defensa: `SELECT … FOR UPDATE` del run, índice único `(device_id, event_id)` con `ON CONFLICT DO NOTHING` y `Incident.dedupe_key` única. Pruebas: `test_materializing_twice_does_not_duplicate` (Task 3, rebobina `emitted_steps` y re-materializa), `test_re_evaluating_the_same_steps_creates_no_duplicates` y `test_evaluate_called_twice_with_same_batch_is_idempotent` (Task 4).
2. **Fechas con y sin zona horaria.** SQLite devuelve `observed_at` sin zona y Postgres con zona; comparar mezclado lanza `TypeError` o desplaza filtros. Defensa: `as_utc()` en cada lectura de la base y en `since/until`. Pruebas: `test_readings_filters_and_timezone_offsets` (filtro con `-06:00`) y `test_late_event_keeps_observed_at` (Task 3); en Task 10 las suites de V3 corren también contra Postgres 17.
3. **El usuario vuelve horas después.** Una lectura tras 3 horas tendría que generar miles de pasos en una sola petición y vencer el timeout. Defensa: tope de 500 pasos por llamada; el polling completa el resto; un run cancelado antes de leerse se pone al día al cancelar y al pedirlo por `run_id`. Pruebas: `test_catch_up_is_capped_at_500_steps_per_call` y `test_readings_of_previous_run` (Task 3).
4. **Pérdida de señal pintada como cero o como línea continua.** Defensa: sin fila en el intervalo, `latest.stale`, incidente `stale`, `withGaps` inserta `null` y los gauges muestran "Sin señal". Pruebas: `test_signal_loss_produces_no_readings_and_latest_is_stale` (Task 3), `test_signal_loss_opens_stale_and_closes_on_recovery` (Task 4), `withGaps` (Task 6), la prueba del inicio (Task 8) y `muestra la banda didáctica, gauges simulados, "Sin señal" y la línea con hueco` (Task 9).
5. **Dos corridas activas en el mismo proyecto.** Una corrida en pausa más una nueva, o dos `POST` simultáneos, dejarían dos runs escribiendo y la UI mostraría el equivocado. Defensa: `paused` también cuenta como activo e índice único parcial `uq_simulation_runs_one_active` con `IntegrityError` → 409. Pruebas: `test_one_active_run_per_project_and_reset_is_a_new_run` y `test_partial_unique_index_blocks_second_active_run` (Task 3).

## Rulings sobre el spec

- `generate(seed, scenario, inputs, step)` se implementa como `generate(seed, scenario, inputs, step, device=0)` y el generador es `random.Random(f"{seed}:{step}:{device}:{variable}")`. Motivo: con la clave del spec todos los sensores darían la misma serie y `sensor_loss` no podría elegir un dispositivo. `device` es la posición del dispositivo en `SimulationRun.device_ids`. Costo si está mal: subir `MODEL_VERSION` y regenerar el snapshot golden.
- `SimulationRun` agrega `device_ids` (snapshot ordenado al iniciar) y `ended_at`; `Incident` agrega `scenario_run_id` y `dedupe_key` (única). Sin ellos no hay reproducibilidad por dispositivo ni evaluación idempotente.
- Tiempo simulado: `observed_at = started_at + step × step_minutes`, con pasos `0 … total_steps − 1`. El tiempo simulado corre delante del reloj (2 s reales = 5 min simulados por defecto); `received_at` es el instante real de materialización. Pausa congela el objetivo en `paused_at`; cancelar materializa hasta ese instante y congela en `ended_at`.
- "Un solo run `running` por proyecto": `paused` también cuenta como activo (si no, reanudar dejaría dos corriendo).
- Stale: por dispositivo, con `stale_after_minutes` = el mínimo de las reglas que cubren sus variables; sin reglas no hay incidentes `stale` (la UI igual muestra "Sin señal" desde `latest`). `rule_id = null` en incidentes `stale`. `latest.stale` = el dispositivo es de la corrida y no tiene lectura en el último paso materializado.
- Reconocer es idempotente: el segundo `PATCH` devuelve 200 sin otro `AuditEvent`. Un incidente reconocido pasa a `closed` cuando la condición se despeja y conserva `acknowledged_at`. `severity` es siempre `warning` en este hito.
- `GET …/telemetry/readings`: sin `run_id` usa la corrida más reciente; `downsample=true` (por defecto) toma un paso de cada `k` (conserva los huecos) y devuelve `interval_minutes = step_minutes × k`; con `downsample=false` y más de 2 000 puntos → 422 `too_many_points`.
- Ruta adicional `POST /projects/{id}/simulation/demo` (editor, idempotente): crea "Sensor norte"/"Sensor sur" y dos "Regla demostrativa" (30 °C con histéresis 1; 45 % con histéresis 2) elegidas para que `heat_rise` dispare y `base` no (lo fija `test_demo_rules_trigger_heat_rise_but_not_base`). El seed solo crea el proyecto "Invernadero demostrativo" (sin área) con esa configuración si `SEED_DEMO_SIMULATION=1`; apagado por defecto para no tocar producción. El seed no inicia corridas.
- Sin UI para editar dispositivos, reglas ni parámetros del motor en V3: API completa; la pantalla ofrece "Preparar demostración", elegir escenario e iniciar con los parámetros de ejemplo, que se muestran de solo lectura con las limitaciones.
- Escala de los gauges = rangos físicos generales que acepta el motor (−10…50 °C, 0…100 %), no rangos óptimos.
- Nave: planta 1:2 a partir de `area_m2` (ancho `√(área/2)`); pared de 3 m y cumbrera `3 + 0.2 × ancho` siempre ilustrativas; sin área, 8 × 16 m rotulado "Tamaño ilustrativo". Posición de dispositivos en metros desde una esquina: `x` ancho, `y` largo, `z` altura.
- Inicio: por variable, la lectura más reciente con señal entre los dispositivos de la corrida actual del proyecto reciente; si todos perdieron la señal, `value = null` y `stale = true` ("Sin señal"); sin corrida, lista vacía ("Sin lecturas").
- Límites: 10 dispositivos y 20 reglas por proyecto (422 `device_limit` / `rule_limit`), 50 corridas y 100 incidentes por listado. Borrar una regla cierra sus incidentes abiertos (`closed_reason: rule_deleted`); un dispositivo borrado o desactivado a mitad de corrida deja de producir lecturas.
- Pestañas del proyecto: Resumen, Bitácora y Ciclos con `?tab=`; Operaciones es la ruta `/app/projects/:id/operations`. "Editar" vive en Resumen.

## Pruebas exigidas por el spec (sección 9, V3) → prueba concreta

| Exigencia del spec | Prueba | Tarea |
|---|---|---|
| Golden del motor: misma semilla/versión/inputs → serie idéntica; semilla distinta → distinta | `test_golden_same_seed_same_series_and_other_seed_differs`, `test_golden_snapshot_pins_didactic_v1`, `test_independent_of_calculation_order_and_device_noise_differs` | 1 |
| Materializar dos veces no duplica | `test_materializing_twice_does_not_duplicate` | 3 |
| Evento tardío conserva `observed_at` | `test_late_event_keeps_observed_at` | 3 |
| Pérdida de señal no genera lecturas y abre `stale` | `test_signal_loss_produces_no_readings_and_latest_is_stale` (3), `test_signal_loss_opens_stale_and_closes_on_recovery` (4) | 3, 4 |
| Histéresis y cooldown evitan tormenta | `test_without_hysteresis_or_cooldown_noise_causes_a_storm`, `test_hysteresis_prevents_storm`, `test_cooldown_in_simulated_time_prevents_storm` | 4 |
| Cancelación detiene la materialización | `test_cancel_stops_materialization` | 3 |
| Un run por proyecto | `test_one_active_run_per_project_and_reset_is_a_new_run`, `test_partial_unique_index_blocks_second_active_run` | 3 |
| Aislamiento entre proyectos y tenants | `test_device_isolation_between_tenants_and_projects` (2), `test_isolation_between_tenants_and_projects` (3), `test_rules_permissions_and_isolation`, `test_alerts_isolated_between_tenants` (4), `test_home_readings_isolated_between_tenants` (5) | 2–5 |
| Reconocimiento auditado | `test_acknowledge_is_audited_once_and_role_checked` | 4 |
| Evaluación idempotente (5.4) | `test_re_evaluating_the_same_steps_creates_no_duplicates`, `test_evaluate_called_twice_with_same_batch_is_idempotent` | 4 |
| Validación de inputs y ≤ 5 000 pasos (5.2) | `test_inputs_validated_against_general_physical_ranges`, `test_max_steps_boundary` (1), `test_run_requires_active_devices_and_valid_inputs` (3) | 1, 3 |
| Tope de 500 pasos por llamada, pausa/reanudar (5.3) | `test_catch_up_is_capped_at_500_steps_per_call`, `test_pause_freezes_and_resume_continues` | 3 |
| Máx. 2 000 puntos con downsample (5.5) | `test_readings_downsample_to_2000_points` | 3 |
| Reglas demostrativas etiquetadas (5.1) | `test_demo_setup_is_idempotent_and_labeled`, `test_demo_rules_trigger_heat_rise_but_not_base`, `test_seed_is_off_by_default_and_idempotent_when_on` | 5 |
| Inicio con últimas lecturas SIMULADO (5.6) | `test_home_shows_latest_simulated_readings_of_recent_project`, `test_home_reports_no_signal_when_all_devices_lost` (5); `muestra las últimas lecturas simuladas con su badge…` (8) | 5, 8 |
| Frontend: gráficas con huecos | `withGaps › corta la línea donde faltan pasos…` (6); `muestra la banda didáctica, gauges simulados, "Sin señal" y la línea con hueco` (9); `charts.test.tsx` existente | 6, 9 |
| Polling cada 5 s mientras corre (5.3/5.6) | `consulta cada 5 s mientras la corrida está en curso y se detiene en pausa` | 9 |
| Nave dimensionada por `area_m2` o ilustrativa (5.6) | `greenhouseDims` (6), `la nave mide lo que dice el área y tiene techo a dos aguas` (7), `sin corrida, los sensores muestran "Sin lecturas" y la escena usa el área registrada` (9) | 6, 7, 9 |
| Cierre de fase: tsc, vitest, pytest, build, smoke Docker, revisión visual, README | Task 10 | 10 |

## Contrato JSON (lo único que comparten los carriles)

Todas las rutas bajo `/api/v1`. Fechas ISO 8601 en UTC. Errores con el sobre existente `{"error": {"code", "message", "request_id", "details"}}`.

```jsonc
// Device — GET/POST /projects/{id}/devices, PATCH …/{did}
{"id": "uuid", "project_id": "uuid", "name": "Sensor norte", "kind": "simulated",
 "variables": ["air_temperature", "relative_humidity"], "x": 4.0, "y": 12.0, "z": 1.5,
 "status": "active", "created_at": "…"}
// POST body: {"name", "variables" (1–2, sin repetir), "x" 0–10000, "y" 0–10000, "z" 0–50, "status"?: "active"|"inactive"}

// SimulationRun — GET/POST /projects/{id}/simulation/runs, GET …/{rid}, POST …/{rid}/{pause|resume|cancel}
{"id": "uuid", "project_id": "uuid", "scenario": "base|heat_rise|sensor_loss", "model_version": "didactic-v1",
 "seed": 42, "inputs": {"temp_mean_c": 22.0, "temp_amplitude_c": 6.0, "peak_hour": 14.0, "temp_noise_c": 0.3,
   "humidity_mean_pct": 65.0, "humidity_coupling": 2.5, "humidity_noise_pct": 1.0, "step_minutes": 5,
   "horizon_hours": 24.0, "tick_seconds": 2.0, "heat_start_step": 60, "heat_ramp_steps": 36, "heat_end_step": 180,
   "heat_peak_c": 8.0, "loss_device": 0, "loss_start_step": 60, "loss_steps": 24},
 "device_ids": ["uuid", "uuid"], "status": "running|paused|completed|cancelled",
 "started_at": "…", "paused_at": null, "paused_seconds": 0.0, "ended_at": null,
 "total_steps": 288, "emitted_steps": 70, "sim_time": "…|null",
 "limits": ["Simulación didáctica, sin calibración agronómica.", "…"], "author_id": "uuid", "created_at": "…"}
// POST body: {"scenario", "seed"?: 0–2147483647, "inputs"?: {…parcial, extra prohibido}}
// 409 run_active · 409 run_state · 422 devices / inputs.loss_device

// GET /projects/{id}/telemetry/readings?variable=&device_id=&since=&until=&run_id=&downsample=
{"run_id": "uuid|null", "interval_minutes": 5, "downsampled": false,
 "points": [{"device_id": "uuid", "variable": "air_temperature", "value": 21.4, "unit": "Cel", "observed_at": "…"}]}

// GET /projects/{id}/telemetry/latest
{"run_id": "uuid|null", "run_status": "running|…|null", "sim_time": "…|null",
 "devices": [{"device_id": "uuid", "name": "Sensor norte", "x": 4.0, "y": 12.0, "z": 1.5,
   "readings": [{"variable": "air_temperature", "value": 21.2, "unit": "Cel", "observed_at": "…|null", "stale": false}]}]}

// AlertRule — GET/POST /projects/{id}/alert-rules, PATCH/DELETE …/{rid}
{"id": "uuid", "project_id": "uuid", "variable": "air_temperature", "comparator": "gt|lt", "threshold": 30.0,
 "hysteresis": 1.0, "cooldown_minutes": 30, "stale_after_minutes": 15, "label": "Regla demostrativa: …",
 "is_didactic": true, "created_at": "…"}

// Incident — GET /projects/{id}/alerts?status=&run_id=, PATCH /projects/{id}/alerts/{aid} body {"action": "acknowledge"}
{"id": "uuid", "project_id": "uuid", "rule_id": "uuid|null", "rule_label": "…|null", "scenario_run_id": "uuid",
 "kind": "threshold|stale", "device_id": "uuid", "device_name": "Sensor norte",
 "opened_at": "… (simulado)", "closed_at": "…|null (simulado)", "severity": "warning",
 "evidence": {"simulated": true, "…": "…"}, "status": "open|acknowledged|closed",
 "acknowledged_by": "uuid|null", "acknowledged_at": "…|null (real)"}

// POST /projects/{id}/simulation/demo
{"created_devices": 2, "created_rules": 2, "devices": [Device], "rules": [AlertRule]}

// GET /home (campo nuevo)
{"recent_project": …, "counts": …, "activity": […],
 "readings": [{"variable": "air_temperature", "value": 24.3, "unit": "Cel", "observed_at": "…",
   "stale": false, "device_name": "Sensor norte", "origin": "simulated"}]}
```

## Mapa de archivos

| Archivo | Tarea | Responsabilidad |
|---|---|---|
| `app/modules/simulation/__init__.py`, `engine.py` | 1 | `SimulationInputs`, `generate`, `heat_delta`, constantes |
| `tests/test_simulation_engine.py` | 1 | golden y validación de entradas |
| `app/modules/simulation/models.py` | 2 | `SimulationRun`, índice único parcial |
| `app/modules/simulation/clock.py` | 2 | `get_now`, `as_utc` |
| `app/modules/telemetry/__init__.py`, `models.py` | 2 | `Device`, `TelemetryReading`, `AlertRule`, `Incident` |
| `alembic/versions/0005_simulation_telemetry.py` | 2 | cinco tablas e índices |
| `app/models_registry.py`, `app/main.py` | 2, 3 | registro de modelos y routers |
| `app/modules/telemetry/schemas.py` | 2 | todos los esquemas de telemetría |
| `app/modules/telemetry/service.py` | 2, 3, 4 | dispositivos; lecturas; reglas e incidentes |
| `app/modules/telemetry/router.py` | 2, 3, 4, 5 | rutas de telemetría y demostración |
| `tests/test_devices.py` | 2 | CRUD de dispositivos |
| `app/modules/simulation/schemas.py`, `service.py`, `router.py` | 3, 4 | corridas y materialización |
| `tests/conftest.py` | 3 | fixture `clock` |
| `tests/test_simulation.py` | 3 | corridas, materialización, lecturas |
| `app/modules/telemetry/rules.py` | 4 | evaluación de reglas |
| `tests/test_alerts.py` | 4 | reglas, incidentes, reconocer |
| `app/modules/telemetry/demo.py`, `seed.py` | 5 | configuración demostrativa y seed |
| `app/core/config.py`, `scripts/seed.py`, `.env.example` | 5 | `SEED_DEMO_SIMULATION` |
| `app/modules/home/schemas.py`, `router.py`, `service.py` | 5 | lecturas en el inicio, textos de actividad |
| `tests/test_demo_simulation.py` | 5 | demo, seed, inicio |
| `frontend/src/features/operations/api.ts`, `format.ts`, `usePolling.ts` | 6 | cliente, formato puro, polling |
| `frontend/src/features/operations/format.test.ts` | 6 | huecos, medidas, textos |
| `frontend/src/features/three/greenhouse.ts`, `greenhouse.test.ts` | 7 | nave paramétrica |
| `frontend/src/features/operations/GreenhouseViewer.tsx`, `LazyGreenhouseViewer.tsx` | 7 | escena 3D con callouts |
| `frontend/src/features/projects/ProjectTabs.tsx` | 8 | pestañas en píldora |
| `frontend/src/features/projects/ProjectDetailPage.tsx`, `projects.test.tsx` | 8 | pestañas en el proyecto |
| `frontend/src/features/home/api.ts`, `HomePage.tsx`, `home.test.tsx` | 8 | lecturas SIMULADO en el inicio |
| `frontend/src/features/operations/OperationsPage.tsx`, `operations.test.tsx` | 9 | pantalla de operaciones |
| `frontend/src/App.tsx` | 9 | ruta `/app/projects/:id/operations` |
| `README.md` | 10 | checklist real / simulado / pendiente |

**Paralelismo:** dos carriles que solo comparten el contrato JSON de arriba.

- Carril backend: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 (secuencial: comparten `telemetry/service.py` y `router.py`).
- Carril frontend: Task 6 → {Task 7, Task 8} → Task 9. Task 7 y Task 8 no comparten archivos; Task 9 necesita la escena (7) y `ProjectTabs` (8).
- Task 10 al final, con ambos carriles integrados.

Cada carril trabaja en su propia rama `sdd/v3-backend` y `sdd/v3-front` desde `feat/hito-v3-invernadero`, y se integran con merge a esa rama antes de Task 10.

---

### Task 1: Motor `didactic-v1` puro y determinista

**Files:**
- Create: `app/modules/simulation/__init__.py` (vacío)
- Create: `app/modules/simulation/engine.py`
- Test: `tests/test_simulation_engine.py`

**Interfaces:**
- Consumes: nada.
- Produces: `MODEL_VERSION = "didactic-v1"`, `SCENARIOS`, `ScenarioLiteral`, `AIR_TEMPERATURE`, `RELATIVE_HUMIDITY`, `VARIABLES`, `VariableLiteral`, `UNITS = {"air_temperature": "Cel", "relative_humidity": "%"}`, `MAX_STEPS = 5000`, `LIMITS: list[str]`, `SimulationInputs` (pydantic, `extra="forbid"`, propiedad `total_steps`), `heat_delta(inputs, step) -> float`, `generate(seed, scenario, inputs, step, device=0) -> dict[str, float | None]`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/test_simulation_engine.py`:

```python
import pytest
from pydantic import ValidationError

from app.modules.simulation.engine import (
    AIR_TEMPERATURE,
    MAX_STEPS,
    MODEL_VERSION,
    RELATIVE_HUMIDITY,
    SCENARIOS,
    SimulationInputs,
    generate,
    heat_delta,
)

INPUTS = SimulationInputs()


def series(seed, scenario, inputs=INPUTS, device=0, steps=None):
    return [generate(seed, scenario, inputs, s, device) for s in (steps or range(inputs.total_steps))]


def test_defaults_are_example_values_with_288_steps():
    assert MODEL_VERSION == "didactic-v1"
    assert INPUTS.total_steps == 288  # 24 h a 5 min por paso


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_golden_same_seed_same_series_and_other_seed_differs(scenario):
    assert series(42, scenario) == series(42, scenario)
    assert series(42, scenario) != series(43, scenario)


def test_golden_snapshot_pins_didactic_v1():
    # Si cambian estos valores, cambió el motor: hay que subir MODEL_VERSION.
    assert generate(42, "base", INPUTS, 0) == {AIR_TEMPERATURE: 16.75, RELATIVE_HUMIDITY: 78.03}
    assert generate(42, "base", INPUTS, 100) == {AIR_TEMPERATURE: 22.42, RELATIVE_HUMIDITY: 64.41}
    assert generate(42, "heat_rise", INPUTS, 100) == {AIR_TEMPERATURE: 30.42, RELATIVE_HUMIDITY: 44.41}


def test_independent_of_calculation_order_and_device_noise_differs():
    forward = series(7, "base", steps=range(50))
    backward = list(reversed(series(7, "base", steps=range(49, -1, -1))))
    assert forward == backward
    assert series(7, "base", device=0, steps=range(10)) != series(7, "base", device=1, steps=range(10))


def test_heat_rise_ramps_saturates_and_ventilates():
    assert heat_delta(INPUTS, 59) == 0
    assert heat_delta(INPUTS, 60) == 0
    assert heat_delta(INPUTS, 78) == pytest.approx(4.0)  # mitad de la rampa de 36 pasos
    assert heat_delta(INPUTS, 96) == pytest.approx(8.0)  # saturación
    assert heat_delta(INPUTS, 179) == pytest.approx(8.0)
    assert heat_delta(INPUTS, 198) == pytest.approx(4.0)  # ventilación: baja con el mismo retardo
    assert heat_delta(INPUTS, 216) == 0
    base, heat = generate(1, "base", INPUTS, 120), generate(1, "heat_rise", INPUTS, 120)
    assert heat[AIR_TEMPERATURE] == pytest.approx(base[AIR_TEMPERATURE] + 8.0, abs=0.01)
    assert heat[RELATIVE_HUMIDITY] < base[RELATIVE_HUMIDITY]


def test_sensor_loss_only_affects_one_device_in_its_window():
    lost = series(3, "sensor_loss", device=0)
    other = series(3, "sensor_loss", device=1)
    missing = [i for i, v in enumerate(lost) if v[AIR_TEMPERATURE] is None]
    assert missing == list(range(60, 84))
    assert all(v == {AIR_TEMPERATURE: None, RELATIVE_HUMIDITY: None} for v in lost[60:84])
    assert all(v[AIR_TEMPERATURE] is not None for v in other)
    assert lost[84] == generate(3, "base", INPUTS, 84, 0)  # se recupera


def test_humidity_is_clamped_to_0_100():
    wet = SimulationInputs(temp_mean_c=20, temp_amplitude_c=20, humidity_mean_pct=100, humidity_coupling=10)
    values = [v[RELATIVE_HUMIDITY] for v in series(5, "base", wet)]
    assert max(values) == 100.0 and min(values) == 0.0
    assert all(0 <= v <= 100 for v in values)


@pytest.mark.parametrize(
    "bad",
    [
        {"temp_mean_c": 50.5},
        {"temp_mean_c": -10.5},
        {"temp_amplitude_c": 21},
        {"step_minutes": 0},
        {"step_minutes": 61},
        {"horizon_hours": 169},
        {"horizon_hours": 0},
        {"step_minutes": 1, "horizon_hours": 100},  # 6000 pasos > 5000
        {"tick_seconds": 0.4},
        {"heat_start_step": 100, "heat_end_step": 100},
        {"temp_mean_c": float("nan")},
        {"desconocido": 1},
    ],
)
def test_inputs_validated_against_general_physical_ranges(bad):
    with pytest.raises(ValidationError):
        SimulationInputs(**bad)


def test_max_steps_boundary():
    assert SimulationInputs(step_minutes=2, horizon_hours=MAX_STEPS * 2 / 60).total_steps == MAX_STEPS


def test_unknown_scenario_rejected():
    with pytest.raises(ValueError):
        generate(1, "tormenta", INPUTS, 0)
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_simulation_engine.py -q -p no:warnings`
Expected: FAIL en la colección con `ModuleNotFoundError: No module named 'app.modules.simulation'`.

- [ ] **Step 3: Motor**

Crear `app/modules/simulation/__init__.py` vacío y `app/modules/simulation/engine.py`:

```python
"""Motor didáctico `didactic-v1`: funciones puras, sin estado ni E/S.

No es un modelo agronómico: genera series plausibles para demostrar la plataforma.
"""
import math
import random
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MODEL_VERSION = "didactic-v1"

SCENARIO_BASE = "base"
SCENARIO_HEAT_RISE = "heat_rise"
SCENARIO_SENSOR_LOSS = "sensor_loss"
SCENARIOS = (SCENARIO_BASE, SCENARIO_HEAT_RISE, SCENARIO_SENSOR_LOSS)
ScenarioLiteral = Literal["base", "heat_rise", "sensor_loss"]

AIR_TEMPERATURE = "air_temperature"
RELATIVE_HUMIDITY = "relative_humidity"
VARIABLES = (AIR_TEMPERATURE, RELATIVE_HUMIDITY)
VariableLiteral = Literal["air_temperature", "relative_humidity"]
UNITS = {AIR_TEMPERATURE: "Cel", RELATIVE_HUMIDITY: "%"}

MAX_STEPS = 5000
MAX_HORIZON_HOURS = 168  # 7 días

LIMITS = [
    "Simulación didáctica, sin calibración agronómica.",
    "Modelo didactic-v1: curva diurna sinusoidal con ruido pseudoaleatorio; no representa un invernadero real.",
    "La humedad relativa se deriva de la temperatura con una relación inversa didáctica, acotada a 0–100 %.",
    "Los parámetros son valores de ejemplo dentro de rangos físicos generales; no son recomendaciones de cultivo.",
]


def _num(default: float, **bounds):
    return Field(default=default, allow_inf_nan=False, **bounds)


class SimulationInputs(BaseModel):
    """Parámetros del motor. Los valores por defecto son de ejemplo, nunca óptimos agronómicos."""

    model_config = ConfigDict(extra="forbid")

    temp_mean_c: float = _num(22.0, ge=-10, le=50)
    temp_amplitude_c: float = _num(6.0, ge=0, le=20)
    peak_hour: float = _num(14.0, ge=0, lt=24)
    temp_noise_c: float = _num(0.3, ge=0, le=5)
    humidity_mean_pct: float = _num(65.0, ge=0, le=100)
    humidity_coupling: float = _num(2.5, ge=0, le=10)
    humidity_noise_pct: float = _num(1.0, ge=0, le=10)
    step_minutes: int = Field(default=5, ge=1, le=60)
    horizon_hours: float = _num(24.0, gt=0, le=MAX_HORIZON_HOURS)
    tick_seconds: float = _num(2.0, ge=0.5, le=60)
    heat_start_step: int = Field(default=60, ge=0, le=MAX_STEPS)
    heat_ramp_steps: int = Field(default=36, ge=1, le=MAX_STEPS)
    heat_end_step: int = Field(default=180, ge=1, le=MAX_STEPS)
    heat_peak_c: float = _num(8.0, ge=0, le=20)
    loss_device: int = Field(default=0, ge=0, le=9)
    loss_start_step: int = Field(default=60, ge=0, le=MAX_STEPS)
    loss_steps: int = Field(default=24, ge=1, le=MAX_STEPS)

    @property
    def total_steps(self) -> int:
        return math.ceil(self.horizon_hours * 60 / self.step_minutes)

    @model_validator(mode="after")
    def _check(self):
        if self.total_steps > MAX_STEPS:
            raise ValueError(f"El horizonte genera {self.total_steps} pasos; el máximo por corrida es {MAX_STEPS}")
        if self.heat_end_step <= self.heat_start_step:
            raise ValueError("heat_end_step debe ser mayor que heat_start_step")
        return self


def heat_delta(inputs: SimulationInputs, step: int) -> float:
    """Rampa de `heat_rise`: sube durante `heat_ramp_steps` (retardo), satura en `heat_peak_c` y,
    desde `heat_end_step` (ventilación didáctica), baja con el mismo retardo."""
    start, ramp, end, peak = inputs.heat_start_step, inputs.heat_ramp_steps, inputs.heat_end_step, inputs.heat_peak_c
    if step < start:
        return 0.0
    if step < end:
        return peak * min(1.0, (step - start) / ramp)
    reached = peak * min(1.0, (end - start) / ramp)
    return reached * max(0.0, 1.0 - (step - end) / ramp)


def _noise(seed: int, step: int, device: int, variable: str, amplitude: float) -> float:
    # Un generador por (semilla, paso, dispositivo, variable): determinista e independiente del orden de cálculo.
    return random.Random(f"{seed}:{step}:{device}:{variable}").uniform(-amplitude, amplitude)


def generate(
    seed: int, scenario: str, inputs: SimulationInputs, step: int, device: int = 0
) -> dict[str, float | None]:
    """Valores de un dispositivo (índice en la corrida) en un paso. `None` = sin lectura."""
    if scenario not in SCENARIOS:
        raise ValueError(f"escenario desconocido: {scenario}")
    if (
        scenario == SCENARIO_SENSOR_LOSS
        and device == inputs.loss_device
        and inputs.loss_start_step <= step < inputs.loss_start_step + inputs.loss_steps
    ):
        return {v: None for v in VARIABLES}

    hours = step * inputs.step_minutes / 60
    temp = inputs.temp_mean_c + inputs.temp_amplitude_c * math.cos(2 * math.pi * (hours - inputs.peak_hour) / 24)
    if scenario == SCENARIO_HEAT_RISE:
        temp += heat_delta(inputs, step)
    temp += _noise(seed, step, device, AIR_TEMPERATURE, inputs.temp_noise_c)

    humidity = inputs.humidity_mean_pct - inputs.humidity_coupling * (temp - inputs.temp_mean_c)
    humidity += _noise(seed, step, device, RELATIVE_HUMIDITY, inputs.humidity_noise_pct)
    humidity = min(100.0, max(0.0, humidity))
    return {AIR_TEMPERATURE: round(temp, 2), RELATIVE_HUMIDITY: round(humidity, 2)}
```

- [ ] **Step 4: Correr las pruebas**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_simulation_engine.py -q -p no:warnings`
Expected: PASS (23 pruebas). Si `test_golden_snapshot_pins_didactic_v1` falla con valores distintos, el motor no es el del plan (no ajustar el snapshot).

- [ ] **Step 5: Commit**

```bash
git add app/modules/simulation tests/test_simulation_engine.py
git commit -m "feat(simulation): motor didactic-v1 puro y determinista con escenarios, validación de entradas y pruebas golden"
```

---

### Task 2: Modelos, migración 0005 y CRUD de dispositivos

**Files:**
- Create: `app/modules/simulation/clock.py`
- Create: `app/modules/simulation/models.py`
- Create: `app/modules/telemetry/__init__.py` (vacío)
- Create: `app/modules/telemetry/models.py`
- Create: `app/modules/telemetry/schemas.py`
- Create: `app/modules/telemetry/service.py`
- Create: `app/modules/telemetry/router.py`
- Create: `alembic/versions/0005_simulation_telemetry.py`
- Modify: `app/models_registry.py`
- Modify: `app/main.py`
- Test: `tests/test_devices.py`

**Interfaces:**
- Consumes: Task 1 (`VariableLiteral`, `UNITS`); `get_project` de `app/modules/projects/service.py`; `scoped`, `record`, `AppError`, `not_found`, `utcnow`.
- Produces:
  - Modelos `SimulationRun` (estados `RUN_RUNNING|RUN_PAUSED|RUN_COMPLETED|RUN_CANCELLED`, `ACTIVE_STATUSES`), `Device`, `TelemetryReading`, `AlertRule`, `Incident` y constantes de `telemetry/models.py` (`MAX_DEVICES = 10`, `INCIDENT_*`, `COMPARATOR_GT`, …).
  - `clock.get_now() -> datetime`, `clock.as_utc(dt) -> datetime | None`.
  - Todos los esquemas de telemetría (`DeviceCreate/Update/Out`, `AlertRuleCreate/Update/Out`, `ReadingPoint`, `ReadingsOut`, `LatestValue`, `LatestDevice`, `LatestOut`, `IncidentAction`, `IncidentOut`, `DemoSetupOut`).
  - `service.list_devices`, `active_devices`, `get_device`, `create_device`, `update_device`, `delete_device`.
  - Rutas `GET/POST /api/v1/projects/{id}/devices`, `PATCH/DELETE /api/v1/projects/{id}/devices/{did}` con el JSON `Device` del contrato.
  - Helpers de prueba `make_project`, `device_body`, `add_device` en `tests/test_devices.py` (los reutilizan Tasks 3–5).

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/test_devices.py`:

```python
import pytest

from app.modules.audit.models import AuditEvent

API = "/api/v1"


def make_project(client, headers, name="Invernadero norte", **extra):
    res = client.post(f"{API}/projects", json={"name": name, "system": "hydroponic", **extra}, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def device_body(name="Sensor norte", **extra):
    return {"name": name, "variables": ["air_temperature", "relative_humidity"], "x": 4.0, "y": 12.0, "z": 1.5, **extra}


def add_device(client, headers, project_id, **extra):
    return client.post(f"{API}/projects/{project_id}/devices", json=device_body(**extra), headers=headers)


def test_device_crud_and_audit(client, tenants, db):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    res = add_device(client, h, p["id"], name="  Sensor norte  ")
    assert res.status_code == 201, res.text
    d = res.json()
    assert d["name"] == "Sensor norte" and d["kind"] == "simulated" and d["status"] == "active"
    assert d["variables"] == ["air_temperature", "relative_humidity"] and (d["x"], d["y"], d["z"]) == (4.0, 12.0, 1.5)

    listed = client.get(f"{API}/projects/{p['id']}/devices", headers=tenants["alfa_viewer"])
    assert listed.status_code == 200 and [x["id"] for x in listed.json()] == [d["id"]]

    patched = client.patch(
        f"{API}/projects/{p['id']}/devices/{d['id']}", json={"name": "Sensor centro", "status": "inactive"}, headers=h
    )
    assert patched.status_code == 200 and patched.json()["name"] == "Sensor centro"
    assert patched.json()["status"] == "inactive"
    # PATCH sin cambios no audita
    assert client.patch(f"{API}/projects/{p['id']}/devices/{d['id']}", json={}, headers=h).status_code == 200

    assert client.delete(f"{API}/projects/{p['id']}/devices/{d['id']}", headers=h).status_code == 204
    assert client.get(f"{API}/projects/{p['id']}/devices", headers=h).json() == []
    assert client.patch(f"{API}/projects/{p['id']}/devices/{d['id']}", json={"name": "X"}, headers=h).status_code == 404
    ops = sorted(e.operation for e in db.query(AuditEvent).filter_by(resource_type="device"))
    assert ops == ["create", "delete", "update"]


def test_viewer_cannot_write_devices(client, tenants):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    did = add_device(client, h, p["id"]).json()["id"]
    v = tenants["alfa_viewer"]
    assert add_device(client, v, p["id"]).status_code == 403
    assert client.patch(f"{API}/projects/{p['id']}/devices/{did}", json={"name": "X"}, headers=v).status_code == 403
    assert client.delete(f"{API}/projects/{p['id']}/devices/{did}", headers=v).status_code == 403


def test_device_limit(client, tenants):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    for i in range(10):
        assert add_device(client, h, p["id"], name=f"S{i}").status_code == 201
    res = add_device(client, h, p["id"], name="S10")
    assert res.status_code == 422 and res.json()["error"]["code"] == "device_limit"


@pytest.mark.parametrize(
    "patch",
    [
        {"name": "   "},
        {"name": "x" * 121},
        {"variables": []},
        {"variables": ["air_temperature", "air_temperature"]},
        {"variables": ["co2"]},
        {"x": -1},
        {"z": 51},
        {"y": "inf"},
        {"kind": "physical"},
    ],
)
def test_device_validation(client, tenants, patch):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    res = client.post(f"{API}/projects/{p['id']}/devices", json={**device_body(), **patch}, headers=h)
    assert res.status_code == 422, res.text


def test_device_isolation_between_tenants_and_projects(client, tenants):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    other = make_project(client, h, name="Otro")
    did = add_device(client, h, p["id"]).json()["id"]
    b = tenants["beta_editor"]
    assert client.get(f"{API}/projects/{p['id']}/devices", headers=b).status_code == 404
    assert add_device(client, b, p["id"]).status_code == 404
    assert client.delete(f"{API}/projects/{p['id']}/devices/{did}", headers=b).status_code == 404
    # Un dispositivo no se alcanza a través de otro proyecto de la misma organización
    assert client.patch(f"{API}/projects/{other['id']}/devices/{did}", json={"name": "X"}, headers=h).status_code == 404
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_devices.py -q -p no:warnings`
Expected: FAIL (`assert 404 == 201` en `POST /devices`).

- [ ] **Step 3: Reloj inyectable**

Crear `app/modules/simulation/clock.py`:

```python
"""Reloj inyectable: las rutas reciben `now` por dependencia para que las pruebas no esperen."""
from datetime import datetime, timezone

from app.core.mixins import utcnow


def get_now() -> datetime:
    return utcnow()


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite devuelve fechas sin zona; Postgres, con zona. Todo se compara en UTC consciente."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
```

- [ ] **Step 4: Modelos**

Crear `app/modules/simulation/models.py`:

```python
"""Corridas de simulación (inmutables salvo su estado de ejecución)."""
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, TenantMixin, UUIDMixin

RUN_RUNNING = "running"
RUN_PAUSED = "paused"
RUN_COMPLETED = "completed"
RUN_CANCELLED = "cancelled"
ACTIVE_STATUSES = (RUN_RUNNING, RUN_PAUSED)

_ONE_ACTIVE_WHERE = text("status IN ('running', 'paused')")


class SimulationRun(UUIDMixin, TenantMixin, AuditMixin, Base):
    __tablename__ = "simulation_runs"
    __table_args__ = (
        # Un solo run activo (running o paused) por proyecto, también ante peticiones simultáneas.
        Index(
            "uq_simulation_runs_one_active",
            "project_id",
            unique=True,
            postgresql_where=_ONE_ACTIVE_WHERE,
            sqlite_where=_ONE_ACTIVE_WHERE,
        ),
    )

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    scenario: Mapped[str] = mapped_column(String(20), nullable=False)
    model_version: Mapped[str] = mapped_column(String(30), nullable=False)
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    inputs: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Dispositivos activos al iniciar, en orden: su posición es el índice que recibe el motor.
    device_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=RUN_RUNNING)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_seconds: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_steps: Mapped[int] = mapped_column(Integer, nullable=False)
    emitted_steps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    limits: Mapped[list] = mapped_column(JSON, nullable=False)
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
```

Crear `app/modules/telemetry/__init__.py` vacío y `app/modules/telemetry/models.py`:

```python
"""Dispositivos, lecturas, reglas de alerta e incidentes (privados por organización)."""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, TenantMixin, UUIDMixin

DEVICE_SIMULATED = "simulated"
DEVICE_PHYSICAL = "physical"  # reservado para HVT-022
DEVICE_ACTIVE = "active"
DEVICE_INACTIVE = "inactive"
MAX_DEVICES = 10

READING_SCHEMA_VERSION = 1
SOURCE_SIMULATED = "simulated"
QUALITY_SYNTHETIC = "synthetic"

COMPARATOR_GT = "gt"
COMPARATOR_LT = "lt"

INCIDENT_THRESHOLD = "threshold"
INCIDENT_STALE = "stale"
INCIDENT_OPEN = "open"
INCIDENT_ACKNOWLEDGED = "acknowledged"
INCIDENT_CLOSED = "closed"
SEVERITY_WARNING = "warning"


class Device(UUIDMixin, TenantMixin, AuditMixin, Base):
    """Sensor dentro del invernadero. x, y en metros sobre la planta (ancho, largo); z, altura."""

    __tablename__ = "devices"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default=DEVICE_SIMULATED)
    variables: Mapped[list] = mapped_column(JSON, nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    z: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=DEVICE_ACTIVE)


class TelemetryReading(UUIDMixin, TenantMixin, Base):
    """Lectura inmutable. La falta de señal es ausencia de fila, nunca un valor nulo ni cero."""

    __tablename__ = "telemetry_readings"
    __table_args__ = (
        UniqueConstraint("device_id", "event_id", name="uq_telemetry_readings_device_event"),
        Index("ix_telemetry_readings_project_variable_observed", "project_id", "variable", "observed_at"),
    )

    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=READING_SCHEMA_VERSION)
    event_id: Mapped[str] = mapped_column(String(36), nullable=False)
    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("devices.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    variable: Mapped[str] = mapped_column(String(40), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(10), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default=SOURCE_SIMULATED)
    quality: Mapped[str] = mapped_column(String(20), nullable=False, default=QUALITY_SYNTHETIC)
    scenario_run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("simulation_runs.id"), nullable=True, index=True
    )


class AlertRule(UUIDMixin, TenantMixin, AuditMixin, Base):
    __tablename__ = "alert_rules"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    variable: Mapped[str] = mapped_column(String(40), nullable=False)
    comparator: Mapped[str] = mapped_column(String(4), nullable=False)
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    hysteresis: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stale_after_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    is_didactic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Incident(UUIDMixin, TenantMixin, AuditMixin, Base):
    """opened_at y closed_at en tiempo simulado; acknowledged_at en tiempo real."""

    __tablename__ = "incidents"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    rule_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("alert_rules.id"), nullable=True, index=True)
    scenario_run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("simulation_runs.id"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("devices.id"), nullable=False, index=True)
    # (run, tipo, regla, dispositivo, paso de apertura): re-evaluar un rango no duplica incidentes.
    dedupe_key: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default=SEVERITY_WARNING)
    evidence: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=INCIDENT_OPEN)
    acknowledged_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

Al final de `app/models_registry.py`:

```python
from app.modules.simulation import models as simulation_models  # noqa: F401
from app.modules.telemetry import models as telemetry_models  # noqa: F401
```

- [ ] **Step 5: Migración**

Crear `alembic/versions/0005_simulation_telemetry.py`:

```python
"""invernadero virtual: dispositivos, corridas, lecturas, reglas e incidentes

Revision ID: 0005
Revises: 0004
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

ONE_ACTIVE = sa.text("status IN ('running', 'paused')")


def _tenant() -> list[sa.Column]:
    return [
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True),
    ]


def _audit() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "devices",
        *_tenant(),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("variables", sa.JSON(), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("z", sa.Float(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        *_audit(),
    )
    op.create_table(
        "simulation_runs",
        *_tenant(),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("scenario", sa.String(20), nullable=False),
        sa.Column("model_version", sa.String(30), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column("inputs", sa.JSON(), nullable=False),
        sa.Column("device_ids", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paused_seconds", sa.Float(), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_steps", sa.Integer(), nullable=False),
        sa.Column("emitted_steps", sa.Integer(), nullable=False),
        sa.Column("limits", sa.JSON(), nullable=False),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        *_audit(),
    )
    op.create_index(
        "uq_simulation_runs_one_active",
        "simulation_runs",
        ["project_id"],
        unique=True,
        postgresql_where=ONE_ACTIVE,
        sqlite_where=ONE_ACTIVE,
    )
    op.create_table(
        "alert_rules",
        *_tenant(),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("variable", sa.String(40), nullable=False),
        sa.Column("comparator", sa.String(4), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("hysteresis", sa.Float(), nullable=False),
        sa.Column("cooldown_minutes", sa.Integer(), nullable=False),
        sa.Column("stale_after_minutes", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(160), nullable=False),
        sa.Column("is_didactic", sa.Boolean(), nullable=False),
        *_audit(),
    )
    op.create_table(
        "telemetry_readings",
        *_tenant(),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.String(36), nullable=False),
        sa.Column("device_id", sa.String(36), sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("variable", sa.String(40), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(10), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("quality", sa.String(20), nullable=False),
        sa.Column(
            "scenario_run_id", sa.String(36), sa.ForeignKey("simulation_runs.id"), nullable=True, index=True
        ),
        sa.UniqueConstraint("device_id", "event_id", name="uq_telemetry_readings_device_event"),
    )
    op.create_index(
        "ix_telemetry_readings_project_variable_observed",
        "telemetry_readings",
        ["project_id", "variable", "observed_at"],
    )
    op.create_table(
        "incidents",
        *_tenant(),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("rule_id", sa.String(36), sa.ForeignKey("alert_rules.id"), nullable=True, index=True),
        sa.Column(
            "scenario_run_id", sa.String(36), sa.ForeignKey("simulation_runs.id"), nullable=True, index=True
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("device_id", sa.String(36), sa.ForeignKey("devices.id"), nullable=False, index=True),
        sa.Column("dedupe_key", sa.String(200), nullable=False, unique=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("acknowledged_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        *_audit(),
    )


def downgrade() -> None:
    op.drop_table("incidents")
    op.drop_index("ix_telemetry_readings_project_variable_observed", table_name="telemetry_readings")
    op.drop_table("telemetry_readings")
    op.drop_table("alert_rules")
    op.drop_index("uq_simulation_runs_one_active", table_name="simulation_runs")
    op.drop_table("simulation_runs")
    op.drop_table("devices")
```

- [ ] **Step 6: Esquemas**

Crear `app/modules/telemetry/schemas.py` (incluye ya los esquemas que usan Tasks 3–5):

```python
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.simulation.engine import VariableLiteral

Meters = Annotated[float, Field(ge=0, le=10000, allow_inf_nan=False)]
Height = Annotated[float, Field(ge=0, le=50, allow_inf_nan=False)]
DeviceStatusLiteral = Literal["active", "inactive"]
ComparatorLiteral = Literal["gt", "lt"]


def _clean_text(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if not v:
        raise ValueError("el texto es obligatorio")
    return v


def _unique_variables(v: list[str] | None) -> list[str] | None:
    if v is None:
        return None
    if len(set(v)) != len(v):
        raise ValueError("variables repetidas")
    return v


# ---- Dispositivos ----


class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["simulated"] = "simulated"
    variables: list[VariableLiteral] = Field(min_length=1, max_length=2)
    x: Meters
    y: Meters
    z: Height
    status: DeviceStatusLiteral = "active"

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return _clean_text(v)

    @field_validator("variables")
    @classmethod
    def _variables(cls, v: list[str] | None) -> list[str] | None:
        return _unique_variables(v)


class DeviceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    variables: list[VariableLiteral] | None = Field(default=None, min_length=1, max_length=2)
    x: Meters | None = None
    y: Meters | None = None
    z: Height | None = None
    status: DeviceStatusLiteral | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return _clean_text(v)

    @field_validator("variables")
    @classmethod
    def _variables(cls, v: list[str] | None) -> list[str] | None:
        return _unique_variables(v)


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    kind: str
    variables: list[str]
    x: float
    y: float
    z: float
    status: str
    created_at: datetime


# ---- Reglas ----


class AlertRuleCreate(BaseModel):
    variable: VariableLiteral
    comparator: ComparatorLiteral
    threshold: float = Field(ge=-1000, le=1000, allow_inf_nan=False)
    hysteresis: float = Field(default=0.0, ge=0, le=100, allow_inf_nan=False)
    cooldown_minutes: int = Field(default=0, ge=0, le=10080)
    stale_after_minutes: int = Field(default=15, ge=1, le=10080)
    label: str = Field(min_length=1, max_length=160)

    @field_validator("label")
    @classmethod
    def _label(cls, v: str | None) -> str | None:
        return _clean_text(v)


class AlertRuleUpdate(BaseModel):
    comparator: ComparatorLiteral | None = None
    threshold: float | None = Field(default=None, ge=-1000, le=1000, allow_inf_nan=False)
    hysteresis: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    cooldown_minutes: int | None = Field(default=None, ge=0, le=10080)
    stale_after_minutes: int | None = Field(default=None, ge=1, le=10080)
    label: str | None = Field(default=None, min_length=1, max_length=160)

    @field_validator("label")
    @classmethod
    def _label(cls, v: str | None) -> str | None:
        return _clean_text(v)


class AlertRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    variable: str
    comparator: str
    threshold: float
    hysteresis: float
    cooldown_minutes: int
    stale_after_minutes: int
    label: str
    is_didactic: bool
    created_at: datetime


# ---- Lecturas ----


class ReadingPoint(BaseModel):
    device_id: str
    variable: str
    value: float
    unit: str
    observed_at: datetime


class ReadingsOut(BaseModel):
    run_id: str | None
    interval_minutes: int | None
    downsampled: bool
    points: list[ReadingPoint]


class LatestValue(BaseModel):
    variable: str
    value: float | None
    unit: str
    observed_at: datetime | None
    stale: bool


class LatestDevice(BaseModel):
    device_id: str
    name: str
    x: float
    y: float
    z: float
    readings: list[LatestValue]


class LatestOut(BaseModel):
    run_id: str | None
    run_status: str | None
    sim_time: datetime | None
    devices: list[LatestDevice]


# ---- Incidentes ----


class IncidentAction(BaseModel):
    action: Literal["acknowledge"]


class IncidentOut(BaseModel):
    id: str
    project_id: str
    rule_id: str | None
    rule_label: str | None
    scenario_run_id: str | None
    kind: str
    device_id: str
    device_name: str
    opened_at: datetime
    closed_at: datetime | None
    severity: str
    evidence: dict
    status: str
    acknowledged_by: str | None
    acknowledged_at: datetime | None


# ---- Demostración ----


class DemoSetupOut(BaseModel):
    created_devices: int
    created_rules: int
    devices: list[DeviceOut]
    rules: list[AlertRuleOut]
```

- [ ] **Step 7: Servicio de dispositivos**

Crear `app/modules/telemetry/service.py`. El bloque de imports ya trae lo que usan las secciones de Tasks 3 y 4 (todos esos nombres existen tras este paso):

```python
import math
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.deps import RequestContext
from app.core.errors import AppError, not_found
from app.core.mixins import utcnow
from app.core.tenant import scoped
from app.modules.projects.models import Project
from app.modules.simulation.clock import as_utc
from app.modules.simulation.engine import UNITS
from app.modules.telemetry.models import (
    DEVICE_ACTIVE,
    INCIDENT_ACKNOWLEDGED,
    INCIDENT_CLOSED,
    INCIDENT_OPEN,
    MAX_DEVICES,
    AlertRule,
    Device,
    Incident,
    TelemetryReading,
)
from app.modules.telemetry.schemas import (
    AlertRuleCreate,
    AlertRuleUpdate,
    DeviceCreate,
    DeviceUpdate,
    IncidentOut,
    LatestDevice,
    LatestOut,
    LatestValue,
    ReadingPoint,
    ReadingsOut,
)

DEVICE_RESOURCE = "device"

# ---- Dispositivos ----


def list_devices(db: Session, ctx: RequestContext, project: Project) -> list[Device]:
    stmt = scoped(Device, ctx).where(Device.project_id == project.id).order_by(Device.created_at, Device.id)
    return list(db.scalars(stmt))


def active_devices(db: Session, ctx: RequestContext, project: Project) -> list[Device]:
    return [d for d in list_devices(db, ctx, project) if d.status == DEVICE_ACTIVE]


def get_device(db: Session, ctx: RequestContext, project: Project, device_id: str) -> Device:
    device = db.scalar(scoped(Device, ctx).where(Device.id == device_id, Device.project_id == project.id))
    if device is None:
        raise not_found("dispositivo")
    return device


def create_device(db: Session, ctx: RequestContext, project: Project, data: DeviceCreate) -> Device:
    count = db.scalar(
        select(func.count()).select_from(scoped(Device, ctx).where(Device.project_id == project.id).subquery())
    )
    if (count or 0) >= MAX_DEVICES:
        raise AppError(422, "device_limit", f"Máximo {MAX_DEVICES} dispositivos por proyecto", {"max": MAX_DEVICES})
    device = Device(organization_id=ctx.organization_id, project_id=project.id, **data.model_dump())
    db.add(device)
    db.flush()
    record(db, ctx, DEVICE_RESOURCE, device.id, "create", {"project_id": project.id, "name": device.name})
    db.commit()
    return device


def update_device(db: Session, ctx: RequestContext, project: Project, device_id: str, data: DeviceUpdate) -> Device:
    device = get_device(db, ctx, project, device_id)
    changes: dict = {}
    for attr in ("name", "variables", "x", "y", "z", "status"):
        value = getattr(data, attr)
        if attr in data.model_fields_set and value is not None and value != getattr(device, attr):
            setattr(device, attr, value)
            changes[attr] = value
    if changes:
        record(db, ctx, DEVICE_RESOURCE, device.id, "update", changes)
    db.commit()
    return device


def delete_device(db: Session, ctx: RequestContext, project: Project, device_id: str) -> None:
    device = get_device(db, ctx, project, device_id)
    device.deleted_at = utcnow()
    record(db, ctx, DEVICE_RESOURCE, device.id, "delete", {"project_id": project.id, "name": device.name})
    db.commit()
```

- [ ] **Step 8: Rutas**

Crear `app/modules/telemetry/router.py`:

```python
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, require_role
from app.modules.identity.models import ROLE_EDITOR, ROLE_VIEWER
from app.modules.projects.service import get_project
from app.modules.telemetry import service
from app.modules.telemetry.schemas import DeviceCreate, DeviceOut, DeviceUpdate

viewer = require_role(ROLE_VIEWER)
editor = require_role(ROLE_EDITOR)

router = APIRouter(prefix="/projects", tags=["telemetry"])


# ---- Dispositivos ----


@router.get("/{project_id}/devices", response_model=list[DeviceOut])
def list_devices(project_id: str, ctx: RequestContext = Depends(viewer), db: Session = Depends(get_db)):
    return service.list_devices(db, ctx, get_project(db, ctx, project_id))


@router.post("/{project_id}/devices", response_model=DeviceOut, status_code=201)
def create_device(
    project_id: str, data: DeviceCreate, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)
):
    return service.create_device(db, ctx, get_project(db, ctx, project_id), data)


@router.patch("/{project_id}/devices/{device_id}", response_model=DeviceOut)
def update_device(
    project_id: str,
    device_id: str,
    data: DeviceUpdate,
    ctx: RequestContext = Depends(editor),
    db: Session = Depends(get_db),
):
    return service.update_device(db, ctx, get_project(db, ctx, project_id), device_id, data)


@router.delete("/{project_id}/devices/{device_id}", status_code=204)
def delete_device(
    project_id: str, device_id: str, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)
):
    service.delete_device(db, ctx, get_project(db, ctx, project_id), device_id)
    return Response(status_code=204)
```

En `app/main.py`, añadir la importación después de la de `prototypes_router`:

```python
from app.modules.telemetry.router import router as telemetry_router
```

y reemplazar el bucle de routers por:

```python
    for router in (
        identity_router,
        catalog_router,
        projects_router,
        prototypes_router,
        home_router,
        telemetry_router,
    ):
        api.include_router(router)
```

- [ ] **Step 9: Correr las pruebas**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_devices.py -q -p no:warnings`
Expected: PASS (13 pruebas). Luego la suite completa: `~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings` → todo PASS.

- [ ] **Step 10: Migración en Postgres 17**

```bash
docker run -d --rm --name hvt-pg-v3 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=hvt -p 55435:5432 postgres:17
until docker exec hvt-pg-v3 pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
export DATABASE_URL=postgresql://postgres:pg@localhost:55435/hvt
~/.venvs/harvestt/bin/python -m alembic upgrade head
~/.venvs/harvestt/bin/python -m alembic check
~/.venvs/harvestt/bin/python -m alembic downgrade 0004
~/.venvs/harvestt/bin/python -m alembic upgrade head
~/.venvs/harvestt/bin/python -m alembic check
docker stop hvt-pg-v3
unset DATABASE_URL
```

Expected: `Running upgrade 0004 -> 0005`, `Running downgrade 0005 -> 0004`, y las dos veces `alembic check` imprime "No new upgrade operations detected."

- [ ] **Step 11: Commit**

```bash
git add app/modules/simulation app/modules/telemetry app/models_registry.py app/main.py alembic/versions/0005_simulation_telemetry.py tests/test_devices.py
git commit -m "feat(telemetry): modelos del invernadero virtual, migración 0005 y CRUD auditado de dispositivos"
```

---

### Task 3: Corridas, materialización sin worker y lecturas

**Files:**
- Create: `app/modules/simulation/schemas.py`
- Create: `app/modules/simulation/service.py`
- Create: `app/modules/simulation/router.py`
- Modify: `app/modules/telemetry/service.py` (sección Lecturas)
- Modify: `app/modules/telemetry/router.py` (imports y rutas de lecturas)
- Modify: `app/main.py`
- Modify: `tests/conftest.py` (fixture `clock`)
- Test: `tests/test_simulation.py`

**Interfaces:**
- Consumes: Task 1 (`generate`, `SimulationInputs`, `LIMITS`, `MODEL_VERSION`, `UNITS`), Task 2 (modelos, `active_devices`, `as_utc`, `get_now`, esquemas `ReadingsOut`/`LatestOut`).
- Produces:
  - `simulation.service`: `MAX_STEPS_PER_CALL = 500`, `StepValues(step, observed_at, values)`, `run_inputs`, `step_time(run, step, inputs=None)`, `sim_time(run)`, `target_steps(run, now)`, `event_id(run_id, step, device_id, variable)`, `materialize(db, run_id, now, limit=500) -> int`, `current_run`, `refresh_current_run(db, ctx, project, now)`, `run_out`, `active_run`, `get_run`, `list_runs`, `create_run`, `pause_run`, `resume_run`, `cancel_run`.
  - `telemetry.service`: `MAX_POINTS = 2000`, `insert_readings(db, rows)`, `query_readings(...) -> ReadingsOut`, `latest_readings(db, ctx, project, run, current) -> LatestOut`.
  - Rutas `GET/POST /projects/{id}/simulation/runs`, `GET …/{rid}`, `POST …/{rid}/{pause,resume,cancel}`, `GET /projects/{id}/telemetry/readings`, `GET /projects/{id}/telemetry/latest` (JSON del contrato).
  - Fixture `clock` (`FrozenClock` con `.now` y `.advance(seconds)`), helpers de prueba `TICK`, `start`, `runs_url`, `latest`, `reading_count` en `tests/test_simulation.py`.

- [ ] **Step 1: Fixture de reloj**

Añadir al final de `tests/conftest.py`:

```python
class FrozenClock:
    """Reloj que solo avanza cuando la prueba lo pide."""

    def __init__(self):
        from datetime import datetime, timezone

        self.now = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)

    def advance(self, seconds: float) -> None:
        from datetime import timedelta

        self.now += timedelta(seconds=seconds)


@pytest.fixture
def clock():
    from app.modules.simulation.clock import get_now

    frozen = FrozenClock()
    app.dependency_overrides[get_now] = lambda: frozen.now
    yield frozen
    app.dependency_overrides.pop(get_now, None)
```

- [ ] **Step 2: Escribir las pruebas que fallan**

Crear `tests/test_simulation.py`:

```python
from datetime import timedelta, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.modules.audit.models import AuditEvent
from app.modules.simulation import service as simulation
from app.modules.simulation.models import SimulationRun
from app.modules.telemetry.models import TelemetryReading
from tests.test_devices import add_device, make_project

API = "/api/v1"
TICK = 2  # segundos reales por paso (valor por defecto)


@pytest.fixture
def setup(client, tenants):
    """Proyecto de alfa con dos sensores."""
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    d1 = add_device(client, h, p["id"], name="Sensor norte").json()
    d2 = add_device(client, h, p["id"], name="Sensor sur", y=4.0).json()
    return {"h": h, "project": p, "devices": [d1, d2]}


def runs_url(pid):
    return f"{API}/projects/{pid}/simulation/runs"


def start(client, headers, pid, scenario="base", seed=7, **inputs):
    return client.post(runs_url(pid), json={"scenario": scenario, "seed": seed, "inputs": inputs}, headers=headers)


def reading_count(db, run_id=None):
    stmt = select(func.count()).select_from(TelemetryReading)
    if run_id:
        stmt = stmt.where(TelemetryReading.scenario_run_id == run_id)
    return db.scalar(stmt)


def latest(client, headers, pid):
    res = client.get(f"{API}/projects/{pid}/telemetry/latest", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


# ---- Corridas ----


def test_create_run_returns_reproducible_metadata_and_audits(client, setup, clock, db):
    s = setup
    res = start(client, s["h"], s["project"]["id"], seed=42)
    assert res.status_code == 201, res.text
    run = res.json()
    assert run["status"] == "running" and run["seed"] == 42 and run["model_version"] == "didactic-v1"
    assert run["total_steps"] == 288 and run["emitted_steps"] == 0 and run["sim_time"] is None
    assert run["device_ids"] == [d["id"] for d in s["devices"]]
    assert run["inputs"]["step_minutes"] == 5 and run["inputs"]["tick_seconds"] == 2.0
    assert "Simulación didáctica, sin calibración agronómica." in run["limits"]
    assert db.query(AuditEvent).filter_by(resource_type="simulation_run", operation="create").count() == 1


def test_seed_is_chosen_by_server_when_missing(client, setup, clock):
    s = setup
    res = client.post(runs_url(s["project"]["id"]), json={"scenario": "base"}, headers=s["h"])
    assert res.status_code == 201 and isinstance(res.json()["seed"], int)


def test_run_requires_active_devices_and_valid_inputs(client, tenants, setup, clock):
    h = tenants["alfa_editor"]
    empty = make_project(client, h, name="Vacío")
    res = start(client, h, empty["id"])
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "devices"
    pid = setup["project"]["id"]
    assert start(client, h, pid, temp_mean_c=80).status_code == 422
    assert start(client, h, pid, step_minutes=1, horizon_hours=100).status_code == 422
    assert start(client, h, pid, scenario="sensor_loss", loss_device=2).status_code == 422
    assert client.post(runs_url(pid), json={"scenario": "tormenta"}, headers=h).status_code == 422


def test_one_active_run_per_project_and_reset_is_a_new_run(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    first = start(client, s["h"], pid).json()
    res = start(client, s["h"], pid)
    assert res.status_code == 409 and res.json()["error"]["code"] == "run_active"
    client.post(f"{runs_url(pid)}/{first['id']}/pause", headers=s["h"])
    assert start(client, s["h"], pid).status_code == 409  # en pausa también cuenta como activo
    client.post(f"{runs_url(pid)}/{first['id']}/cancel", headers=s["h"])
    second = start(client, s["h"], pid)
    assert second.status_code == 201  # "reset" = corrida nueva; la anterior queda intacta
    runs = client.get(runs_url(pid), headers=s["h"]).json()
    assert [r["id"] for r in runs] == [second.json()["id"], first["id"]]
    assert runs[1]["status"] == "cancelled"


def test_partial_unique_index_blocks_second_active_run(client, setup, clock, db):
    s = setup
    run = start(client, s["h"], s["project"]["id"]).json()
    original = db.get(SimulationRun, run["id"])
    clone = SimulationRun(
        organization_id=original.organization_id,
        project_id=original.project_id,
        scenario="base",
        model_version="didactic-v1",
        seed=1,
        inputs=original.inputs,
        device_ids=original.device_ids,
        status="paused",
        started_at=clock.now,
        paused_seconds=0,
        total_steps=10,
        emitted_steps=0,
        limits=[],
        author_id=original.author_id,
    )
    db.add(clone)
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_state_transitions_and_conflicts(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid).json()["id"]
    assert client.post(f"{runs_url(pid)}/{rid}/resume", headers=s["h"]).status_code == 409
    assert client.post(f"{runs_url(pid)}/{rid}/pause", headers=s["h"]).json()["status"] == "paused"
    assert client.post(f"{runs_url(pid)}/{rid}/pause", headers=s["h"]).status_code == 409
    assert client.post(f"{runs_url(pid)}/{rid}/resume", headers=s["h"]).json()["status"] == "running"
    assert client.post(f"{runs_url(pid)}/{rid}/cancel", headers=s["h"]).json()["status"] == "cancelled"
    res = client.post(f"{runs_url(pid)}/{rid}/cancel", headers=s["h"])
    assert res.status_code == 409 and res.json()["error"]["code"] == "run_state"


def test_viewer_reads_but_cannot_control(client, tenants, setup, clock):
    s = setup
    pid = s["project"]["id"]
    v = tenants["alfa_viewer"]
    assert start(client, v, pid).status_code == 403
    rid = start(client, s["h"], pid).json()["id"]
    assert client.get(f"{runs_url(pid)}/{rid}", headers=v).status_code == 200
    for action in ("pause", "resume", "cancel"):
        assert client.post(f"{runs_url(pid)}/{rid}/{action}", headers=v).status_code == 403


# ---- Materialización ----


def test_materializes_on_read_from_clock(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    run = start(client, s["h"], pid).json()
    assert latest(client, s["h"], pid)["sim_time"] is None  # aún no pasa el primer tick
    clock.advance(10 * TICK + 1)
    body = latest(client, s["h"], pid)
    assert reading_count(db, run["id"]) == 10 * 2 * 2  # 10 pasos × 2 sensores × 2 variables
    got = client.get(f"{runs_url(pid)}/{run['id']}", headers=s["h"]).json()
    assert got["emitted_steps"] == 10
    started = clock.now - timedelta(seconds=10 * TICK + 1)
    assert body["sim_time"].replace("Z", "+00:00") == (started + timedelta(minutes=9 * 5)).isoformat()
    assert all(r["value"] is not None and not r["stale"] for d in body["devices"] for r in d["readings"])


def test_materializing_twice_does_not_duplicate(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    run = start(client, s["h"], pid).json()
    clock.advance(20 * TICK)
    latest(client, s["h"], pid)
    latest(client, s["h"], pid)
    count = reading_count(db, run["id"])
    assert count == 20 * 4
    # Una petición concurrente que leyó emitted_steps viejo vuelve a generar los mismos pasos: mismos event_id.
    row = db.get(SimulationRun, run["id"])
    row.emitted_steps = 0
    db.commit()
    assert simulation.materialize(db, run["id"], clock.now) == 20
    assert reading_count(db, run["id"]) == count


def test_late_event_keeps_observed_at(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    run = start(client, s["h"], pid).json()
    started = clock.now
    clock.advance(100 * TICK)  # nadie leyó durante 200 s: los 100 pasos se materializan tarde
    latest(client, s["h"], pid)
    rows = db.scalars(
        select(TelemetryReading).where(TelemetryReading.scenario_run_id == run["id"]).order_by(TelemetryReading.observed_at)
    ).all()
    first, last = rows[0], rows[-1]
    assert first.observed_at.replace(tzinfo=timezone.utc) == started
    assert last.observed_at.replace(tzinfo=timezone.utc) == started + timedelta(minutes=99 * 5)
    assert {r.received_at.replace(tzinfo=timezone.utc) for r in rows} == {clock.now}
    assert {(r.source, r.quality, r.schema_version) for r in rows} == {("simulated", "synthetic", 1)}
    assert {r.unit for r in rows} == {"Cel", "%"}


def test_catch_up_is_capped_at_500_steps_per_call(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid, horizon_hours=168).json()["id"]  # 2016 pasos
    clock.advance(3000 * TICK)  # el usuario vuelve horas después
    emitted = []
    for _ in range(5):
        run = client.get(f"{runs_url(pid)}/{rid}", headers=s["h"]).json()
        emitted.append((run["emitted_steps"], run["status"]))
    assert emitted == [(500, "running"), (1000, "running"), (1500, "running"), (2000, "running"), (2016, "completed")]


def test_pause_freezes_and_resume_continues(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid).json()["id"]
    clock.advance(5 * TICK)
    client.post(f"{runs_url(pid)}/{rid}/pause", headers=s["h"])
    clock.advance(100)
    assert client.get(f"{runs_url(pid)}/{rid}", headers=s["h"]).json()["emitted_steps"] == 5
    resumed = client.post(f"{runs_url(pid)}/{rid}/resume", headers=s["h"]).json()
    assert resumed["paused_seconds"] == 100
    clock.advance(2 * TICK)
    assert client.get(f"{runs_url(pid)}/{rid}", headers=s["h"]).json()["emitted_steps"] == 7


def test_cancel_stops_materialization(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid).json()["id"]
    clock.advance(5 * TICK)
    client.post(f"{runs_url(pid)}/{rid}/cancel", headers=s["h"])
    clock.advance(500)
    run = client.get(f"{runs_url(pid)}/{rid}", headers=s["h"]).json()
    assert run["status"] == "cancelled" and run["emitted_steps"] == 5
    latest(client, s["h"], pid)
    assert reading_count(db, rid) == 5 * 4


def test_run_completes_at_total_steps(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid, horizon_hours=1).json()["id"]  # 12 pasos
    clock.advance(1000)
    run = client.get(f"{runs_url(pid)}/{rid}", headers=s["h"]).json()
    assert run["status"] == "completed" and run["emitted_steps"] == 12 and run["ended_at"] is not None
    assert start(client, s["h"], pid).status_code == 201


def test_deleted_device_stops_producing_readings(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid).json()["id"]
    clock.advance(5 * TICK)
    latest(client, s["h"], pid)
    client.delete(f"{API}/projects/{pid}/devices/{s['devices'][1]['id']}", headers=s["h"])
    clock.advance(5 * TICK)
    latest(client, s["h"], pid)
    assert reading_count(db, rid) == 5 * 4 + 5 * 2


# ---- Pérdida de señal ----


def test_signal_loss_produces_no_readings_and_latest_is_stale(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    lost, ok = s["devices"]
    rid = start(client, s["h"], pid, scenario="sensor_loss", loss_start_step=2, loss_steps=3).json()["id"]
    clock.advance(4 * TICK)  # pasos 0..3: el sensor 0 ya no reporta en 2 y 3
    body = latest(client, s["h"], pid)
    by_device = {d["device_id"]: d for d in body["devices"]}
    assert all(r["stale"] for r in by_device[lost["id"]]["readings"])
    assert all(not r["stale"] for r in by_device[ok["id"]]["readings"])
    clock.advance(6 * TICK)
    latest(client, s["h"], pid)
    observed = db.scalars(
        select(TelemetryReading.observed_at).where(
            TelemetryReading.scenario_run_id == rid,
            TelemetryReading.device_id == lost["id"],
            TelemetryReading.variable == "air_temperature",
        )
    ).all()
    started = clock.now - timedelta(seconds=10 * TICK)
    steps = sorted(round((o.replace(tzinfo=timezone.utc) - started).total_seconds() / 300) for o in observed)
    assert steps == [0, 1, 5, 6, 7, 8, 9]  # pasos 2, 3 y 4 sin fila (ni None ni 0)
    assert db.scalar(select(func.count()).select_from(TelemetryReading).where(TelemetryReading.value == 0)) == 0
    body = latest(client, s["h"], pid)
    assert not any(r["stale"] for d in body["devices"] for r in d["readings"])  # se recuperó


# ---- Lecturas ----


def readings(client, headers, pid, **params):
    return client.get(f"{API}/projects/{pid}/telemetry/readings", params=params, headers=headers)


def test_readings_filters_and_timezone_offsets(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    d1 = s["devices"][0]["id"]
    start(client, s["h"], pid)
    started = clock.now
    clock.advance(12 * TICK)
    body = readings(client, s["h"], pid, variable="air_temperature", device_id=d1).json()
    assert body["interval_minutes"] == 5 and body["downsampled"] is False
    assert len(body["points"]) == 12
    assert {(p["variable"], p["unit"], p["device_id"]) for p in body["points"]} == {("air_temperature", "Cel", d1)}
    # since/until con desfase horario (-06:00) equivalen a la misma hora UTC
    local = timezone(timedelta(hours=-6))
    since = (started + timedelta(minutes=10)).astimezone(local).isoformat()
    until = (started + timedelta(minutes=25)).astimezone(local).isoformat()
    window = readings(client, s["h"], pid, variable="air_temperature", device_id=d1, since=since, until=until).json()
    assert len(window["points"]) == 4  # pasos 2, 3, 4 y 5


def test_readings_downsample_to_2000_points(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    d1 = s["devices"][0]["id"]
    rid = start(client, s["h"], pid, step_minutes=1, horizon_hours=60).json()["id"]  # 3600 pasos
    clock.advance(3600 * TICK)
    simulation.materialize(db, rid, clock.now, limit=5000)
    body = readings(client, s["h"], pid, variable="air_temperature", device_id=d1).json()
    assert body["downsampled"] is True and body["interval_minutes"] == 2
    assert len(body["points"]) == 1800
    both = readings(client, s["h"], pid, device_id=d1).json()  # 2 variables × 3600
    assert len(both["points"]) <= 2000 and both["interval_minutes"] == 4
    res = readings(client, s["h"], pid, variable="air_temperature", device_id=d1, downsample="false")
    assert res.status_code == 422 and res.json()["error"]["code"] == "too_many_points"


def test_readings_without_runs_is_empty(client, setup):
    body = readings(client, setup["h"], setup["project"]["id"]).json()
    assert body == {"run_id": None, "interval_minutes": None, "downsampled": False, "points": []}
    body = latest(client, setup["h"], setup["project"]["id"])
    assert body["run_id"] is None
    assert all(r["value"] is None and not r["stale"] for d in body["devices"] for r in d["readings"])


def test_readings_of_previous_run(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    first = start(client, s["h"], pid).json()["id"]
    clock.advance(3 * TICK)
    client.post(f"{runs_url(pid)}/{first}/cancel", headers=s["h"])
    start(client, s["h"], pid)
    clock.advance(1 * TICK)
    assert len(readings(client, s["h"], pid).json()["points"]) == 4
    old = readings(client, s["h"], pid, run_id=first).json()
    assert old["run_id"] == first and len(old["points"]) == 12


def test_isolation_between_tenants_and_projects(client, tenants, setup, clock):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid).json()["id"]
    clock.advance(4 * TICK)
    b = tenants["beta_editor"]
    assert client.get(runs_url(pid), headers=b).status_code == 404
    assert client.get(f"{runs_url(pid)}/{rid}", headers=b).status_code == 404
    assert client.post(f"{runs_url(pid)}/{rid}/pause", headers=b).status_code == 404
    assert readings(client, b, pid).status_code == 404
    assert client.get(f"{API}/projects/{pid}/telemetry/latest", headers=b).status_code == 404
    other = make_project(client, s["h"], name="Otro")
    assert client.get(f"{runs_url(other['id'])}/{rid}", headers=s["h"]).status_code == 404
    assert readings(client, s["h"], other["id"], run_id=rid).status_code == 404
```

- [ ] **Step 3: Verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_simulation.py -q -p no:warnings`
Expected: FAIL en la colección (`ModuleNotFoundError: No module named 'app.modules.simulation.service'`).

- [ ] **Step 4: Esquemas de corridas**

Crear `app/modules/simulation/schemas.py`:

```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.simulation.engine import ScenarioLiteral, SimulationInputs


class RunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario: ScenarioLiteral
    # Sin semilla, el servidor elige una y la devuelve: la corrida sigue siendo reproducible.
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    inputs: SimulationInputs = Field(default_factory=SimulationInputs)


class RunOut(BaseModel):
    id: str
    project_id: str
    scenario: str
    model_version: str
    seed: int
    inputs: dict
    device_ids: list[str]
    status: str
    started_at: datetime
    paused_at: datetime | None
    paused_seconds: float
    ended_at: datetime | None
    total_steps: int
    emitted_steps: int
    sim_time: datetime | None
    limits: list[str]
    author_id: str
    created_at: datetime
```

- [ ] **Step 5: Lecturas en el servicio de telemetría**

Añadir al final de `app/modules/telemetry/service.py`:

```python
# ---- Lecturas ----

MAX_POINTS = 2000
INSERT_CHUNK = 1000  # 14 columnas × 1000 filas: bajo el límite de parámetros de Postgres y SQLite


def insert_readings(db: Session, rows: list[dict]) -> None:
    """INSERT … ON CONFLICT (device_id, event_id) DO NOTHING en Postgres y en SQLite."""
    if not rows:
        return
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:  # pragma: no cover
        raise RuntimeError(f"Dialecto sin inserción idempotente: {dialect}")
    table = TelemetryReading.__table__
    for i in range(0, len(rows), INSERT_CHUNK):
        stmt = insert(table).values(rows[i : i + INSERT_CHUNK])
        db.execute(stmt.on_conflict_do_nothing(index_elements=["device_id", "event_id"]))


def _stride(steps: list[int], series: int) -> int:
    """Menor salto entre pasos que deja como máximo MAX_POINTS puntos."""
    if not steps:
        return 1
    span = max(steps) - min(steps) + 1
    stride = 1
    while math.ceil(span / stride) * series > MAX_POINTS:
        stride += 1
    return stride


def query_readings(
    db: Session,
    ctx: RequestContext,
    project: Project,
    run,
    *,
    variable: str | None = None,
    device_id: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    downsample: bool = True,
) -> ReadingsOut:
    if run is None:
        return ReadingsOut(run_id=None, interval_minutes=None, downsampled=False, points=[])
    step_minutes = int(run.inputs["step_minutes"])
    stmt = select(
        TelemetryReading.device_id,
        TelemetryReading.variable,
        TelemetryReading.value,
        TelemetryReading.unit,
        TelemetryReading.observed_at,
    ).where(
        TelemetryReading.organization_id == ctx.organization_id,
        TelemetryReading.project_id == project.id,
        TelemetryReading.scenario_run_id == run.id,
    )
    if variable:
        stmt = stmt.where(TelemetryReading.variable == variable)
    if device_id:
        stmt = stmt.where(TelemetryReading.device_id == device_id)
    if since is not None:
        stmt = stmt.where(TelemetryReading.observed_at >= as_utc(since))
    if until is not None:
        stmt = stmt.where(TelemetryReading.observed_at <= as_utc(until))
    rows = db.execute(
        stmt.order_by(TelemetryReading.observed_at, TelemetryReading.device_id, TelemetryReading.variable)
    ).all()

    origin = as_utc(run.started_at)
    steps = [round((as_utc(r.observed_at) - origin).total_seconds() / 60 / step_minutes) for r in rows]
    stride = 1
    if len(rows) > MAX_POINTS:
        if not downsample:
            raise AppError(
                422,
                "too_many_points",
                f"La consulta devuelve {len(rows)} puntos; el máximo es {MAX_POINTS}. Usa downsample o acota el rango.",
                {"max": MAX_POINTS, "count": len(rows)},
            )
        stride = _stride(steps, len({(r.device_id, r.variable) for r in rows}))
    points = [
        ReadingPoint(
            device_id=r.device_id, variable=r.variable, value=r.value, unit=r.unit, observed_at=as_utc(r.observed_at)
        )
        for r, step in zip(rows, steps)
        if step % stride == 0
    ]
    return ReadingsOut(
        run_id=run.id, interval_minutes=step_minutes * stride, downsampled=stride > 1, points=points
    )


def latest_readings(db: Session, ctx: RequestContext, project: Project, run, current: datetime | None) -> LatestOut:
    """Último valor por dispositivo y variable en la corrida; `stale` si no hay lectura en el paso actual."""
    devices_out: list[LatestDevice] = []
    run_devices = set(run.device_ids) if run is not None else set()
    for device in list_devices(db, ctx, project):
        values: list[LatestValue] = []
        for var in device.variables:
            row = None
            if run is not None:
                row = db.execute(
                    select(TelemetryReading.value, TelemetryReading.unit, TelemetryReading.observed_at)
                    .where(
                        TelemetryReading.organization_id == ctx.organization_id,
                        TelemetryReading.project_id == project.id,
                        TelemetryReading.variable == var,
                        TelemetryReading.device_id == device.id,
                        TelemetryReading.scenario_run_id == run.id,
                    )
                    .order_by(TelemetryReading.observed_at.desc())
                    .limit(1)
                ).first()
            observed = as_utc(row.observed_at) if row else None
            stale = device.id in run_devices and current is not None and (observed is None or observed < current)
            values.append(
                LatestValue(
                    variable=var,
                    value=row.value if row else None,
                    unit=row.unit if row else UNITS[var],
                    observed_at=observed,
                    stale=stale,
                )
            )
        devices_out.append(
            LatestDevice(device_id=device.id, name=device.name, x=device.x, y=device.y, z=device.z, readings=values)
        )
    return LatestOut(
        run_id=run.id if run is not None else None,
        run_status=run.status if run is not None else None,
        sim_time=current,
        devices=devices_out,
    )
```

- [ ] **Step 6: Servicio de corridas y materialización**

Crear `app/modules/simulation/service.py` (Task 4 le agrega la evaluación de reglas):

```python
"""Corridas y materialización sin worker: al leer se generan los pasos que ya debieron ocurrir."""
import math
import secrets
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.deps import RequestContext
from app.core.errors import AppError, not_found, unprocessable
from app.core.tenant import scoped
from app.modules.projects.models import Project
from app.modules.simulation.clock import as_utc
from app.modules.simulation.engine import LIMITS, MODEL_VERSION, SCENARIO_SENSOR_LOSS, UNITS, SimulationInputs, generate
from app.modules.simulation.models import (
    ACTIVE_STATUSES,
    RUN_CANCELLED,
    RUN_COMPLETED,
    RUN_PAUSED,
    RUN_RUNNING,
    SimulationRun,
)
from app.modules.simulation.schemas import RunCreate, RunOut
from app.modules.telemetry.models import (
    DEVICE_ACTIVE,
    QUALITY_SYNTHETIC,
    READING_SCHEMA_VERSION,
    SOURCE_SIMULATED,
    Device,
)
from app.modules.telemetry.service import active_devices, insert_readings

RUN_RESOURCE = "simulation_run"
MAX_STEPS_PER_CALL = 500
RUN_LIST_LIMIT = 50


@dataclass
class StepValues:
    """Valores de un paso: {device_id: {variable: valor | None}} (None = sin lectura)."""

    step: int
    observed_at: datetime
    values: dict[str, dict[str, float | None]] = field(default_factory=dict)


# ---- Tiempo simulado ----


def run_inputs(run: SimulationRun) -> SimulationInputs:
    return SimulationInputs.model_validate(run.inputs)


def step_time(run: SimulationRun, step: int, inputs: SimulationInputs | None = None) -> datetime:
    inputs = inputs or run_inputs(run)
    return as_utc(run.started_at) + timedelta(minutes=step * inputs.step_minutes)


def sim_time(run: SimulationRun) -> datetime | None:
    """Instante simulado del último paso materializado."""
    return step_time(run, run.emitted_steps - 1) if run.emitted_steps > 0 else None


def target_steps(run: SimulationRun, now: datetime) -> int:
    """Pasos que ya debieron ocurrir: floor((now − started_at − paused_seconds) / tick_seconds), acotado."""
    if run.status == RUN_COMPLETED:
        return run.total_steps
    effective = as_utc(now)
    if run.status == RUN_PAUSED and run.paused_at is not None:
        effective = as_utc(run.paused_at)
    elif run.status == RUN_CANCELLED and run.ended_at is not None:
        effective = as_utc(run.ended_at)
    elapsed = (effective - as_utc(run.started_at)).total_seconds() - run.paused_seconds
    steps = math.floor(elapsed / run_inputs(run).tick_seconds)
    return max(0, min(run.total_steps, steps))


def event_id(run_id: str, step: int, device_id: str, variable: str) -> str:
    return str(uuid.uuid5(uuid.UUID(run_id), f"{step}:{device_id}:{variable}"))


# ---- Materialización ----


def materialize(db: Session, run_id: str, now: datetime, limit: int = MAX_STEPS_PER_CALL) -> int:
    """Genera e inserta los pasos pendientes (máximo `limit`). Devuelve cuántos pasos avanzó."""
    # FOR UPDATE serializa materializaciones simultáneas del mismo run en Postgres (SQLite ya serializa escrituras).
    run = db.scalar(
        select(SimulationRun)
        .where(SimulationRun.id == run_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if run is None or run.status == RUN_COMPLETED:
        return 0
    start = run.emitted_steps
    end = min(target_steps(run, now), start + limit)
    if end > start:
        inputs = run_inputs(run)
        found = {
            d.id: d
            for d in db.scalars(select(Device).where(Device.id.in_(run.device_ids), Device.deleted_at.is_(None)))
        }
        # Un dispositivo borrado o desactivado durante la corrida deja de producir lecturas.
        devices = [
            (i, found[did]) for i, did in enumerate(run.device_ids) if did in found and found[did].status == DEVICE_ACTIVE
        ]
        received = as_utc(now)
        rows: list[dict] = []
        batch: list[StepValues] = []
        for step in range(start, end):
            observed = step_time(run, step, inputs)
            item = StepValues(step=step, observed_at=observed)
            for index, device in devices:
                generated = generate(run.seed, run.scenario, inputs, step, index)
                item.values[device.id] = {var: generated[var] for var in device.variables if var in generated}
                for var, value in item.values[device.id].items():
                    if value is None:
                        continue
                    rows.append(
                        {
                            "id": str(uuid.uuid4()),
                            "organization_id": run.organization_id,
                            "schema_version": READING_SCHEMA_VERSION,
                            "event_id": event_id(run.id, step, device.id, var),
                            "device_id": device.id,
                            "project_id": run.project_id,
                            "variable": var,
                            "value": value,
                            "unit": UNITS[var],
                            "observed_at": observed,
                            "received_at": received,
                            "source": SOURCE_SIMULATED,
                            "quality": QUALITY_SYNTHETIC,
                            "scenario_run_id": run.id,
                        }
                    )
            batch.append(item)
        insert_readings(db, rows)
        run.emitted_steps = end
    if run.emitted_steps >= run.total_steps and run.status in ACTIVE_STATUSES:
        run.status = RUN_COMPLETED
        run.paused_at = None
        run.ended_at = as_utc(now)
    db.commit()
    return end - start


def current_run(db: Session, ctx: RequestContext, project: Project) -> SimulationRun | None:
    """La corrida más reciente del proyecto (la que muestran operaciones e inicio)."""
    return db.scalar(
        scoped(SimulationRun, ctx)
        .where(SimulationRun.project_id == project.id)
        .order_by(SimulationRun.started_at.desc(), SimulationRun.created_at.desc())
        .limit(1)
    )


def refresh_current_run(db: Session, ctx: RequestContext, project: Project, now: datetime) -> SimulationRun | None:
    run = current_run(db, ctx, project)
    if run is not None and run.status != RUN_COMPLETED:
        materialize(db, run.id, now)
        db.refresh(run)
    return run


# ---- Corridas ----


def run_out(run: SimulationRun) -> RunOut:
    return RunOut(
        id=run.id,
        project_id=run.project_id,
        scenario=run.scenario,
        model_version=run.model_version,
        seed=run.seed,
        inputs=run.inputs,
        device_ids=run.device_ids,
        status=run.status,
        started_at=as_utc(run.started_at),
        paused_at=as_utc(run.paused_at),
        paused_seconds=run.paused_seconds,
        ended_at=as_utc(run.ended_at),
        total_steps=run.total_steps,
        emitted_steps=run.emitted_steps,
        sim_time=sim_time(run),
        limits=run.limits,
        author_id=run.author_id,
        created_at=as_utc(run.created_at),
    )


def active_run(db: Session, ctx: RequestContext, project: Project) -> SimulationRun | None:
    return db.scalar(
        scoped(SimulationRun, ctx).where(
            SimulationRun.project_id == project.id, SimulationRun.status.in_(ACTIVE_STATUSES)
        )
    )


def _run_active_error() -> AppError:
    return AppError(409, "run_active", "Ya hay una simulación activa en este proyecto; cancélala antes de iniciar otra")


def get_run(db: Session, ctx: RequestContext, project: Project, run_id: str) -> SimulationRun:
    run = db.scalar(scoped(SimulationRun, ctx).where(SimulationRun.id == run_id, SimulationRun.project_id == project.id))
    if run is None:
        raise not_found("corrida")
    return run


def list_runs(db: Session, ctx: RequestContext, project: Project) -> list[SimulationRun]:
    stmt = (
        scoped(SimulationRun, ctx)
        .where(SimulationRun.project_id == project.id)
        .order_by(SimulationRun.started_at.desc(), SimulationRun.created_at.desc())
        .limit(RUN_LIST_LIMIT)
    )
    return list(db.scalars(stmt))


def create_run(db: Session, ctx: RequestContext, project: Project, data: RunCreate, now: datetime) -> SimulationRun:
    if active_run(db, ctx, project) is not None:
        raise _run_active_error()
    devices = active_devices(db, ctx, project)
    if not devices:
        raise unprocessable("El proyecto no tiene dispositivos activos", {"field": "devices"})
    if data.scenario == SCENARIO_SENSOR_LOSS and data.inputs.loss_device >= len(devices):
        raise unprocessable("El dispositivo que pierde señal no existe en este proyecto", {"field": "inputs.loss_device"})
    run = SimulationRun(
        organization_id=ctx.organization_id,
        project_id=project.id,
        scenario=data.scenario,
        model_version=MODEL_VERSION,
        seed=data.seed if data.seed is not None else secrets.randbelow(2_147_483_647),
        inputs=data.inputs.model_dump(),
        device_ids=[d.id for d in devices],
        status=RUN_RUNNING,
        started_at=as_utc(now),
        paused_seconds=0.0,
        total_steps=data.inputs.total_steps,
        emitted_steps=0,
        limits=list(LIMITS),
        author_id=ctx.user.id,
    )
    db.add(run)
    try:
        db.flush()
    except IntegrityError:
        # Otra petición creó un run activo entre la verificación y el INSERT (índice único parcial).
        db.rollback()
        raise _run_active_error()
    record(
        db,
        ctx,
        RUN_RESOURCE,
        run.id,
        "create",
        {"project_id": project.id, "scenario": run.scenario, "seed": run.seed, "model_version": run.model_version},
    )
    db.commit()
    return run


def _state_error(message: str) -> AppError:
    return AppError(409, "run_state", message)


def pause_run(db: Session, ctx: RequestContext, project: Project, run_id: str, now: datetime) -> SimulationRun:
    run = get_run(db, ctx, project, run_id)
    if run.status != RUN_RUNNING:
        raise _state_error("Solo se puede pausar una simulación en curso")
    run.status = RUN_PAUSED
    run.paused_at = as_utc(now)
    record(db, ctx, RUN_RESOURCE, run.id, "pause", {"project_id": project.id})
    db.commit()
    return run


def _accumulate_pause(run: SimulationRun, now: datetime) -> None:
    if run.paused_at is not None:
        run.paused_seconds += max(0.0, (as_utc(now) - as_utc(run.paused_at)).total_seconds())
        run.paused_at = None


def resume_run(db: Session, ctx: RequestContext, project: Project, run_id: str, now: datetime) -> SimulationRun:
    run = get_run(db, ctx, project, run_id)
    if run.status != RUN_PAUSED:
        raise _state_error("Solo se puede reanudar una simulación en pausa")
    _accumulate_pause(run, now)
    run.status = RUN_RUNNING
    record(db, ctx, RUN_RESOURCE, run.id, "resume", {"project_id": project.id})
    db.commit()
    return run


def cancel_run(db: Session, ctx: RequestContext, project: Project, run_id: str, now: datetime) -> SimulationRun:
    run = get_run(db, ctx, project, run_id)
    if run.status in ACTIVE_STATUSES:
        # Lo que ya ocurrió queda registrado antes de cerrar (el resto, si excede el tope, al leer por run_id).
        materialize(db, run.id, now)
        db.refresh(run)
    if run.status not in ACTIVE_STATUSES:
        raise _state_error("La simulación ya terminó")
    _accumulate_pause(run, now)
    run.status = RUN_CANCELLED
    run.ended_at = as_utc(now)
    record(db, ctx, RUN_RESOURCE, run.id, "cancel", {"project_id": project.id, "emitted_steps": run.emitted_steps})
    db.commit()
    return run
```

- [ ] **Step 7: Rutas de corridas**

Crear `app/modules/simulation/router.py`:

```python
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, require_role
from app.modules.identity.models import ROLE_EDITOR, ROLE_VIEWER
from app.modules.projects.service import get_project
from app.modules.simulation import service
from app.modules.simulation.clock import get_now
from app.modules.simulation.models import RUN_COMPLETED
from app.modules.simulation.schemas import RunCreate, RunOut

viewer = require_role(ROLE_VIEWER)
editor = require_role(ROLE_EDITOR)

router = APIRouter(prefix="/projects", tags=["simulation"])


@router.get("/{project_id}/simulation/runs", response_model=list[RunOut])
def list_runs(
    project_id: str,
    ctx: RequestContext = Depends(viewer),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
):
    project = get_project(db, ctx, project_id)
    service.refresh_current_run(db, ctx, project, now)
    return [service.run_out(r) for r in service.list_runs(db, ctx, project)]


@router.post("/{project_id}/simulation/runs", response_model=RunOut, status_code=201)
def create_run(
    project_id: str,
    data: RunCreate,
    ctx: RequestContext = Depends(editor),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
):
    return service.run_out(service.create_run(db, ctx, get_project(db, ctx, project_id), data, now))


@router.get("/{project_id}/simulation/runs/{run_id}", response_model=RunOut)
def get_run(
    project_id: str,
    run_id: str,
    ctx: RequestContext = Depends(viewer),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
):
    run = service.get_run(db, ctx, get_project(db, ctx, project_id), run_id)
    if run.status != RUN_COMPLETED:
        service.materialize(db, run.id, now)
        db.refresh(run)
    return service.run_out(run)


@router.post("/{project_id}/simulation/runs/{run_id}/pause", response_model=RunOut)
def pause_run(
    project_id: str,
    run_id: str,
    ctx: RequestContext = Depends(editor),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
):
    return service.run_out(service.pause_run(db, ctx, get_project(db, ctx, project_id), run_id, now))


@router.post("/{project_id}/simulation/runs/{run_id}/resume", response_model=RunOut)
def resume_run(
    project_id: str,
    run_id: str,
    ctx: RequestContext = Depends(editor),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
):
    return service.run_out(service.resume_run(db, ctx, get_project(db, ctx, project_id), run_id, now))


@router.post("/{project_id}/simulation/runs/{run_id}/cancel", response_model=RunOut)
def cancel_run(
    project_id: str,
    run_id: str,
    ctx: RequestContext = Depends(editor),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
):
    return service.run_out(service.cancel_run(db, ctx, get_project(db, ctx, project_id), run_id, now))
```

En `app/main.py`, añadir la importación después de la de `prototypes_router`:

```python
from app.modules.simulation.router import router as simulation_router
```

y agregar `simulation_router,` como último elemento de la tupla del bucle de routers (después de `telemetry_router,`).

- [ ] **Step 8: Rutas de lecturas**

En `app/modules/telemetry/router.py`, reemplazar todo el bloque de imports (todo lo que está antes de `viewer = require_role(ROLE_VIEWER)`) por:

```python
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, require_role
from app.modules.identity.models import ROLE_EDITOR, ROLE_VIEWER
from app.modules.projects.service import get_project
from app.modules.simulation import service as simulation
from app.modules.simulation.clock import get_now
from app.modules.simulation.engine import VariableLiteral
from app.modules.simulation.models import RUN_COMPLETED
from app.modules.telemetry import service
from app.modules.telemetry.schemas import (
    AlertRuleCreate,
    AlertRuleOut,
    AlertRuleUpdate,
    DeviceCreate,
    DeviceOut,
    DeviceUpdate,
    IncidentAction,
    IncidentOut,
    LatestOut,
    ReadingsOut,
)
```

y añadir al final del archivo:

```python
# ---- Lecturas ----


@router.get("/{project_id}/telemetry/readings", response_model=ReadingsOut)
def readings(
    project_id: str,
    variable: VariableLiteral | None = None,
    device_id: str | None = Query(default=None, max_length=36),
    since: datetime | None = None,
    until: datetime | None = None,
    run_id: str | None = Query(default=None, max_length=36),
    downsample: bool = True,
    ctx: RequestContext = Depends(viewer),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
):
    project = get_project(db, ctx, project_id)
    run = simulation.refresh_current_run(db, ctx, project, now)
    if run_id is not None and (run is None or run.id != run_id):
        run = simulation.get_run(db, ctx, project, run_id)
        if run.status != RUN_COMPLETED:
            simulation.materialize(db, run.id, now)
            db.refresh(run)
    return service.query_readings(
        db, ctx, project, run, variable=variable, device_id=device_id, since=since, until=until, downsample=downsample
    )


@router.get("/{project_id}/telemetry/latest", response_model=LatestOut)
def latest(
    project_id: str,
    ctx: RequestContext = Depends(viewer),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
):
    project = get_project(db, ctx, project_id)
    run = simulation.refresh_current_run(db, ctx, project, now)
    return service.latest_readings(db, ctx, project, run, simulation.sim_time(run) if run else None)
```

- [ ] **Step 9: Correr las pruebas**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_simulation.py -q -p no:warnings`
Expected: PASS (21 pruebas). Luego la suite completa → todo PASS.

- [ ] **Step 10: Commit**

```bash
git add app/modules/simulation app/modules/telemetry app/main.py tests/conftest.py tests/test_simulation.py
git commit -m "feat(simulation): corridas con pausa y cancelación, materialización idempotente al leer con tope de 500 pasos y lecturas con downsample"
```

---

### Task 4: Reglas, incidentes con histéresis, cooldown y "Sin señal", reconocer

**Files:**
- Create: `app/modules/telemetry/rules.py`
- Modify: `app/modules/telemetry/service.py` (secciones Reglas e Incidentes)
- Modify: `app/modules/telemetry/router.py` (rutas de reglas y alertas)
- Modify: `app/modules/simulation/service.py` (evaluar reglas al materializar)
- Test: `tests/test_alerts.py`

**Interfaces:**
- Consumes: Task 3 (`StepValues`, `materialize`, `step_time`, `refresh_current_run`, helpers `TICK`/`start`), Task 2 (modelos, esquemas `AlertRule*`, `IncidentAction`, `IncidentOut`).
- Produces:
  - `rules.breached(rule, value)`, `rules.cleared(rule, value)`, `rules.dedupe_key(run_id, kind, rule_id, device_id, step)`, `rules.project_rules(db, organization_id, project_id)`, `rules.evaluate(db, run, batch, devices)`.
  - `telemetry.service`: `MAX_RULES = 20`, `list_rules`, `get_rule`, `create_rule`, `update_rule`, `delete_rule`, `incident_out`, `list_incidents`, `acknowledge_incident`.
  - Rutas `GET/POST /projects/{id}/alert-rules`, `PATCH/DELETE …/{rid}`, `GET /projects/{id}/alerts?status=&run_id=`, `PATCH /projects/{id}/alerts/{aid}` (`{"action": "acknowledge"}`).

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/test_alerts.py`:

```python
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.modules.audit.models import AuditEvent
from app.modules.simulation import service as simulation
from app.modules.simulation.models import SimulationRun
from app.modules.telemetry import rules as rules_mod
from app.modules.telemetry.models import Device, Incident
from tests.test_devices import add_device, make_project
from tests.test_simulation import TICK, start

API = "/api/v1"


@pytest.fixture
def setup(client, tenants):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    d = add_device(client, h, p["id"], name="Sensor norte").json()
    return {"h": h, "pid": p["id"], "device": d}


def rule_body(**extra):
    return {
        "variable": "air_temperature",
        "comparator": "gt",
        "threshold": 30.0,
        "hysteresis": 1.0,
        "cooldown_minutes": 30,
        "stale_after_minutes": 15,
        "label": "Regla demostrativa: temperatura alta",
        **extra,
    }


def add_rule(client, headers, pid, **extra):
    res = client.post(f"{API}/projects/{pid}/alert-rules", json=rule_body(**extra), headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def alerts(client, headers, pid, **params):
    res = client.get(f"{API}/projects/{pid}/alerts", params=params, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def run_to_end(client, clock, headers, pid, rid, steps):
    clock.advance(steps * TICK + 1)
    client.get(f"{API}/projects/{pid}/simulation/runs/{rid}", headers=headers)


# ---- CRUD de reglas ----


def test_rule_crud_is_didactic_and_audited(client, tenants, setup, db):
    s = setup
    rule = add_rule(client, s["h"], s["pid"], label="  Regla demostrativa  ")
    assert rule["is_didactic"] is True and rule["label"] == "Regla demostrativa"
    assert client.get(f"{API}/projects/{s['pid']}/alert-rules", headers=tenants["alfa_viewer"]).json()[0]["id"] == rule["id"]
    patched = client.patch(f"{API}/projects/{s['pid']}/alert-rules/{rule['id']}", json={"threshold": 31}, headers=s["h"])
    assert patched.status_code == 200 and patched.json()["threshold"] == 31
    assert client.delete(f"{API}/projects/{s['pid']}/alert-rules/{rule['id']}", headers=s["h"]).status_code == 204
    assert client.get(f"{API}/projects/{s['pid']}/alert-rules", headers=s["h"]).json() == []
    ops = sorted(e.operation for e in db.query(AuditEvent).filter_by(resource_type="alert_rule"))
    assert ops == ["create", "delete", "update"]


@pytest.mark.parametrize(
    "patch",
    [
        {"variable": "co2"},
        {"comparator": "eq"},
        {"threshold": "nan"},
        {"hysteresis": -1},
        {"cooldown_minutes": -1},
        {"stale_after_minutes": 0},
        {"label": "  "},
        {"is_didactic": False, "label": "x" * 161},
    ],
)
def test_rule_validation(client, setup, patch):
    res = client.post(f"{API}/projects/{setup['pid']}/alert-rules", json=rule_body(**patch), headers=setup["h"])
    assert res.status_code == 422, res.text


def test_rules_permissions_and_isolation(client, tenants, setup):
    s = setup
    rid = add_rule(client, s["h"], s["pid"])["id"]
    v, b = tenants["alfa_viewer"], tenants["beta_editor"]
    assert client.post(f"{API}/projects/{s['pid']}/alert-rules", json=rule_body(), headers=v).status_code == 403
    assert client.patch(f"{API}/projects/{s['pid']}/alert-rules/{rid}", json={"threshold": 1}, headers=v).status_code == 403
    assert client.get(f"{API}/projects/{s['pid']}/alert-rules", headers=b).status_code == 404
    assert client.delete(f"{API}/projects/{s['pid']}/alert-rules/{rid}", headers=b).status_code == 404


# ---- Umbral, histéresis y cooldown ----


def test_heat_rise_opens_one_threshold_incident_with_evidence(client, setup, clock):
    s = setup
    add_rule(client, s["h"], s["pid"])
    rid = start(client, s["h"], s["pid"], scenario="heat_rise", seed=42).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 288)
    items = [i for i in alerts(client, s["h"], s["pid"]) if i["kind"] == "threshold"]
    assert len(items) == 1
    inc = items[0]
    assert inc["status"] == "closed" and inc["closed_at"] > inc["opened_at"]
    assert inc["device_name"] == "Sensor norte" and inc["rule_label"] == "Regla demostrativa: temperatura alta"
    assert inc["evidence"]["simulated"] is True and inc["evidence"]["threshold"] == 30.0
    assert inc["evidence"]["readings"][0]["value"] > 30
    assert inc["evidence"]["closing_reading"]["value"] < 29  # threshold − hysteresis


def test_base_scenario_with_demo_threshold_stays_quiet(client, setup, clock):
    s = setup
    add_rule(client, s["h"], s["pid"])
    rid = start(client, s["h"], s["pid"], scenario="base", seed=42).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 288)
    assert alerts(client, s["h"], s["pid"]) == []


def _noisy_flat(client, s, clock, **rule):
    """Temperatura plana en 22 °C con ruido ±0.3: cruza un umbral de 22 casi en cada paso."""
    add_rule(client, s["h"], s["pid"], threshold=22.0, **rule)
    rid = start(client, s["h"], s["pid"], seed=9, temp_amplitude_c=0, temp_noise_c=0.3).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 288)
    return [i for i in alerts(client, s["h"], s["pid"]) if i["kind"] == "threshold"]


def test_without_hysteresis_or_cooldown_noise_causes_a_storm(client, setup, clock):
    assert len(_noisy_flat(client, setup, clock, hysteresis=0, cooldown_minutes=0)) > 40


def test_hysteresis_prevents_storm(client, setup, clock):
    # Para cerrar habría que bajar de 21.5; el ruido nunca llega: un solo incidente.
    assert len(_noisy_flat(client, setup, clock, hysteresis=0.5, cooldown_minutes=0)) == 1


def test_cooldown_in_simulated_time_prevents_storm(client, setup, clock):
    items = _noisy_flat(client, setup, clock, hysteresis=0, cooldown_minutes=120)
    assert 1 < len(items) <= 288 * 5 // 120 + 1
    opened = sorted(i["opened_at"] for i in items)
    closed = sorted(i["closed_at"] for i in items if i["closed_at"])
    for prev_close, next_open in zip(closed, opened[1:]):
        gap = _ts(next_open) - _ts(prev_close)
        assert gap >= timedelta(minutes=120)


def _ts(iso: str):
    from datetime import datetime

    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


# ---- Sin señal ----


def test_signal_loss_opens_stale_and_closes_on_recovery(client, setup, clock, db):
    s = setup
    add_rule(client, s["h"], s["pid"])  # stale_after_minutes = 15 (3 pasos)
    rid = start(client, s["h"], s["pid"], scenario="sensor_loss", seed=42).json()["id"]  # pierde pasos 60..83
    run = db.get(SimulationRun, rid)
    clock.advance(70 * TICK + 1)
    open_now = alerts(client, s["h"], s["pid"], status="open")
    stale = [i for i in open_now if i["kind"] == "stale"]
    assert len(stale) == 1
    assert _ts(stale[0]["opened_at"]) == simulation.step_time(run, 62)  # última señal en el paso 59 + 15 min
    assert stale[0]["evidence"]["last_seen_at"] == simulation.step_time(run, 59).isoformat()
    clock.advance(30 * TICK)
    closed = [i for i in alerts(client, s["h"], s["pid"]) if i["kind"] == "stale"]
    assert len(closed) == 1 and closed[0]["status"] == "closed"
    assert _ts(closed[0]["closed_at"]) == simulation.step_time(run, 84)


def test_no_rules_no_incidents(client, setup, clock):
    s = setup
    rid = start(client, s["h"], s["pid"], scenario="sensor_loss").json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 288)
    assert alerts(client, s["h"], s["pid"]) == []


# ---- Idempotencia ----


def test_re_evaluating_the_same_steps_creates_no_duplicates(client, setup, clock, db):
    s = setup
    add_rule(client, s["h"], s["pid"])
    rid = start(client, s["h"], s["pid"], scenario="heat_rise", seed=42).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 100)
    before = {(i.dedupe_key, i.status) for i in db.scalars(select(Incident))}
    assert before
    # Re-materializar (concurrencia o reintento) re-evalúa los mismos pasos
    run = db.get(SimulationRun, rid)
    run.emitted_steps = 0
    db.commit()
    simulation.materialize(db, rid, clock.now)
    db.expire_all()
    assert {(i.dedupe_key, i.status) for i in db.scalars(select(Incident))} == before


def test_evaluate_called_twice_with_same_batch_is_idempotent(client, setup, clock, db):
    s = setup
    add_rule(client, s["h"], s["pid"], threshold=20.0, hysteresis=0, cooldown_minutes=0)
    rid = start(client, s["h"], s["pid"]).json()["id"]
    run = db.get(SimulationRun, rid)
    device = db.get(Device, s["device"]["id"])
    batch = [
        simulation.StepValues(step=i, observed_at=simulation.step_time(run, i), values={device.id: {"air_temperature": v}})
        for i, v in enumerate([19.0, 21.0, 21.5, 19.0, 21.0])
    ]
    rules_mod.evaluate(db, run, batch, [device])
    db.commit()
    rules_mod.evaluate(db, run, batch, [device])
    db.commit()
    incidents = db.scalars(select(Incident).order_by(Incident.opened_at)).all()
    assert [(i.status, i.dedupe_key.rsplit(":", 1)[1]) for i in incidents] == [("closed", "1"), ("open", "4")]


# ---- Reconocer ----


def test_acknowledge_is_audited_once_and_role_checked(client, tenants, setup, clock, db):
    s = setup
    add_rule(client, s["h"], s["pid"])
    rid = start(client, s["h"], s["pid"], scenario="heat_rise", seed=42).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 100)
    inc = alerts(client, s["h"], s["pid"], status="open")[0]
    url = f"{API}/projects/{s['pid']}/alerts/{inc['id']}"
    assert client.patch(url, json={"action": "acknowledge"}, headers=tenants["alfa_viewer"]).status_code == 403
    assert client.patch(url, json={"action": "acknowledge"}, headers=tenants["beta_editor"]).status_code == 404
    assert client.patch(url, json={"action": "cerrar"}, headers=s["h"]).status_code == 422
    res = client.patch(url, json={"action": "acknowledge"}, headers=s["h"])
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "acknowledged" and body["acknowledged_at"] and body["acknowledged_by"]
    assert client.patch(url, json={"action": "acknowledge"}, headers=s["h"]).status_code == 200
    events = db.query(AuditEvent).filter_by(resource_type="incident", operation="acknowledge").all()
    assert len(events) == 1 and events[0].resource_id == inc["id"]
    # Al volver la temperatura bajo el umbral se cierra, conservando el reconocimiento
    run_to_end(client, clock, s["h"], s["pid"], rid, 288)
    final = next(i for i in alerts(client, s["h"], s["pid"]) if i["id"] == inc["id"])
    assert final["status"] == "closed" and final["acknowledged_at"] == body["acknowledged_at"]


def test_alerts_isolated_between_tenants(client, tenants, setup, clock):
    s = setup
    add_rule(client, s["h"], s["pid"])
    rid = start(client, s["h"], s["pid"], scenario="heat_rise", seed=42).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 100)
    assert client.get(f"{API}/projects/{s['pid']}/alerts", headers=tenants["beta_viewer"]).status_code == 404
    other = make_project(client, tenants["beta_editor"], name="Beta")
    assert alerts(client, tenants["beta_editor"], other["id"]) == []


def test_deleting_rule_closes_its_open_incidents(client, setup, clock):
    s = setup
    rule = add_rule(client, s["h"], s["pid"])
    rid = start(client, s["h"], s["pid"], scenario="heat_rise", seed=42).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 100)
    assert alerts(client, s["h"], s["pid"], status="open")
    client.delete(f"{API}/projects/{s['pid']}/alert-rules/{rule['id']}", headers=s["h"])
    items = alerts(client, s["h"], s["pid"])
    assert items and all(i["status"] == "closed" for i in items)
    assert items[0]["evidence"]["closed_reason"] == "rule_deleted"
    assert items[0]["rule_label"] == "Regla demostrativa: temperatura alta"
```

- [ ] **Step 2: Verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_alerts.py -q -p no:warnings`
Expected: FAIL en la colección (`ImportError: cannot import name 'rules' from 'app.modules.telemetry'`).

- [ ] **Step 3: Evaluador de reglas**

Crear `app/modules/telemetry/rules.py`:

```python
"""Evaluación de reglas sobre los pasos recién materializados (tiempo simulado).

Idempotente: el estado (incidentes abiertos, último cierre, última señal) se lee de la base en cada
lote y cada apertura lleva una `dedupe_key` única por (run, tipo, regla, dispositivo, paso).
"""
from datetime import timedelta
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.simulation.clock import as_utc
from app.modules.simulation.engine import UNITS
from app.modules.telemetry.models import (
    COMPARATOR_GT,
    INCIDENT_CLOSED,
    INCIDENT_OPEN,
    INCIDENT_STALE,
    INCIDENT_THRESHOLD,
    SEVERITY_WARNING,
    AlertRule,
    Device,
    Incident,
    TelemetryReading,
)

if TYPE_CHECKING:  # evita el import circular simulation.service ↔ telemetry.rules
    from app.modules.simulation.models import SimulationRun
    from app.modules.simulation.service import StepValues


def breached(rule: AlertRule, value: float) -> bool:
    return value > rule.threshold if rule.comparator == COMPARATOR_GT else value < rule.threshold


def cleared(rule: AlertRule, value: float) -> bool:
    """Histéresis: solo se cierra al volver más allá de threshold ∓ hysteresis."""
    if rule.comparator == COMPARATOR_GT:
        return value < rule.threshold - rule.hysteresis
    return value > rule.threshold + rule.hysteresis


def dedupe_key(run_id: str, kind: str, rule_id: str | None, device_id: str, step: int) -> str:
    return f"{run_id}:{kind}:{rule_id or '-'}:{device_id}:{step}"


def project_rules(db: Session, organization_id: str, project_id: str) -> list[AlertRule]:
    stmt = (
        select(AlertRule)
        .where(
            AlertRule.organization_id == organization_id,
            AlertRule.project_id == project_id,
            AlertRule.deleted_at.is_(None),
        )
        .order_by(AlertRule.created_at, AlertRule.id)
    )
    return list(db.scalars(stmt))


def _reading(observed_at, variable: str, value: float) -> dict:
    return {"observed_at": observed_at.isoformat(), "variable": variable, "value": value, "unit": UNITS[variable]}


def evaluate(db: Session, run: "SimulationRun", batch: list["StepValues"], devices: list[Device]) -> None:
    if not batch or not devices:
        return
    rules = project_rules(db, run.organization_id, run.project_id)
    if not rules:
        return
    incidents = list(
        db.scalars(select(Incident).where(Incident.scenario_run_id == run.id, Incident.deleted_at.is_(None)))
    )
    keys = {i.dedupe_key for i in incidents}
    open_by: dict[tuple, Incident] = {(i.kind, i.rule_id, i.device_id): i for i in incidents if i.closed_at is None}
    last_closed: dict[tuple, object] = {}
    for i in incidents:
        if i.kind == INCIDENT_THRESHOLD and i.closed_at is not None:
            k = (i.rule_id, i.device_id)
            closed = as_utc(i.closed_at)
            last_closed[k] = max(closed, last_closed.get(k, closed))

    first = batch[0].observed_at
    origin = as_utc(run.started_at)
    last_seen = {
        d.id: as_utc(
            db.scalar(
                select(func.max(TelemetryReading.observed_at)).where(
                    TelemetryReading.scenario_run_id == run.id,
                    TelemetryReading.device_id == d.id,
                    TelemetryReading.observed_at < first,
                )
            )
        )
        for d in devices
    }

    def open_incident(kind: str, rule: AlertRule | None, device: Device, step: int, observed, evidence: dict) -> None:
        key = dedupe_key(run.id, kind, rule.id if rule else None, device.id, step)
        if key in keys:
            return
        incident = Incident(
            organization_id=run.organization_id,
            project_id=run.project_id,
            rule_id=rule.id if rule else None,
            scenario_run_id=run.id,
            kind=kind,
            device_id=device.id,
            dedupe_key=key,
            opened_at=observed,
            severity=SEVERITY_WARNING,
            evidence={**evidence, "simulated": True},
            status=INCIDENT_OPEN,
        )
        db.add(incident)
        keys.add(key)
        open_by[(kind, incident.rule_id, device.id)] = incident

    def close_incident(incident: Incident, observed, evidence: dict) -> None:
        incident.closed_at = observed
        incident.status = INCIDENT_CLOSED
        incident.evidence = {**(incident.evidence or {}), **evidence}
        open_by.pop((incident.kind, incident.rule_id, incident.device_id), None)

    for item in batch:
        observed = item.observed_at
        for device in devices:
            values = item.values.get(device.id, {})
            has_signal = any(v is not None for v in values.values())
            device_rules = [r for r in rules if r.variable in device.variables]

            # Sin señal: no hay lectura del dispositivo durante stale_after_minutes de tiempo simulado.
            stale_after = min((r.stale_after_minutes for r in device_rules), default=None)
            stale = open_by.get((INCIDENT_STALE, None, device.id))
            if has_signal:
                if stale is not None and observed > as_utc(stale.opened_at):
                    close_incident(stale, observed, {"signal_back_at": observed.isoformat()})
                last_seen[device.id] = observed
            elif stale_after is not None and stale is None:
                reference = last_seen.get(device.id) or origin
                if observed - reference >= timedelta(minutes=stale_after):
                    open_incident(
                        INCIDENT_STALE,
                        None,
                        device,
                        item.step,
                        observed,
                        {"last_seen_at": reference.isoformat(), "stale_after_minutes": stale_after},
                    )

            for rule in device_rules:
                value = values.get(rule.variable)
                if value is None:
                    continue
                current = open_by.get((INCIDENT_THRESHOLD, rule.id, device.id))
                if current is None:
                    if not breached(rule, value):
                        continue
                    closed = last_closed.get((rule.id, device.id))
                    # Cooldown en tiempo simulado; también descarta pasos anteriores a un cierre (re-evaluación).
                    if closed is not None and observed < closed + timedelta(minutes=rule.cooldown_minutes):
                        continue
                    open_incident(
                        INCIDENT_THRESHOLD,
                        rule,
                        device,
                        item.step,
                        observed,
                        {
                            "rule_label": rule.label,
                            "variable": rule.variable,
                            "comparator": rule.comparator,
                            "threshold": rule.threshold,
                            "hysteresis": rule.hysteresis,
                            "readings": [_reading(observed, rule.variable, value)],
                        },
                    )
                elif observed > as_utc(current.opened_at) and cleared(rule, value):
                    close_incident(current, observed, {"closing_reading": _reading(observed, rule.variable, value)})
                    last_closed[(rule.id, device.id)] = observed
```

- [ ] **Step 4: Evaluar al materializar**

En `app/modules/simulation/service.py`, añadir la importación antes de `from app.modules.telemetry.service import active_devices, insert_readings`:

```python
from app.modules.telemetry import rules
```

y dentro de `materialize`, inmediatamente después de `insert_readings(db, rows)`:

```python
        rules.evaluate(db, run, batch, [d for _, d in devices])
```

- [ ] **Step 5: Servicio de reglas e incidentes**

Añadir al final de `app/modules/telemetry/service.py`:

```python
# ---- Reglas ----

RULE_RESOURCE = "alert_rule"
INCIDENT_RESOURCE = "incident"
MAX_RULES = 20
INCIDENT_LIST_LIMIT = 100


def list_rules(db: Session, ctx: RequestContext, project: Project) -> list[AlertRule]:
    stmt = scoped(AlertRule, ctx).where(AlertRule.project_id == project.id).order_by(AlertRule.created_at, AlertRule.id)
    return list(db.scalars(stmt))


def get_rule(db: Session, ctx: RequestContext, project: Project, rule_id: str) -> AlertRule:
    rule = db.scalar(scoped(AlertRule, ctx).where(AlertRule.id == rule_id, AlertRule.project_id == project.id))
    if rule is None:
        raise not_found("regla")
    return rule


def create_rule(db: Session, ctx: RequestContext, project: Project, data: AlertRuleCreate) -> AlertRule:
    if len(list_rules(db, ctx, project)) >= MAX_RULES:
        raise AppError(422, "rule_limit", f"Máximo {MAX_RULES} reglas por proyecto", {"max": MAX_RULES})
    # En este hito toda regla es didáctica: no hay umbrales agronómicos con evidencia.
    rule = AlertRule(organization_id=ctx.organization_id, project_id=project.id, is_didactic=True, **data.model_dump())
    db.add(rule)
    db.flush()
    record(db, ctx, RULE_RESOURCE, rule.id, "create", {"project_id": project.id, **data.model_dump()})
    db.commit()
    return rule


def update_rule(db: Session, ctx: RequestContext, project: Project, rule_id: str, data: AlertRuleUpdate) -> AlertRule:
    rule = get_rule(db, ctx, project, rule_id)
    changes: dict = {}
    for attr in ("comparator", "threshold", "hysteresis", "cooldown_minutes", "stale_after_minutes", "label"):
        value = getattr(data, attr)
        if attr in data.model_fields_set and value is not None and value != getattr(rule, attr):
            setattr(rule, attr, value)
            changes[attr] = value
    if changes:
        record(db, ctx, RULE_RESOURCE, rule.id, "update", changes)
    db.commit()
    return rule


def delete_rule(db: Session, ctx: RequestContext, project: Project, rule_id: str) -> None:
    rule = get_rule(db, ctx, project, rule_id)
    now = utcnow()
    rule.deleted_at = now
    # Sus incidentes abiertos ya no podrían cerrarse: se cierran con el motivo en la evidencia.
    for incident in db.scalars(
        scoped(Incident, ctx).where(Incident.rule_id == rule.id, Incident.closed_at.is_(None))
    ):
        incident.closed_at = now
        incident.status = INCIDENT_CLOSED
        incident.evidence = {**(incident.evidence or {}), "closed_reason": "rule_deleted"}
    record(db, ctx, RULE_RESOURCE, rule.id, "delete", {"project_id": project.id, "label": rule.label})
    db.commit()


# ---- Incidentes ----


def incident_out(incident: Incident, devices: dict[str, Device], rules_by_id: dict[str, AlertRule]) -> IncidentOut:
    device = devices.get(incident.device_id)
    rule = rules_by_id.get(incident.rule_id) if incident.rule_id else None
    return IncidentOut(
        id=incident.id,
        project_id=incident.project_id,
        rule_id=incident.rule_id,
        rule_label=rule.label if rule else (incident.evidence or {}).get("rule_label"),
        scenario_run_id=incident.scenario_run_id,
        kind=incident.kind,
        device_id=incident.device_id,
        device_name=device.name if device else "Dispositivo eliminado",
        opened_at=as_utc(incident.opened_at),
        closed_at=as_utc(incident.closed_at),
        severity=incident.severity,
        evidence=incident.evidence or {},
        status=incident.status,
        acknowledged_by=incident.acknowledged_by,
        acknowledged_at=as_utc(incident.acknowledged_at),
    )


def _lookups(db: Session, ctx: RequestContext, project: Project) -> tuple[dict, dict]:
    """Incluye borrados: un incidente conserva el nombre de su dispositivo y la etiqueta de su regla."""
    org, pid = ctx.organization_id, project.id
    devices = {d.id: d for d in db.scalars(select(Device).where(Device.organization_id == org, Device.project_id == pid))}
    rules_by_id = {
        r.id: r for r in db.scalars(select(AlertRule).where(AlertRule.organization_id == org, AlertRule.project_id == pid))
    }
    return devices, rules_by_id


def list_incidents(
    db: Session, ctx: RequestContext, project: Project, status: str | None = None, run_id: str | None = None
) -> list[IncidentOut]:
    stmt = scoped(Incident, ctx).where(Incident.project_id == project.id)
    if status:
        stmt = stmt.where(Incident.status == status)
    if run_id:
        stmt = stmt.where(Incident.scenario_run_id == run_id)
    stmt = stmt.order_by(Incident.opened_at.desc(), Incident.created_at.desc()).limit(INCIDENT_LIST_LIMIT)
    devices, rules_by_id = _lookups(db, ctx, project)
    return [incident_out(i, devices, rules_by_id) for i in db.scalars(stmt)]


def acknowledge_incident(db: Session, ctx: RequestContext, project: Project, incident_id: str) -> IncidentOut:
    incident = db.scalar(scoped(Incident, ctx).where(Incident.id == incident_id, Incident.project_id == project.id))
    if incident is None:
        raise not_found("incidente")
    # Reconocer dos veces no cambia nada ni deja un segundo evento de auditoría.
    if incident.acknowledged_at is None:
        incident.acknowledged_at = utcnow()
        incident.acknowledged_by = ctx.user.id
        if incident.status == INCIDENT_OPEN:
            incident.status = INCIDENT_ACKNOWLEDGED
        record(
            db,
            ctx,
            INCIDENT_RESOURCE,
            incident.id,
            "acknowledge",
            {"project_id": project.id, "kind": incident.kind, "device_id": incident.device_id},
        )
        db.commit()
    devices, rules_by_id = _lookups(db, ctx, project)
    return incident_out(incident, devices, rules_by_id)
```

- [ ] **Step 6: Rutas**

Añadir al final de `app/modules/telemetry/router.py` (los imports ya están desde Task 3):

```python
# ---- Reglas ----


@router.get("/{project_id}/alert-rules", response_model=list[AlertRuleOut])
def list_rules(project_id: str, ctx: RequestContext = Depends(viewer), db: Session = Depends(get_db)):
    return service.list_rules(db, ctx, get_project(db, ctx, project_id))


@router.post("/{project_id}/alert-rules", response_model=AlertRuleOut, status_code=201)
def create_rule(
    project_id: str, data: AlertRuleCreate, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)
):
    return service.create_rule(db, ctx, get_project(db, ctx, project_id), data)


@router.patch("/{project_id}/alert-rules/{rule_id}", response_model=AlertRuleOut)
def update_rule(
    project_id: str,
    rule_id: str,
    data: AlertRuleUpdate,
    ctx: RequestContext = Depends(editor),
    db: Session = Depends(get_db),
):
    return service.update_rule(db, ctx, get_project(db, ctx, project_id), rule_id, data)


@router.delete("/{project_id}/alert-rules/{rule_id}", status_code=204)
def delete_rule(project_id: str, rule_id: str, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)):
    service.delete_rule(db, ctx, get_project(db, ctx, project_id), rule_id)
    return Response(status_code=204)


# ---- Incidentes ----


@router.get("/{project_id}/alerts", response_model=list[IncidentOut])
def list_alerts(
    project_id: str,
    status: Literal["open", "acknowledged", "closed"] | None = None,
    run_id: str | None = Query(default=None, max_length=36),
    ctx: RequestContext = Depends(viewer),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
):
    project = get_project(db, ctx, project_id)
    simulation.refresh_current_run(db, ctx, project, now)
    return service.list_incidents(db, ctx, project, status=status, run_id=run_id)


@router.patch("/{project_id}/alerts/{incident_id}", response_model=IncidentOut)
def acknowledge_alert(
    project_id: str,
    incident_id: str,
    data: IncidentAction,
    ctx: RequestContext = Depends(editor),
    db: Session = Depends(get_db),
):
    return service.acknowledge_incident(db, ctx, get_project(db, ctx, project_id), incident_id)
```

- [ ] **Step 7: Correr las pruebas**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_alerts.py -q -p no:warnings`
Expected: PASS (22 pruebas). Luego la suite completa → todo PASS (las pruebas de Task 3 no crean reglas, así que la evaluación no cambia sus resultados).

- [ ] **Step 8: Commit**

```bash
git add app/modules/telemetry app/modules/simulation/service.py tests/test_alerts.py
git commit -m "feat(telemetry): reglas didácticas con histéresis y cooldown en tiempo simulado, incidentes sin señal idempotentes y reconocimiento auditado"
```

---

### Task 5: Configuración demostrativa, seed opcional y lecturas en el inicio

**Files:**
- Create: `app/modules/telemetry/demo.py`
- Create: `app/modules/telemetry/seed.py`
- Modify: `app/modules/telemetry/router.py` (ruta de demostración)
- Modify: `app/core/config.py`
- Modify: `scripts/seed.py`
- Modify: `.env.example`
- Modify: `app/modules/home/schemas.py`
- Modify: `app/modules/home/router.py`
- Modify: `app/modules/home/service.py`
- Test: `tests/test_demo_simulation.py`

**Interfaces:**
- Consumes: Tasks 2–4 (`list_devices`, `list_rules`, `latest_readings`, `refresh_current_run`, `sim_time`, `DemoSetupOut`).
- Produces:
  - `demo.greenhouse_dims(area_m2) -> (ancho, largo)` (misma fórmula que `greenhouseDims` del frontend), `demo.DEMO_RULES`, `demo.ensure_demo_setup(db, ctx | None, organization_id, project) -> {"devices": n, "rules": n}`.
  - `POST /api/v1/projects/{id}/simulation/demo` (editor) → `DemoSetupOut`.
  - `Settings.seed_demo_simulation` (`SEED_DEMO_SIMULATION`, apagado por defecto) y `telemetry.seed.seed(db)`.
  - `GET /api/v1/home` con `readings: HomeReading[]` (contrato) y `build_home(db, ctx, now)`; textos de actividad de `device`, `alert_rule`, `simulation_run` e `incident`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/test_demo_simulation.py`:

```python
import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.modules.audit.models import AuditEvent
from app.modules.home.service import activity_text
from app.modules.identity import service as identity
from app.modules.projects.models import Project
from app.modules.telemetry import seed as telemetry_seed
from app.modules.telemetry.demo import DEMO_RULES, greenhouse_dims
from app.modules.telemetry.models import AlertRule, Device
from tests.test_devices import make_project
from tests.test_simulation import TICK, start

API = "/api/v1"


def demo(client, headers, pid):
    res = client.post(f"{API}/projects/{pid}/simulation/demo", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


# ---- Configuración demostrativa ----


def test_greenhouse_dims_from_area_or_illustrative():
    assert greenhouse_dims(None) == (8.0, 16.0)
    assert greenhouse_dims(128) == pytest.approx((8.0, 16.0))
    assert greenhouse_dims(50) == pytest.approx((5.0, 10.0))


def test_demo_setup_is_idempotent_and_labeled(client, tenants, db):
    h = tenants["alfa_editor"]
    p = make_project(client, h, area_m2=50)
    first = demo(client, h, p["id"])
    assert (first["created_devices"], first["created_rules"]) == (2, 2)
    assert [d["name"] for d in first["devices"]] == ["Sensor norte", "Sensor sur"]
    assert [(d["x"], d["y"]) for d in first["devices"]] == [(2.5, 7.5), (2.5, 2.5)]  # dentro de la nave 5 × 10 m
    assert all(r["is_didactic"] and r["label"].startswith("Regla demostrativa") for r in first["rules"])
    again = demo(client, h, p["id"])
    assert (again["created_devices"], again["created_rules"]) == (0, 0)
    assert len(again["devices"]) == 2 and len(again["rules"]) == 2
    assert client.post(f"{API}/projects/{p['id']}/simulation/demo", headers=tenants["alfa_viewer"]).status_code == 403
    assert client.post(f"{API}/projects/{p['id']}/simulation/demo", headers=tenants["beta_editor"]).status_code == 404
    texts = {activity_text(e) for e in db.query(AuditEvent).filter_by(resource_type="device")}
    assert texts == {"Dispositivo agregado: Sensor norte", "Dispositivo agregado: Sensor sur"}


def test_demo_rules_trigger_heat_rise_but_not_base(client, tenants, clock):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    demo(client, h, p["id"])
    rid = start(client, h, p["id"], scenario="base", seed=42).json()["id"]
    clock.advance(288 * TICK + 1)
    client.get(f"{API}/projects/{p['id']}/simulation/runs/{rid}", headers=h)
    assert client.get(f"{API}/projects/{p['id']}/alerts", headers=h).json() == []
    rid = start(client, h, p["id"], scenario="heat_rise", seed=42).json()["id"]
    clock.advance(288 * TICK + 1)
    client.get(f"{API}/projects/{p['id']}/simulation/runs/{rid}", headers=h)
    kinds = {(i["kind"], i["evidence"]["variable"]) for i in client.get(f"{API}/projects/{p['id']}/alerts", headers=h).json()}
    assert kinds == {("threshold", "air_temperature"), ("threshold", "relative_humidity")}


# ---- Seed ----


def test_seed_is_off_by_default_and_idempotent_when_on(db, monkeypatch):
    org = identity.ensure_organization(db, "HarvestT", "harvestt")
    db.commit()
    monkeypatch.setattr(telemetry_seed, "settings", Settings(seed_org_slug="harvestt"))
    telemetry_seed.seed(db)
    db.commit()
    assert db.scalars(select(Project)).all() == []

    monkeypatch.setattr(telemetry_seed, "settings", Settings(seed_org_slug="harvestt", seed_demo_simulation=True))
    for _ in range(2):
        telemetry_seed.seed(db)
        db.commit()
    projects = db.scalars(select(Project).where(Project.organization_id == org.id)).all()
    assert [p.name for p in projects] == ["Invernadero demostrativo"]
    assert projects[0].area_m2 is None  # sin área inventada: la escena usa el tamaño ilustrativo
    assert db.query(Device).count() == 2
    assert sorted(r.label for r in db.scalars(select(AlertRule))) == sorted(r["label"] for r in DEMO_RULES)


# ---- Inicio ----


def test_home_shows_latest_simulated_readings_of_recent_project(client, tenants, clock):
    h = tenants["alfa_editor"]
    p = make_project(client, h, name="Demo")
    assert client.get(f"{API}/home", headers=h).json()["readings"] == []  # sin corridas: "Sin lecturas"
    demo(client, h, p["id"])
    start(client, h, p["id"], seed=42)
    clock.advance(10 * TICK)
    readings = client.get(f"{API}/home", headers=tenants["alfa_viewer"]).json()["readings"]
    assert [r["variable"] for r in readings] == ["air_temperature", "relative_humidity"]
    assert all(r["origin"] == "simulated" and not r["stale"] and r["value"] is not None for r in readings)
    assert {r["unit"] for r in readings} == {"Cel", "%"}
    assert readings[0]["device_name"] == "Sensor norte"


def test_home_reports_no_signal_when_all_devices_lost(client, tenants, clock, db):
    h = tenants["alfa_editor"]
    p = make_project(client, h, name="Demo")
    demo(client, h, p["id"])
    # Solo un sensor: desactivar el segundo antes de iniciar
    south = next(d for d in client.get(f"{API}/projects/{p['id']}/devices", headers=h).json() if d["name"] == "Sensor sur")
    client.patch(f"{API}/projects/{p['id']}/devices/{south['id']}", json={"status": "inactive"}, headers=h)
    start(client, h, p["id"], scenario="sensor_loss", loss_start_step=2, loss_steps=5)
    clock.advance(4 * TICK)
    readings = client.get(f"{API}/home", headers=h).json()["readings"]
    assert readings and all(r["stale"] and r["value"] is None for r in readings)


def test_home_readings_isolated_between_tenants(client, tenants, clock):
    h = tenants["alfa_editor"]
    p = make_project(client, h, name="Demo")
    demo(client, h, p["id"])
    start(client, h, p["id"])
    clock.advance(10 * TICK)
    assert client.get(f"{API}/home", headers=tenants["beta_viewer"]).json()["readings"] == []


@pytest.mark.parametrize(
    "resource,operation,text",
    [
        ("simulation_run", "create", "Simulación iniciada"),
        ("simulation_run", "pause", "Simulación en pausa"),
        ("simulation_run", "resume", "Simulación reanudada"),
        ("simulation_run", "cancel", "Simulación cancelada"),
        ("incident", "acknowledge", "Incidente reconocido"),
        ("alert_rule", "create", "Regla de alerta creada"),
        ("device", "delete", "Dispositivo eliminado"),
    ],
)
def test_activity_texts(resource, operation, text):
    event = AuditEvent(resource_type=resource, resource_id="x", operation=operation, data={})
    assert activity_text(event) == text
```

- [ ] **Step 2: Verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_demo_simulation.py -q -p no:warnings`
Expected: FAIL en la colección (`ImportError: cannot import name 'seed' from 'app.modules.telemetry'`).

- [ ] **Step 3: Configuración demostrativa**

Crear `app/modules/telemetry/demo.py`:

```python
"""Configuración demostrativa del invernadero virtual.

Los umbrales NO son valores agronómicos: se eligieron para que, con los parámetros de ejemplo del
motor didactic-v1, el escenario `heat_rise` dispare y `base` no. Cada regla lo dice en su etiqueta.
"""
import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.deps import RequestContext
from app.modules.projects.models import Project
from app.modules.simulation.engine import AIR_TEMPERATURE, RELATIVE_HUMIDITY
from app.modules.telemetry.models import AlertRule, Device

ILLUSTRATIVE_WIDTH_M = 8.0
ILLUSTRATIVE_LENGTH_M = 16.0
SENSOR_HEIGHT_M = 1.5

DEMO_RULES = (
    {
        "label": "Regla demostrativa: temperatura del aire sobre 30 °C (umbral de ejemplo, no agronómico)",
        "variable": AIR_TEMPERATURE,
        "comparator": "gt",
        "threshold": 30.0,
        "hysteresis": 1.0,
        "cooldown_minutes": 30,
        "stale_after_minutes": 15,
    },
    {
        "label": "Regla demostrativa: humedad relativa bajo 45 % (umbral de ejemplo, no agronómico)",
        "variable": RELATIVE_HUMIDITY,
        "comparator": "lt",
        "threshold": 45.0,
        "hysteresis": 2.0,
        "cooldown_minutes": 30,
        "stale_after_minutes": 15,
    },
)


def greenhouse_dims(area_m2: float | None) -> tuple[float, float]:
    """(ancho, largo) en metros: nave 1:2 con el área registrada o tamaño ilustrativo 8 × 16 m.
    Misma fórmula que `greenhouseDims` del frontend."""
    if area_m2 is None or area_m2 <= 0:
        return ILLUSTRATIVE_WIDTH_M, ILLUSTRATIVE_LENGTH_M
    width = math.sqrt(area_m2 / 2)
    return width, width * 2


def ensure_demo_setup(db: Session, ctx: RequestContext | None, organization_id: str, project: Project) -> dict:
    """Crea (si faltan, por nombre o etiqueta) dos sensores y dos reglas demostrativas. Idempotente."""
    width, length = greenhouse_dims(project.area_m2)
    wanted_devices = (
        ("Sensor norte", round(width / 2, 2), round(length * 0.75, 2)),
        ("Sensor sur", round(width / 2, 2), round(length * 0.25, 2)),
    )
    existing_devices = {
        d.name
        for d in db.scalars(
            select(Device).where(
                Device.organization_id == organization_id, Device.project_id == project.id, Device.deleted_at.is_(None)
            )
        )
    }
    created = {"devices": 0, "rules": 0}
    for name, x, y in wanted_devices:
        if name in existing_devices:
            continue
        device = Device(
            organization_id=organization_id,
            project_id=project.id,
            name=name,
            kind="simulated",
            variables=[AIR_TEMPERATURE, RELATIVE_HUMIDITY],
            x=x,
            y=y,
            z=SENSOR_HEIGHT_M,
            status="active",
        )
        db.add(device)
        db.flush()
        record(db, ctx, "device", device.id, "create", {"project_id": project.id, "name": name, "demo": True})
        created["devices"] += 1

    existing_rules = {
        r.label
        for r in db.scalars(
            select(AlertRule).where(
                AlertRule.organization_id == organization_id,
                AlertRule.project_id == project.id,
                AlertRule.deleted_at.is_(None),
            )
        )
    }
    for spec in DEMO_RULES:
        if spec["label"] in existing_rules:
            continue
        rule = AlertRule(organization_id=organization_id, project_id=project.id, is_didactic=True, **spec)
        db.add(rule)
        db.flush()
        record(db, ctx, "alert_rule", rule.id, "create", {"project_id": project.id, "label": rule.label, "demo": True})
        created["rules"] += 1
    return created
```

En `app/modules/telemetry/router.py`, añadir `from app.modules.telemetry.demo import ensure_demo_setup` justo después de `from app.modules.telemetry import service`, agregar `DemoSetupOut,` a la importación de `app.modules.telemetry.schemas` (después de `AlertRuleUpdate,`) y añadir al final del archivo:

```python
# ---- Demostración ----


@router.post("/{project_id}/simulation/demo", response_model=DemoSetupOut)
def demo_setup(project_id: str, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)):
    project = get_project(db, ctx, project_id)
    created = ensure_demo_setup(db, ctx, ctx.organization_id, project)
    db.commit()
    return DemoSetupOut(
        created_devices=created["devices"],
        created_rules=created["rules"],
        devices=service.list_devices(db, ctx, project),
        rules=service.list_rules(db, ctx, project),
    )
```

- [ ] **Step 4: Seed opcional**

En `app/core/config.py`, dentro de `Settings`, después de `public_org_slug`:

```python
    # Crea el proyecto "Invernadero demostrativo" con sensores y reglas demostrativas (V3)
    seed_demo_simulation: bool = field(
        default_factory=lambda: _env("SEED_DEMO_SIMULATION", "0").lower() in ("1", "true", "yes")
    )
```

Crear `app/modules/telemetry/seed.py`:

```python
"""Proyecto demostrativo del invernadero virtual. Solo con SEED_DEMO_SIMULATION=1 (apagado por defecto)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_org_by_slug
from app.modules.projects.models import SYSTEM_OTHER, Project
from app.modules.telemetry.demo import ensure_demo_setup

DEMO_PROJECT_NAME = "Invernadero demostrativo"
DEMO_PROJECT_OBJECTIVES = (
    "Proyecto de demostración del invernadero virtual. Todas sus lecturas son simuladas "
    "(motor didactic-v1, sin calibración agronómica)."
)


def seed(db: Session) -> None:
    if not settings.seed_demo_simulation:
        return
    org = get_org_by_slug(db, settings.seed_org_slug)
    if org is None:
        return
    project = db.scalar(
        select(Project).where(
            Project.organization_id == org.id, Project.name == DEMO_PROJECT_NAME, Project.deleted_at.is_(None)
        )
    )
    if project is None:
        # Sin área: la escena usa el tamaño ilustrativo etiquetado; no se inventa un dato del proyecto.
        project = Project(
            organization_id=org.id, name=DEMO_PROJECT_NAME, objectives=DEMO_PROJECT_OBJECTIVES, system=SYSTEM_OTHER
        )
        db.add(project)
        db.flush()
    ensure_demo_setup(db, None, org.id, project)
```

En `scripts/seed.py`, añadir `from app.modules.telemetry import seed as telemetry_seed` después de la importación de `prototypes_seed` y cambiar la tupla:

```python
SEEDS = (identity_seed, catalog_seed, projects_seed, prototypes_seed, telemetry_seed)
```

En `.env.example`, después de `PUBLIC_ORG_SLUG=harvestt`:

```bash
# 1 = crea el proyecto "Invernadero demostrativo" con sensores y reglas demostrativas (V3). Apagado en producción.
SEED_DEMO_SIMULATION=0
```

- [ ] **Step 5: Lecturas en el inicio**

Reemplazar `app/modules/home/schemas.py` por:

```python
from datetime import datetime

from pydantic import BaseModel


class HomeProject(BaseModel):
    id: str
    name: str
    system: str
    area_m2: float | None
    species: list[str]


class HomeCounts(BaseModel):
    projects: int
    crop_cycles: int
    observations: int
    sources_cited: int


class HomeActivity(BaseModel):
    id: str
    text: str
    resource_type: str
    resource_id: str
    created_at: datetime


class HomeReading(BaseModel):
    """Última lectura simulada por variable del proyecto reciente; value=None con stale=True es "Sin señal"."""

    variable: str
    value: float | None
    unit: str
    observed_at: datetime | None
    stale: bool
    device_name: str
    origin: str


class HomeOut(BaseModel):
    recent_project: HomeProject | None
    counts: HomeCounts
    readings: list[HomeReading]
    activity: list[HomeActivity]
```

Reemplazar `app/modules/home/router.py` por:

```python
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context
from app.modules.home.schemas import HomeOut
from app.modules.home.service import build_home
from app.modules.simulation.clock import get_now

router = APIRouter(prefix="/home", tags=["home"])


@router.get("", response_model=HomeOut)
def home(
    ctx: RequestContext = Depends(get_context), db: Session = Depends(get_db), now: datetime = Depends(get_now)
):
    return build_home(db, ctx, now)
```

Reemplazar `app/modules/home/service.py` por:

```python
"""Resumen del inicio de la plataforma: datos reales del tenant y lecturas simuladas etiquetadas."""
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import RequestContext
from app.core.tenant import scoped
from app.modules.audit.models import AuditEvent
from app.modules.catalog.models import SUBJECT_SPECIES, TraitAssertion
from app.modules.home.schemas import HomeActivity, HomeCounts, HomeOut, HomeProject, HomeReading
from app.modules.projects.models import CropCycle, Observation, Project
from app.modules.simulation import service as simulation
from app.modules.simulation.engine import VARIABLES
from app.modules.telemetry.service import latest_readings

ACTIVITY_LIMIT = 10

_TEXTS = {
    ("project", "create"): "Proyecto creado: {name}",
    ("project", "update"): "Proyecto actualizado",
    ("crop_cycle", "create"): "Ciclo de cultivo iniciado",
    ("prototype", "create"): "Prototipo creado: {name}",
    ("prototype", "update"): "Prototipo actualizado",
    ("prototype", "delete"): "Prototipo eliminado",
    ("observation", "create"): "Observación registrada",
    ("prototype_asset", "create"): "Archivo de prototipo agregado",
    ("prototype_asset", "update"): "Archivo de prototipo actualizado",
    ("prototype_asset", "delete"): "Archivo de prototipo eliminado",
    ("prototype_hotspot", "create"): "Punto agregado al modelo 3D",
    ("prototype_hotspot", "update"): "Punto del modelo 3D actualizado",
    ("prototype_hotspot", "delete"): "Punto del modelo 3D eliminado",
    ("device", "create"): "Dispositivo agregado: {name}",
    ("device", "update"): "Dispositivo actualizado",
    ("device", "delete"): "Dispositivo eliminado",
    ("alert_rule", "create"): "Regla de alerta creada",
    ("alert_rule", "update"): "Regla de alerta actualizada",
    ("alert_rule", "delete"): "Regla de alerta eliminada",
    ("simulation_run", "create"): "Simulación iniciada",
    ("simulation_run", "pause"): "Simulación en pausa",
    ("simulation_run", "resume"): "Simulación reanudada",
    ("simulation_run", "cancel"): "Simulación cancelada",
    ("incident", "acknowledge"): "Incidente reconocido",
}


def activity_text(event: AuditEvent) -> str:
    template = _TEXTS.get((event.resource_type, event.operation))
    if template is None:
        return "Cambio registrado"
    name = (event.data or {}).get("name")
    if "{name}" in template:
        return template.format(name=name) if name else template.split(":")[0]
    return template


def _count(db: Session, model, ctx: RequestContext) -> int:
    return db.scalar(select(func.count()).select_from(scoped(model, ctx).subquery())) or 0


def _sources_cited(db: Session, ctx: RequestContext) -> int:
    species_ids = db.scalars(scoped(CropCycle, ctx).with_only_columns(CropCycle.species_id).distinct()).all()
    if not species_ids:
        return 0
    refs = db.scalars(
        select(TraitAssertion.evidence_refs).where(
            TraitAssertion.subject_type == SUBJECT_SPECIES, TraitAssertion.subject_id.in_(species_ids)
        )
    ).all()
    return len({r.get("source_id") for group in refs for r in (group or []) if r.get("source_id")})


def _readings(db: Session, ctx: RequestContext, project: Project, now: datetime) -> list[HomeReading]:
    """Por variable: la lectura más reciente con señal entre los dispositivos; si todos perdieron la señal, "Sin señal"."""
    run = simulation.refresh_current_run(db, ctx, project, now)
    if run is None:
        return []
    latest = latest_readings(db, ctx, project, run, simulation.sim_time(run))
    out: list[HomeReading] = []
    for variable in VARIABLES:
        candidates = sorted(
            ((d.name, r) for d in latest.devices for r in d.readings if r.variable == variable and r.observed_at),
            key=lambda c: c[0],
        )
        if not candidates:
            continue
        live = [c for c in candidates if not c[1].stale]
        name, reading = max(live or candidates, key=lambda c: c[1].observed_at)
        out.append(
            HomeReading(
                variable=variable,
                value=reading.value if live else None,
                unit=reading.unit,
                observed_at=reading.observed_at,
                stale=not live,
                device_name=name,
                origin="simulated",
            )
        )
    return out


def build_home(db: Session, ctx: RequestContext, now: datetime) -> HomeOut:
    recent = db.scalar(scoped(Project, ctx).order_by(Project.updated_at.desc(), Project.created_at.desc()).limit(1))
    recent_out = None
    readings: list[HomeReading] = []
    if recent is not None:
        readings = _readings(db, ctx, recent, now)
        cycles = db.scalars(scoped(CropCycle, ctx).where(CropCycle.project_id == recent.id)).unique().all()
        species = sorted({c.species.scientific_name for c in cycles if c.species is not None})
        recent_out = HomeProject(
            id=recent.id, name=recent.name, system=recent.system, area_m2=recent.area_m2, species=species
        )

    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.organization_id == ctx.organization_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(ACTIVITY_LIMIT)
    ).all()

    return HomeOut(
        recent_project=recent_out,
        counts=HomeCounts(
            projects=_count(db, Project, ctx),
            crop_cycles=_count(db, CropCycle, ctx),
            observations=_count(db, Observation, ctx),
            sources_cited=_sources_cited(db, ctx),
        ),
        readings=readings,
        activity=[
            HomeActivity(
                id=e.id,
                text=activity_text(e),
                resource_type=e.resource_type,
                resource_id=e.resource_id,
                created_at=e.created_at,
            )
            for e in events
        ],
    )
```

- [ ] **Step 6: Correr las pruebas**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_demo_simulation.py tests/test_home.py -q -p no:warnings`
Expected: PASS (14 + 5 pruebas). Luego la suite completa → todo PASS.

- [ ] **Step 7: Commit**

```bash
git add app/modules/telemetry app/modules/home app/core/config.py scripts/seed.py .env.example tests/test_demo_simulation.py
git commit -m "feat(telemetry): configuración demostrativa etiquetada, seed opcional y últimas lecturas simuladas en el inicio"
```

---

### Task 6: Cliente de operaciones, formato puro y polling

**Files:**
- Create: `frontend/src/features/operations/api.ts`
- Create: `frontend/src/features/operations/format.ts`
- Create: `frontend/src/features/operations/usePolling.ts`
- Test: `frontend/src/features/operations/format.test.ts`

**Interfaces:**
- Consumes: solo el contrato JSON (no depende de ninguna tarea backend).
- Produces:
  - `api.ts`: tipos `Variable`, `Scenario`, `RunStatus`, `RunAction`, `IncidentKind`, `IncidentStatus`, `Device`, `SimulationRun`, `ReadingPoint`, `ReadingsResponse`, `LatestValue`, `LatestDevice`, `LatestResponse`, `AlertRule`, `Incident`, `DemoSetup`; objeto `operationsApi` con `devices`, `runs`, `startRun(projectId, scenario)`, `controlRun(projectId, runId, action)`, `latest`, `readings(projectId, {variable, device_id, run_id?})`, `alerts`, `acknowledge(projectId, incidentId)`, `rules`, `demoSetup`.
  - `format.ts` (sin three): `VARIABLES`, `VARIABLE_LABELS`, `GAUGE_RANGES`, `SCENARIO_LABELS`, `RUN_STATUS_LABELS`, `INCIDENT_KIND_LABELS`, `INCIDENT_STATUS_LABELS`, `unitLabel`, `formatReading`, `readingText`, `deviceCalloutLabel`, `withGaps(points, intervalMinutes)`, `GreenhouseDims`, `greenhouseDims(areaM2)`, `deviceToWorld(dims, p)`, `formatMeters`.
  - `usePolling(callback, active, ms = POLL_MS)`, `POLL_MS = 5000`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `frontend/src/features/operations/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { LatestDevice, ReadingPoint } from './api'
import { deviceCalloutLabel, deviceToWorld, greenhouseDims, readingText, unitLabel, withGaps } from './format'

const point = (minute: number, value: number): ReadingPoint => ({
  device_id: 'd1',
  variable: 'air_temperature',
  value,
  unit: 'Cel',
  observed_at: new Date(Date.UTC(2026, 9, 20, 12, minute)).toISOString(),
})

describe('withGaps', () => {
  it('corta la línea donde faltan pasos y no inventa ceros', () => {
    const series = withGaps([point(0, 20), point(5, 21), point(25, 22), point(30, 23)], 5)
    expect(series.map((p) => p.value)).toEqual([20, 21, null, 22, 23])
    expect(series.some((p) => p.value === 0)).toBe(false)
  })

  it('respeta el intervalo de una serie reducida', () => {
    expect(withGaps([point(0, 1), point(10, 2), point(20, 3)], 10).map((p) => p.value)).toEqual([1, 2, 3])
  })
})

describe('greenhouseDims', () => {
  it('usa el área registrada en proporción 1:2', () => {
    const d = greenhouseDims(128)
    expect(d.width).toBeCloseTo(8)
    expect(d.length).toBeCloseTo(16)
    expect(d.illustrative).toBe(false)
    expect(d.ridgeHeight).toBeGreaterThan(d.wallHeight)
  })

  it('sin área usa el tamaño ilustrativo etiquetado', () => {
    expect(greenhouseDims(null)).toMatchObject({ width: 8, length: 16, illustrative: true })
  })

  it('convierte posiciones del dispositivo a la escena centrada', () => {
    const d = greenhouseDims(null)
    expect(deviceToWorld(d, { x: 4, y: 8, z: 1.5 })).toEqual({ x: 0, y: 1.5, z: 0 })
    expect(deviceToWorld(d, { x: 0, y: 0, z: 0 })).toEqual({ x: -4, y: 0, z: 8 })
  })
})

describe('textos de lectura', () => {
  const device = (readings: LatestDevice['readings']): LatestDevice => ({ device_id: 'd1', name: 'Sensor norte', x: 0, y: 0, z: 0, readings })

  it('valor con unidad, "Sin señal" si perdió la señal y "Sin lecturas" si aún no hay', () => {
    expect(unitLabel('Cel')).toBe('°C')
    expect(readingText({ variable: 'air_temperature', value: 24.34, unit: 'Cel', observed_at: 'x', stale: false })).toBe('24.3 °C')
    expect(readingText({ variable: 'air_temperature', value: 24.34, unit: 'Cel', observed_at: 'x', stale: true })).toBe('Sin señal')
    expect(readingText({ variable: 'relative_humidity', value: null, unit: '%', observed_at: null, stale: false })).toBe('Sin lecturas')
  })

  it('el callout resume el dispositivo sin repetir "Sin señal"', () => {
    const lost = device([
      { variable: 'air_temperature', value: 20, unit: 'Cel', observed_at: 'x', stale: true },
      { variable: 'relative_humidity', value: 60, unit: '%', observed_at: 'x', stale: true },
    ])
    expect(deviceCalloutLabel(lost)).toBe('Sensor norte · Sin señal')
    const live = device([
      { variable: 'air_temperature', value: 24.3, unit: 'Cel', observed_at: 'x', stale: false },
      { variable: 'relative_humidity', value: 61, unit: '%', observed_at: 'x', stale: false },
    ])
    expect(deviceCalloutLabel(live)).toBe('Sensor norte · 24.3 °C · 61.0 %')
  })
})
```

Run (en `frontend/`): `npx vitest run src/features/operations/format.test.ts`
Expected: FAIL (`Failed to resolve import "./format"`).

- [ ] **Step 2: Cliente**

Crear `frontend/src/features/operations/api.ts`:

```ts
import { api } from '@/api/client'

export type Variable = 'air_temperature' | 'relative_humidity'
export type Scenario = 'base' | 'heat_rise' | 'sensor_loss'
export type RunStatus = 'running' | 'paused' | 'completed' | 'cancelled'
export type RunAction = 'pause' | 'resume' | 'cancel'
export type IncidentKind = 'threshold' | 'stale'
export type IncidentStatus = 'open' | 'acknowledged' | 'closed'

export interface Device {
  id: string
  project_id: string
  name: string
  kind: 'simulated' | 'physical'
  variables: Variable[]
  x: number
  y: number
  z: number
  status: 'active' | 'inactive'
  created_at: string
}

export interface SimulationRun {
  id: string
  project_id: string
  scenario: Scenario
  model_version: string
  seed: number
  inputs: Record<string, number>
  device_ids: string[]
  status: RunStatus
  started_at: string
  paused_at: string | null
  paused_seconds: number
  ended_at: string | null
  total_steps: number
  emitted_steps: number
  sim_time: string | null
  limits: string[]
  author_id: string
  created_at: string
}

export interface ReadingPoint {
  device_id: string
  variable: Variable
  value: number
  unit: string
  observed_at: string
}

export interface ReadingsResponse {
  run_id: string | null
  interval_minutes: number | null
  downsampled: boolean
  points: ReadingPoint[]
}

export interface LatestValue {
  variable: Variable
  value: number | null
  unit: string
  observed_at: string | null
  stale: boolean
}

export interface LatestDevice {
  device_id: string
  name: string
  x: number
  y: number
  z: number
  readings: LatestValue[]
}

export interface LatestResponse {
  run_id: string | null
  run_status: RunStatus | null
  sim_time: string | null
  devices: LatestDevice[]
}

export interface AlertRule {
  id: string
  project_id: string
  variable: Variable
  comparator: 'gt' | 'lt'
  threshold: number
  hysteresis: number
  cooldown_minutes: number
  stale_after_minutes: number
  label: string
  is_didactic: boolean
  created_at: string
}

export interface Incident {
  id: string
  project_id: string
  rule_id: string | null
  rule_label: string | null
  scenario_run_id: string | null
  kind: IncidentKind
  device_id: string
  device_name: string
  opened_at: string
  closed_at: string | null
  severity: string
  evidence: Record<string, unknown>
  status: IncidentStatus
  acknowledged_by: string | null
  acknowledged_at: string | null
}

export interface DemoSetup {
  created_devices: number
  created_rules: number
  devices: Device[]
  rules: AlertRule[]
}

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`

export const operationsApi = {
  devices: (projectId: string) => api.get<Device[]>(`${base(projectId)}/devices`).then((r) => r.data),
  runs: (projectId: string) => api.get<SimulationRun[]>(`${base(projectId)}/simulation/runs`).then((r) => r.data),
  startRun: (projectId: string, scenario: Scenario) =>
    api.post<SimulationRun>(`${base(projectId)}/simulation/runs`, { scenario }).then((r) => r.data),
  controlRun: (projectId: string, runId: string, action: RunAction) =>
    api.post<SimulationRun>(`${base(projectId)}/simulation/runs/${encodeURIComponent(runId)}/${action}`).then((r) => r.data),
  latest: (projectId: string) => api.get<LatestResponse>(`${base(projectId)}/telemetry/latest`).then((r) => r.data),
  readings: (projectId: string, params: { variable: Variable; device_id: string; run_id?: string }) =>
    api.get<ReadingsResponse>(`${base(projectId)}/telemetry/readings`, { params }).then((r) => r.data),
  alerts: (projectId: string) => api.get<Incident[]>(`${base(projectId)}/alerts`).then((r) => r.data),
  acknowledge: (projectId: string, incidentId: string) =>
    api
      .patch<Incident>(`${base(projectId)}/alerts/${encodeURIComponent(incidentId)}`, { action: 'acknowledge' })
      .then((r) => r.data),
  rules: (projectId: string) => api.get<AlertRule[]>(`${base(projectId)}/alert-rules`).then((r) => r.data),
  demoSetup: (projectId: string) => api.post<DemoSetup>(`${base(projectId)}/simulation/demo`).then((r) => r.data),
}
```

- [ ] **Step 3: Formato puro**

Crear `frontend/src/features/operations/format.ts`:

```ts
// Sin importar three: lo usan las páginas, el inicio y la escena 3D.
import type { IncidentKind, IncidentStatus, LatestDevice, LatestValue, ReadingPoint, RunStatus, Scenario, Variable } from './api'

export const VARIABLES: Variable[] = ['air_temperature', 'relative_humidity']

export const VARIABLE_LABELS: Record<Variable, string> = {
  air_temperature: 'Temperatura del aire',
  relative_humidity: 'Humedad relativa',
}

/** Escala de los gauges: los rangos físicos generales que acepta el motor, no rangos óptimos. */
export const GAUGE_RANGES: Record<Variable, [number, number]> = {
  air_temperature: [-10, 50],
  relative_humidity: [0, 100],
}

export const SCENARIO_LABELS: Record<Scenario, string> = {
  base: 'Base',
  heat_rise: 'Subida de temperatura',
  sensor_loss: 'Pérdida de sensor y recuperación',
}

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  running: 'En curso',
  paused: 'En pausa',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

export const INCIDENT_KIND_LABELS: Record<IncidentKind, string> = { threshold: 'Umbral', stale: 'Sin señal' }

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Abierto',
  acknowledged: 'Reconocido',
  closed: 'Cerrado',
}

export function unitLabel(unit: string): string {
  return unit === 'Cel' ? '°C' : unit
}

export function formatReading(value: number): string {
  return value.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Texto de una lectura: valor con unidad, "Sin señal" o "Sin lecturas"; nunca 0 por ausencia. */
export function readingText(r: LatestValue): string {
  if (r.stale) return 'Sin señal'
  if (r.value === null) return 'Sin lecturas'
  return `${formatReading(r.value)} ${unitLabel(r.unit)}`
}

export function deviceCalloutLabel(device: LatestDevice): string {
  const texts = device.readings.map(readingText)
  const unique = Array.from(new Set(texts))
  const body = unique.length === 1 && (unique[0] === 'Sin señal' || unique[0] === 'Sin lecturas') ? unique : texts
  return [device.name, ...body].join(' · ')
}

/** Serie para LineChart: inserta un null donde faltan pasos (pérdida de señal) para cortar la línea. */
export function withGaps(points: ReadingPoint[], intervalMinutes: number | null): Array<{ t: string; value: number | null }> {
  const out: Array<{ t: string; value: number | null }> = []
  const maxGapMs = (intervalMinutes ?? 0) * 60_000 * 1.5
  let previous: number | null = null
  for (const p of points) {
    const t = Date.parse(p.observed_at)
    if (previous !== null && maxGapMs > 0 && t - previous > maxGapMs) out.push({ t: p.observed_at, value: null })
    out.push({ t: p.observed_at, value: p.value })
    previous = t
  }
  return out
}

export interface GreenhouseDims {
  width: number
  length: number
  wallHeight: number
  ridgeHeight: number
  /** true si el proyecto no tiene área registrada y se usa el tamaño ilustrativo. */
  illustrative: boolean
}

export const ILLUSTRATIVE_WIDTH_M = 8
export const ILLUSTRATIVE_LENGTH_M = 16
const WALL_HEIGHT_M = 3

/** Nave 1:2 con el área registrada (misma fórmula que telemetry/demo.py) o tamaño ilustrativo 8 × 16 m. */
export function greenhouseDims(areaM2: number | null): GreenhouseDims {
  const illustrative = !areaM2 || areaM2 <= 0
  const width = illustrative ? ILLUSTRATIVE_WIDTH_M : Math.sqrt(areaM2 / 2)
  const length = illustrative ? ILLUSTRATIVE_LENGTH_M : width * 2
  return { width, length, wallHeight: WALL_HEIGHT_M, ridgeHeight: WALL_HEIGHT_M + width * 0.2, illustrative }
}

/** Posición del dispositivo (x ancho, y largo, z altura, en m desde una esquina) a coordenadas de escena (Y arriba, centrada). */
export function deviceToWorld(dims: GreenhouseDims, p: { x: number; y: number; z: number }) {
  return { x: p.x - dims.width / 2, y: p.z, z: dims.length / 2 - p.y }
}

export function formatMeters(value: number): string {
  return value.toLocaleString('es-MX', { maximumFractionDigits: 1 })
}
```

- [ ] **Step 4: Polling**

Crear `frontend/src/features/operations/usePolling.ts`:

```ts
import { useEffect, useRef } from 'react'

export const POLL_MS = 5000

/** Llama a `callback` cada `ms` mientras `active` sea true (p. ej. mientras el run está en curso). */
export function usePolling(callback: () => void, active: boolean, ms = POLL_MS) {
  const ref = useRef(callback)
  ref.current = callback
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => ref.current(), ms)
    return () => clearInterval(timer)
  }, [active, ms])
}
```

- [ ] **Step 5: Verificar**

Run (en `frontend/`): `npx vitest run src/features/operations/format.test.ts && npx tsc -b`
Expected: PASS (7 pruebas) y `tsc` sin errores.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/operations
git commit -m "feat(operations): cliente del invernadero virtual, formato sin ceros inventados, series con huecos y medidas de la nave"
```

---

### Task 7: Nave 3D paramétrica con sensores y callouts (chunk perezoso)

**Files:**
- Create: `frontend/src/features/three/greenhouse.ts`
- Test: `frontend/src/features/three/greenhouse.test.ts`
- Create: `frontend/src/features/operations/GreenhouseViewer.tsx`
- Create: `frontend/src/features/operations/LazyGreenhouseViewer.tsx`

**Interfaces:**
- Consumes: Task 6 (`GreenhouseDims`, `greenhouseDims`, `deviceToWorld`); V2 (`useProjectedCallouts`, `CalloutProjector`, `Callout`, `viewerPalette`).
- Produces:
  - `greenhouse.ts`: `GreenhouseColors`, `gableProfile(dims)`, `buildGreenhouse(dims, colors) -> THREE.Group` (hijos con nombre `floor`, `shell`, `frame`), `disposeGroup(group)`.
  - `GreenhouseViewer` (export default, perezoso): props `GreenhouseViewerProps { dims; devices: SceneDevice[]; label?; className? }`, `SceneDevice { key; label; x; y; z; stale }` (x, y, z en metros dentro de la nave).
  - `LazyGreenhouseViewer.tsx`: `GreenhouseViewer(props)` con `Suspense` y re-export del tipo `SceneDevice`.

Nota: los puntos de los callouts están en coordenadas de escena y se proyectan contra el grupo `sensors` (identidad, sin geometría propia), así que `CalloutProjector` nunca los atenúa: la nave es translúcida y los sensores están dentro.

- [ ] **Step 1: Prueba que falla**

Crear `frontend/src/features/three/greenhouse.test.ts`:

```ts
import * as THREE from 'three'
import { expect, it } from 'vitest'
import { greenhouseDims } from '@/features/operations/format'
import { buildGreenhouse, gableProfile } from './greenhouse'

const colors = { frame: 0x262b25, glass: 0xffffff, floor: 0xcfdacb }

it('la nave mide lo que dice el área y tiene techo a dos aguas', () => {
  const dims = greenhouseDims(50) // 5 × 10 m
  const group = buildGreenhouse(dims, colors)
  const shell = group.getObjectByName('shell') as THREE.Mesh
  const box = new THREE.Box3().setFromObject(shell)
  expect(box.min.x).toBeCloseTo(-2.5)
  expect(box.max.x).toBeCloseTo(2.5)
  expect(box.min.z).toBeCloseTo(-5)
  expect(box.max.z).toBeCloseTo(5)
  expect(box.min.y).toBeCloseTo(0)
  expect(box.max.y).toBeCloseTo(dims.ridgeHeight)
  const profile = gableProfile(dims)
  expect(profile[3]).toEqual([0, dims.ridgeHeight]) // cumbrera al centro
  expect(group.getObjectByName('floor')).toBeDefined()
  expect(group.getObjectByName('frame')).toBeInstanceOf(THREE.LineSegments)
})
```

Run (en `frontend/`): `npx vitest run src/features/three/greenhouse.test.ts`
Expected: FAIL (`Failed to resolve import "./greenhouse"`).

- [ ] **Step 2: Geometría**

Crear `frontend/src/features/three/greenhouse.ts`:

```ts
import * as THREE from 'three'
import type { GreenhouseDims } from '@/features/operations/format'

export interface GreenhouseColors {
  frame: number
  glass: number
  floor: number
}

/** Perfil a dos aguas (x, y) en el plano frontal; se extruye a lo largo de la nave. */
export function gableProfile(dims: GreenhouseDims): Array<[number, number]> {
  const half = dims.width / 2
  return [
    [-half, 0],
    [half, 0],
    [half, dims.wallHeight],
    [0, dims.ridgeHeight],
    [-half, dims.wallHeight],
  ]
}

/** Nave paramétrica: piso, cubierta translúcida a dos aguas y aristas. Centrada en el origen, Y arriba. */
export function buildGreenhouse(dims: GreenhouseDims, colors: GreenhouseColors): THREE.Group {
  const group = new THREE.Group()
  group.name = 'greenhouse'

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.width, dims.length),
    new THREE.MeshStandardMaterial({ color: colors.floor, roughness: 0.9 }),
  )
  floor.name = 'floor'
  floor.rotation.x = -Math.PI / 2
  group.add(floor)

  const shape = new THREE.Shape()
  gableProfile(dims).forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)))
  shape.closePath()
  const shellGeometry = new THREE.ExtrudeGeometry(shape, { depth: dims.length, bevelEnabled: false })
  shellGeometry.translate(0, 0, -dims.length / 2)

  const shell = new THREE.Mesh(
    shellGeometry,
    new THREE.MeshStandardMaterial({
      color: colors.glass,
      transparent: true,
      opacity: 0.16,
      roughness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  shell.name = 'shell'
  group.add(shell)

  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(shellGeometry), new THREE.LineBasicMaterial({ color: colors.frame }))
  frame.name = 'frame'
  group.add(frame)
  return group
}

/** Libera geometrías y materiales de un grupo construido aquí. */
export function disposeGroup(group: THREE.Object3D) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    mesh.geometry?.dispose()
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(material)) material.forEach((m) => m.dispose())
    else material?.dispose()
  })
}
```

- [ ] **Step 3: Visor**

Crear `frontend/src/features/operations/GreenhouseViewer.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Callout } from '@/components/ui'
import { buildGreenhouse, disposeGroup } from '@/features/three/greenhouse'
import { useProjectedCallouts } from '@/features/three/useProjectedCallouts'
import { viewerPalette } from '@/features/prototypes/viewerPalette'
import { useTheme } from '@/store/theme'
import { deviceToWorld, GreenhouseDims } from './format'

export interface SceneDevice {
  key: string
  label: string
  /** Metros dentro de la nave: x ancho, y largo, z altura. */
  x: number
  y: number
  z: number
  stale: boolean
}

export interface GreenhouseViewerProps {
  dims: GreenhouseDims
  devices: SceneDevice[]
  label?: string
  className?: string
}

const LIVE = 0xa6e22e
const STALE = 0x9aa898

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

/** Invernadero paramétrico con sensores como esferas y su última lectura en callouts. Chunk perezoso. */
export default function GreenhouseViewer({ dims, devices, label = 'Invernadero virtual', className = '' }: GreenhouseViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'ready' | 'nowebgl'>('ready')
  const theme = useTheme((s) => s.theme)
  const darkRef = useRef(theme === 'dark')
  const applyThemeRef = useRef<((dark: boolean) => void) | null>(null)
  const syncDevicesRef = useRef<((list: SceneDevice[]) => void) | null>(null)
  const { projected, projector } = useProjectedCallouts()
  const devicesKey = JSON.stringify(devices)

  useEffect(() => {
    darkRef.current = theme === 'dark'
    applyThemeRef.current?.(darkRef.current)
  }, [theme])

  // Callouts y esferas siguen a los datos sin reconstruir la escena.
  useEffect(() => {
    const list: SceneDevice[] = JSON.parse(devicesKey)
    projector.setPoints(list.map((d, i) => ({ key: d.key, label: d.label, index: i + 1, ...deviceToWorld(dims, d) })))
    syncDevicesRef.current?.(list)
  }, [devicesKey, dims, projector])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    if (!webglAvailable()) {
      setPhase('nowebgl')
      return
    }
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setPhase('nowebgl')
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.touchAction = 'none'
    mount.appendChild(renderer.domElement)

    const palette = viewerPalette(darkRef.current)
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const hemi = new THREE.HemisphereLight(0xffffff, palette.ground, 0.6)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(6, 10, 8)
    scene.add(sun)

    const greenhouse = buildGreenhouse(dims, { frame: palette.gridCenter, glass: 0xffffff, floor: palette.ground })
    scene.add(greenhouse)
    // Los puntos de los callouts están en coordenadas de escena: el grupo queda en identidad.
    const sensors = new THREE.Group()
    scene.add(sensors)
    const radius = Math.max(0.15, Math.min(dims.width, dims.length) * 0.03)
    const sphere = new THREE.SphereGeometry(radius, 20, 14)

    syncDevicesRef.current = (list) => {
      sensors.children.forEach((c) => ((c as THREE.Mesh).material as THREE.Material).dispose())
      sensors.clear()
      for (const d of list) {
        const mesh = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ color: d.stale ? STALE : LIVE, roughness: 0.4 }))
        const p = deviceToWorld(dims, d)
        mesh.position.set(p.x, p.y, p.z)
        sensors.add(mesh)
      }
    }
    syncDevicesRef.current(JSON.parse(devicesKey))

    applyThemeRef.current = (dark) => {
      const p = viewerPalette(dark)
      hemi.groundColor.setHex(p.ground)
      const floor = greenhouse.getObjectByName('floor') as THREE.Mesh | undefined
      ;(floor?.material as THREE.MeshStandardMaterial | undefined)?.color.setHex(p.ground)
    }

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000)
    const size = Math.max(dims.width, dims.length, dims.ridgeHeight)
    camera.position.set(size * 0.9, size * 0.7, size * 1.1)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.target.set(0, dims.wallHeight / 2, 0)
    controls.minDistance = size * 0.4
    controls.maxDistance = size * 4
    controls.maxPolarAngle = Math.PI / 2.05
    controls.update()

    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()
    projector.invalidate()

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      controls.update()
      projector.update(camera, sensors, mount.clientWidth || 1, mount.clientHeight || 1, performance.now())
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      syncDevicesRef.current = null
      applyThemeRef.current = null
      sensors.children.forEach((c) => ((c as THREE.Mesh).material as THREE.Material).dispose())
      sphere.dispose()
      disposeGroup(greenhouse)
      scene.clear()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
    // devicesKey se aplica con syncDevicesRef; la escena solo se reconstruye si cambian las medidas.
  }, [dims.width, dims.length, dims.ridgeHeight, projector])

  return (
    <div className={`relative overflow-hidden rounded-[22px] bg-gradient-to-b from-surface/60 to-bg-2/60 ${className}`}>
      <div ref={mountRef} className="absolute inset-0" role="img" aria-label={label} />
      {phase === 'ready' && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {projected.map((c) =>
            c.hidden ? null : <Callout key={c.key} x={c.x} y={c.y} side={c.side} dimmed={c.dimmed} label={c.label} index={c.index} />,
          )}
        </div>
      )}
      {phase === 'nowebgl' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
          Tu navegador no admite WebGL, necesario para ver el invernadero en 3D. Las lecturas siguen disponibles abajo.
        </div>
      )}
    </div>
  )
}
```

Crear `frontend/src/features/operations/LazyGreenhouseViewer.tsx`:

```tsx
import { lazy, Suspense } from 'react'
import type { GreenhouseViewerProps } from './GreenhouseViewer'

// three.js vive solo en este chunk perezoso.
const GreenhouseViewerImpl = lazy(() => import('./GreenhouseViewer'))

export type { SceneDevice } from './GreenhouseViewer'

export function GreenhouseViewer(props: GreenhouseViewerProps) {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          className={`flex items-center justify-center rounded-[22px] border border-border bg-surface text-xs font-medium text-muted ${props.className ?? ''}`}
        >
          Preparando invernadero 3D…
        </div>
      }
    >
      <GreenhouseViewerImpl {...props} />
    </Suspense>
  )
}
```

- [ ] **Step 4: Verificar**

Run (en `frontend/`): `npx vitest run src/features/three && npx tsc -b`
Expected: PASS (incluidas las pruebas de V2 en `three.test.ts`) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/three/greenhouse.ts frontend/src/features/three/greenhouse.test.ts frontend/src/features/operations/GreenhouseViewer.tsx frontend/src/features/operations/LazyGreenhouseViewer.tsx
git commit -m "feat(operations): nave 3D paramétrica a dos aguas con sensores y callouts de su última lectura, en el chunk perezoso de three"
```

---

### Task 8: Pestañas en píldora del proyecto y lecturas SIMULADO en el inicio

**Files:**
- Create: `frontend/src/features/projects/ProjectTabs.tsx`
- Modify: `frontend/src/features/projects/ProjectDetailPage.tsx`
- Modify: `frontend/src/features/projects/projects.test.tsx`
- Modify: `frontend/src/features/home/api.ts`
- Modify: `frontend/src/features/home/HomePage.tsx`
- Modify: `frontend/src/features/home/home.test.tsx`

**Interfaces:**
- Consumes: Task 6 (`formatReading`, `unitLabel`); contrato `GET /home` con `readings`.
- Produces: `ProjectTab = 'resumen' | 'bitacora' | 'ciclos' | 'operaciones'`, `projectTabHref(projectId, tab)`, `ProjectTabs({ projectId, active })` (nav `aria-label="Secciones del proyecto"`, enlace activo con `aria-current="page"`); `HomeReading` y `HomeData.readings`.

- [ ] **Step 1: Pruebas que fallan**

En `frontend/src/features/projects/projects.test.tsx`:

1. Cambiar la importación de Testing Library a `import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'`.
2. En `ProjectDetailPage muestra conflicto de versión al guardar`, reemplazar las dos líneas

```tsx
  expect(await screen.findByText('Primera observación')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
```

por (la bitácora ahora vive en su pestaña; "Editar" en Resumen):

```tsx
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
```

3. Añadir al final:

```tsx
it('ProjectDetailPage separa Resumen, Bitácora, Ciclos y Operaciones en pestañas', async () => {
  mocked.getProject.mockResolvedValue(project)
  mocked.listObservations.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
  render(
    <MemoryRouter initialEntries={['/app/projects/p1?tab=bitacora']}>
      <Routes>
        <Route path="/app/projects/:id" element={<ProjectDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
  const nav = await screen.findByRole('navigation', { name: 'Secciones del proyecto' })
  const links = within(nav).getAllByRole('link')
  expect(links.map((l) => l.textContent)).toEqual(['Resumen', 'Bitácora', 'Ciclos', 'Operaciones'])
  expect(within(nav).getByRole('link', { name: 'Bitácora' })).toHaveAttribute('aria-current', 'page')
  expect(within(nav).getByRole('link', { name: 'Operaciones' })).toHaveAttribute('href', '/app/projects/p1/operations')
  expect(screen.getByRole('heading', { name: 'Bitácora' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull() // editar vive en Resumen
  fireEvent.click(within(nav).getByRole('link', { name: 'Ciclos' }))
  expect(await screen.findByText(/Sin ciclos de cultivo/)).toBeInTheDocument()
})
```

En `frontend/src/features/home/home.test.tsx`, añadir `readings: [],` a la fixture `base` (después de `counts`) y al objeto de `con proyecto muestra héroe, conteos reales y actividad` (después de `counts`), y añadir al final:

```tsx
it('muestra las últimas lecturas simuladas con su badge y "Sin señal" si se perdió', async () => {
  vi.spyOn(homeApi, 'get').mockResolvedValue({
    ...base,
    recent_project: { id: 'p1', name: 'Invernadero demostrativo', system: 'other', area_m2: null, species: [] },
    readings: [
      { variable: 'air_temperature', value: 24.34, unit: 'Cel', observed_at: '2026-10-20T12:00:00Z', stale: false, device_name: 'Sensor norte', origin: 'simulated' },
      { variable: 'relative_humidity', value: null, unit: '%', observed_at: '2026-10-20T11:50:00Z', stale: true, device_name: 'Sensor norte', origin: 'simulated' },
    ],
  })
  renderPage()
  await waitFor(() => expect(screen.getByText('24.3')).toBeInTheDocument())
  expect(screen.getByText('°C')).toBeInTheDocument()
  expect(screen.getByText('Simulado')).toHaveAttribute('title', expect.stringContaining('simulación'))
  const humidity = screen.getByText('Humedad relativa').closest('div')!
  expect(humidity).toHaveTextContent('Sin señal')
  expect(humidity).not.toHaveTextContent('%') // sin señal no se muestra 0 ni el último valor
})
```

Run (en `frontend/`): `npx vitest run src/features/projects src/features/home`
Expected: FAIL (no hay navegación de pestañas; `24.3` no aparece).

- [ ] **Step 2: Pestañas**

Crear `frontend/src/features/projects/ProjectTabs.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { cx } from '@/components/ui'

export type ProjectTab = 'resumen' | 'bitacora' | 'ciclos' | 'operaciones'

const TABS: Array<{ key: ProjectTab; label: string }> = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'bitacora', label: 'Bitácora' },
  { key: 'ciclos', label: 'Ciclos' },
  { key: 'operaciones', label: 'Operaciones' },
]

export function projectTabHref(projectId: string, tab: ProjectTab): string {
  const base = `/app/projects/${encodeURIComponent(projectId)}`
  if (tab === 'resumen') return base
  if (tab === 'operaciones') return `${base}/operations`
  return `${base}?tab=${tab}`
}

export function ProjectTabs({ projectId, active }: { projectId: string; active: ProjectTab }) {
  return (
    <nav aria-label="Secciones del proyecto" className="mb-6 flex gap-2 overflow-x-auto pb-1">
      {TABS.map((t) => (
        <Link
          key={t.key}
          to={projectTabHref(projectId, t.key)}
          aria-current={t.key === active ? 'page' : undefined}
          className={cx(
            'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
            t.key === active ? 'bg-lime text-ink' : 'glass !rounded-full text-muted hover:text-fg',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
```

Reemplazar `frontend/src/features/projects/ProjectDetailPage.tsx` por (misma lógica de carga, edición y conflicto; el contenido se reparte en pestañas):

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import { Badge, Button, Card, Empty, ErrorState, Forbidden, Loading } from '@/components/ui'
import { useHasRole } from '@/store/auth'
import { getProject, ProjectDetail, ProjectInput, updateProject } from './api'
import { CYCLE_STATUS_LABELS, fieldErrors, formatArea, formatDateTime, STAGE_LABELS, SYSTEM_LABELS } from './labels'
import { ObservationLog } from './ObservationLog'
import { ProjectForm, ProjectFormValues } from './ProjectForm'
import { ProjectTab, ProjectTabs } from './ProjectTabs'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; code?: number }
  | { status: 'ready'; data: ProjectDetail }

function toFormValues(p: ProjectDetail): ProjectFormValues {
  return {
    name: p.name,
    objectives: p.objectives ?? '',
    area_m2: p.area_m2 != null ? String(p.area_m2) : '',
    system: p.system,
    location: p.location ?? '',
  }
}

function formatDay(iso: string | null): string {
  if (!iso) return 'Sin fecha'
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-MX', { dateStyle: 'medium' })
}

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: ProjectTab = tabParam === 'bitacora' || tabParam === 'ciclos' ? tabParam : 'resumen'
  const canEdit = useHasRole('editor')
  const [state, setState] = useState<State>({ status: 'loading' })
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})

  const load = useCallback(
    (quiet = false) => {
      if (!quiet) setState({ status: 'loading' })
      return getProject(id)
        .then((data) => setState({ status: 'ready', data }))
        .catch((err) =>
          setState({ status: 'error', message: errorMessage(err, 'No se pudo cargar el proyecto'), code: errorStatus(err) }),
        )
    },
    [id],
  )

  useEffect(() => {
    load()
  }, [load])

  const back = (
    <Link to="/app/projects" className="mb-4 inline-block text-sm text-muted hover:text-fg">
      ← Proyectos
    </Link>
  )

  if (state.status === 'loading') return <>{back}<Loading label="Cargando proyecto…" /></>
  if (state.status === 'error') {
    return (
      <>
        {back}
        {state.code === 404 ? (
          <Empty title="Proyecto no encontrado" description="No existe o no pertenece a tu organización activa." />
        ) : state.code === 403 ? (
          <Forbidden />
        ) : (
          <ErrorState message={state.message} onRetry={() => load()} />
        )}
      </>
    )
  }

  const p = state.data

  const save = async (data: ProjectInput) => {
    setSaving(true)
    setConflict(false)
    setSaveError(null)
    setServerErrors({})
    try {
      const updated = await updateProject(p.id, { ...data, version: p.version })
      setState({ status: 'ready', data: updated })
      setEditing(false)
    } catch (err) {
      const status = errorStatus(err)
      if (status === 409) setConflict(true)
      else {
        const fields = fieldErrors(err)
        setServerErrors(fields)
        if (Object.keys(fields).length === 0) setSaveError(errorMessage(err, 'No se pudieron guardar los cambios'))
      }
    } finally {
      setSaving(false)
    }
  }

  const reloadAfterConflict = async () => {
    await load(true)
    setConflict(false)
  }

  const cancelEdit = () => {
    setEditing(false)
    setConflict(false)
    setSaveError(null)
    setServerErrors({})
  }

  return (
    <>
      {back}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="display text-3xl">{p.name}</h1>
          <p className="mt-1 text-xs text-muted">
            Versión <span className="font-mono">{p.version}</span> · Actualizado {formatDateTime(p.updated_at)}
          </p>
        </div>
        {canEdit && !editing && tab === 'resumen' && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
      </div>
      <ProjectTabs projectId={p.id} active={tab} />

      {tab === 'resumen' && (
        <Card className="max-w-3xl p-5">
          {editing ? (
            <>
              <h2 className="mb-4 eyebrow">Editar proyecto</h2>
              <ProjectForm
                key={p.version}
                initial={toFormValues(p)}
                submitLabel="Guardar cambios"
                saving={saving}
                serverErrors={serverErrors}
                notice={
                  conflict ? (
                    <div role="alert" className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                      <p>Otra persona modificó este proyecto mientras editabas. Tus cambios no se guardaron.</p>
                      <Button type="button" variant="secondary" onClick={reloadAfterConflict}>
                        Cargar versión actual
                      </Button>
                    </div>
                  ) : saveError ? (
                    <p role="alert" className="text-sm text-danger">
                      {saveError}
                    </p>
                  ) : null
                }
                onSubmit={save}
                onCancel={cancelEdit}
              />
            </>
          ) : (
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="eyebrow">Objetivos</dt>
                <dd className="mt-1 whitespace-pre-wrap">{p.objectives || <span className="text-muted">Sin objetivos registrados</span>}</dd>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="eyebrow">Sistema</dt>
                  <dd className="mt-1">{SYSTEM_LABELS[p.system] ?? p.system}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Área</dt>
                  <dd className="mt-1 font-mono">{formatArea(p.area_m2)}</dd>
                </div>
              </div>
              <div>
                <dt className="eyebrow">Ubicación</dt>
                <dd className="mt-1">{p.location || <span className="text-muted">Sin especificar</span>}</dd>
              </div>
            </dl>
          )}
        </Card>
      )}

      {tab === 'ciclos' && (
        <Card className="max-w-3xl p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="eyebrow">Cultivos</h2>
            {canEdit && (
              <Link to="/app/plants" className="text-sm font-medium text-accent hover:underline">
                Añadir desde el catálogo
              </Link>
            )}
          </div>
          {p.crop_cycles.length === 0 ? (
            <p className="text-sm text-muted">
              Sin ciclos de cultivo. {canEdit && 'Abre una especie en el explorador vegetal y usa «Añadir a proyecto».'}
            </p>
          ) : (
            <ul className="space-y-3">
              {p.crop_cycles.map((c) => (
                <li key={c.id} className="text-sm">
                  <Link to={`/app/plants/${c.species_id}`} className="italic hover:text-accent">
                    {c.species_name}
                  </Link>
                  {c.cultivar_name && <span> ‘{c.cultivar_name}’</span>}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone={c.status === 'active' ? 'accent' : 'neutral'}>{CYCLE_STATUS_LABELS[c.status] ?? c.status}</Badge>
                    <span>Inicio: {formatDay(c.started_on)}</span>
                    <span>· Etapa: {STAGE_LABELS[c.stage] ?? c.stage}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'bitacora' && (
        <Card className="p-5">
          <h2 className="mb-4 eyebrow">Bitácora</h2>
          <ObservationLog projectId={p.id} cycles={p.crop_cycles} canEdit={canEdit} />
        </Card>
      )}
    </>
  )
}
```

- [ ] **Step 3: Lecturas en el inicio**

Reemplazar `frontend/src/features/home/api.ts` por:

```ts
import { api } from '@/api/client'

export interface HomeProject {
  id: string
  name: string
  system: string
  area_m2: number | null
  species: string[]
}

export interface HomeActivity {
  id: string
  text: string
  resource_type: string
  resource_id: string
  created_at: string
}

/** Última lectura simulada por variable; stale=true con value=null es "Sin señal". */
export interface HomeReading {
  variable: 'air_temperature' | 'relative_humidity'
  value: number | null
  unit: string
  observed_at: string | null
  stale: boolean
  device_name: string
  origin: 'simulated'
}

export interface HomeData {
  recent_project: HomeProject | null
  counts: { projects: number; crop_cycles: number; observations: number; sources_cited: number }
  readings: HomeReading[]
  activity: HomeActivity[]
}

export const homeApi = {
  get: () => api.get<HomeData>('/home').then((r) => r.data),
}
```

Reemplazar `frontend/src/features/home/HomePage.tsx` por:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { BarChart, Card, ErrorState, Loading, StatTile } from '@/components/ui'
import { formatDate } from '@/features/catalog/labels'
import { formatReading, unitLabel } from '@/features/operations/format'
import type { CultivationSystem } from '@/features/projects/api'
import { SYSTEM_LABELS } from '@/features/projects/labels'
import { useAuth } from '@/store/auth'
import { HomeData, homeApi, HomeReading } from './api'

type State = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready'; data: HomeData }

function GreenhouseArt() {
  return (
    <svg viewBox="0 0 200 150" className="h-full w-full" aria-hidden="true">
      <polygon points="20,70 100,20 180,70" fill="rgb(var(--c-surface) / 0.7)" stroke="rgb(var(--c-surface))" strokeWidth="2" />
      <rect x="20" y="70" width="160" height="70" fill="rgb(var(--c-lime) / 0.25)" stroke="rgb(var(--c-surface))" strokeWidth="2" />
      {[60, 100, 140].map((x) => (
        <line key={x} x1={x} y1="70" x2={x} y2="140" stroke="rgb(var(--c-surface))" strokeWidth="1.5" />
      ))}
    </svg>
  )
}

function ReadingTile({ label, reading }: { label: string; reading?: HomeReading }) {
  if (!reading) return <StatTile label={label} value={null} emptyText="Sin lecturas" />
  if (reading.stale || reading.value === null) return <StatTile label={label} value={null} emptyText="Sin señal" />
  return <StatTile label={label} value={formatReading(reading.value)} unit={unitLabel(reading.unit)} origin={reading.origin} />
}

export function HomePage() {
  const user = useAuth((s) => s.user)
  const [state, setState] = useState<State>({ phase: 'loading' })

  const load = useCallback(() => {
    setState({ phase: 'loading' })
    homeApi
      .get()
      .then((data) => setState({ phase: 'ready', data }))
      .catch((err) => setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar el inicio') }))
  }, [])
  useEffect(load, [load])

  if (state.phase === 'loading') return <Loading />
  if (state.phase === 'error') return <ErrorState message={state.message} onRetry={load} />
  const { recent_project: p, counts, activity, readings } = state.data
  const reading = (variable: HomeReading['variable']) => readings.find((r) => r.variable === variable)

  return (
    <div className="space-y-3">
      <p className="eyebrow">Hola{user?.full_name ? `, ${user.full_name}` : ''}</p>
      <Card className="relative overflow-hidden p-6 sm:min-h-[220px]">
        <div className="relative z-10 max-w-md">
          <p className="eyebrow">{p ? 'Proyecto activo' : 'Comienza aquí'}</p>
          {p ? (
            <>
              <h1 className="display mt-2 break-words text-4xl sm:text-5xl">{p.name}</h1>
              <p className="mt-3 text-sm text-muted">
                {[p.species.join(', ') || 'Sin especie asignada', SYSTEM_LABELS[p.system as CultivationSystem] ?? p.system, p.area_m2 ? `${p.area_m2} m²` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <Link to={`/app/projects/${p.id}`} className="mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-fg">
                Abrir proyecto
              </Link>
            </>
          ) : (
            <>
              <h1 className="display mt-2 text-4xl sm:text-5xl">Aún no hay proyectos</h1>
              <p className="mt-3 text-sm text-muted">Crea un proyecto de cultivo para ver aquí su estado.</p>
              <Link to="/app/projects" className="mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-fg">
                Crear proyecto
              </Link>
            </>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-0 right-4 hidden h-[180px] w-[240px] sm:block">
          <GreenhouseArt />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ReadingTile label="Temperatura del aire" reading={reading('air_temperature')} />
        <ReadingTile label="Humedad relativa" reading={reading('relative_humidity')} />
        <StatTile label="Observaciones" value={counts.observations} />
        <StatTile label="Fuentes citadas" value={counts.sources_cited} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <p className="font-bold">Espacio de trabajo</p>
          <p className="mb-4 text-xs text-muted">Registros reales de esta organización</p>
          <BarChart
            ariaLabel="Proyectos, ciclos y observaciones"
            highlightIndex={2}
            data={[
              { label: 'Proyectos', value: counts.projects },
              { label: 'Ciclos', value: counts.crop_cycles },
              { label: 'Observaciones', value: counts.observations },
            ]}
          />
          <div className="mt-2 grid grid-cols-3 text-center text-[11px] text-muted">
            <span>Proyectos · {counts.projects}</span>
            <span>Ciclos · {counts.crop_cycles}</span>
            <span>Observaciones · {counts.observations}</span>
          </div>
        </Card>
        <Card className="p-5">
          <p className="mb-2 font-bold">Actividad reciente</p>
          {activity.length === 0 ? (
            <p className="text-sm text-muted">Sin actividad todavía.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{a.text}</span>
                  <span className="shrink-0 text-[11px] text-muted">{formatDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificar**

Run (en `frontend/`): `npx vitest run src/features/projects src/features/home && npx tsc -b`
Expected: PASS (5 + 4 pruebas) y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/projects frontend/src/features/home
git commit -m "feat(projects): pestañas en píldora Resumen, Bitácora, Ciclos y Operaciones; el inicio muestra lecturas simuladas o «Sin señal»"
```

---

### Task 9: Pantalla de operaciones `/app/projects/:id/operations`

**Files:**
- Create: `frontend/src/features/operations/OperationsPage.tsx`
- Test: `frontend/src/features/operations/operations.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: Task 6 (`operationsApi`, formato, `usePolling`, `POLL_MS`), Task 7 (`LazyGreenhouseViewer`), Task 8 (`ProjectTabs`); `getProject` de `features/projects/api`; `Gauge`, `LineChart`, `StatTile`, `OriginBadge`, `Badge`, `Select` de `components/ui`.
- Produces: `OperationsPage`, `DIDACTIC_NOTICE = 'Simulación didáctica, sin calibración agronómica'`; ruta `/app/projects/:id/operations`.

Comportamiento: carga `latest` primero (materializa) y luego dispositivos, corridas, incidentes y las series del dispositivo elegido; mientras la corrida más reciente está `running` repite la carga cada 5 s sin parpadeo (`load(true)`). Gauges solo cuando hay lectura o señal perdida ("Sin señal"); sin datos todavía, `StatTile` "Sin lecturas".

- [ ] **Step 1: Pruebas que fallan**

Crear `frontend/src/features/operations/operations.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as projectsApi from '@/features/projects/api'
import { useAuth } from '@/store/auth'
import { Device, Incident, LatestResponse, operationsApi, ReadingsResponse, SimulationRun } from './api'
import { DIDACTIC_NOTICE, OperationsPage } from './OperationsPage'
import { POLL_MS } from './usePolling'

vi.mock('@/features/projects/api', () => ({ getProject: vi.fn() }))
vi.mock('./LazyGreenhouseViewer', () => ({
  GreenhouseViewer: ({ devices }: { devices: { key: string; label: string; stale: boolean }[] }) => (
    <ul data-testid="scene">
      {devices.map((d) => (
        <li key={d.key} data-stale={d.stale}>
          {d.label}
        </li>
      ))}
    </ul>
  ),
}))

const project: projectsApi.ProjectDetail = {
  id: 'p1',
  name: 'Invernadero demostrativo',
  objectives: null,
  area_m2: null,
  system: 'other',
  location: null,
  version: 1,
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
  crop_cycles: [],
}

const devices: Device[] = [
  { id: 'd1', project_id: 'p1', name: 'Sensor norte', kind: 'simulated', variables: ['air_temperature', 'relative_humidity'], x: 4, y: 12, z: 1.5, status: 'active', created_at: '2026-10-20T10:00:00Z' },
  { id: 'd2', project_id: 'p1', name: 'Sensor sur', kind: 'simulated', variables: ['air_temperature', 'relative_humidity'], x: 4, y: 4, z: 1.5, status: 'active', created_at: '2026-10-20T10:00:00Z' },
]

const run = (status: SimulationRun['status']): SimulationRun => ({
  id: 'r1',
  project_id: 'p1',
  scenario: 'sensor_loss',
  model_version: 'didactic-v1',
  seed: 42,
  inputs: { step_minutes: 5, tick_seconds: 2 },
  device_ids: ['d1', 'd2'],
  status,
  started_at: '2026-10-20T12:00:00Z',
  paused_at: null,
  paused_seconds: 0,
  ended_at: null,
  total_steps: 288,
  emitted_steps: 70,
  sim_time: '2026-10-20T17:45:00Z',
  limits: ['Simulación didáctica, sin calibración agronómica.'],
  author_id: 'u1',
  created_at: '2026-10-20T12:00:00Z',
})

const latest: LatestResponse = {
  run_id: 'r1',
  run_status: 'running',
  sim_time: '2026-10-20T17:45:00Z',
  devices: [
    {
      device_id: 'd1', name: 'Sensor norte', x: 4, y: 12, z: 1.5,
      readings: [
        { variable: 'air_temperature', value: 21.2, unit: 'Cel', observed_at: '2026-10-20T16:55:00Z', stale: true },
        { variable: 'relative_humidity', value: 66, unit: '%', observed_at: '2026-10-20T16:55:00Z', stale: true },
      ],
    },
    {
      device_id: 'd2', name: 'Sensor sur', x: 4, y: 4, z: 1.5,
      readings: [
        { variable: 'air_temperature', value: 24.34, unit: 'Cel', observed_at: '2026-10-20T17:45:00Z', stale: false },
        { variable: 'relative_humidity', value: 61, unit: '%', observed_at: '2026-10-20T17:45:00Z', stale: false },
      ],
    },
  ],
}

const series: ReadingsResponse = {
  run_id: 'r1',
  interval_minutes: 5,
  downsampled: false,
  points: [0, 5, 30, 35].map((m, i) => ({
    device_id: 'd1', variable: 'air_temperature', value: 20 + i, unit: 'Cel',
    observed_at: new Date(Date.UTC(2026, 9, 20, 12, m)).toISOString(),
  })),
}

const incident: Incident = {
  id: 'i1', project_id: 'p1', rule_id: null, rule_label: null, scenario_run_id: 'r1', kind: 'stale', device_id: 'd1',
  device_name: 'Sensor norte', opened_at: '2026-10-20T17:10:00Z', closed_at: null, severity: 'warning',
  evidence: { simulated: true }, status: 'open', acknowledged_by: null, acknowledged_at: null,
}

function setRole(role: 'viewer' | 'editor') {
  useAuth.setState({
    token: 't',
    organizationId: 'o1',
    user: { id: 'u1', email: 'a@a.test', full_name: 'A', is_superadmin: false },
    memberships: [{ organization: { id: 'o1', name: 'Alfa', slug: 'alfa' }, role }],
  })
}

function mockApi(status: SimulationRun['status'] | null = 'running', overrides: Partial<Record<keyof typeof operationsApi, unknown>> = {}) {
  vi.mocked(projectsApi.getProject).mockResolvedValue(project)
  const spies = {
    devices: vi.spyOn(operationsApi, 'devices').mockResolvedValue(devices),
    runs: vi.spyOn(operationsApi, 'runs').mockResolvedValue(status ? [run(status)] : []),
    latest: vi.spyOn(operationsApi, 'latest').mockResolvedValue(status ? latest : { ...latest, run_id: null, run_status: null, sim_time: null }),
    alerts: vi.spyOn(operationsApi, 'alerts').mockResolvedValue(status ? [incident] : []),
    readings: vi.spyOn(operationsApi, 'readings').mockResolvedValue(series),
    startRun: vi.spyOn(operationsApi, 'startRun').mockResolvedValue(run('running')),
    controlRun: vi.spyOn(operationsApi, 'controlRun').mockResolvedValue(run('paused')),
    acknowledge: vi.spyOn(operationsApi, 'acknowledge').mockResolvedValue({ ...incident, status: 'acknowledged', acknowledged_at: 'x' }),
    demoSetup: vi.spyOn(operationsApi, 'demoSetup').mockResolvedValue({ created_devices: 2, created_rules: 2, devices, rules: [] }),
  }
  for (const [key, value] of Object.entries(overrides)) {
    ;(spies as Record<string, { mockResolvedValue: (v: unknown) => void }>)[key].mockResolvedValue(value)
  }
  return spies
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/projects/p1/operations']}>
      <Routes>
        <Route path="/app/projects/:id/operations" element={<OperationsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  setRole('editor')
})

afterEach(() => {
  vi.useRealTimers()
})

it('muestra la banda didáctica, gauges simulados, "Sin señal" y la línea con hueco', async () => {
  mockApi('running')
  renderPage()
  expect(await screen.findByRole('note')).toHaveTextContent(DIDACTIC_NOTICE)
  // El primer dispositivo perdió la señal: los gauges no muestran 0 ni el último valor
  const meters = screen.getAllByRole('meter')
  expect(meters).toHaveLength(2)
  meters.forEach((m) => expect(m).toHaveAttribute('aria-valuetext', 'Sin señal'))
  expect(screen.getAllByText('Simulado').length).toBeGreaterThanOrEqual(2)
  // La serie tiene un hueco de 25 min: dos tramos en la gráfica de temperatura
  const chart = screen.getByRole('img', { name: 'Temperatura del aire de Sensor norte' })
  expect(chart.querySelectorAll('path')).toHaveLength(2)
  const scene = screen.getByTestId('scene')
  expect(within(scene).getByText('Sensor norte · Sin señal')).toHaveAttribute('data-stale', 'true')
  expect(within(scene).getByText('Sensor sur · 24.3 °C · 61.0 %')).toHaveAttribute('data-stale', 'false')
  expect(screen.getByText(/Tamaño ilustrativo de 8 × 16 m/)).toBeInTheDocument()
})

it('al elegir otro dispositivo los gauges muestran su último valor', async () => {
  const spies = mockApi('running')
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Sensor sur' }))
  await waitFor(() => expect(screen.getAllByRole('meter')[0]).toHaveAttribute('aria-valuenow', '24.3'))
  expect(spies.readings).toHaveBeenLastCalledWith('p1', { variable: 'relative_humidity', device_id: 'd2' })
})

it('el editor pausa y cancela la corrida en curso', async () => {
  const spies = mockApi('running')
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Pausar' }))
  await waitFor(() => expect(spies.controlRun).toHaveBeenCalledWith('p1', 'r1', 'pause'))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(spies.controlRun).toHaveBeenCalledWith('p1', 'r1', 'cancel'))
})

it('inicia una corrida nueva con el escenario elegido y muestra el 409', async () => {
  const spies = mockApi('completed')
  renderPage()
  fireEvent.change(await screen.findByRole('combobox', { name: 'Escenario' }), { target: { value: 'heat_rise' } })
  fireEvent.click(screen.getByRole('button', { name: 'Nueva corrida' }))
  await waitFor(() => expect(spies.startRun).toHaveBeenCalledWith('p1', 'heat_rise'))
  spies.startRun.mockRejectedValue(
    new AxiosError('conflict', 'ERR', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      data: { error: { code: 'run_active', message: 'Ya hay una simulación activa en este proyecto' } },
      headers: {},
      config: { headers: new AxiosHeaders() },
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Nueva corrida' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Ya hay una simulación activa')
})

it('reconoce un incidente', async () => {
  const spies = mockApi('running')
  renderPage()
  const list = await screen.findByRole('list', { name: 'Incidentes' })
  expect(within(list).getByText('El dispositivo dejó de reportar.')).toBeInTheDocument()
  fireEvent.click(within(list).getByRole('button', { name: 'Reconocer' }))
  await waitFor(() => expect(spies.acknowledge).toHaveBeenCalledWith('p1', 'i1'))
})

it('el viewer ve lecturas e incidentes sin controles', async () => {
  setRole('viewer')
  mockApi('running')
  renderPage()
  await screen.findByRole('list', { name: 'Incidentes' })
  expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Reconocer' })).toBeNull()
})

it('consulta cada 5 s mientras la corrida está en curso y se detiene en pausa', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const spies = mockApi('running')
  renderPage()
  await screen.findByRole('note')
  await waitFor(() => expect(spies.latest).toHaveBeenCalledTimes(1))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS)
  })
  await waitFor(() => expect(spies.latest).toHaveBeenCalledTimes(2))
  spies.runs.mockResolvedValue([run('paused')])
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS)
  })
  await waitFor(() => expect(spies.latest).toHaveBeenCalledTimes(3))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
  })
  expect(spies.latest).toHaveBeenCalledTimes(3)
})

it('sin dispositivos ofrece preparar la demostración', async () => {
  const spies = mockApi(null, { devices: [], latest: { run_id: null, run_status: null, sim_time: null, devices: [] } })
  renderPage()
  expect(await screen.findByText('Sin dispositivos')).toBeInTheDocument()
  expect(screen.getByRole('note')).toHaveTextContent(DIDACTIC_NOTICE)
  fireEvent.click(screen.getByRole('button', { name: 'Preparar demostración' }))
  await waitFor(() => expect(spies.demoSetup).toHaveBeenCalledWith('p1'))
})

it('sin corrida, los sensores muestran "Sin lecturas" y la escena usa el área registrada', async () => {
  mockApi(null, {
    latest: {
      run_id: null,
      run_status: null,
      sim_time: null,
      devices: latest.devices.map((d) => ({ ...d, readings: d.readings.map((r) => ({ ...r, value: null, observed_at: null, stale: false })) })),
    },
  })
  vi.mocked(projectsApi.getProject).mockResolvedValue({ ...project, area_m2: 50 })
  renderPage()
  expect(await screen.findByText('Sin corridas todavía')).toBeInTheDocument()
  expect(screen.getAllByText('Sin lecturas').length).toBeGreaterThanOrEqual(2)
  expect(screen.queryAllByRole('meter')).toHaveLength(0)
  expect(within(screen.getByTestId('scene')).getByText('Sensor norte · Sin lecturas')).toBeInTheDocument()
  expect(screen.getByText(/Nave de 5 × 10 m a partir del área registrada \(50 m²\)/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Iniciar simulación' })).toBeInTheDocument()
})
```

Run (en `frontend/`): `npx vitest run src/features/operations/operations.test.tsx`
Expected: FAIL (`Failed to resolve import "./OperationsPage"`).

- [ ] **Step 2: Página**

Crear `frontend/src/features/operations/OperationsPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorMessage, errorStatus } from '@/api/client'
import { Badge, Button, Card, Empty, ErrorState, Gauge, LineChart, Loading, OriginBadge, Select, StatTile, Tone } from '@/components/ui'
import { getProject, ProjectDetail } from '@/features/projects/api'
import { formatDateTime } from '@/features/projects/labels'
import { ProjectTabs } from '@/features/projects/ProjectTabs'
import { useHasRole } from '@/store/auth'
import {
  Device,
  Incident,
  LatestResponse,
  operationsApi,
  ReadingsResponse,
  RunAction,
  Scenario,
  SimulationRun,
  Variable,
} from './api'
import {
  deviceCalloutLabel,
  formatMeters,
  GAUGE_RANGES,
  greenhouseDims,
  INCIDENT_KIND_LABELS,
  INCIDENT_STATUS_LABELS,
  RUN_STATUS_LABELS,
  SCENARIO_LABELS,
  unitLabel,
  VARIABLE_LABELS,
  VARIABLES,
  withGaps,
} from './format'
import { GreenhouseViewer } from './LazyGreenhouseViewer'
import { usePolling } from './usePolling'

export const DIDACTIC_NOTICE = 'Simulación didáctica, sin calibración agronómica'

interface Data {
  project: ProjectDetail
  devices: Device[]
  runs: SimulationRun[]
  latest: LatestResponse
  incidents: Incident[]
  charts: Record<Variable, ReadingsResponse | null>
}

type State = { phase: 'loading' } | { phase: 'error'; message: string; code?: number } | { phase: 'ready'; data: Data }

const STATUS_TONE: Record<string, Tone> = { running: 'lime', paused: 'warning', completed: 'accent', cancelled: 'neutral' }

async function fetchCharts(projectId: string, deviceId: string | null, runId: string | null) {
  const empty = { air_temperature: null, relative_humidity: null } as Record<Variable, ReadingsResponse | null>
  if (!deviceId || !runId) return empty
  const results = await Promise.all(VARIABLES.map((variable) => operationsApi.readings(projectId, { variable, device_id: deviceId })))
  return { air_temperature: results[0], relative_humidity: results[1] }
}

export function OperationsPage() {
  const { id = '' } = useParams()
  const canEdit = useHasRole('editor')
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [selected, setSelected] = useState<string | null>(null)
  const [scenario, setScenario] = useState<Scenario>('base')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(
    async (quiet = false, deviceId: string | null = null) => {
      if (!quiet) setState({ phase: 'loading' })
      try {
        // latest materializa los pasos pendientes; el resto lee el estado ya al día.
        const [project, latest] = await Promise.all([getProject(id), operationsApi.latest(id)])
        const [devices, runs, incidents] = await Promise.all([
          operationsApi.devices(id),
          operationsApi.runs(id),
          operationsApi.alerts(id),
        ])
        const device = deviceId ?? latest.devices[0]?.device_id ?? null
        const charts = await fetchCharts(id, device, latest.run_id)
        setSelected(device)
        setState({ phase: 'ready', data: { project, devices, runs, latest, incidents, charts } })
      } catch (err) {
        if (!quiet) {
          setState({ phase: 'error', message: errorMessage(err, 'No se pudo cargar la operación'), code: errorStatus(err) })
        }
      }
    },
    [id],
  )

  useEffect(() => {
    load()
  }, [load])

  const data = state.phase === 'ready' ? state.data : null
  const run = data?.runs[0] ?? null
  usePolling(() => load(true, selected), run?.status === 'running')

  const back = (
    <Link to={`/app/projects/${encodeURIComponent(id)}`} className="mb-4 inline-block text-sm text-muted hover:text-fg">
      ← {data?.project.name ?? 'Proyecto'}
    </Link>
  )
  const notice = (
    <p role="note" className="glass mb-4 flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
      <OriginBadge origin="simulated" />
      {DIDACTIC_NOTICE}
    </p>
  )

  if (state.phase === 'loading') return <>{back}<Loading label="Cargando operación…" /></>
  if (state.phase === 'error') {
    return (
      <>
        {back}
        {state.code === 404 ? (
          <Empty title="Proyecto no encontrado" description="No existe o no pertenece a tu organización activa." />
        ) : (
          <ErrorState message={state.message} onRetry={() => load()} />
        )}
      </>
    )
  }

  const { project, devices, latest, incidents, charts } = state.data
  const active = run !== null && (run.status === 'running' || run.status === 'paused')
  const dims = greenhouseDims(project.area_m2)
  const current = latest.devices.find((d) => d.device_id === selected) ?? latest.devices[0] ?? null

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      await load(true, selected)
    } catch (err) {
      setActionError(errorMessage(err, 'No se pudo completar la acción'))
    } finally {
      setBusy(false)
    }
  }
  const control = (action: RunAction) => run && act(() => operationsApi.controlRun(id, run.id, action))
  const acknowledge = (incident: Incident) => act(() => operationsApi.acknowledge(id, incident.id))
  const selectDevice = (deviceId: string) => {
    setSelected(deviceId)
    load(true, deviceId)
  }

  return (
    <>
      {back}
      <ProjectTabs projectId={id} active="operaciones" />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Operaciones · invernadero virtual</p>
          <h1 className="display mt-1 break-words text-3xl">{project.name}</h1>
        </div>
        {run && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone={STATUS_TONE[run.status]}>{RUN_STATUS_LABELS[run.status]}</Badge>
            <span>{SCENARIO_LABELS[run.scenario]}</span>
            <span>
              · Paso {run.emitted_steps} de {run.total_steps}
            </span>
          </div>
        )}
      </div>
      {notice}

      {devices.length === 0 ? (
        <Empty
          title="Sin dispositivos"
          description="Este proyecto aún no tiene sensores simulados. La demostración agrega dos sensores y dos reglas demostrativas (umbrales de ejemplo, no agronómicos)."
          action={
            canEdit ? (
              <Button disabled={busy} onClick={() => act(() => operationsApi.demoSetup(id))}>
                Preparar demostración
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
          <div className="min-w-0 space-y-3">
            <Card className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="font-bold">{run ? `Corrida · semilla ${run.seed}` : 'Sin corridas todavía'}</p>
                  <p className="text-xs text-muted">
                    {run?.sim_time ? `Tiempo simulado: ${formatDateTime(run.sim_time)}` : 'Inicia una corrida para generar lecturas simuladas.'}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    {run?.status === 'running' && (
                      <Button variant="secondary" disabled={busy} onClick={() => control('pause')}>
                        Pausar
                      </Button>
                    )}
                    {run?.status === 'paused' && (
                      <Button variant="secondary" disabled={busy} onClick={() => control('resume')}>
                        Reanudar
                      </Button>
                    )}
                    {active && (
                      <Button variant="ghost" disabled={busy} onClick={() => control('cancel')}>
                        Cancelar
                      </Button>
                    )}
                    {!active && (
                      <>
                        <Select
                          aria-label="Escenario"
                          value={scenario}
                          onChange={(e) => setScenario(e.target.value as Scenario)}
                          className="!w-auto"
                        >
                          {(Object.keys(SCENARIO_LABELS) as Scenario[]).map((s) => (
                            <option key={s} value={s}>
                              {SCENARIO_LABELS[s]}
                            </option>
                          ))}
                        </Select>
                        <Button disabled={busy} onClick={() => act(() => operationsApi.startRun(id, scenario))}>
                          {run ? 'Nueva corrida' : 'Iniciar simulación'}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {actionError && (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {actionError}
                </p>
              )}
              {run && (
                <details className="mt-3 text-xs text-muted">
                  <summary className="cursor-pointer font-semibold">Modelo {run.model_version}: parámetros de ejemplo y limitaciones</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {run.limits.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono sm:grid-cols-3">
                    {Object.entries(run.inputs).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </Card>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Dispositivo">
              {latest.devices.map((d) => (
                <button
                  key={d.device_id}
                  type="button"
                  aria-pressed={d.device_id === current?.device_id}
                  onClick={() => selectDevice(d.device_id)}
                  className={
                    d.device_id === current?.device_id
                      ? 'rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-ink-fg'
                      : 'glass !rounded-full px-3 py-1.5 text-xs font-semibold'
                  }
                >
                  {d.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {VARIABLES.map((variable) => {
                const reading = current?.readings.find((r) => r.variable === variable)
                const [min, max] = GAUGE_RANGES[variable]
                if (!reading) return <StatTile key={variable} label={VARIABLE_LABELS[variable]} value={null} emptyText="No mide esta variable" />
                if (!reading.stale && reading.value === null) {
                  return <StatTile key={variable} label={VARIABLE_LABELS[variable]} value={null} emptyText="Sin lecturas" />
                }
                return (
                  <Card key={variable} className="flex flex-col items-center gap-2 p-4">
                    <Gauge
                      label={VARIABLE_LABELS[variable]}
                      min={min}
                      max={max}
                      unit={unitLabel(reading.unit)}
                      value={reading.stale || reading.value === null ? null : Math.round(reading.value * 10) / 10}
                    />
                    <OriginBadge origin="simulated" />
                  </Card>
                )
              })}
            </div>

            {VARIABLES.map((variable) => {
              const series = charts[variable]
              const unit = variable === 'air_temperature' ? '°C' : '%'
              return (
                <Card key={variable} className="p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="font-bold">
                      {VARIABLE_LABELS[variable]} <span className="text-xs font-semibold text-muted">({unit})</span>
                    </p>
                    <OriginBadge origin="simulated" />
                  </div>
                  <LineChart
                    ariaLabel={`${VARIABLE_LABELS[variable]} de ${current?.name ?? 'sin dispositivo'}`}
                    unit={unit}
                    data={series ? withGaps(series.points, series.interval_minutes) : []}
                  />
                  {series?.downsampled && (
                    <p className="mt-2 text-[11px] text-muted">Serie reducida: un punto cada {series.interval_minutes} min simulados.</p>
                  )}
                </Card>
              )
            })}
          </div>

          <div className="min-w-0 space-y-3">
            <Card className="p-2">
              <GreenhouseViewer
                className="h-[320px] sm:h-[380px]"
                dims={dims}
                devices={latest.devices.map((d) => ({
                  key: d.device_id,
                  label: deviceCalloutLabel(d),
                  x: d.x,
                  y: d.y,
                  z: d.z,
                  stale: d.readings.some((r) => r.stale),
                }))}
              />
              <p className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] text-muted">
                <OriginBadge origin="illustrative" />
                {dims.illustrative
                  ? `Tamaño ilustrativo de ${formatMeters(dims.width)} × ${formatMeters(dims.length)} m: el proyecto no tiene área registrada.`
                  : `Nave de ${formatMeters(dims.width)} × ${formatMeters(dims.length)} m a partir del área registrada (${formatMeters(project.area_m2 ?? 0)} m²); forma y alturas ilustrativas.`}
              </p>
            </Card>

            <Card className="p-5">
              <p className="mb-3 font-bold">Incidentes</p>
              {incidents.length === 0 ? (
                <p className="text-sm text-muted">Sin incidentes registrados.</p>
              ) : (
                <ul className="divide-y divide-border/50" aria-label="Incidentes">
                  {incidents.map((i) => (
                    <li key={i.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="warning">{INCIDENT_KIND_LABELS[i.kind]}</Badge>
                          <Badge tone={i.status === 'open' ? 'danger' : 'neutral'}>{INCIDENT_STATUS_LABELS[i.status]}</Badge>
                          <span className="font-semibold">{i.device_name}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {i.kind === 'stale' ? 'El dispositivo dejó de reportar.' : i.rule_label}
                        </p>
                        <p className="text-[11px] text-muted">
                          Abierto {formatDateTime(i.opened_at)}
                          {i.closed_at ? ` · cerrado ${formatDateTime(i.closed_at)}` : ''} (tiempo simulado)
                        </p>
                      </div>
                      {canEdit && i.acknowledged_at === null && (
                        <Button variant="secondary" disabled={busy} onClick={() => acknowledge(i)}>
                          Reconocer
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Ruta**

En `frontend/src/App.tsx`, añadir después de la importación de `PlantsPage`:

```tsx
import { OperationsPage } from '@/features/operations/OperationsPage'
```

y después de `<Route path="projects/:id" element={<ProjectDetailPage />} />`:

```tsx
        <Route path="projects/:id/operations" element={<OperationsPage />} />
```

- [ ] **Step 4: Verificar**

Run (en `frontend/`): `npx vitest run && npx tsc -b && npm run build`
Expected: PASS (19 archivos de prueba). En la salida del build, `GreenhouseViewer-*.js` y `three-*.js` son chunks aparte; comprobar que three no entra al bundle principal:

```bash
grep -c "WebGLRenderer" dist/assets/index-*.js
```

Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/operations frontend/src/App.tsx
git commit -m "feat(operations): pantalla de operaciones con banda didáctica, gauges y series simuladas, incidentes reconocibles, nave 3D y polling cada 5 s"
```

---

### Task 10: README, verificación de cierre de fase

Con ambos carriles integrados en `feat/hito-v3-invernadero`.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Checklist**

En `README.md`:

1. En "Desarrollo local", después de la línea de `make dev`, añadir: `SEED_DEMO_SIMULATION=1 make seed-demo   # opcional: proyecto "Invernadero demostrativo" con sensores y reglas demostrativas`.
2. Cambiar el título `### Estado: real / simulado / pendiente (hito visual V2)` por `### Estado: real / simulado / pendiente (hito visual V3)`.
3. Reemplazar la fila `| Lecturas de temperatura y humedad en el inicio | Pendiente (V3: invernadero virtual, etiquetadas SIMULADO) |` por estas tres filas:

```markdown
| Lecturas de temperatura y humedad en el inicio | Simulado: última lectura del invernadero virtual del proyecto reciente con badge SIMULADO; "Sin lecturas" sin corridas y "Sin señal" si el sensor la perdió (nunca 0) |
| Invernadero virtual (`/app/projects/:id/operations`) | Simulado: motor didáctico `didactic-v1` (sin calibración agronómica) con escenarios base, subida de temperatura y pérdida de sensor; corridas reproducibles por semilla, pausa/reanudar/cancelar, reglas demostrativas con histéresis y cooldown, incidentes reconocibles (auditados) y nave 3D ilustrativa |
| Telemetría de sensores físicos, control de actuadores | Pendiente (HVT-022; fuera de este hito) |
```


- [ ] **Step 2: Suites completas**

```bash
~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings
cd frontend && npx tsc -b && npx vitest run && npm run build && grep -c "WebGLRenderer" dist/assets/index-*.js; cd ..
```

Expected: todo PASS; el `grep` imprime `0` (three fuera del bundle principal).

- [ ] **Step 3: Migraciones y suites de V3 en Postgres 17**

```bash
docker run -d --rm --name hvt-pg-v3 -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=hvt -p 55435:5432 postgres:17
until docker exec hvt-pg-v3 pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
export DATABASE_URL=postgresql://postgres:pg@localhost:55435/hvt
~/.venvs/harvestt/bin/python -m alembic upgrade head
~/.venvs/harvestt/bin/python -m alembic check
~/.venvs/harvestt/bin/python -m alembic downgrade 0004
~/.venvs/harvestt/bin/python -m alembic upgrade head
~/.venvs/harvestt/bin/python -m alembic check
docker exec hvt-pg-v3 psql -U postgres -c "CREATE DATABASE hvt_test"
DATABASE_URL=postgresql://postgres:pg@localhost:55435/hvt_test ~/.venvs/harvestt/bin/python -m pytest \
  tests/test_devices.py tests/test_simulation.py tests/test_alerts.py tests/test_demo_simulation.py -q -p no:warnings
unset DATABASE_URL
```

Expected: `alembic check` → "No new upgrade operations detected." las dos veces; las 70 pruebas de V3 PASS también en Postgres (ejercitan `ON CONFLICT` de Postgres, `FOR UPDATE`, el índice único parcial y fechas con zona). Dejar el contenedor corriendo para el Step 4.

- [ ] **Step 4: Smoke del contenedor con Postgres**

```bash
docker exec hvt-pg-v3 psql -U postgres -c "DROP DATABASE hvt" -c "CREATE DATABASE hvt"
docker build -t harvestt-cortex .
docker run -d --rm --name hvt-app-v3 --network host \
  -e ENVIRONMENT=development -e PORT=8010 \
  -e DATABASE_URL=postgresql://postgres:pg@localhost:55435/hvt \
  -e SEED_ADMIN_EMAIL=admin@harvestt.test -e SEED_ADMIN_PASSWORD=demo-12345 \
  -e SEED_DEMO_SIMULATION=1 harvestt-cortex
until curl -sf localhost:8010/api/v1/health/ready >/dev/null; do sleep 2; done
docker logs hvt-app-v3 2>&1 | grep -E "0004 -> 0005|seed completado"
python3 - <<'PY'
import json, time, urllib.request

BASE = "http://localhost:8010/api/v1"

def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read() or b"null")

token = call("POST", "/auth/login", {"email": "admin@harvestt.test", "password": "demo-12345"})["access_token"]
project = next(p for p in call("GET", "/projects", token=token)["items"] if p["name"] == "Invernadero demostrativo")
pid = project["id"]
assert [d["name"] for d in call("GET", f"/projects/{pid}/devices", token=token)] == ["Sensor norte", "Sensor sur"]
run = call("POST", f"/projects/{pid}/simulation/runs", {"scenario": "heat_rise", "seed": 42, "inputs": {"tick_seconds": 0.5}}, token)
time.sleep(70)  # ~140 pasos: la temperatura ya cruzó 30 °C
latest = call("GET", f"/projects/{pid}/telemetry/latest", token=token)
alerts = call("GET", f"/projects/{pid}/alerts", token=token)
home = call("GET", "/home", token=token)
print("sim_time", latest["sim_time"], "incidentes", sorted({a["evidence"]["variable"] for a in alerts}))
assert latest["run_status"] == "running" and alerts
assert all(r["origin"] == "simulated" for r in home["readings"])
call("POST", f"/projects/{pid}/simulation/runs/{run['id']}/cancel", token=token)
print("smoke OK")
PY
```

Expected: los logs muestran `Running upgrade 0004 -> 0005` y `seed completado`; el script imprime incidentes de `air_temperature` y `relative_humidity` y `smoke OK`. Reiniciar el contenedor (`docker restart hvt-app-v3`) no duplica sensores ni reglas (seed idempotente): repetir la aserción de dispositivos.

- [ ] **Step 5: Revisión visual**

Con el contenedor del Step 4 corriendo, iniciar una corrida `sensor_loss` desde la UI (`/app/projects/<demo>/operations`, "Nueva corrida") y tomar capturas en claro 1280, oscuro 1280 y claro 375 de `/app`, `/app/projects/<demo>` (pestañas) y `/app/projects/<demo>/operations` (con el contenedor de Playwright `mcr.microsoft.com/playwright:v1.49.0-jammy`, `--network host`). Revisar:

- banda "Simulación didáctica, sin calibración agronómica" visible en los tres tamaños, sin scroll horizontal a 375 px;
- gauges con badge SIMULADO; durante la pérdida de señal, "Sin señal" en el sensor afectado y su esfera gris en la escena, con el callout "Sensor norte · Sin señal";
- la serie de temperatura con hueco visible durante la pérdida y recuperación después;
- incidente "Sin señal" en la lista, botón "Reconocer" y, tras pulsarlo, estado "Reconocido";
- rótulo ILUSTRATIVO con "Tamaño ilustrativo de 8 × 16 m" (el proyecto demo no tiene área);
- pestañas en píldora con la activa en lima; en `/app`, tiles de temperatura y humedad con SIMULADO;
- contraste legible de callouts, gauges y badges en ambos temas.

Al terminar: `docker stop hvt-app-v3 hvt-pg-v3`.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: invernadero virtual y lecturas del inicio pasan a simulado en el checklist (V3)"
```

Merge a `main` y despliegue: **solo con autorización explícita del usuario en esta fase.**

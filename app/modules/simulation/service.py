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
from app.modules.telemetry import rules
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
        rules.evaluate(db, run, batch, [d for _, d in devices])
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

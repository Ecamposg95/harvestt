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

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

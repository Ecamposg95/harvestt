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
from app.modules.telemetry.demo import ensure_demo_setup
from app.modules.telemetry.schemas import (
    AlertRuleCreate,
    AlertRuleOut,
    AlertRuleUpdate,
    DemoSetupOut,
    DeviceCreate,
    DeviceOut,
    DeviceUpdate,
    IncidentAction,
    IncidentOut,
    LatestOut,
    ReadingsOut,
)

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

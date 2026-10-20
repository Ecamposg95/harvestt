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

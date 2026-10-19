from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context, require_role
from app.modules.identity.models import ROLE_EDITOR
from app.modules.projects import service
from app.modules.projects.schemas import (
    CropCycleCreate,
    CropCycleOut,
    ObservationCreate,
    ObservationOut,
    Page,
    ProjectCreate,
    ProjectDetail,
    ProjectOut,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["projects"])

editor = require_role(ROLE_EDITOR)


@router.get("", response_model=Page[ProjectOut])
def list_projects(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    ctx: RequestContext = Depends(get_context),
    db: Session = Depends(get_db),
):
    items, total = service.list_projects(db, ctx, page, page_size)
    return Page[ProjectOut](
        items=[ProjectOut.model_validate(p) for p in items], total=total, page=page, page_size=page_size
    )


@router.post("", response_model=ProjectDetail, status_code=201)
def create_project(data: ProjectCreate, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)):
    project = service.create_project(db, ctx, data)
    return service.project_detail(db, ctx, project)


@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(project_id: str, ctx: RequestContext = Depends(get_context), db: Session = Depends(get_db)):
    return service.project_detail(db, ctx, service.get_project(db, ctx, project_id))


@router.patch("/{project_id}", response_model=ProjectDetail)
def update_project(
    project_id: str, data: ProjectUpdate, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)
):
    project = service.update_project(db, ctx, service.get_project(db, ctx, project_id), data)
    return service.project_detail(db, ctx, project)


@router.post("/{project_id}/crop-cycles", response_model=CropCycleOut, status_code=201)
def create_crop_cycle(
    project_id: str, data: CropCycleCreate, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)
):
    project = service.get_project(db, ctx, project_id)
    return service.crop_cycle_out(service.create_crop_cycle(db, ctx, project, data))


@router.get("/{project_id}/observations", response_model=Page[ObservationOut])
def list_observations(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    ctx: RequestContext = Depends(get_context),
    db: Session = Depends(get_db),
):
    project = service.get_project(db, ctx, project_id)
    items, total = service.list_observations(db, ctx, project, page, page_size)
    return Page[ObservationOut](
        items=[service.observation_out(o) for o in items], total=total, page=page, page_size=page_size
    )


@router.post("/{project_id}/observations", response_model=ObservationOut, status_code=201)
def create_observation(
    project_id: str, data: ObservationCreate, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)
):
    project = service.get_project(db, ctx, project_id)
    return service.observation_out(service.create_observation(db, ctx, project, data))

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

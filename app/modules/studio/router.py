from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context, require_role
from app.modules.identity.models import ROLE_EDITOR
from app.modules.projects import service as projects
from app.modules.studio import service
from app.modules.studio.schemas import LayoutIn, LayoutOut

router = APIRouter(prefix="/projects", tags=["studio"])
editor = require_role(ROLE_EDITOR)


@router.get("/{project_id}/layout", response_model=LayoutOut)
def get_layout(project_id: str, ctx: RequestContext = Depends(get_context), db: Session = Depends(get_db)):
    return service.get_layout(db, ctx, projects.get_project(db, ctx, project_id))


@router.put("/{project_id}/layout", response_model=LayoutOut)
def put_layout(project_id: str, data: LayoutIn, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)):
    return service.replace_layout(db, ctx, projects.get_project(db, ctx, project_id), data)

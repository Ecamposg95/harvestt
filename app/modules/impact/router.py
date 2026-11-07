from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import RequestContext, require_role
from app.modules.identity.models import ROLE_VIEWER
from app.modules.impact import service
from app.modules.impact.schemas import ProjectImpactOut, PublicImpactOut
from app.modules.projects.service import get_project
from app.modules.prototypes.service import public_org_id
from app.modules.simulation import service as simulation
from app.modules.simulation.clock import get_now

viewer = require_role(ROLE_VIEWER)

router = APIRouter(tags=["impact"])


@router.get("/projects/{project_id}/impact", response_model=ProjectImpactOut)
def project_impact(
    project_id: str,
    ctx: RequestContext = Depends(viewer),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
):
    project = get_project(db, ctx, project_id)
    # Materializa la corrida en curso para que los incidentes reflejen el paso actual.
    simulation.refresh_current_run(db, ctx, project, now)
    return service.project_kpis(db, ctx, project, now)


@router.get("/public/impact", response_model=PublicImpactOut)
def public_impact(db: Session = Depends(get_db), now: datetime = Depends(get_now)):
    return service.public_kpis(db, public_org_id(db, settings.public_org_slug), now)

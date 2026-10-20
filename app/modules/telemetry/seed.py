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

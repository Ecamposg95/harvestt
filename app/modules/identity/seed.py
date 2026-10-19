from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.identity import service
from app.modules.identity.models import ROLE_ADMIN


def seed(db: Session) -> None:
    org = service.ensure_organization(db, settings.seed_org_name, settings.seed_org_slug)
    if settings.seed_admin_email and settings.seed_admin_password:
        admin = service.ensure_user(
            db, settings.seed_admin_email, settings.seed_admin_password, "Administrador", is_superadmin=True
        )
        service.ensure_membership(db, admin, org, ROLE_ADMIN)

from dataclasses import dataclass

from fastapi import Depends, Header, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError, forbidden
from app.core.security import decode_access_token
from app.modules.identity.models import (
    MEMBERSHIP_ACTIVE,
    ROLE_ADMIN,
    ROLE_RANK,
    Membership,
    Organization,
    User,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


@dataclass
class RequestContext:
    user: User
    organization: Organization
    role: str
    request_id: str | None = None

    @property
    def organization_id(self) -> str:
        return self.organization.id

    def has_role(self, minimum: str) -> bool:
        return self.user.is_superadmin or ROLE_RANK[self.role] >= ROLE_RANK[minimum]


def _unauthorized() -> AppError:
    return AppError(401, "unauthorized", "Sesión inválida o expirada")


def get_current_user(token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    if not token:
        raise _unauthorized()
    user_id = decode_access_token(token)
    user = db.get(User, user_id) if user_id else None
    if user is None or not user.is_active or user.deleted_at is not None:
        raise _unauthorized()
    return user


def get_context(
    request: Request,
    x_organization_id: str | None = Header(default=None, alias="X-Organization-ID"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RequestContext:
    request_id = getattr(request.state, "request_id", None)
    memberships = [m for m in user.memberships if m.status == MEMBERSHIP_ACTIVE and m.deleted_at is None]

    if x_organization_id:
        membership = next((m for m in memberships if m.organization_id == x_organization_id), None)
        if membership:
            return RequestContext(user, membership.organization, membership.role, request_id)
        if user.is_superadmin:
            org = db.get(Organization, x_organization_id)
            if org and org.deleted_at is None:
                return RequestContext(user, org, ROLE_ADMIN, request_id)
        raise forbidden("No perteneces a esta organización")

    if len(memberships) == 1:
        m = memberships[0]
        return RequestContext(user, m.organization, m.role, request_id)
    raise AppError(400, "organization_required", "Indica la organización con el encabezado X-Organization-ID")


def require_role(minimum: str):
    def dependency(ctx: RequestContext = Depends(get_context)) -> RequestContext:
        if not ctx.has_role(minimum):
            raise forbidden()
        return ctx

    return dependency


def require_superadmin(user: User = Depends(get_current_user)) -> User:
    if not user.is_superadmin:
        raise forbidden()
    return user


def get_org_by_slug(db: Session, slug: str) -> Organization | None:
    return db.scalar(select(Organization).where(Organization.slug == slug, Organization.deleted_at.is_(None)))

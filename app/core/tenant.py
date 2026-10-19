from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.deps import RequestContext
from app.core.errors import not_found


def scoped(model, ctx: RequestContext) -> Select:
    """SELECT de un modelo privado limitado a la organización activa y sin borrados."""
    stmt = select(model).where(model.organization_id == ctx.organization_id)
    if hasattr(model, "deleted_at"):
        stmt = stmt.where(model.deleted_at.is_(None))
    return stmt


def get_scoped_or_404(db: Session, model, obj_id: str, ctx: RequestContext, resource: str = "recurso"):
    obj = db.scalar(scoped(model, ctx).where(model.id == obj_id))
    if obj is None:
        raise not_found(resource)
    return obj

from sqlalchemy.orm import Session

from app.core.deps import RequestContext
from app.modules.audit.models import AuditEvent


def record(
    db: Session,
    ctx: RequestContext | None,
    resource_type: str,
    resource_id: str,
    operation: str,
    data: dict | None = None,
) -> AuditEvent:
    event = AuditEvent(
        organization_id=ctx.organization_id if ctx else None,
        actor_id=ctx.user.id if ctx else None,
        resource_type=resource_type,
        resource_id=resource_id,
        operation=operation,
        data=data,
        request_id=ctx.request_id if ctx else None,
    )
    db.add(event)
    return event

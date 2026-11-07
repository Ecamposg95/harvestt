from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import audit
from app.core.errors import not_found
from app.core.mixins import utcnow
from app.modules.identity.models import User
from app.modules.vision.models import Recognition
from app.modules.vision.schemas import RecognitionIn


def list_recognitions(db: Session, org_id: str) -> list[Recognition]:
    stmt = (
        select(Recognition)
        .where(Recognition.organization_id == org_id, Recognition.deleted_at.is_(None))
        .order_by(Recognition.sort_order, Recognition.awarded_on)
    )
    return list(db.scalars(stmt))


def create_recognition(db: Session, user: User, org_id: str, data: RecognitionIn) -> Recognition:
    rec = Recognition(organization_id=org_id, **data.model_dump())
    db.add(rec)
    db.flush()
    audit.record(db, None, "recognition", rec.id, "create", {**data.model_dump(mode="json"), "actor_id": user.id})
    db.commit()
    db.refresh(rec)
    return rec


def delete_recognition(db: Session, user: User, rec_id: str) -> None:
    rec = db.get(Recognition, rec_id)
    if rec is None or rec.deleted_at is not None:
        raise not_found("reconocimiento")
    rec.deleted_at = utcnow()
    audit.record(db, None, "recognition", rec.id, "delete", {"actor_id": user.id})
    db.commit()

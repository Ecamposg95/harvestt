from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import audit
from app.core.errors import not_found
from app.core.mixins import utcnow
from app.modules.identity.models import User
from app.modules.vision.models import InboundRequest, Recognition
from app.modules.vision.schemas import RecognitionIn, RequestIn, RequestReview


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


def round_coord(value: float | None) -> float | None:
    """Redondea a 1 decimal (~ciudad) para no guardar ubicaciones precisas."""
    return None if value is None else round(value, 1)


def create_request(db: Session, data: RequestIn) -> InboundRequest | None:
    if data.website.strip():
        return None  # trampa anti-bots: se descarta sin guardar
    fields = data.model_dump(exclude={"website"})
    fields["lat"] = round_coord(data.lat)
    fields["lon"] = round_coord(data.lon)
    req = InboundRequest(**fields)
    db.add(req)
    db.flush()
    audit.record(db, None, "inbound_request", req.id, "create", {"kind": req.kind})
    db.commit()
    db.refresh(req)
    return req


def list_requests(db: Session, status: str | None) -> list[InboundRequest]:
    stmt = select(InboundRequest).where(InboundRequest.deleted_at.is_(None))
    if status:
        stmt = stmt.where(InboundRequest.status == status)
    return list(db.scalars(stmt.order_by(InboundRequest.created_at.desc())))


def review_request(db: Session, user: User, req_id: str, review: RequestReview) -> InboundRequest:
    req = db.get(InboundRequest, req_id)
    if req is None or req.deleted_at is not None:
        raise not_found("solicitud")
    req.status = review.status
    req.review_note = review.note
    req.reviewed_by = user.id
    req.reviewed_at = utcnow()
    audit.record(db, None, "inbound_request", req.id, "review",
                 {"status": review.status, "note": review.note, "actor_id": user.id})
    db.commit()
    db.refresh(req)
    return req

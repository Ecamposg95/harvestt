from datetime import datetime

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import require_superadmin
from app.core.errors import not_found
from app.modules.identity.models import User
from app.modules.prototypes.service import public_org_id
from app.modules.simulation.clock import get_now
from app.modules.vision import service
from app.modules.vision.ratelimit import limit_public_requests
from app.modules.vision.schemas import RecognitionIn, RecognitionOut, RequestAck, RequestIn, RequestOut, RequestReview, VisionOut

public_router = APIRouter(prefix="/public", tags=["vision"])
admin_router = APIRouter(prefix="/admin", tags=["vision-admin"])


def _org_id(db: Session) -> str:
    org_id = public_org_id(db, settings.public_org_slug)
    if org_id is None:
        raise not_found("organización pública")
    return org_id


@public_router.get("/vision", response_model=VisionOut)
def vision(db: Session = Depends(get_db), now: datetime = Depends(get_now)):
    return service.vision_summary(db, public_org_id(db, settings.public_org_slug), now)


@admin_router.get("/recognitions", response_model=list[RecognitionOut])
def list_recognitions(user: User = Depends(require_superadmin), db: Session = Depends(get_db)):
    return service.list_recognitions(db, _org_id(db))


@admin_router.post("/recognitions", response_model=RecognitionOut, status_code=201)
def create_recognition(data: RecognitionIn, user: User = Depends(require_superadmin), db: Session = Depends(get_db)):
    return service.create_recognition(db, user, _org_id(db), data)


@admin_router.delete("/recognitions/{rec_id}", status_code=204)
def delete_recognition(rec_id: str, user: User = Depends(require_superadmin), db: Session = Depends(get_db)):
    service.delete_recognition(db, user, rec_id)
    return Response(status_code=204)


@public_router.post("/requests", response_model=RequestAck, status_code=201, dependencies=[Depends(limit_public_requests)])
def create_request(data: RequestIn, db: Session = Depends(get_db)):
    service.create_request(db, data)
    return RequestAck()  # misma respuesta aunque la trampa descarte la solicitud


@admin_router.get("/requests", response_model=list[RequestOut])
def list_requests(status: str | None = None, user: User = Depends(require_superadmin), db: Session = Depends(get_db)):
    return service.list_requests(db, status)


@admin_router.patch("/requests/{req_id}", response_model=RequestOut)
def review_request(req_id: str, review: RequestReview, user: User = Depends(require_superadmin),
                   db: Session = Depends(get_db)):
    return service.review_request(db, user, req_id, review)

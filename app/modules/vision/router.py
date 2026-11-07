from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import require_superadmin
from app.core.errors import not_found
from app.modules.identity.models import User
from app.modules.prototypes.service import public_org_id
from app.modules.vision import service
from app.modules.vision.schemas import RecognitionIn, RecognitionOut

public_router = APIRouter(prefix="/public", tags=["vision"])
admin_router = APIRouter(prefix="/admin", tags=["vision-admin"])


def _org_id(db: Session) -> str:
    org_id = public_org_id(db, settings.public_org_slug)
    if org_id is None:
        raise not_found("organización pública")
    return org_id


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

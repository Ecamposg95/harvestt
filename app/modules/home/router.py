from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context
from app.modules.home.schemas import HomeOut
from app.modules.home.service import build_home
from app.modules.simulation.clock import get_now

router = APIRouter(prefix="/home", tags=["home"])


@router.get("", response_model=HomeOut)
def home(
    ctx: RequestContext = Depends(get_context), db: Session = Depends(get_db), now: datetime = Depends(get_now)
):
    return build_home(db, ctx, now)

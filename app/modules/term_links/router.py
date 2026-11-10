from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context
from app.core.errors import not_found
from app.modules.ontology.models import OntologyTerm
from app.modules.term_links import service
from app.modules.term_links.service import TermUsage

router = APIRouter(prefix="/ontology", tags=["ontology"])


@router.get("/terms/{term_id}/usage", response_model=TermUsage)
def usage(term_id: str, ctx: RequestContext = Depends(get_context), db: Session = Depends(get_db)):
    term = db.scalar(select(OntologyTerm).where(
        OntologyTerm.id == term_id, OntologyTerm.status == "published", OntologyTerm.deleted_at.is_(None),
    ))
    if term is None:
        raise not_found("término")
    return service.term_usage(db, ctx, term_id)

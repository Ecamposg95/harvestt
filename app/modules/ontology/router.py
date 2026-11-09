from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.modules.identity.models import User
from app.modules.ontology import service
from app.modules.ontology.schemas import SuggestionOut, TermDetail, TermEdit, TermProposal, TermSummary

router = APIRouter(prefix="/ontology", tags=["ontology"])
public_router = APIRouter(prefix="/public/ontology", tags=["ontology-public"])


@router.get("/terms", response_model=list[TermSummary])
def list_terms(
    domain: str | None = None,
    q: str | None = None,
    status: str | None = None,
    mine: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.list_terms(db, user, domain, q, status, mine)


@router.get("/suggest", response_model=list[SuggestionOut])
def suggest(q: str = Query(default=""), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.suggest(db, q)


@router.get("/terms/{term_id}", response_model=TermDetail)
def get_term(term_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.term_detail(db, service.get_term(db, user, term_id))


@router.post("/terms", response_model=TermDetail, status_code=201)
def propose(data: TermProposal, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.term_detail(db, service.propose(db, user, data))


@router.patch("/terms/{term_id}", response_model=TermDetail)
def edit(term_id: str, data: TermEdit, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    term = service.get_term(db, user, term_id)
    return service.term_detail(db, service.edit(db, user, term, data))

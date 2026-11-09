from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, require_superadmin
from app.modules.identity.models import User
from app.modules.ontology import review as reviews
from app.modules.ontology import service
from app.modules.ontology.schemas import (
    EquivalencesIn,
    ObsoleteIn,
    ReleaseOut,
    ReviewIn,
    SuggestionOut,
    TermDetail,
    TermEdit,
    TermProposal,
    TermSummary,
)

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


@router.post("/terms/{term_id}/review", response_model=TermDetail)
def review(term_id: str, data: ReviewIn, user: User = Depends(require_superadmin), db: Session = Depends(get_db)):
    term = service.get_term(db, user, term_id)
    return service.term_detail(db, reviews.review(db, user, term, data))


@router.post("/terms/{term_id}/obsolete", response_model=TermDetail)
def obsolete(term_id: str, data: ObsoleteIn, user: User = Depends(require_superadmin), db: Session = Depends(get_db)):
    term = service.get_term(db, user, term_id)
    return service.term_detail(db, reviews.obsolete(db, user, term, data))


@router.put("/terms/{term_id}/equivalences", response_model=TermDetail)
def replace_equivalences(
    term_id: str, data: EquivalencesIn, user: User = Depends(require_superadmin), db: Session = Depends(get_db)
):
    term = service.get_term(db, user, term_id)
    return service.term_detail(db, reviews.replace_equivalences(db, user, term, data))


@router.get("/releases", response_model=list[ReleaseOut])
def releases(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return reviews.releases(db)


@router.get("/review-queue", response_model=list[TermSummary])
def review_queue(user: User = Depends(require_superadmin), db: Session = Depends(get_db)):
    return reviews.review_queue(db)

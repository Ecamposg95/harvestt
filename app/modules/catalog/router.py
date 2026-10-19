from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context
from app.modules.catalog import service
from app.modules.catalog.schemas import Page, SourceOut, SpeciesDetail, SpeciesSummary

router = APIRouter(tags=["catalog"])


@router.get("/plants", response_model=Page[SpeciesSummary])
def list_plants(
    q: str | None = Query(default=None, max_length=200),
    family: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: RequestContext = Depends(get_context),
    db: Session = Depends(get_db),
):
    items, total = service.search_species(db, q, family, page, page_size)
    return Page[SpeciesSummary](
        items=[SpeciesSummary.model_validate(s) for s in items], total=total, page=page, page_size=page_size
    )


@router.get("/plants/families", response_model=list[str])
def list_families(_: RequestContext = Depends(get_context), db: Session = Depends(get_db)):
    return service.list_families(db)


@router.get("/plants/{species_id}", response_model=SpeciesDetail)
def get_plant(species_id: str, _: RequestContext = Depends(get_context), db: Session = Depends(get_db)):
    return service.species_detail(db, service.get_species_or_404(db, species_id))


@router.get("/sources/{source_id}", response_model=SourceOut)
def get_source(source_id: str, _: RequestContext = Depends(get_context), db: Session = Depends(get_db)):
    return service.get_source_or_404(db, source_id)

from datetime import datetime
from typing import Callable

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context, require_superadmin
from app.core.errors import AppError, not_found
from app.modules.catalog.service import get_species_or_404
from app.modules.connectors import service
from app.modules.connectors.genesys import AccessionOut, list_accessions_live
from app.modules.connectors.http import FetchError, Fetcher
from app.modules.connectors.registry import SOURCES, source_status
from app.modules.connectors.schemas import BanksOut, ConnectorOut, ConnectorSyncOut
from app.modules.connectors.sync import default_fetcher_factory, run_sync
from app.modules.identity.models import User
from app.modules.simulation.clock import get_now

router = APIRouter(tags=["connectors"])


def get_fetcher_factory() -> Callable[[str], Fetcher]:
    return default_fetcher_factory


@router.get("/plants/{species_id}/banks", response_model=BanksOut)
def plant_banks(species_id: str, _: RequestContext = Depends(get_context), db: Session = Depends(get_db)):
    return service.species_banks(db, get_species_or_404(db, species_id))


@router.get("/connectors", response_model=list[ConnectorOut])
def list_connectors(_: User = Depends(require_superadmin), db: Session = Depends(get_db)):
    return service.connectors_panel(db)


@router.get("/connectors/genesys/accessions", response_model=list[AccessionOut])
def genesys_accessions(
    species_id: str = Query(...),
    _: RequestContext = Depends(get_context),
    db: Session = Depends(get_db),
    factory: Callable[[str], Fetcher] = Depends(get_fetcher_factory),
):
    species = get_species_or_404(db, species_id)
    unavailable = AppError(503, "source_unavailable", "Genesys no está disponible")
    if source_status("genesys") != "active":
        raise unavailable
    try:
        return list_accessions_live(species, factory("genesys"))
    except FetchError:
        raise unavailable


@router.post("/connectors/{key}/sync", response_model=ConnectorSyncOut)
def sync_connector(
    key: str,
    user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
    factory: Callable[[str], Fetcher] = Depends(get_fetcher_factory),
):
    if key not in {s.key for s in SOURCES}:
        raise not_found("conector")
    return run_sync(db, key, user, now, factory)

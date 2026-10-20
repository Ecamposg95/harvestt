from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context, require_superadmin
from app.core.storage import get_storage
from app.modules.catalog import media, service
from app.modules.catalog.schemas import Page, SourceOut, SpeciesDetail, SpeciesMediaOut, SpeciesSummary
from app.modules.identity.models import User

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


@router.post("/plants/{species_id}/media", response_model=SpeciesMediaOut, status_code=201)
def upload_media(
    species_id: str,
    file: UploadFile = File(...),
    kind: str = Form(default="photo"),
    license: str = Form(default=""),
    attribution: str = Form(default=""),
    source_url: str = Form(default=""),
    is_hero: bool = Form(default=False),
    callouts: str = Form(default="[]"),
    user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    meta = media.parse_meta(kind, license, attribution, source_url, is_hero, callouts)
    return service.media_out(media.create_media(db, user, species_id, file.file, file.filename, meta))


@router.delete("/plants/{species_id}/media/{media_id}", status_code=204)
def delete_media(
    species_id: str, media_id: str, user: User = Depends(require_superadmin), db: Session = Depends(get_db)
):
    media.delete_media(db, user, species_id, media_id)
    return Response(status_code=204)


@router.get("/plants/{species_id}/media/{media_id}/file")
def media_file(
    species_id: str,
    media_id: str,
    request: Request,
    _: RequestContext = Depends(get_context),
    db: Session = Depends(get_db),
):
    item = media.get_media_or_404(db, species_id, media_id)
    etag = f'"{item.checksum_sha256}"'
    headers = {"Cache-Control": "private, max-age=86400", "ETag": etag, "X-Content-Type-Options": "nosniff"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    headers["Content-Length"] = str(item.size_bytes)
    headers["Content-Disposition"] = f'inline; filename="{item.filename}"'
    return StreamingResponse(get_storage().open(item.storage_key), media_type=item.content_type, headers=headers)

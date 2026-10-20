from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import RequestContext, require_role
from app.core.errors import not_found
from app.core.storage import get_storage
from app.modules.prototypes import service
from app.modules.prototypes.models import PrototypeAsset
from app.modules.prototypes.schemas import (
    AssetOut,
    AssetUpdate,
    HotspotCreate,
    HotspotOut,
    HotspotUpdate,
    PrototypeCreate,
    PrototypeDetailOut,
    PrototypeOut,
    PrototypeUpdate,
    PublicAssetOut,
    PublicPrototypeDetail,
    PublicPrototypeSummary,
)

viewer = require_role("viewer")
editor = require_role("editor")

internal = APIRouter(prefix="/prototypes", tags=["prototypes"])
public = APIRouter(prefix="/public", tags=["public"])


def _stream(asset: PrototypeAsset, cache_control: str) -> StreamingResponse:
    headers = {
        "Cache-Control": cache_control,
        "Content-Length": str(asset.size_bytes),
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": f'inline; filename="{asset.filename}"',
    }
    return StreamingResponse(get_storage().open(asset.storage_key), media_type=asset.content_type, headers=headers)


def _detail(db: Session, proto) -> PrototypeDetailOut:
    out = PrototypeOut.model_validate(proto).model_dump()
    return PrototypeDetailOut(**out, assets=[AssetOut.model_validate(a) for a in service.list_assets(db, proto)])


# ---- Interna ----


@internal.get("", response_model=list[PrototypeOut])
def list_prototypes(ctx: RequestContext = Depends(viewer), db: Session = Depends(get_db)):
    return service.list_prototypes(db, ctx)


@internal.post("", response_model=PrototypeDetailOut, status_code=201)
def create_prototype(data: PrototypeCreate, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)):
    return _detail(db, service.create_prototype(db, ctx, data))


@internal.get("/{prototype_id}", response_model=PrototypeDetailOut)
def get_prototype(prototype_id: str, ctx: RequestContext = Depends(viewer), db: Session = Depends(get_db)):
    return _detail(db, service.get_prototype(db, ctx, prototype_id))


@internal.patch("/{prototype_id}", response_model=PrototypeDetailOut)
def update_prototype(
    prototype_id: str, data: PrototypeUpdate, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)
):
    return _detail(db, service.update_prototype(db, ctx, prototype_id, data))


@internal.delete("/{prototype_id}", status_code=204)
def delete_prototype(prototype_id: str, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)):
    service.delete_prototype(db, ctx, prototype_id)
    return Response(status_code=204)


@internal.post("/{prototype_id}/assets", response_model=AssetOut, status_code=201)
def upload_asset(
    prototype_id: str,
    file: UploadFile = File(...),
    kind: Literal["image", "model_stl"] | None = Form(default=None),
    caption: str = Form(default="", max_length=300),
    is_public: bool = Form(default=False),
    ctx: RequestContext = Depends(editor),
    db: Session = Depends(get_db),
):
    return service.create_asset(db, ctx, prototype_id, file.file, file.filename, kind, caption, is_public)


@internal.patch("/{prototype_id}/assets/{asset_id}", response_model=AssetOut)
def update_asset(
    prototype_id: str,
    asset_id: str,
    data: AssetUpdate,
    ctx: RequestContext = Depends(editor),
    db: Session = Depends(get_db),
):
    return service.update_asset(db, ctx, prototype_id, asset_id, data)


@internal.delete("/{prototype_id}/assets/{asset_id}", status_code=204)
def delete_asset(prototype_id: str, asset_id: str, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)):
    service.delete_asset(db, ctx, prototype_id, asset_id)
    return Response(status_code=204)


@internal.get("/{prototype_id}/assets/{asset_id}/file")
def asset_file(prototype_id: str, asset_id: str, ctx: RequestContext = Depends(viewer), db: Session = Depends(get_db)):
    proto = service.get_prototype(db, ctx, prototype_id)
    asset = service.get_asset(db, ctx, proto, asset_id)
    return _stream(asset, "private, no-store")


@internal.get("/{prototype_id}/hotspots", response_model=list[HotspotOut])
def list_hotspots(prototype_id: str, ctx: RequestContext = Depends(viewer), db: Session = Depends(get_db)):
    return service.list_hotspots(db, ctx, prototype_id)


@internal.post("/{prototype_id}/hotspots", response_model=HotspotOut, status_code=201)
def create_hotspot(
    prototype_id: str, data: HotspotCreate, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)
):
    return service.create_hotspot(db, ctx, prototype_id, data)


@internal.patch("/{prototype_id}/hotspots/{hotspot_id}", response_model=HotspotOut)
def update_hotspot(
    prototype_id: str,
    hotspot_id: str,
    data: HotspotUpdate,
    ctx: RequestContext = Depends(editor),
    db: Session = Depends(get_db),
):
    return service.update_hotspot(db, ctx, prototype_id, hotspot_id, data)


@internal.delete("/{prototype_id}/hotspots/{hotspot_id}", status_code=204)
def delete_hotspot(
    prototype_id: str, hotspot_id: str, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)
):
    service.delete_hotspot(db, ctx, prototype_id, hotspot_id)
    return Response(status_code=204)


# ---- Pública (sin autenticación, solo la organización PUBLIC_ORG_SLUG) ----


def _public_org(db: Session) -> str | None:
    return service.public_org_id(db, settings.public_org_slug)


def _public_asset_out(asset: PrototypeAsset) -> PublicAssetOut:
    return PublicAssetOut(
        id=asset.id,
        kind=asset.kind,
        filename=asset.filename,
        content_type=asset.content_type,
        size_bytes=asset.size_bytes,
        caption=asset.caption,
        url=f"/api/v1/public/assets/{asset.id}",
    )


def _hero(proto, assets: list[PrototypeAsset]) -> PublicAssetOut | None:
    hero = next((a for a in assets if a.id == proto.hero_asset_id and a.kind == "image"), None)
    if hero is None:  # sin hero público: primera imagen pública
        hero = next((a for a in assets if a.kind == "image"), None)
    return _public_asset_out(hero) if hero else None


def _summary_fields(proto, assets: list[PrototypeAsset]) -> dict:
    return {
        "slug": proto.slug,
        "name": proto.name,
        "codename": proto.codename,
        "purpose": proto.purpose,
        "summary": proto.summary,
        "status": proto.status,
        "published_at": proto.published_at,
        "hero": _hero(proto, assets),
    }


@public.get("/prototypes", response_model=list[PublicPrototypeSummary])
def public_prototypes(db: Session = Depends(get_db)):
    org_id = _public_org(db)
    if org_id is None:
        return []
    protos = service.public_prototypes(db, org_id)
    by_proto: dict[str, list[PrototypeAsset]] = {}
    for asset in service.public_assets(db, [p.id for p in protos]):
        by_proto.setdefault(asset.prototype_id, []).append(asset)
    return [PublicPrototypeSummary(**_summary_fields(p, by_proto.get(p.id, []))) for p in protos]


@public.get("/prototypes/{slug}", response_model=PublicPrototypeDetail)
def public_prototype(slug: str, db: Session = Depends(get_db)):
    org_id = _public_org(db)
    proto = service.public_prototype(db, org_id, slug) if org_id else None
    if proto is None:
        raise not_found("prototipo")
    assets = service.public_assets(db, [proto.id])
    return PublicPrototypeDetail(
        **_summary_fields(proto, assets),
        description=proto.description,
        specs=proto.specs or [],
        assets=[_public_asset_out(a) for a in assets],
    )


@public.get("/assets/{asset_id}")
def public_asset_file(asset_id: str, db: Session = Depends(get_db)):
    org_id = _public_org(db)
    asset = service.public_asset(db, org_id, asset_id) if org_id else None
    if asset is None:
        raise not_found("archivo")
    return _stream(asset, "public, max-age=3600")


router = APIRouter()
router.include_router(internal)
router.include_router(public)

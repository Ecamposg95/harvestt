import logging
import re
import unicodedata
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.deps import RequestContext
from app.core.errors import AppError, conflict, not_found, unprocessable
from app.core.mixins import new_id, utcnow
from app.core.storage import get_storage
from app.core.tenant import get_scoped_or_404, scoped
from app.modules.prototypes.models import KIND_IMAGE, Prototype, PrototypeAsset
from app.modules.prototypes.schemas import AssetUpdate, PrototypeCreate, PrototypeUpdate
from app.modules.prototypes.validation import receive_upload

log = logging.getLogger(__name__)

RESOURCE = "prototype"
ASSET_RESOURCE = "prototype_asset"


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:100].strip("-") or "prototipo"


def _slug_taken(db: Session, org_id: str, slug: str, exclude_id: str | None = None) -> bool:
    # Incluye borrados: la restricción única de la tabla también los cuenta.
    stmt = select(Prototype.id).where(Prototype.organization_id == org_id, Prototype.slug == slug)
    if exclude_id:
        stmt = stmt.where(Prototype.id != exclude_id)
    return db.scalar(stmt) is not None


def unique_slug(db: Session, org_id: str, base: str) -> str:
    slug, n = base, 2
    while _slug_taken(db, org_id, slug):
        slug = f"{base}-{n}"
        n += 1
    return slug


# ---- Prototipos ----


def list_prototypes(db: Session, ctx: RequestContext) -> list[Prototype]:
    stmt = scoped(Prototype, ctx).order_by(Prototype.sort_order, Prototype.name)
    return list(db.scalars(stmt))


def get_prototype(db: Session, ctx: RequestContext, prototype_id: str) -> Prototype:
    return get_scoped_or_404(db, Prototype, prototype_id, ctx, "prototipo")


def list_assets(db: Session, prototype: Prototype) -> list[PrototypeAsset]:
    stmt = (
        select(PrototypeAsset)
        .where(
            PrototypeAsset.prototype_id == prototype.id,
            PrototypeAsset.organization_id == prototype.organization_id,
            PrototypeAsset.deleted_at.is_(None),
        )
        .order_by(PrototypeAsset.sort_order, PrototypeAsset.created_at)
    )
    return list(db.scalars(stmt))


def create_prototype(db: Session, ctx: RequestContext, data: PrototypeCreate) -> Prototype:
    if data.slug:
        if _slug_taken(db, ctx.organization_id, data.slug):
            raise AppError(409, "slug_taken", "Ya existe un prototipo con ese slug", {"field": "slug"})
        slug = data.slug
    else:
        slug = unique_slug(db, ctx.organization_id, slugify(data.name))
    proto = Prototype(
        organization_id=ctx.organization_id,
        slug=slug,
        name=data.name,
        codename=(data.codename or "").strip() or None,
        purpose=data.purpose.strip(),
        summary=data.summary,
        description=data.description,
        status=data.status,
        specs=[s.model_dump() for s in data.specs],
        is_public=data.is_public,
        published_at=utcnow() if data.is_public else None,
        sort_order=data.sort_order,
        version=1,
    )
    db.add(proto)
    db.flush()
    record(db, ctx, RESOURCE, proto.id, "create", {"slug": slug, "name": proto.name})
    db.commit()
    return proto


def update_prototype(db: Session, ctx: RequestContext, prototype_id: str, data: PrototypeUpdate) -> Prototype:
    proto = get_prototype(db, ctx, prototype_id)
    if data.version != proto.version:
        raise conflict()
    fields = data.model_fields_set - {"version"}
    changes: dict = {}

    if "slug" in fields and data.slug and data.slug != proto.slug:
        if _slug_taken(db, ctx.organization_id, data.slug, exclude_id=proto.id):
            raise AppError(409, "slug_taken", "Ya existe un prototipo con ese slug", {"field": "slug"})
        proto.slug = changes["slug"] = data.slug
    if "name" in fields and data.name is not None:
        name = data.name.strip()
        if not name:
            raise unprocessable("El nombre es obligatorio", {"field": "name"})
        proto.name = changes["name"] = name
    if "codename" in fields:
        proto.codename = changes["codename"] = (data.codename or "").strip() or None
    for attr in ("purpose", "summary", "description", "status", "sort_order"):
        if attr in fields and getattr(data, attr) is not None:
            value = getattr(data, attr)
            if attr == "purpose":
                value = value.strip()
            setattr(proto, attr, value)
            changes[attr] = value if attr != "description" else "(actualizada)"
    if "specs" in fields and data.specs is not None:
        proto.specs = [s.model_dump() for s in data.specs]
        changes["specs"] = len(proto.specs)
    if "is_public" in fields and data.is_public is not None:
        proto.is_public = changes["is_public"] = data.is_public
        if data.is_public and proto.published_at is None:
            proto.published_at = utcnow()
    if "hero_asset_id" in fields:
        if data.hero_asset_id:
            asset = db.scalar(
                select(PrototypeAsset).where(
                    PrototypeAsset.id == data.hero_asset_id,
                    PrototypeAsset.prototype_id == proto.id,
                    PrototypeAsset.organization_id == ctx.organization_id,
                    PrototypeAsset.deleted_at.is_(None),
                )
            )
            if asset is None or asset.kind != KIND_IMAGE:
                raise unprocessable(
                    "La imagen principal debe ser una imagen de este prototipo", {"field": "hero_asset_id"}
                )
        proto.hero_asset_id = changes["hero_asset_id"] = data.hero_asset_id or None

    proto.version += 1
    record(db, ctx, RESOURCE, proto.id, "update", changes)
    db.commit()
    return proto


def delete_prototype(db: Session, ctx: RequestContext, prototype_id: str) -> None:
    proto = get_prototype(db, ctx, prototype_id)
    now = utcnow()
    proto.deleted_at = now
    proto.is_public = False
    # Libera el slug para reutilizarlo y conserva el original en la auditoría.
    old_slug = proto.slug
    proto.slug = f"{old_slug[:80]}--borrado-{proto.id[:8]}"
    for asset in list_assets(db, proto):
        asset.deleted_at = now
    record(db, ctx, RESOURCE, proto.id, "delete", {"slug": old_slug})
    db.commit()


# ---- Assets ----


def get_asset(db: Session, ctx: RequestContext, prototype: Prototype, asset_id: str) -> PrototypeAsset:
    asset = db.scalar(
        scoped(PrototypeAsset, ctx).where(PrototypeAsset.id == asset_id, PrototypeAsset.prototype_id == prototype.id)
    )
    if asset is None:
        raise not_found("archivo")
    return asset


def create_asset(
    db: Session,
    ctx: RequestContext,
    prototype_id: str,
    src: BinaryIO,
    filename: str | None,
    kind: str | None,
    caption: str,
    is_public: bool,
) -> PrototypeAsset:
    proto = get_prototype(db, ctx, prototype_id)
    validated = receive_upload(src, filename, kind)
    try:
        asset_id = new_id()
        key = f"prototypes/{ctx.organization_id}/{proto.id}/{asset_id}.{validated.extension}"
        existing = list_assets(db, proto)
        asset = PrototypeAsset(
            id=asset_id,
            organization_id=ctx.organization_id,
            prototype_id=proto.id,
            kind=validated.kind,
            filename=validated.filename,
            content_type=validated.content_type,
            size_bytes=validated.size_bytes,
            checksum_sha256=validated.checksum_sha256,
            storage_key=key,
            caption=caption.strip()[:300],
            is_public=is_public,
            sort_order=max((a.sort_order for a in existing), default=-1) + 1,
        )
        get_storage().put(key, validated.file, validated.content_type)
    finally:
        validated.file.close()
    try:
        db.add(asset)
        # Primera imagen: se usa como principal si no hay otra.
        if asset.kind == KIND_IMAGE and proto.hero_asset_id is None:
            proto.hero_asset_id = asset.id
            proto.version += 1
        record(
            db,
            ctx,
            ASSET_RESOURCE,
            asset.id,
            "create",
            {"prototype_id": proto.id, "kind": asset.kind, "filename": asset.filename, "size": asset.size_bytes},
        )
        db.commit()
    except Exception:
        db.rollback()
        get_storage().delete(key)
        raise
    return asset


def update_asset(db: Session, ctx: RequestContext, prototype_id: str, asset_id: str, data: AssetUpdate) -> PrototypeAsset:
    proto = get_prototype(db, ctx, prototype_id)
    asset = get_asset(db, ctx, proto, asset_id)
    changes = {}
    for attr in ("caption", "is_public", "sort_order"):
        if attr in data.model_fields_set and getattr(data, attr) is not None:
            value = getattr(data, attr)
            if attr == "caption":
                value = value.strip()
            setattr(asset, attr, value)
            changes[attr] = value
    record(db, ctx, ASSET_RESOURCE, asset.id, "update", changes)
    db.commit()
    return asset


def delete_asset(db: Session, ctx: RequestContext, prototype_id: str, asset_id: str) -> None:
    proto = get_prototype(db, ctx, prototype_id)
    asset = get_asset(db, ctx, proto, asset_id)
    asset.deleted_at = utcnow()
    if proto.hero_asset_id == asset.id:
        proto.hero_asset_id = None
        proto.version += 1
    record(db, ctx, ASSET_RESOURCE, asset.id, "delete", {"prototype_id": proto.id, "filename": asset.filename})
    db.commit()
    try:
        get_storage().delete(asset.storage_key)
    except Exception:  # el registro ya quedó borrado; un huérfano en storage no debe romper la respuesta
        log.exception("No se pudo borrar el objeto %s", asset.storage_key)


# ---- Público ----


def public_org_id(db: Session, slug: str) -> str | None:
    from app.core.deps import get_org_by_slug

    org = get_org_by_slug(db, slug)
    return org.id if org else None


def public_prototypes(db: Session, org_id: str) -> list[Prototype]:
    stmt = (
        select(Prototype)
        .where(Prototype.organization_id == org_id, Prototype.is_public.is_(True), Prototype.deleted_at.is_(None))
        .order_by(Prototype.sort_order, Prototype.name)
    )
    return list(db.scalars(stmt))


def public_prototype(db: Session, org_id: str, slug: str) -> Prototype | None:
    return db.scalar(
        select(Prototype).where(
            Prototype.organization_id == org_id,
            Prototype.slug == slug,
            Prototype.is_public.is_(True),
            Prototype.deleted_at.is_(None),
        )
    )


def public_assets(db: Session, prototype_ids: list[str]) -> list[PrototypeAsset]:
    if not prototype_ids:
        return []
    stmt = (
        select(PrototypeAsset)
        .where(
            PrototypeAsset.prototype_id.in_(prototype_ids),
            PrototypeAsset.is_public.is_(True),
            PrototypeAsset.deleted_at.is_(None),
        )
        .order_by(PrototypeAsset.sort_order, PrototypeAsset.created_at)
    )
    return list(db.scalars(stmt))


def public_asset(db: Session, org_id: str, asset_id: str) -> PrototypeAsset | None:
    return db.scalar(
        select(PrototypeAsset)
        .join(Prototype, Prototype.id == PrototypeAsset.prototype_id)
        .where(
            PrototypeAsset.id == asset_id,
            PrototypeAsset.organization_id == org_id,
            PrototypeAsset.is_public.is_(True),
            PrototypeAsset.deleted_at.is_(None),
            Prototype.organization_id == org_id,
            Prototype.is_public.is_(True),
            Prototype.deleted_at.is_(None),
        )
    )

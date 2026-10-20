"""Medios globales de especie: subida solo superadmin, licencia y atribución obligatorias, sin descargas automáticas."""
import json
import logging
import struct
from typing import BinaryIO

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.errors import not_found, unprocessable
from app.core.mixins import new_id, utcnow
from app.core.storage import get_storage
from app.modules.audit.models import AuditEvent
from app.modules.catalog.models import SpeciesMedia
from app.modules.catalog.schemas import SpeciesMediaMeta
from app.modules.catalog.service import active_media, get_species_or_404
from app.modules.identity.models import User
from app.modules.prototypes.models import KIND_IMAGE
from app.modules.prototypes.validation import receive_upload

log = logging.getLogger(__name__)

RESOURCE = "species_media"
HEAD_BYTES = 64 * 1024
JPEG_SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def image_dimensions(head: bytes, fmt: str) -> tuple[int, int] | None:
    """(ancho, alto) leídos de la cabecera con stdlib; None si no se pueden leer."""
    width = height = 0
    try:
        if fmt == "png":
            if head[12:16] != b"IHDR":
                return None
            width, height = struct.unpack(">II", head[16:24])
        elif fmt == "jpeg":
            i = 2
            while i + 9 <= len(head):
                if head[i] != 0xFF:
                    return None
                marker = head[i + 1]
                if marker in JPEG_SOF:
                    height, width = struct.unpack(">HH", head[i + 5 : i + 9])
                    break
                (length,) = struct.unpack(">H", head[i + 2 : i + 4])
                i += 2 + length
        elif fmt == "webp":
            chunk = head[12:16]
            if chunk == b"VP8X":
                width = 1 + int.from_bytes(head[24:27], "little")
                height = 1 + int.from_bytes(head[27:30], "little")
            elif chunk == b"VP8 ":
                width = struct.unpack("<H", head[26:28])[0] & 0x3FFF
                height = struct.unpack("<H", head[28:30])[0] & 0x3FFF
            elif chunk == b"VP8L":
                bits = int.from_bytes(head[21:25], "little")
                width = (bits & 0x3FFF) + 1
                height = ((bits >> 14) & 0x3FFF) + 1
            else:
                return None
        else:
            return None
    except (struct.error, IndexError):
        return None
    return (width, height) if width > 0 and height > 0 else None


def parse_meta(kind: str, license: str, attribution: str, source_url: str, is_hero: bool, callouts: str) -> SpeciesMediaMeta:
    """Valida los campos del formulario antes de leer el archivo: sin licencia o atribución no se guarda nada."""
    try:
        raw_callouts = json.loads(callouts or "[]")
    except json.JSONDecodeError:
        raise unprocessable("Los callouts deben ser JSON válido", {"field": "callouts"}) from None
    try:
        return SpeciesMediaMeta(
            kind=kind,
            license=license,
            attribution=attribution,
            source_url=source_url or None,
            is_hero=is_hero,
            callouts=raw_callouts,
        )
    except ValidationError as exc:
        errors = exc.errors()
        first = errors[0]
        field = str(first["loc"][0]) if first.get("loc") else "file"
        message = str(first.get("msg", "Datos inválidos")).removeprefix("Value error, ")
        raise unprocessable(
            message, {"field": field, "errors": [{"loc": list(e["loc"]), "msg": e["msg"]} for e in errors]}
        ) from None


def _audit(db: Session, user: User, media_id: str, operation: str, data: dict) -> None:
    # Recurso global: sin organización (no aparece en la actividad de ningún tenant).
    db.add(
        AuditEvent(
            organization_id=None,
            actor_id=user.id,
            resource_type=RESOURCE,
            resource_id=media_id,
            operation=operation,
            data=data,
        )
    )


def get_media_or_404(db: Session, species_id: str, media_id: str) -> SpeciesMedia:
    media = db.get(SpeciesMedia, media_id)
    if media is None or media.deleted_at is not None or media.species_id != species_id:
        raise not_found("medio")
    return media


def create_media(
    db: Session, user: User, species_id: str, src: BinaryIO, filename: str | None, meta: SpeciesMediaMeta
) -> SpeciesMedia:
    species = get_species_or_404(db, species_id)
    validated = receive_upload(src, filename, KIND_IMAGE)  # misma validación que prototipos: firma y 15 MB
    try:
        dims = image_dimensions(validated.file.read(HEAD_BYTES), validated.fmt)
        validated.file.seek(0)
        media_id = new_id()
        key = f"species/{species.id}/{media_id}.{validated.extension}"
        existing = active_media(db, species.id)
        media = SpeciesMedia(
            id=media_id,
            species_id=species.id,
            storage_key=key,
            filename=validated.filename,
            content_type=validated.content_type,
            size_bytes=validated.size_bytes,
            checksum_sha256=validated.checksum_sha256,
            kind=meta.kind,
            license=meta.license,
            attribution=meta.attribution,
            source_url=meta.source_url,
            # La primera imagen de la especie es héroe aunque no se marque.
            is_hero=meta.is_hero or not any(m.is_hero for m in existing),
            width=dims[0] if dims else None,
            height=dims[1] if dims else None,
            callouts=[c.model_dump() for c in meta.callouts],
        )
        get_storage().put(key, validated.file, validated.content_type)
    finally:
        validated.file.close()
    try:
        if media.is_hero:
            for other in existing:
                other.is_hero = False
        db.add(media)
        _audit(
            db,
            user,
            media.id,
            "create",
            {"species_id": species.id, "license": media.license, "attribution": media.attribution, "filename": media.filename},
        )
        db.commit()
    except Exception:
        db.rollback()
        get_storage().delete(key)
        raise
    return media


def delete_media(db: Session, user: User, species_id: str, media_id: str) -> None:
    media = get_media_or_404(db, species_id, media_id)
    media.deleted_at = utcnow()
    _audit(db, user, media.id, "delete", {"species_id": species_id, "filename": media.filename})
    db.commit()
    try:
        get_storage().delete(media.storage_key)
    except Exception:  # el registro ya quedó borrado; un huérfano en storage no debe romper la respuesta
        log.exception("No se pudo borrar el objeto %s", media.storage_key)

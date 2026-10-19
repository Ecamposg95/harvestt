"""Validación de archivos subidos: tamaño, firma de bytes y checksum (solo stdlib)."""
import hashlib
import re
import struct
import tempfile
import unicodedata
from dataclasses import dataclass
from typing import BinaryIO

from app.core.errors import unprocessable
from app.modules.prototypes.models import KIND_IMAGE, KIND_MODEL_STL

MB = 1024 * 1024
MAX_IMAGE_BYTES = 15 * MB
MAX_STL_BYTES = 100 * MB
CHUNK = 1024 * 1024
SPOOL_MAX_MEMORY = 2 * MB

IMAGE_EXTENSIONS = {"png": "png", "jpg": "jpeg", "jpeg": "jpeg", "webp": "webp"}
STL_EXTENSIONS = {"stl"}
CONTENT_TYPES = {"png": "image/png", "jpeg": "image/jpeg", "webp": "image/webp", "stl": "model/stl"}
# Extensión canónica de almacenamiento para cada formato detectado
STORAGE_EXT = {"png": "png", "jpeg": "jpg", "webp": "webp", "stl": "stl"}


@dataclass
class ValidatedFile:
    file: BinaryIO  # posicionado al inicio; el llamador debe cerrarlo
    filename: str
    kind: str
    fmt: str  # png | jpeg | webp | stl
    content_type: str
    size_bytes: int
    checksum_sha256: str

    @property
    def extension(self) -> str:
        return STORAGE_EXT[self.fmt]


def sanitize_filename(name: str | None, fallback: str = "archivo") -> str:
    name = (name or "").replace("\\", "/").split("/")[-1]
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip(".-_")
    name = re.sub(r"-{2,}", "-", name)
    if not name:
        name = fallback
    if len(name) > 150:
        stem, dot, ext = name.rpartition(".")
        name = (stem[: 150 - len(ext) - 1] + "." + ext) if dot and len(ext) <= 10 else name[:150]
    return name


def extension_of(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def kind_for_extension(ext: str) -> str | None:
    if ext in IMAGE_EXTENSIONS:
        return KIND_IMAGE
    if ext in STL_EXTENSIONS:
        return KIND_MODEL_STL
    return None


def detect_image_format(head: bytes) -> str | None:
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


def is_valid_stl(f: BinaryIO, size: int) -> bool:
    f.seek(0)
    head = f.read(84)
    if size >= 84:
        (count,) = struct.unpack("<I", head[80:84])
        if size == 84 + 50 * count:
            return True
    # ASCII: inicia con "solid" (tras espacios opcionales) y contiene "facet"
    if not head.lstrip().lower().startswith(b"solid"):
        return False
    f.seek(0)
    tail = b""
    while chunk := f.read(CHUNK):
        window = tail + chunk.lower()
        if b"facet" in window:
            return True
        tail = window[-4:]
    return False


def receive_upload(src: BinaryIO, original_name: str | None, declared_kind: str | None) -> ValidatedFile:
    """Copia el upload a un SpooledTemporaryFile calculando SHA-256 y limitando tamaño, y valida su firma."""
    filename = sanitize_filename(original_name)
    ext = extension_of(filename)
    kind = kind_for_extension(ext)
    if kind is None:
        raise unprocessable("Tipo de archivo no permitido: usa PNG, JPG, WEBP o STL", {"field": "file"})
    if declared_kind and declared_kind != kind:
        raise unprocessable("El tipo indicado no coincide con la extensión del archivo", {"field": "kind"})

    limit = MAX_IMAGE_BYTES if kind == KIND_IMAGE else MAX_STL_BYTES
    out = tempfile.SpooledTemporaryFile(max_size=SPOOL_MAX_MEMORY)
    digest = hashlib.sha256()
    size = 0
    try:
        while chunk := src.read(CHUNK):
            size += len(chunk)
            if size > limit:
                raise unprocessable(
                    f"El archivo excede el máximo de {limit // MB} MB", {"field": "file", "max_bytes": limit}
                )
            digest.update(chunk)
            out.write(chunk)
        if size == 0:
            raise unprocessable("El archivo está vacío", {"field": "file"})

        if kind == KIND_IMAGE:
            out.seek(0)
            fmt = detect_image_format(out.read(16))
            if fmt is None or fmt != IMAGE_EXTENSIONS[ext]:
                raise unprocessable("El contenido no corresponde a una imagen PNG, JPG o WEBP válida", {"field": "file"})
        else:
            if not is_valid_stl(out, size):
                raise unprocessable("El archivo no es un STL válido (binario o ASCII)", {"field": "file"})
            fmt = "stl"
    except Exception:
        out.close()
        raise

    out.seek(0)
    return ValidatedFile(
        file=out,
        filename=filename,
        kind=kind,
        fmt=fmt,
        content_type=CONTENT_TYPES[fmt],
        size_bytes=size,
        checksum_sha256=digest.hexdigest(),
    )

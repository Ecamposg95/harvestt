import os
import shutil
from pathlib import Path
from typing import BinaryIO, Iterator, Protocol

from app.core.config import settings

CHUNK = 1024 * 1024


class Storage(Protocol):
    def put(self, key: str, fileobj: BinaryIO, content_type: str) -> None: ...
    def open(self, key: str) -> Iterator[bytes]: ...
    def delete(self, key: str) -> None: ...
    def exists(self, key: str) -> bool: ...


def _safe_key(key: str) -> str:
    parts = [p for p in key.replace("\\", "/").split("/") if p not in ("", ".", "..")]
    if not parts:
        raise ValueError("clave de almacenamiento vacía")
    return "/".join(parts)


class LocalStorage:
    def __init__(self, root: str):
        self.root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / _safe_key(key)).resolve()
        if self.root not in path.parents:
            raise ValueError("clave fuera del almacenamiento")
        return path

    def put(self, key: str, fileobj: BinaryIO, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as out:
            shutil.copyfileobj(fileobj, out, CHUNK)

    def open(self, key: str) -> Iterator[bytes]:
        with open(self._path(key), "rb") as f:
            while chunk := f.read(CHUNK):
                yield chunk

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            os.remove(path)

    def exists(self, key: str) -> bool:
        return self._path(key).exists()


class S3Storage:
    def __init__(self):
        import boto3

        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint or None,
            region_name=settings.s3_region or None,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
        )

    def put(self, key: str, fileobj: BinaryIO, content_type: str) -> None:
        self.client.upload_fileobj(fileobj, self.bucket, _safe_key(key), ExtraArgs={"ContentType": content_type})

    def open(self, key: str) -> Iterator[bytes]:
        body = self.client.get_object(Bucket=self.bucket, Key=_safe_key(key))["Body"]
        yield from body.iter_chunks(CHUNK)

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=_safe_key(key))

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=_safe_key(key))
            return True
        except self.client.exceptions.ClientError:
            return False


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        _storage = S3Storage() if settings.storage_backend == "s3" else LocalStorage(settings.storage_dir)
    return _storage

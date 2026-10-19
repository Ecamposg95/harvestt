import os
from dataclasses import dataclass, field

INSECURE_SECRET = "dev-insecure-secret-change-me"


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _normalize_db_url(url: str) -> str:
    # Railway entrega postgres://; SQLAlchemy 2 requiere postgresql://
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


@dataclass(frozen=True)
class Settings:
    environment: str = field(default_factory=lambda: _env("ENVIRONMENT", "development"))
    database_url: str = field(
        default_factory=lambda: _normalize_db_url(
            _env("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/harvestt")
        )
    )
    secret_key: str = field(default_factory=lambda: _env("SECRET_KEY", INSECURE_SECRET))
    access_token_minutes: int = field(default_factory=lambda: int(_env("ACCESS_TOKEN_MINUTES", "720")))
    cors_origins: list[str] = field(
        default_factory=lambda: [o.strip() for o in _env("CORS_ORIGINS").split(",") if o.strip()]
    )
    seed_admin_email: str = field(default_factory=lambda: _env("SEED_ADMIN_EMAIL"))
    seed_admin_password: str = field(default_factory=lambda: _env("SEED_ADMIN_PASSWORD"))
    seed_org_name: str = field(default_factory=lambda: _env("SEED_ORG_NAME", "HarvestT"))
    seed_org_slug: str = field(default_factory=lambda: _env("SEED_ORG_SLUG", "harvestt"))
    public_org_slug: str = field(default_factory=lambda: _env("PUBLIC_ORG_SLUG", "harvestt"))
    storage_backend: str = field(default_factory=lambda: _env("STORAGE_BACKEND", "local"))
    storage_dir: str = field(default_factory=lambda: _env("STORAGE_DIR", "storage"))
    s3_endpoint: str = field(default_factory=lambda: _env("S3_ENDPOINT"))
    s3_bucket: str = field(default_factory=lambda: _env("S3_BUCKET"))
    s3_region: str = field(default_factory=lambda: _env("S3_REGION", "auto"))
    s3_access_key_id: str = field(default_factory=lambda: _env("S3_ACCESS_KEY_ID"))
    s3_secret_access_key: str = field(default_factory=lambda: _env("S3_SECRET_ACCESS_KEY"))
    # Railway buckets usan virtual-host; MinIO local suele requerir "path"
    s3_addressing_style: str = field(default_factory=lambda: _env("S3_ADDRESSING_STYLE", "virtual"))

    @property
    def is_development(self) -> bool:
        return self.environment in ("development", "test")

    def validate(self) -> None:
        if not self.is_development and self.secret_key in ("", INSECURE_SECRET):
            raise RuntimeError("SECRET_KEY inseguro: configúralo antes de arrancar fuera de development")


settings = Settings()

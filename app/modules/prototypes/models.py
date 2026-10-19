# Modelos del módulo; se registran en app/models_registry.py
from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, TenantMixin, UUIDMixin

STATUS_CONCEPT = "concept"
STATUS_DESIGN = "design"
STATUS_IN_CONSTRUCTION = "in_construction"
STATUS_TESTING = "testing"
STATUS_OPERATIONAL = "operational"
STATUS_RETIRED = "retired"
STATUSES = (
    STATUS_CONCEPT,
    STATUS_DESIGN,
    STATUS_IN_CONSTRUCTION,
    STATUS_TESTING,
    STATUS_OPERATIONAL,
    STATUS_RETIRED,
)

KIND_IMAGE = "image"
KIND_MODEL_STL = "model_stl"
ASSET_KINDS = (KIND_IMAGE, KIND_MODEL_STL)


class Prototype(UUIDMixin, TenantMixin, AuditMixin, Base):
    __tablename__ = "prototypes"
    __table_args__ = (UniqueConstraint("organization_id", "slug", name="uq_prototype_org_slug"),)

    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    codename: Mapped[str | None] = mapped_column(String(80), nullable=True)
    purpose: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default=STATUS_CONCEPT)
    specs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Sin FK para evitar ciclo prototypes <-> prototype_assets; se valida en el servicio.
    hero_asset_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class PrototypeAsset(UUIDMixin, TenantMixin, AuditMixin, Base):
    __tablename__ = "prototype_assets"

    prototype_id: Mapped[str] = mapped_column(String(36), ForeignKey("prototypes.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    caption: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

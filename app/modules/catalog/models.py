"""Catálogo vegetal global (sin tenant). Lectura para cualquier miembro; escritura solo superadmin."""
from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.mixins import AuditMixin, UUIDMixin

# Procedencia de un valor. Nunca se inventan cifras: sin evidencia → "missing".
ORIGIN_MEASURED = "measured"
ORIGIN_SOURCED = "sourced"
ORIGIN_DERIVED = "derived"
ORIGIN_SIMULATED = "simulated"
ORIGIN_ILLUSTRATIVE = "illustrative"
ORIGIN_MISSING = "missing"
ORIGINS = (
    ORIGIN_MEASURED,
    ORIGIN_SOURCED,
    ORIGIN_DERIVED,
    ORIGIN_SIMULATED,
    ORIGIN_ILLUSTRATIVE,
    ORIGIN_MISSING,
)

REVIEW_UNREVIEWED = "unreviewed"
REVIEW_IN_REVIEW = "in_review"
REVIEW_APPROVED = "approved"
REVIEW_REJECTED = "rejected"
REVIEW_STATUSES = (REVIEW_UNREVIEWED, REVIEW_IN_REVIEW, REVIEW_APPROVED, REVIEW_REJECTED)

SUBJECT_SPECIES = "species"
SUBJECT_CULTIVAR = "cultivar"
SUBJECT_TYPES = (SUBJECT_SPECIES, SUBJECT_CULTIVAR)

UNKNOWN = "unknown"


class Species(UUIDMixin, AuditMixin, Base):
    __tablename__ = "species"

    scientific_name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    authorship: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # [{"lang": "es", "name": "lechuga"}, ...]
    common_names: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    family: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    # {"gbif": {"id": "...", "source_id": "...", "url": "...", "match_type": "...", "verified_at": "..."}}
    external_ids: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    cultivars: Mapped[list["Cultivar"]] = relationship(
        back_populates="species", lazy="selectin", order_by="Cultivar.name"
    )


class Cultivar(UUIDMixin, AuditMixin, Base):
    __tablename__ = "cultivars"
    __table_args__ = (UniqueConstraint("species_id", "name", name="uq_cultivar_species_name"),)

    species_id: Mapped[str] = mapped_column(String(36), ForeignKey("species.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    provenance: Mapped[str | None] = mapped_column(Text, nullable=True)

    species: Mapped[Species] = relationship(back_populates="cultivars")


class Source(UUIDMixin, AuditMixin, Base):
    __tablename__ = "sources"

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    publisher: Mapped[str | None] = mapped_column(String(200), nullable=True)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    license: Mapped[str | None] = mapped_column(String(120), nullable=True)
    accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Permisos separados: {"metadata": true, "text": false, "images": false, "redistribution": false}
    rights: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class TraitAssertion(UUIDMixin, AuditMixin, Base):
    __tablename__ = "trait_assertions"

    subject_type: Mapped[str] = mapped_column(String(30), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    variable: Mapped[str] = mapped_column(String(60), nullable=False)
    value_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    growth_stage: Mapped[str] = mapped_column(String(60), nullable=False, default=UNKNOWN)
    cultivation_system: Mapped[str] = mapped_column(String(60), nullable=False, default=UNKNOWN)
    origin: Mapped[str] = mapped_column(String(20), nullable=False, default=ORIGIN_MISSING)
    review_status: Mapped[str] = mapped_column(String(20), nullable=False, default=REVIEW_UNREVIEWED)
    # [{"source_id": "...", "locator": "p. 12"}]
    evidence_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


MEDIA_KINDS = ("photo", "render")
MAX_MEDIA_CALLOUTS = 12


class SpeciesMedia(UUIDMixin, AuditMixin, Base):
    """Imagen global de una especie. La sube un superadmin con licencia verificada; nunca se descarga sola."""

    __tablename__ = "species_media"

    species_id: Mapped[str] = mapped_column(String(36), ForeignKey("species.id"), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="photo")
    license: Mapped[str] = mapped_column(String(120), nullable=False)
    attribution: Mapped[str] = mapped_column(String(300), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_hero: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # [{"trait_variable": "ph", "x": 0.25, "y": 0.75}] con x, y en 0..1 sobre la imagen
    callouts: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

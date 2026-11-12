"""Caché por celda de valores muestreados de fuentes públicas (sin organización: datos de una coordenada)."""
from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, Float, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, UUIDMixin

GEO_OK = "ok"
GEO_NO_DATA = "no_data"
GEO_STATUSES = (GEO_OK, GEO_NO_DATA)


class GeoSample(UUIDMixin, AuditMixin, Base):
    __tablename__ = "geo_samples"
    __table_args__ = (
        UniqueConstraint("source", "lat_key", "lon_key", name="uq_geo_sample"),
        CheckConstraint("status IN ('ok', 'no_data')", name="ck_geo_samples_status"),
    )

    source: Mapped[str] = mapped_column(String(30), nullable=False)
    lat_key: Mapped[float] = mapped_column(Float, nullable=False)
    lon_key: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    license: Mapped[str] = mapped_column(String(200), nullable=False)
    attribution: Mapped[str] = mapped_column(String(500), nullable=False)
    source_url: Mapped[str] = mapped_column(String(500), nullable=False)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)

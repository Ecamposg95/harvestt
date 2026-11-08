"""Página Visión: reconocimientos del equipo y solicitudes entrantes (nodos y contacto)."""
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, TenantMixin, UUIDMixin

REQUEST_KINDS = ("node", "contact")
REQUEST_STATUSES = ("pending", "approved", "rejected")


class Recognition(UUIDMixin, TenantMixin, AuditMixin, Base):
    """Premio o reconocimiento verificable; la evidencia es obligatoria."""

    __tablename__ = "recognitions"

    award: Mapped[str] = mapped_column(String(120), nullable=False)
    event: Mapped[str] = mapped_column(String(200), nullable=False)
    venue: Mapped[str] = mapped_column(String(200), nullable=False)
    awarded_on: Mapped[date] = mapped_column(Date, nullable=False)
    prototype_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("prototypes.id"), nullable=True)
    evidence: Mapped[str] = mapped_column(String(500), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class InboundRequest(UUIDMixin, AuditMixin, Base):
    """Solicitud pública (global, sin organización): kind node = quiere un nodo; contact = mensaje."""

    __tablename__ = "inbound_requests"
    __table_args__ = (
        CheckConstraint("kind IN ('node', 'contact')", name="ck_inbound_requests_kind"),
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="ck_inbound_requests_status"),
        Index("ix_inbound_requests_status", "status"),
    )

    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    organization: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    message: Mapped[str] = mapped_column(String(2000), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

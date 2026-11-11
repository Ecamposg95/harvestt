"""Conectores de solo lectura a bancos de datos públicos de plantas: copia local y corridas."""
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, UUIDMixin, utcnow

SNAPSHOT_STATUSES = ("ok", "not_found", "error")
SYNC_STATUSES = ("running", "ok", "partial", "error")


class ConnectorSnapshot(UUIDMixin, AuditMixin, Base):
    """Última copia buena de una fuente para una especie (global, sin organización)."""

    __tablename__ = "connector_snapshots"
    __table_args__ = (UniqueConstraint("source", "species_id", name="uq_connector_snapshot"),)

    source: Mapped[str] = mapped_column(String(20), nullable=False)
    species_id: Mapped[str] = mapped_column(String(36), ForeignKey("species.id"), nullable=False, index=True)
    # ok | not_found | error ("error" solo si el primer intento falló y no hay copia previa)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    license: Mapped[str | None] = mapped_column(String(200), nullable=True)
    attribution: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(300), nullable=True)  # motivo visible de not_found


class ConnectorSync(UUIDMixin, Base):
    """Corrida de sincronización de una fuente."""

    __tablename__ = "connector_syncs"
    __table_args__ = (Index("ix_connector_syncs_source_started_at", "source", "started_at"),)

    source: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    species_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    species_ok: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    actor_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
